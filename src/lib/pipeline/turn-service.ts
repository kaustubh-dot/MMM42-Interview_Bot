import "server-only";

import { goldenReport } from "../../fixtures/golden-interview";
import type { AnswerArtifact, IntegrityEvent } from "../../types/pipeline";
import type { StartRequest, SubmitTurnRequest, TurnReply } from "../../types/pipeline-api";
import { redactIdentityText } from "../prompts/pipeline/blind";
import { toClientRecord } from "./client-projection";
import { type GradeAnswer, advanceInterview, createOpeningSession } from "./engine";
import { PipelineError } from "./errors";
import { gradeAnswer } from "./grade";
import { mockGradeAnswer } from "./mock-grader";
import type { SessionStore } from "./mock-session-store";
import { planIdentities } from "./scoring-context";
import { sessionStore } from "./session-store";

const processState = globalThis as typeof globalThis & {
  mmm42InterviewLocks?: Map<string, Promise<void>>;
};
const locks = processState.mmm42InterviewLocks ?? new Map<string, Promise<void>>();
processState.mmm42InterviewLocks = locks;

export async function withInterviewLock<T>(
  interviewId: string,
  action: () => Promise<T>,
): Promise<T> {
  const prior = locks.get(interviewId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(interviewId, current);
  await prior;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(interviewId) === current) {
      locks.delete(interviewId);
    }
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function id(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new PipelineError("INVALID_INPUT", `${field} must be a nonempty safe identifier.`, 400);
  }
  return value;
}

function startRequest(raw: unknown): StartRequest {
  if (!object(raw)) {
    throw new PipelineError("INVALID_INPUT", "Expected a JSON object.", 400);
  }
  return {
    interviewId: id(raw.interviewId, "interviewId"),
    requestId: id(raw.requestId, "requestId"),
    ...(raw.roleId !== undefined && raw.roleId !== null && { roleId: id(raw.roleId, "roleId") }),
  };
}

const eventKinds = new Set([
  "tabBlur",
  "tabFocus",
  "paste",
  "faceMissing",
  "multipleFaces",
  "lookAway",
  "faceSignalsUnavailable",
]);

function submitRequest(raw: unknown): SubmitTurnRequest {
  if (!object(raw)) {
    throw new PipelineError("INVALID_INPUT", "Expected a JSON object.", 400);
  }
  const interviewId = id(raw.interviewId, "interviewId");
  const requestId = id(raw.requestId, "requestId");
  const expectedTurnId = id(raw.expectedTurnId, "expectedTurnId");
  if (typeof raw.text !== "string" || Buffer.byteLength(raw.text, "utf8") > 100 * 1024) {
    throw new PipelineError(
      "INVALID_INPUT",
      "Spoken transcript must be a string under 100 KiB.",
      400,
    );
  }
  if (
    typeof raw.startMs !== "number" ||
    !Number.isFinite(raw.startMs) ||
    raw.startMs < 0 ||
    typeof raw.endMs !== "number" ||
    !Number.isFinite(raw.endMs) ||
    raw.endMs < raw.startMs
  ) {
    throw new PipelineError("INVALID_INPUT", "Turn timing is invalid.", 400);
  }
  if (
    !Array.isArray(raw.integrityEvents) ||
    raw.integrityEvents.length > 100 ||
    raw.integrityEvents.some(
      (event: unknown) =>
        !object(event) ||
        !eventKinds.has(String(event.kind)) ||
        typeof event.atMs !== "number" ||
        !Number.isFinite(event.atMs) ||
        event.atMs < 0 ||
        (event.durationMs !== undefined &&
          (typeof event.durationMs !== "number" ||
            !Number.isFinite(event.durationMs) ||
            event.durationMs < 0)) ||
        (event.detail !== undefined &&
          (typeof event.detail !== "string" || event.detail.length > 1000)),
    )
  ) {
    throw new PipelineError("INVALID_INPUT", "Integrity events are invalid.", 400);
  }
  if (
    !object(raw.faceSignals) ||
    typeof raw.faceSignals.available !== "boolean" ||
    (raw.faceSignals.reason !== undefined &&
      (typeof raw.faceSignals.reason !== "string" || raw.faceSignals.reason.length > 200))
  ) {
    throw new PipelineError("INVALID_INPUT", "Face signal availability is invalid.", 400);
  }
  if (
    raw.typedAnswer !== undefined &&
    (!Array.isArray(raw.artifacts) ||
      raw.artifacts[0]?.kind !== "code" ||
      raw.typedAnswer !== raw.artifacts[0]?.code)
  ) {
    throw new PipelineError(
      "INVALID_INPUT",
      "typedAnswer must match the code artifact; omit it from new requests.",
      400,
    );
  }
  return {
    interviewId,
    requestId,
    expectedTurnId,
    text: raw.text,
    startMs: raw.startMs,
    endMs: raw.endMs,
    ...(raw.artifacts !== undefined && { artifacts: raw.artifacts as AnswerArtifact[] }),
    integrityEvents: raw.integrityEvents.map((event: Record<string, unknown>) => ({
      kind: event.kind as IntegrityEvent["kind"],
      atMs: event.atMs as number,
      ...(event.durationMs !== undefined && { durationMs: event.durationMs as number }),
      ...(event.detail !== undefined && { detail: event.detail as string }),
    })),
    faceSignals: {
      available: raw.faceSignals.available,
      ...(raw.faceSignals.reason !== undefined && { reason: raw.faceSignals.reason as string }),
    },
  };
}

