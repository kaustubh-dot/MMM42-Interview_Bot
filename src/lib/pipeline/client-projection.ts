import "server-only";

import type {
  AnswerArtifact,
  Citation,
  InterviewPlan,
  InterviewRecord,
  InterviewReport,
} from "../../types/pipeline";
import type {
  ClientInterviewPlan,
  ClientInterviewRecord,
  ClientInterviewReport,
} from "../../types/pipeline-api";

// Explicit field allowlists keep future server fields out of serialized responses.
export function toClientPlan(plan: InterviewPlan): ClientInterviewPlan {
  return {
    interviewId: plan.interviewId,
    roleTitle: plan.roleTitle,
    maxQuestions: plan.maxQuestions,
    rubric: plan.rubric.map(({ grade, label, anchor }) => ({ grade, label, anchor })),
    claims: plan.claims.map((claim) => ({
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
        fundamental: claim.ladder.fundamental,
        initial: claim.ladder.initial,
        termFollowUpTemplate: claim.ladder.termFollowUpTemplate,
        scenarioTwist: claim.ladder.scenarioTwist,
        whyDefenseTemplate: claim.ladder.whyDefenseTemplate,
        ...(claim.ladder.codeSnippet && {
          codeSnippet: {
            language: claim.ladder.codeSnippet.language,
            code: claim.ladder.codeSnippet.code,
          },
        }),
        ...(claim.ladder.workspace && {
          workspace:
            claim.ladder.workspace.kind === "code"
              ? { kind: "code" as const }
              : { kind: "whiteboard" as const, prompt: claim.ladder.workspace.prompt },
        }),
      },
    })),
  };
}

function projectArtifact(artifact: AnswerArtifact): AnswerArtifact {
  return artifact.kind === "code"
    ? { kind: "code", language: artifact.language, code: artifact.code }
    : { kind: "whiteboard", sceneJson: artifact.sceneJson };
}

export function toClientRecord(record: InterviewRecord): ClientInterviewRecord {
  return {
    plan: toClientPlan(record.plan),
    candidateLabel: record.candidateLabel,
    startedAt: record.startedAt,
    turns: record.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      text: turn.text,
      startMs: turn.startMs,
      endMs: turn.endMs,
      claimId: turn.claimId,
      rung: turn.rung,
      ...(turn.typedAnswer !== undefined && { typedAnswer: turn.typedAnswer }),
      ...(turn.artifacts !== undefined && { artifacts: turn.artifacts.map(projectArtifact) }),
    })),
    decisions: record.decisions.map((decision) => ({
      turnId: decision.turnId,
      claimId: decision.claimId,
      lastGrade: decision.lastGrade,
      gradedTurnId: decision.gradedTurnId,
      reason: decision.reason,
      fromRung: decision.fromRung,
      toRung: decision.toRung,
      areaState: {
        claimId: decision.areaState.claimId,
        asked: decision.areaState.asked,
        grades: [...decision.areaState.grades],
        consecutiveWeak: decision.areaState.consecutiveWeak,
        currentRung: decision.areaState.currentRung,
        ladderRung: decision.areaState.ladderRung,
        usedFundamental: decision.areaState.usedFundamental,
      },
    })),
    integrityEvents: record.integrityEvents.map((event) => ({
      kind: event.kind,
      atMs: event.atMs,
      ...(event.durationMs !== undefined && { durationMs: event.durationMs }),
      ...(event.turnId !== undefined && { turnId: event.turnId }),
      ...(event.detail !== undefined && { detail: event.detail }),
    })),
    ...(record.chain && {
      chain: record.chain.map(({ seq, kind, refId, prevHash, entryHash }) => ({
        seq,
        kind,
        refId,
        prevHash,
        entryHash,
      })),
    }),
  };
}

function projectCitation({ turnId, start, end, quote }: Citation): Citation {
  return { turnId, start, end, quote };
}

export function toClientReport(report: InterviewReport): ClientInterviewReport {
  return {
    record: toClientRecord(report.record),
    evaluation: {
      perClaim: report.evaluation.perClaim.map((claim) => ({
        claimId: claim.claimId,
        score: claim.score,
        evidenceStrength: claim.evidenceStrength,
        needsHumanReview: claim.needsHumanReview,
        citations: claim.citations.map(projectCitation),
        rationale: claim.rationale,
        ladderPath: [...claim.ladderPath],
      })),
      notes: report.evaluation.notes.map(({ kind, claimId, turnIds, text }) => ({
        kind,
        claimId,
        turnIds: [...turnIds],
        text,
      })),
      removedUncited: report.evaluation.removedUncited,
      ...(report.evaluation.candidateFeedback && {
        candidateFeedback: report.evaluation.candidateFeedback.map((item) => ({
          claimId: item.claimId,
          strength: item.strength,
          nextStep: item.nextStep,
          citation: projectCitation(item.citation),
        })),
      }),
    },
    audit: {
      checks: report.audit.checks.map(({ id, title, status, findings }) => ({
        id,
        title,
        status,
        findings: findings.map(({ text, turnIds }) => ({ text, turnIds: [...turnIds] })),
      })),
      precomputed: report.audit.precomputed,
      ...(report.audit.counterfactual && {
        counterfactual: report.audit.counterfactual.map((item) => ({
          turnId: item.turnId,
          originalScore: item.originalScore,
          rephrasedScore: item.rephrasedScore,
          placeboScore: item.placeboScore,
        })),
      }),
    },
    integrity: {
      level: report.integrity.level,
      totalPoints: report.integrity.totalPoints,
      disclaimer: report.integrity.disclaimer,
      signals: report.integrity.signals.map((signal) => ({
        name: signal.name,
        value: signal.value,
        unit: signal.unit,
        threshold: signal.threshold,
        points: signal.points,
        available: signal.available,
        benignExplanations: [...signal.benignExplanations],
      })),
    },
  };
}
