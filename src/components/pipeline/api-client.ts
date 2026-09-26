// Browser client for A's pipeline routes (docs/superpowers/plans/2026-09-26-team-kickoff.md,
// endpoint table). The server assigns turn IDs, claims, rungs, grades and decisions; this
// client only sends what the candidate produced.

import type {
  ClientInterviewPlan,
  ClientInterviewRecord,
  ClientInterviewReport,
  PipelineErrorResponse,
  StartRequest,
  SubmitTurnRequest,
  TurnReply,
} from "./contract";

export class PipelineApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  /** The route does not exist yet (A's service not deployed) or the network is down. */
  get serviceUnavailable(): boolean {
    return this.status === 0 || this.status === 404 || this.code === "not_found_route";
  }
}

/** How the server is running, from A's X-Pipeline-Mode / X-Pipeline-Storage headers. */
export interface PipelineMode {
  engine: string | null; // "mock" | "gemini"
  storage: string | null; // e.g. "mock-memory"
}

let lastMode: PipelineMode = { engine: null, storage: null };
/** Mode reported by the most recent pipeline response. */
export const pipelineMode = (): PipelineMode => lastMode;

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new PipelineApiError(0, "network", "Could not reach the server. Check the connection.");
  }
  if (res.headers.get("X-Pipeline-Mode") || res.headers.get("X-Pipeline-Storage")) {
    lastMode = {
      engine: res.headers.get("X-Pipeline-Mode"),
      storage: res.headers.get("X-Pipeline-Storage"),
    };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON (e.g. Next's 404 page) falls through to the generic error below.
  }
  if (!res.ok) {
    const err = (body as PipelineErrorResponse | null)?.error;
    if (!err && res.status === 404) {
      throw new PipelineApiError(
        404,
        "not_found_route",
        "The live interview service is not available yet.",
      );
    }
    throw new PipelineApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? `Request failed (${res.status}).`,
    );
  }
  return body as T;
}

const json = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createPlan(input: {
  resume: File;
  jdText?: string;
  jd?: File;
  /** FoloUp role (interview.id) from a /interview?role= link; files the attempt under it. */
  roleId?: string;
}): Promise<ClientInterviewPlan> {
  const form = new FormData();
  form.append("resume", input.resume);
  if (input.roleId) {
    form.append("roleId", input.roleId);
  }
  if (input.jd) {
    form.append("jd", input.jd);
  } else if (input.jdText) {
    form.append("jdText", input.jdText);
  }
  const res = await call<{ plan: ClientInterviewPlan }>("/api/pipeline/plan", {
    method: "POST",
    body: form,
  });
  return res.plan;
}

export interface SessionState {
  record: ClientInterviewRecord;
  finished: boolean;
}

/** Last accepted state of an attempt (refresh recovery and 409 conflicts). */
export function getSession(interviewId: string): Promise<SessionState> {
  return call<SessionState>(
    `/api/pipeline/session?interviewId=${encodeURIComponent(interviewId)}`,
    {
      method: "GET",
    },
  );
}

export function startInterview(req: StartRequest): Promise<TurnReply> {
  return call<TurnReply>("/api/pipeline/start", json(req));
}

export function submitTurn(req: SubmitTurnRequest): Promise<TurnReply> {
  return call<TurnReply>("/api/pipeline/turn", json(req));
}

export async function generateReport(interviewId: string): Promise<ClientInterviewReport> {
  const res = await call<{ report: ClientInterviewReport }>(
    "/api/pipeline/report",
    json({ interviewId }),
  );
  return res.report;
}

export async function loadReport(interviewId: string): Promise<ClientInterviewReport> {
  const res = await call<{ report: ClientInterviewReport }>(
    `/api/pipeline/report?interviewId=${encodeURIComponent(interviewId)}`,
    { method: "GET" },
  );
  return res.report;
}
