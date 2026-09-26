import type { ConcernLevel, Grade, ReasonCode, Rung } from "@/types/pipeline";

export const REASON_LABELS: Record<ReasonCode, string> = {
  OPENING_TOP_RANKED_CLAIM: "Opening on the top-ranked claim",
  STRONG_DEEPEN: "Strong answer (grade ≥2): climb one rung",
  WEAK_FUNDAMENTAL: "Weak answer (≤1): drop to a fundamental question (once per area)",
  AREA_BUDGET_EXHAUSTED: "4 questions asked in this area: move to the next claim",
  REPEATED_WEAK_MOVE_ON: "2 weak answers in a row: move to the next claim",
  LADDER_COMPLETE_NEXT_CLAIM: "Ladder complete: move to the next claim",
  NEXT_RANKED_CLAIM: "Move to the next highest-ranked claim",
  TIME_UP: "Question limit reached: interview ends",
};

export const RUNG_LABELS: Record<Rung, string> = {
  fundamental: "Fundamental",
  initial: "Initial",
  termFollowUp: "Term follow-up",
  scenarioTwist: "Scenario twist",
  whyDefense: "Why-defense",
};

export const GRADE_LABELS: Record<Grade, string> = {
  0: "No evidence",
  1: "Surface",
  2: "Working",
  3: "Deep",
};

export const SELECTION_RULE =
  "A strong answer (grade ≥2) climbs one rung: initial → term follow-up → scenario twist → why-defense. A weak answer (≤1) drops to a fundamental question, once per area. After 4 questions in an area, or 2 weak answers in a row, we move to the next highest-ranked claim.";

export const CONCERN_STYLES: Record<ConcernLevel, string> = {
  Low: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Medium: "bg-amber-50 text-amber-900 border-amber-200",
  High: "bg-orange-100 text-orange-900 border-orange-300",
};

export function priorityScore(jdWeight: number, specificity: number): number {
  return jdWeight * (1 - specificity);
}
