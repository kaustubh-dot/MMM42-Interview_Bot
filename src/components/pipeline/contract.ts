// PROVISIONAL client-side contract for C's UI.
// These types mirror the A1 interfaces in docs/superpowers/plans/2026-09-26-team-kickoff.md
// ("Interfaces to publish in A1") and CLAUDE.md §4 "Approved contract work".
// TODO(C, after A1 merges): delete this file's local definitions and re-export from
// `@/types/pipeline` / `@/types/pipeline-api` so there is one source of truth.
// Do not extend these shapes here; contract changes go through A.

import type {
  Audit,
  Claim,
  CodeSnippet,
  Decision,
  Evaluation,
  IntegrityEvent,
  IntegrityReport,
  InterviewPlan,
  InterviewRecord,
  QuestionLadder,
  Turn,
} from "@/types/pipeline";

export type WorkspaceSpec = { kind: "code" } | { kind: "whiteboard"; prompt: string };

export type AnswerArtifact =
  | { kind: "code"; language: string; code: string }
  | { kind: "whiteboard"; sceneJson: string };

export type ClientCodeSnippet = Omit<CodeSnippet, "plantedIssue">;

export type ClientClaim = Omit<Claim, "ladder"> & {
  ladder: Omit<QuestionLadder, "codeSnippet"> & {
    codeSnippet?: ClientCodeSnippet;
    workspace?: WorkspaceSpec;
  };
};

export type ClientInterviewPlan = Omit<InterviewPlan, "claims"> & {
  claims: ClientClaim[];
};

export type ClientTurn = Turn & { artifacts?: AnswerArtifact[] };

export type ClientInterviewRecord = Omit<InterviewRecord, "plan" | "turns"> & {
  plan: ClientInterviewPlan;
  turns: ClientTurn[];
};

export interface ClientInterviewReport {
  record: ClientInterviewRecord;
  evaluation: Evaluation;
  audit: Audit;
  integrity: IntegrityReport;
}

export interface FaceSignalAvailability {
  available: boolean;
  reason?: string;
}

export interface StartRequest {
  interviewId: string;
  requestId: string;
}

export interface SubmitTurnRequest {
  interviewId: string;
  requestId: string;
  expectedTurnId: string;
  text: string;
  startMs: number;
  endMs: number;
  artifacts?: AnswerArtifact[];
  integrityEvents: IntegrityEvent[];
  faceSignals: FaceSignalAvailability;
}

export interface TurnReply {
  record: ClientInterviewRecord;
  nextQuestion: Turn | null;
  decision: Decision;
  finished: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// Size limits from CLAUDE.md §4. The server enforces them; the client checks first so an
// oversized submission is rejected visibly while the local draft is kept.
export const MAX_CODE_BYTES = 100 * 1024;
export const MAX_SCENE_BYTES = 500 * 1024;

/**
 * Which workspace (if any) the given AI question opens. Mirrors the agreed rule: only the
 * `scenarioTwist` rung of a technical claim; an explicit workspace wins; a legacy technical
 * claim with a code snippet and no workspace selects code mode.
 */
export function workspaceForQuestion(
  plan: ClientInterviewPlan,
  question: Pick<Turn, "claimId" | "rung">,
): { kind: "code"; snippet: ClientCodeSnippet } | { kind: "whiteboard"; prompt: string } | null {
  if (question.rung !== "scenarioTwist") {
    return null;
  }
  const claim = plan.claims.find((c) => c.id === question.claimId);
  if (!claim?.isTechnical) {
    return null;
  }
  const { workspace, codeSnippet } = claim.ladder;
  if (workspace?.kind === "whiteboard") {
    return { kind: "whiteboard", prompt: workspace.prompt };
  }
  if (codeSnippet && (!workspace || workspace.kind === "code")) {
    return { kind: "code", snippet: codeSnippet };
  }
  return null;
}
