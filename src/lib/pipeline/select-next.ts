import {
  AREA_QUESTION_BUDGET,
  type AreaState,
  type Grade,
  type InterviewPlan,
  MAX_CONSECUTIVE_WEAK,
  RUNG_ORDER,
  type ReasonCode,
  type Rung,
  STRONG_GRADE_MIN,
} from "../../types/pipeline";

export interface Selection {
  reason: ReasonCode;
  claimId: string;
  toRung: Rung;
}

export function selectNext(
  plan: InterviewPlan,
  area: AreaState,
  grade: Grade,
  totalAsked: number,
  visited: ReadonlySet<string>,
): Selection {
  const timeUp = (): Selection => ({
    reason: "TIME_UP",
    claimId: area.claimId,
    toRung: area.currentRung,
  });
  const moveOn = (reason: ReasonCode): Selection => {
    const claim = [...plan.claims]
      .sort((a, b) => a.rank - b.rank)
      .find((item) => !visited.has(item.id));
    return claim ? { reason, claimId: claim.id, toRung: "initial" } : timeUp();
  };

  if (totalAsked >= plan.maxQuestions) {
    return timeUp();
  }

  if (grade >= STRONG_GRADE_MIN) {
    if (area.asked >= AREA_QUESTION_BUDGET) {
      return moveOn("AREA_BUDGET_EXHAUSTED");
    }
    const nextRung = RUNG_ORDER[RUNG_ORDER.indexOf(area.ladderRung) + 1];
    return nextRung
      ? { reason: "STRONG_DEEPEN", claimId: area.claimId, toRung: nextRung }
      : moveOn("LADDER_COMPLETE_NEXT_CLAIM");
  }

  if (area.consecutiveWeak + 1 >= MAX_CONSECUTIVE_WEAK) {
    return moveOn("REPEATED_WEAK_MOVE_ON");
  }
  if (area.asked >= AREA_QUESTION_BUDGET) {
    return moveOn("AREA_BUDGET_EXHAUSTED");
  }
  if (!area.usedFundamental) {
    return { reason: "WEAK_FUNDAMENTAL", claimId: area.claimId, toRung: "fundamental" };
  }
  return moveOn("NEXT_RANKED_CLAIM");
}
