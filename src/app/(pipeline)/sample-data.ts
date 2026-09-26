// SERVER-ONLY. Imported only by server components in this route group.
// It reads the full golden fixture (which contains hidden `plantedIssue` answers) and
// returns an explicit allowlisted projection that is safe to pass to client components.
// Never import this module (or `@/fixtures/golden-interview`) from a "use client" file.
// TODO(C, after A1 merges): replace `toClientReport` with A's `client-projection.ts` and the
// sanitized fixture export.

import type {
  ClientClaim,
  ClientInterviewPlan,
  ClientInterviewReport,
  ClientTurn,
} from "@/components/pipeline/contract";
import { goldenReport } from "@/fixtures/golden-interview";
import type { Claim, InterviewPlan, InterviewReport, Turn } from "@/types/pipeline";

export const SAMPLE_INTERVIEW_ID = goldenReport.record.plan.interviewId;

function toClientClaim(claim: Claim): ClientClaim {
  const { ladder } = claim;
  return {
    id: claim.id,
    skillArea: claim.skillArea,
    isTechnical: claim.isTechnical,
    claimText: claim.claimText,
    resumeEvidence: claim.resumeEvidence,
    jdRequirement: claim.jdRequirement,
    jdWeight: claim.jdWeight,
    specificity: claim.specificity,
    rank: claim.rank,
    ladder: {
      fundamental: ladder.fundamental,
      initial: ladder.initial,
      termFollowUpTemplate: ladder.termFollowUpTemplate,
      scenarioTwist: ladder.scenarioTwist,
      whyDefenseTemplate: ladder.whyDefenseTemplate,
      // Allowlist: language + code only. plantedIssue stays on the server.
      ...(ladder.codeSnippet
        ? { codeSnippet: { language: ladder.codeSnippet.language, code: ladder.codeSnippet.code } }
        : {}),
    },
  };
}

function toClientPlan(plan: InterviewPlan): ClientInterviewPlan {
  return {
    interviewId: plan.interviewId,
    roleTitle: plan.roleTitle,
    claims: plan.claims.map(toClientClaim),
    rubric: plan.rubric,
    maxQuestions: plan.maxQuestions,
  };
}

function toClientTurn(turn: Turn): ClientTurn {
  return {
    id: turn.id,
    speaker: turn.speaker,
    text: turn.text,
    startMs: turn.startMs,
    endMs: turn.endMs,
    claimId: turn.claimId,
    rung: turn.rung,
    ...(turn.typedAnswer !== undefined ? { typedAnswer: turn.typedAnswer } : {}),
  };
}

export function toClientReport(report: InterviewReport): ClientInterviewReport {
  const { record } = report;
  const safe: ClientInterviewReport = {
    record: {
      plan: toClientPlan(record.plan),
      candidateLabel: record.candidateLabel,
      startedAt: record.startedAt,
      turns: record.turns.map(toClientTurn),
      decisions: record.decisions,
      integrityEvents: record.integrityEvents,
      chain: record.chain,
    },
    evaluation: report.evaluation,
    audit: report.audit,
    integrity: report.integrity,
  };
  // Belt and braces: fail loudly on the server rather than ship a hidden answer.
  if (JSON.stringify(safe).includes("plantedIssue")) {
    throw new Error("Sanitized fixture still contains plantedIssue");
  }
  return safe;
}

export function getSampleReport(): ClientInterviewReport {
  return toClientReport(goldenReport);
}
