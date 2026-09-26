// Two ways to run the interview screen with one interface:
// - live: A's turn API (server grades, selects and records every turn)
// - fixture replay: steps through the sanitized golden sample. Questions and decisions come
//   from the recorded sample regardless of what the candidate says; nothing is graded.
//   The UI labels this mode everywhere it appears.

import { newRequestId, startInterview, submitTurn } from "./api-client";
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
  /** Fixture only: the sample candidate's answer to this question, for demo convenience. */
  sampleAnswerFor?: (questionTurnId: string) => string | null;
}

export function createLiveDriver(interviewId: string): InterviewDriver {
  return {
    mode: "live",
    interviewId,
    start: () => startInterview({ interviewId, requestId: newRequestId() }),
    submit: submitTurn,
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
    sampleAnswerFor: (questionTurnId) => {
      const pos = full.turns.findIndex((t) => t.id === questionTurnId);
      const next = full.turns[pos + 1];
      return next?.speaker === "candidate" ? next.text : null;
    },
  };
}
