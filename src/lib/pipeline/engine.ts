import "server-only";

import {
  type AreaState,
  type Claim,
  type Decision,
  type InterviewPlan,
  RUNG_ORDER,
  type Rung,
  STRONG_GRADE_MIN,
  type Turn,
} from "../../types/pipeline";
import type {
  GradeInput,
  GradeResult,
  SavedSession,
  SubmitTurnRequest,
  TurnReply,
} from "../../types/pipeline-api";
import { questionWorkspace, validateArtifacts } from "./answer-artifact";
import { toClientRecord } from "./client-projection";
import { PipelineError } from "./errors";
import { selectNext } from "./select-next";

export const CLOSING_TEXT =
  "That's all the time we have. Thank you for walking me through your work today.";

export { PipelineError, questionWorkspace };

export type GradeAnswer = (input: GradeInput) => Promise<GradeResult>;

function turnId(index: number): string {
  return `t${String(index).padStart(2, "0")}`;
}

function newArea(claimId: string): AreaState {
  return {
    claimId,
    asked: 0,
    grades: [],
    consecutiveWeak: 0,
    currentRung: "initial",
    ladderRung: "initial",
    usedFundamental: false,
  };
}

function validCandidateValue(value: string | null, answerText: string): value is string {
  return typeof value === "string" && value.trim().length > 0 && answerText.includes(value);
}

export function questionText(
  claim: Claim,
  rung: Rung,
  grade: GradeResult | null,
  answerText: string,
): string {
  const ladder = claim.ladder;
  if (rung === "initial") {
    return ladder.initial;
  }
  if (rung === "fundamental") {
    return ladder.fundamental;
  }
  if (rung === "scenarioTwist") {
    return claim.isTechnical && ladder.workspace?.kind === "whiteboard"
      ? ladder.workspace.prompt
      : ladder.scenarioTwist;
  }
  if (rung === "termFollowUp") {
    return grade && validCandidateValue(grade.term, answerText)
      ? ladder.termFollowUpTemplate.replaceAll("{{term}}", () => grade.term as string)
      : `In your ${claim.skillArea} work, what mechanism did you use, and why?`;
  }
  return grade && validCandidateValue(grade.quote, answerText)
    ? ladder.whyDefenseTemplate.replaceAll("{{quote}}", () => grade.quote as string)
    : "Why was that approach the right choice over the alternatives?";
}

function reply(session: SavedSession, question: Turn | null, decision: Decision): TurnReply {
  return {
    record: toClientRecord(session.record),
    nextQuestion: question,
    decision,
    finished: session.finished,
  };
}

export function createOpeningSession(
  plan: InterviewPlan,
  requestId: string,
  startedAt: string = new Date().toISOString(),
): SavedSession {
  const top = [...plan.claims].sort((a, b) => a.rank - b.rank)[0];
  if (!top || plan.maxQuestions < 1) {
    throw new PipelineError(
      "INVALID_PLAN",
      "An interview needs a ranked claim and question budget.",
      400,
    );
  }
  const area = newArea(top.id);
  area.asked = 1;
  const question: Turn = {
    id: "t01",
    speaker: "ai",
    text: questionText(top, "initial", null, ""),
    startMs: 0,
    endMs: 0,
    claimId: top.id,
    rung: "initial",
  };
  const decision: Decision = {
    turnId: question.id,
    claimId: top.id,
    lastGrade: null,
    gradedTurnId: null,
    reason: "OPENING_TOP_RANKED_CLAIM",
    fromRung: null,
    toRung: "initial",
    areaState: area,
  };
  const session: SavedSession = {
    record: {
      plan: structuredClone(plan),
      candidateLabel: "Candidate A",
      startedAt,
      turns: [question],
      decisions: [decision],
      integrityEvents: [],
    },
    lastRequestId: requestId,
    lastReply: null,
    finished: false,
    faceSignals: { available: false },
  };
  session.lastReply = reply(session, question, decision);
  return session;
}

