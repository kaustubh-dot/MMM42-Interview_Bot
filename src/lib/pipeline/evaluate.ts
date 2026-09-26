import "server-only";

import { goldenReport } from "@/fixtures/golden-interview";
import { LlmError, generateJson } from "@/lib/llm";
import { identityValuesFrom, redactIdentityText } from "@/lib/prompts/pipeline/blind";
import { EVALUATE_SYSTEM_PROMPT } from "@/lib/prompts/pipeline/evaluate";
import type { Evaluation, InterviewRecord } from "@/types/pipeline";
import type { LlmRequest } from "@/types/pipeline-api";
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
      label,
      anchor,
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
  perClaim: [
    ...goldenReport.evaluation.perClaim.map(({ claimId, score, rationale, citations }) => ({
      claimId,
      score,
      rationale,
      citations: citations.map(({ turnId, start, end, quote }) => ({ turnId, start, end, quote })),
    })),
    {
      claimId: "c4",
      score: 3,
      rationale: "Sample unsupported score citing load testing, which was never spoken.",
      citations: [{ turnId: "t02", start: 0, end: 12, quote: "load testing" }],
    },
  ],
  notes: goldenReport.evaluation.notes.map(({ kind, claimId, turnIds, text }) => ({
    kind,
    claimId,
    turnIds: [...turnIds],
    text,
  })),
  candidateFeedback: (goldenReport.evaluation.candidateFeedback ?? []).map((item) => ({
    claimId: item.claimId,
    strength: item.strength,
    nextStep: item.nextStep,
    citation: {
      turnId: item.citation.turnId,
      start: item.citation.start,
      end: item.citation.end,
      quote: item.citation.quote,
    },
  })),
};

/** A fresh attempt ID is allowed; only identical spoken content, questions and grades prove a sample. */
export function isGoldenSpokenRecord(record: InterviewRecord): boolean {
  const signature = (value: InterviewRecord) =>
    JSON.stringify({
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

/** Reject quotations of identities that were hidden from the evaluator, even if guessed correctly. */
export function validateBlindEvaluation(record: InterviewRecord, raw: unknown): Evaluation {
  const visibleTurns = new Map(
    buildBlindEvaluationInput(record).turns.map((turn) => [turn.id, turn]),
  );
  const visibleCitation = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const citation = value as Record<string, unknown>;
    if (
      typeof citation.turnId !== "string" ||
      typeof citation.start !== "number" ||
      typeof citation.end !== "number" ||
      typeof citation.quote !== "string" ||
      citation.quote.includes("█")
    ) {
      return false;
    }
    const turn = visibleTurns.get(citation.turnId);
    return turn?.text.slice(citation.start, citation.end) === citation.quote;
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return validateEvaluation(record, raw);
  }
  const draft = raw as Record<string, unknown>;
  return validateEvaluation(record, {
    ...draft,
    perClaim: Array.isArray(draft.perClaim)
      ? draft.perClaim.map((item) =>
          typeof item === "object" && item !== null && !Array.isArray(item)
            ? {
                ...item,
                citations: Array.isArray(item.citations)
                  ? item.citations.filter(visibleCitation)
                  : item.citations,
              }
            : item,
        )
      : draft.perClaim,
    candidateFeedback: Array.isArray(draft.candidateFeedback)
      ? draft.candidateFeedback.filter(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            "citation" in item &&
            visibleCitation(item.citation),
        )
      : draft.candidateFeedback,
  });
}

/** One blind evaluator call; keep offsets and validate against the immutable original transcript. */
export async function evaluateRecord(record: InterviewRecord): Promise<Evaluation> {
  const source = structuredClone(record);
  const mockOutput = isGoldenSpokenRecord(source) ? goldenEvaluationMock : null;
  if (process.env.LLM_MODE === "mock" && mockOutput === null) {
    throw new LlmError(
      "LLM_CONFIGURATION",
      "Only the unchanged golden spoken record has a mock evaluation.",
    );
  }
  const request: LlmRequest = {
    task: "evaluate",
    system: EVALUATE_SYSTEM_PROMPT,
    input: buildBlindEvaluationInput(source),
    mockOutput,
  };
  const raw = await generateJson(request);
  try {
    return validateBlindEvaluation(source, raw);
  } catch {
    throw new LlmError("LLM_INVALID_RESPONSE", "Evaluator returned an invalid evaluation shape.");
  }
}
