import type { Grade, ReasonCode, Rung } from "@/types/pipeline";

export const GRADE_LABELS: Record<Grade, string> = {
  0: "No evidence",
  1: "Surface",
  2: "Working",
  3: "Deep",
};

export function priorityScore(jdWeight: number, specificity: number): number {
  return jdWeight * (1 - specificity);
}

// Student-friendly wording used in the candidate and report UI. The machine-readable reason
// code is still shown next to it.
export const FRIENDLY_REASONS: Record<ReasonCode, { title: string; detail: string }> = {
  OPENING_TOP_RANKED_CLAIM: {
    title: "Starting with your most important topic",
    detail: "This is the resume claim the job cares about most and that needs the most detail.",
  },
  STRONG_DEEPEN: {
    title: "Good answer, so going one level deeper",
    detail: "Your last answer scored 2 or more out of 3, so the next question digs further.",
  },
  WEAK_FUNDAMENTAL: {
    title: "Stepping back to the basics",
    detail:
      "Your last answer scored 1 or less, so here is a simpler question. This happens once per topic.",
  },
  AREA_BUDGET_EXHAUSTED: {
    title: "Moving to the next topic",
    detail: "We've asked 4 questions on that topic, which is the limit.",
  },
  REPEATED_WEAK_MOVE_ON: {
    title: "Moving on to give you a fresh start",
    detail: "Two tough answers in a row on one topic, so we switch to the next one.",
  },
  LADDER_COMPLETE_NEXT_CLAIM: {
    title: "Topic complete",
    detail: "You reached the deepest question on that topic, so we move on.",
  },
  NEXT_RANKED_CLAIM: {
    title: "Next topic",
    detail: "Moving to the next most important claim on your resume.",
  },
  TIME_UP: {
    title: "That's the last question",
    detail: "The interview has reached its question limit.",
  },
};

export const FRIENDLY_RUNGS: Record<Rung, string> = {
  fundamental: "Back to basics",
  initial: "Opening question",
  termFollowUp: "Follow-up on your words",
  scenarioTwist: "Real-world twist",
  whyDefense: "Defend your choice",
};