export async function advanceInterview(
  current: SavedSession,
  request: SubmitTurnRequest,
  gradeAnswer: GradeAnswer,
): Promise<{ session: SavedSession; reply: TurnReply }> {
  if (request.requestId === current.lastRequestId && current.lastReply) {
    const accepted = current.record.turns.at(-2);
    const answeredQuestion = current.record.turns.at(-3);
    const claim = current.record.plan.claims.find((item) => item.id === accepted?.claimId);
    if (
      !accepted ||
      !claim ||
      accepted.speaker !== "candidate" ||
      request.interviewId !== current.record.plan.interviewId ||
      request.expectedTurnId !== answeredQuestion?.id ||
      request.text !== accepted.text ||
      request.startMs !== accepted.startMs ||
      request.endMs !== accepted.endMs ||
      JSON.stringify(validateArtifacts(request.artifacts, claim, accepted.rung)) !==
        JSON.stringify(accepted.artifacts ?? [])
    ) {
      throw new PipelineError(
        "REQUEST_ID_REUSED",
        "This request ID already belongs to a different submission.",
        409,
      );
    }
    return { session: current, reply: current.lastReply };
  }
  const record = current.record;
  const question = record.turns.at(-1);
  if (current.finished || question?.speaker !== "ai" || request.expectedTurnId !== question.id) {
    throw new PipelineError(
      "STALE_TURN",
      "The expected question is no longer current. Reload the session.",
      409,
    );
  }
  if (request.interviewId !== record.plan.interviewId) {
    throw new PipelineError("INVALID_INPUT", "The interview ID does not match this session.", 400);
  }
  const claim = record.plan.claims.find((item) => item.id === question.claimId);
  if (!claim) {
    throw new PipelineError("INVALID_PLAN", "The active claim is missing from the plan.", 400);
  }
  const artifacts = validateArtifacts(request.artifacts, claim, question.rung);

  // Only the spoken transcript reaches B's grader. Artifacts and integrity stay outside the score.
  const grade = await gradeAnswer({
    rubric: record.plan.rubric,
    claimId: claim.id,
    questionText: question.text,
    answerText: request.text,
  });
  if (!Number.isInteger(grade.grade) || grade.grade < 0 || grade.grade > 3) {
    throw new PipelineError(
      "GRADE_INVALID",
      "The grader returned an invalid grade. Retry the turn.",
      502,
    );
  }

  const session: SavedSession = structuredClone(current);
  const nextRecord = session.record;
  const answer: Turn = {
    id: turnId(nextRecord.turns.length + 1),
    speaker: "candidate",
    text: request.text,
    startMs: request.startMs,
    endMs: request.endMs,
    claimId: question.claimId,
    rung: question.rung,
    ...(artifacts.length > 0 && { artifacts }),
    ...(artifacts[0]?.kind === "code" && { typedAnswer: artifacts[0].code }),
  };
  nextRecord.turns.push(answer);
  nextRecord.integrityEvents.push(
    ...request.integrityEvents.map((event) => ({ ...event, turnId: answer.id })),
  );

  const prior = nextRecord.decisions.at(-1);
  if (!prior) {
    throw new PipelineError("INVALID_SESSION", "The opening decision is missing.", 409);
  }
  const selection = selectNext(
    nextRecord.plan,
    prior.areaState,
    grade.grade,
    nextRecord.decisions.filter((decision) => decision.reason !== "TIME_UP").length,
    new Set(nextRecord.decisions.map((decision) => decision.claimId)),
  );
  const continuing = selection.claimId === claim.id;
  const area = continuing ? structuredClone(prior.areaState) : newArea(selection.claimId);
  if (continuing) {
    area.grades.push(grade.grade);
    // Reference TIME_UP happens before touching the weak count.
    if (nextRecord.decisions.length < nextRecord.plan.maxQuestions) {
      area.consecutiveWeak = grade.grade >= STRONG_GRADE_MIN ? 0 : area.consecutiveWeak + 1;
    }
  }
  if (selection.reason !== "TIME_UP") {
    area.currentRung = selection.toRung;
    if (RUNG_ORDER.indexOf(selection.toRung) > RUNG_ORDER.indexOf(area.ladderRung)) {
      area.ladderRung = selection.toRung;
    }
    if (selection.toRung === "fundamental") {
      area.usedFundamental = true;
    }
    area.asked += 1;
  }
  const nextClaim = nextRecord.plan.claims.find((item) => item.id === selection.claimId);
  if (!nextClaim) {
    throw new PipelineError("INVALID_PLAN", "The next claim is missing from the plan.", 400);
  }
  const finished = selection.reason === "TIME_UP";
  const nextQuestion: Turn = {
    id: turnId(nextRecord.turns.length + 1),
    speaker: "ai",
    text: finished ? CLOSING_TEXT : questionText(nextClaim, selection.toRung, grade, request.text),
    startMs: request.endMs,
    endMs: request.endMs,
    claimId: selection.claimId,
    rung: selection.toRung,
  };
  nextRecord.turns.push(nextQuestion);
  const decision: Decision = {
    turnId: nextQuestion.id,
    claimId: selection.claimId,
    lastGrade: grade.grade,
    gradedTurnId: answer.id,
    reason: selection.reason,
    fromRung: question.rung,
    toRung: selection.toRung,
    areaState: area,
  };
  nextRecord.decisions.push(decision);
  session.finished = finished;
  session.faceSignals = request.faceSignals;
  session.lastRequestId = request.requestId;
  const result = reply(session, finished ? null : nextQuestion, decision);
  session.lastReply = result;
  return { session, reply: result };
}
