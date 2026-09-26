import "server-only";

import { goldenReport } from "../../fixtures/golden-interview";
import type { GradeInput, GradeResult } from "../../types/pipeline-api";
import { generateJson } from "../llm";
import { PipelineError } from "./errors";

const goldenAnswers = goldenReport.record.turns.filter((turn) => turn.speaker === "candidate");
const goldenGrades = [3, 3, 1, 2, 1, 0, 3, 3] as const;

// MOCK ONLY: exact golden transcript answers use the fixture grades; other spoken
// answers receive Surface (1). This does not estimate real candidate performance.
export async function mockGradeAnswer(input: GradeInput): Promise<GradeResult> {
  if (process.env.LLM_MODE !== "mock") {
    throw new PipelineError(
      "GRADER_UNAVAILABLE",
      "B's live grader is not connected. Set LLM_MODE=mock for the demo.",
      502,
    );
  }
  const index = goldenAnswers.findIndex(
    (turn) => turn.claimId === input.claimId && turn.text === input.answerText,
  );
  const raw: unknown = await generateJson({
    task: "grade",
    system: "MOCK FIXTURE ONLY: grade the spoken answer; artifacts are excluded.",
    input: {
      rubric: input.rubric.map(({ grade, label, anchor }) => ({ grade, label, anchor })),
      claimId: input.claimId,
      questionText: input.questionText,
      answerText: input.answerText,
    },
    mockOutput: { grade: index >= 0 ? goldenGrades[index] : 1, term: null, quote: null },
  });
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !Number.isInteger((raw as Record<string, unknown>).grade) ||
    ![0, 1, 2, 3].includes((raw as Record<string, unknown>).grade as number) ||
    (raw as Record<string, unknown>).term !== null ||
    (raw as Record<string, unknown>).quote !== null
  ) {
    throw new PipelineError("GRADE_INVALID", "The mock grader returned an invalid response.", 502);
  }
  return raw as GradeResult;
}
