import { goldenReport } from "@/fixtures/golden-interview";
import { identityValuesFrom, redactIdentityText } from "@/lib/prompts/pipeline/blind";
import type { Evaluation, InterviewRecord } from "@/types/pipeline";
import { gradedAnswers, validateEvaluation } from "./citations";

export { validateEvaluation } from "./citations";

export function recordIdentityValues(record: InterviewRecord, knownValues: readonly string[] = []) {
  return identityValuesFrom(
    [
      ...record.turns.map((turn) => turn.text),
      ...record.plan.claims.flatMap((claim) => [claim.claimText, claim.resumeEvidence]),
    ],
    [record.candidateLabel, ...knownValues],
  );
}

/** An explicit allowlist: no resume identities, artifacts, hidden issues, timing or integrity. */
export function buildBlindEvaluationInput(
  record: InterviewRecord,
  knownIdentityValues: readonly string[] = [],
) {
  const identities = recordIdentityValues(record, knownIdentityValues);
  const redact = (text: string) => redactIdentityText(text, identities);
  const grades = gradedAnswers(record);
  return {
    rubric: record.plan.rubric.map(({ grade, label, anchor }) => ({
      grade,
      label: redact(label),
      anchor: redact(anchor),
    })),
    claims: record.plan.claims.map(({ id, skillArea }) => ({ id, skillArea: redact(skillArea) })),
    turns: record.turns.map(({ id, speaker, text, claimId, rung }) => ({
      id,
      speaker,
      text: redact(text),
      claimId,
      rung,
    })),
    grades: record.turns.flatMap((turn) => {
      const grade = grades.get(turn.id);
      return grade === undefined ? [] : [{ turnId: turn.id, grade }];
    }),
  };
}

// Public fixture draft for A's mockOutput. The extra unsupported score reproduces
// the reference's removedUncited=1 instead of trusting a model-supplied count.
export const goldenEvaluationMock = {
  ...goldenReport.evaluation,
  perClaim: [
    ...goldenReport.evaluation.perClaim,
    {
      claimId: "c4",
      score: 3,
      rationale: "Sample unsupported score citing load testing, which was never spoken.",
      citations: [{ turnId: "t02", start: 0, end: 12, quote: "load testing" }],
    },
  ],
};

/** IDs alone never authorize replaying the precomputed sample onto a different interview. */
export function isGoldenSpokenRecord(record: InterviewRecord): boolean {
  const signature = (value: InterviewRecord) =>
    JSON.stringify({
      interviewId: value.plan.interviewId,
      rubric: value.plan.rubric,
      claims: value.plan.claims.map(({ id, skillArea }) => ({ id, skillArea })),
      turns: value.turns.map(({ id, speaker, text, claimId, rung }) => ({
        id,
        speaker,
        text,
        claimId,
        rung,
      })),
      grades: Array.from(gradedAnswers(value).entries()),
    });
  return signature(record) === signature(goldenReport.record);
}

/**
 * Fixture-only service until A1 supplies generateJson and the shared API types.
 * This is an explicit stub, not a live evaluator or a competing LLM adapter.
 * A connects EVALUATE_SYSTEM_PROMPT + buildBlindEvaluationInput to generateJson,
 * then passes its unknown output through validateEvaluation exactly as below.
 */
export async function evaluateRecord(record: InterviewRecord): Promise<Evaluation> {
  if (process.env.LLM_MODE !== "mock" || !isGoldenSpokenRecord(record)) {
    throw new Error(
      "Evaluator integration is pending A1. Only the unchanged golden spoken record with LLM_MODE=mock is supported.",
    );
  }
  return validateEvaluation(record, structuredClone(goldenEvaluationMock));
}