export async function startAttempt(
  raw: unknown,
  store: SessionStore = sessionStore,
): Promise<TurnReply> {
  const request = startRequest(raw);
  return withInterviewLock(request.interviewId, async () => {
    const existing = await store.loadSession(request.interviewId);
    if (existing) {
      if (existing.record.turns.length === 0 && existing.lastRequestId === null) {
        const session = createOpeningSession(existing.record.plan, request.requestId);
        await store.saveSession(session, null);
        return session.lastReply as TurnReply;
      }
      if (
        existing.record.decisions.length === 1 &&
        existing.lastRequestId === request.requestId &&
        existing.lastReply
      ) {
        return existing.lastReply;
      }
      throw new PipelineError("ALREADY_STARTED", "This attempt has already started.", 409);
    }
    if (process.env.LLM_MODE !== "mock") {
      throw new PipelineError(
        "UNKNOWN_ATTEMPT",
        "Generate a plan before starting this attempt.",
        404,
      );
    }
    if (
      request.interviewId !== "golden-sample-001" &&
      !/^mock-[A-Za-z0-9_-]{1,64}$/.test(request.interviewId)
    ) {
      throw new PipelineError(
        "UNKNOWN_ATTEMPT",
        "No plan exists for this attempt. Use a mock-* ID in mock mode.",
        404,
      );
    }
    const plan = structuredClone(goldenReport.record.plan);
    plan.interviewId = request.interviewId;
    if (request.interviewId.startsWith("mock-whiteboard-")) {
      const technical = plan.claims.find((claim) => claim.id === "c2");
      if (technical) {
        const prompt =
          "Draw the orders API, PostgreSQL read path, and cache. Explain how you keep reads consistent when an order changes.";
        technical.ladder.workspace = { kind: "whiteboard", prompt };
        technical.ladder.scenarioTwist = prompt;
        technical.ladder.codeSnippet = undefined;
      }
    }
    const session = createOpeningSession(plan, request.requestId);
    await store.createSession(session, request.roleId ? { roleId: request.roleId } : undefined);
    return session.lastReply as TurnReply;
  });
}

export async function submitCandidateTurn(
  raw: unknown,
  store: SessionStore = sessionStore,
  grader?: GradeAnswer,
): Promise<TurnReply> {
  const request = submitRequest(raw);
  return withInterviewLock(request.interviewId, async () => {
    const current = await store.loadSession(request.interviewId);
    if (!current) {
      throw new PipelineError("UNKNOWN_ATTEMPT", "Interview attempt not found.", 404);
    }
    if (current.record.turns.length === 0) {
      throw new PipelineError(
        "NOT_STARTED",
        "Start this attempt before submitting an answer.",
        409,
      );
    }
    if (current.lastRequestId === request.requestId && current.record.decisions.length === 1) {
      throw new PipelineError("REQUEST_ID_REUSED", "Use a new request ID for the answer.", 409);
    }
    const identities = planIdentities(request.interviewId);
    // Keep A2's explicitly labeled demo path separate. Planned interviews use B's real adapter,
    // whose mock mode accepts only its documented golden inputs.
    const selectedGrader =
      grader ??
      (identities === null
        ? mockGradeAnswer
        : async (input) =>
            gradeAnswer({
              ...input,
              questionText: redactIdentityText(input.questionText, identities),
              answerText: redactIdentityText(input.answerText, identities),
            }));
    const { session, reply } = await advanceInterview(current, request, selectedGrader);
    if (session !== current) {
      await store.saveSession(session, current.lastRequestId);
    }
    return reply;
  });
}

export async function readSession(interviewId: string, store: SessionStore = sessionStore) {
  const current = await store.loadSession(id(interviewId, "interviewId"));
  if (!current) {
    throw new PipelineError("UNKNOWN_ATTEMPT", "Interview attempt not found.", 404);
  }
  return { record: toClientRecord(current.record), finished: current.finished };
}
