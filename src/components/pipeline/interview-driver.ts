// Two ways to run the interview screen with one interface:
// - live: A's turn API (server grades, selects and records every turn). In LLM_MODE=mock the
//   server runs its labeled mock engine with in-memory storage; the UI shows that label.
// - fixture replay: steps through the sanitized golden sample. Questions and decisions come
//   from the recorded sample regardless of what the candidate says; nothing is graded.
//   The UI labels this mode everywhere it appears.

import { getSession, newRequestId, startInterview, submitTurn } from "./api-client";
import type {
  ClientInterviewRecord,
  ClientInterviewReport,
  ClientTurn,
  SubmitTurnRequest,
  TurnReply,
} from "./contract";

export interface InterviewDriver {
  mode: "live" | "fixture";
  interviewId: string;
  start: () => Promise<TurnReply>;
  submit: (req: SubmitTurnRequest) => Promise<TurnReply>;
  /** Live only: reload the last accepted state (after a refresh or a 409 conflict). */
  recover?: () => Promise<TurnReply>;
  /** Demo convenience: the sample candidate's answer to the question with this text. */
  sampleAnswerFor?: (question: { id: string; text: string; claimId: string; rung: string }) =>
    | string
    | null;
}

/** Rebuilds the screen state from GET /session. */
function replyFromSession(record: ClientInterviewRecord, finished: boolean): TurnReply {
  const last = record.turns.at(-1);
  const decision = record.decisions.at(-1);
  if (!decision) {
    throw new Error("This interview hasn't started yet.");
  }
  return {
    record,
    nextQuestion: !finished && last?.speaker === "ai" ? last : null,
    decision,
    finished,
  };
}

/**
 * Sample answers for the demo: match the recorded question by text, or else by claim and rung
 * (the mock engine words follow-ups with a safe template, so the text can differ).
 */
function sampleAnswers(sample?: ClientInterviewReport) {
  if (!sample) {
    return undefined;
  }
  const turns = sample.record.turns;
  const answerAfter = (i: number) =>
    i >= 0 && turns[i + 1]?.speaker === "candidate" ? turns[i + 1].text : null;
  return (question: { text: string; claimId: string; rung: string }) => {
    const byText = turns.findIndex((t) => t.speaker === "ai" && t.text === question.text);
    if (byText >= 0) {
      return answerAfter(byText);
    }
    return answerAfter(
      turns.findIndex(
        (t) => t.speaker === "ai" && t.claimId === question.claimId && t.rung === question.rung,
      ),
    );
  };
}

export function createLiveDriver(
  interviewId: string,
  sample?: ClientInterviewReport,
  roleId?: string,
): InterviewDriver {
  return {
    mode: "live",
    interviewId,
    start: () =>
      startInterview({ interviewId, requestId: newRequestId(), ...(roleId && { roleId }) }),
    submit: submitTurn,
    recover: async () => {
      const s = await getSession(interviewId);
      return replyFromSession(s.record, s.finished);
    },
    sampleAnswerFor: sampleAnswers(sample),
  };
}

export function createFixtureDriver(sample: ClientInterviewReport): InterviewDriver {
  const full = sample.record;
  const aiTurns = full.turns.filter((t) => t.speaker === "ai");
  const decisionFor = (turnId: string) => {
    const d = full.decisions.find((x) => x.turnId === turnId);
    if (!d) {
      throw new Error(`Fixture has no decision for ${turnId}`);
    }
    return d;
  };
  // What the candidate actually submitted in this replay, by the fixture candidate turn ID.
  const submitted = new Map<string, ClientTurn>();
  const replies = new Map<string, TurnReply>();

  const recordUpTo = (aiIndex: number): ClientInterviewRecord => {
    const last = aiTurns[aiIndex];
    const cut = full.turns.findIndex((t) => t.id === last.id);
    const turns = full.turns.slice(0, cut + 1).map((t) => submitted.get(t.id) ?? t);
    const turnIds = new Set(turns.map((t) => t.id));
    return {
      ...full,
      turns,
      decisions: full.decisions.filter((d) => turnIds.has(d.turnId)),
      integrityEvents: [],
      chain: undefined,
    };
  };

  const replyAt = (aiIndex: number): TurnReply => {
    const question = aiTurns[aiIndex];
    const finished = aiIndex === aiTurns.length - 1;
    return {
      record: recordUpTo(aiIndex),
      nextQuestion: question,
      decision: decisionFor(question.id),
      finished,
    };
  };

  return {
    mode: "fixture",
    interviewId: full.plan.interviewId,
    start: async () => replyAt(0),
    submit: async (req) => {
      const cached = replies.get(req.requestId);
      if (cached) {
        return cached;
      }
      const qIndex = aiTurns.findIndex((t) => t.id === req.expectedTurnId);
      if (qIndex < 0 || qIndex >= aiTurns.length - 1) {
        throw new Error("This question is not part of the sample replay.");
      }
      const qPos = full.turns.findIndex((t) => t.id === req.expectedTurnId);
      const answerSlot = full.turns[qPos + 1];
      if (answerSlot?.speaker === "candidate") {
        submitted.set(answerSlot.id, {
          ...answerSlot,
          text: req.text,
          startMs: req.startMs,
          endMs: req.endMs,
          ...(req.artifacts?.length ? { artifacts: req.artifacts } : {}),
        });
      }
      const reply = replyAt(qIndex + 1);
      replies.set(req.requestId, reply);
      return reply;
    },
    sampleAnswerFor: (question) => {
      const pos = full.turns.findIndex((t) => t.id === question.id);
      const next = full.turns[pos + 1];
      return next?.speaker === "candidate" ? next.text : null;
    },
  };
}
