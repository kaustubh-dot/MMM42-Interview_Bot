import "server-only";

import { goldenReport } from "@/fixtures/golden-interview";
import { LlmError, generateJson } from "@/lib/llm";
import { identityValuesFrom, redactIdentityText } from "@/lib/prompts/pipeline/blind";
import { GRADE_SYSTEM_PROMPT } from "@/lib/prompts/pipeline/grade";
import type { RubricLevel } from "@/types/pipeline";
import type { GradeInput, GradeResult, LlmRequest } from "@/types/pipeline-api";
import { gradedAnswers, isGrade } from "./citations";

function validateRubric(rubric: RubricLevel[]): void {
  if (
    !Array.isArray(rubric) ||
    rubric.length !== 4 ||
    new Set(rubric.map((level) => level?.grade)).size !== 4 ||
    rubric.some(
      (level) =>
        !level ||
        !isGrade(level.grade) ||
        typeof level.label !== "string" ||
        !level.label.trim() ||
        typeof level.anchor !== "string" ||
        !level.anchor.trim(),
    )
  ) {
    throw new Error("Grader requires the four shared rubric anchors, one for each grade 0–3.");
  }
}

/** Rebuild only the documented fields; runtime extra fields cannot leak into scoring. */
export function buildBlindGradeInput(input: GradeInput) {
  validateRubric(input.rubric);
  if (
    typeof input.claimId !== "string" ||
    !input.claimId.trim() ||
    typeof input.questionText !== "string" ||
    !input.questionText.trim() ||
    typeof input.answerText !== "string"
  ) {
    throw new Error("Grader requires a claim, question and spoken answer text.");
  }
  const identities = identityValuesFrom([input.questionText, input.answerText]);
  return {
    rubric: input.rubric.map(({ grade, label, anchor }) => ({ grade, label, anchor })),
    claimId: input.claimId,
    questionText: redactIdentityText(input.questionText, identities),
    answerText: redactIdentityText(input.answerText, identities),
  };
}

export function validateGradeResult(answerText: string, raw: unknown): GradeResult {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !("grade" in raw) ||
    !isGrade(raw.grade)
  ) {
    throw new Error("Grader returned an invalid grade; expected an integer from 0 to 3.");
  }
  if (!answerText.trim()) {
    return { grade: 0, term: null, quote: null };
  }
  const candidateWords = (value: unknown) =>
    typeof value === "string" && value.trim() && !value.includes("█") && answerText.includes(value)
      ? value
      : null;
  return {
    grade: raw.grade,
    term: candidateWords("term" in raw ? raw.term : null),
    quote: candidateWords("quote" in raw ? raw.quote : null),
  };
}

const GOLDEN_TERMS: Record<string, string> = {
  t02: "composite index on customer_id and created_at",
  t04: "created_at first",
  t06: "SELECT star",
  t08: "DATE()",
  t10: "in-memory store",
  t12: "TTL-based expiry",
  t14: "outbox table",
  t16: "unique constraint",
};

function fixtureGrade(input: GradeInput) {
  const index = goldenReport.record.turns.findIndex(
    (turn, i, turns) =>
      turn.speaker === "candidate" &&
      turn.claimId === input.claimId &&
      turn.text === input.answerText &&
      i > 0 &&
      turns[i - 1].speaker === "ai" &&
      turns[i - 1].text === input.questionText,
  );
  if (
    index < 0 ||
    JSON.stringify(input.rubric) !== JSON.stringify(goldenReport.record.plan.rubric)
  ) {
    return null;
  }
  const turn = goldenReport.record.turns[index];
  const grade = gradedAnswers(goldenReport.record).get(turn.id);
  const citation = goldenReport.evaluation.perClaim
    .flatMap((claim) => claim.citations)
    .find((item) => item.turnId === turn.id);
  return {
    grade: grade ?? 0,
    term: GOLDEN_TERMS[turn.id],
    quote: citation?.quote ?? null,
  };
}

/** At most one call with the actual plan rubric; silence deterministically means No evidence. */
export async function gradeAnswer(input: GradeInput): Promise<GradeResult> {
  const blind = buildBlindGradeInput(input);
  if (!input.answerText.trim()) {
    return { grade: 0, term: null, quote: null };
  }
  const mockOutput = fixtureGrade(input);
  if (process.env.LLM_MODE === "mock" && mockOutput === null) {
    throw new LlmError(
      "LLM_CONFIGURATION",
      "Only exact golden question/answer pairs and the shared fixture rubric have mock grades.",
    );
  }
  const request: LlmRequest = {
    task: "grade",
    system: GRADE_SYSTEM_PROMPT,
    input: blind,
    mockOutput,
  };
  const raw = await generateJson(request);
  try {
    return validateGradeResult(blind.answerText, raw);
  } catch {
    throw new LlmError("LLM_INVALID_RESPONSE", "Grader returned an invalid 0–3 grade.");
  }
}
