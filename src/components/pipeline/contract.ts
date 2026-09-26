// C's view of the shared contract. Types come from A's single definitions in
// `@/types/pipeline` and `@/types/pipeline-api`; this file only re-exports them and adds
// UI helpers. Contract changes go through A.

import type { Turn } from "@/types/pipeline";
import type { ClientCodeSnippet, ClientInterviewPlan } from "@/types/pipeline-api";

export type { AnswerArtifact, QuestionWorkspace } from "@/types/pipeline";
export type {
  ClientClaim,
  ClientCodeSnippet,
  ClientInterviewPlan,
  ClientInterviewRecord,
  ClientInterviewReport,
  FaceSignalAvailability,
  PipelineErrorResponse,
  StartRequest,
  SubmitTurnRequest,
  TurnReply,
} from "@/types/pipeline-api";

/** Turns in client records carry at most one optional artifact (`Turn.artifacts`). */
export type ClientTurn = Turn;

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
