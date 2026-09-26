import type { ClientInterviewReport } from "../../types/pipeline-api";

// Browser-safe mapping for C: absent scores are never represented as a zero score.
export function claimAssessmentStatuses(report: ClientInterviewReport) {
  return report.record.plan.claims.map((claim) => ({
    claimId: claim.id,
    status: report.evaluation.perClaim.some((item) => item.claimId === claim.id)
      ? ("assessed" as const)
      : report.record.turns.some(
            (turn) => turn.speaker === "candidate" && turn.claimId === claim.id && turn.text.trim(),
          )
        ? ("no_supported_score" as const)
        : ("not_assessed" as const),
  }));
}
