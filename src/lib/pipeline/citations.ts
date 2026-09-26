import type {
  Citation,
  ClaimEvaluation,
  Evaluation,
  Grade,
  InterviewRecord,
  Turn,
} from "@/types/pipeline";

export function isGrade(value: unknown): value is Grade {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 3;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Ambiguous IDs cannot provide evidence. Offsets use JavaScript UTF-16 code units,
// exactly as Turn.text.slice does; never trim or rewrite the saved transcript.
function uniqueTurns(record: InterviewRecord): Map<string, Turn> {
  const turns = new Map<string, Turn>();
  const duplicates = new Set<string>();
  for (const turn of record.turns) {
    if (turns.has(turn.id)) {
      duplicates.add(turn.id);
    }
    turns.set(turn.id, turn);
  }
  for (const id of Array.from(duplicates)) {
    turns.delete(id);
  }
  return turns;
}

/** Only an exact, nonempty spoken candidate quotation from this claim can support it. */
export function validateCitation(
  record: InterviewRecord,
  raw: unknown,
  claimId?: string,
): Citation | null {
  if (!isObject(raw) || typeof raw.turnId !== "string" || typeof raw.quote !== "string") {
    return null;
  }
  const turn = uniqueTurns(record).get(raw.turnId);
  if (!turn || turn.speaker !== "candidate" || (claimId && turn.claimId !== claimId)) {
    return null;
  }
  const { start, end, quote } = raw;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > turn.text.length ||
    quote.trim().length === 0 ||
    turn.text.slice(start, end) !== quote
  ) {
    return null;
  }
  return { turnId: turn.id, start, end, quote };
}

/** Match a decision's grade to its actual candidate turn, not the next claim's ID. */
export function gradedAnswers(record: InterviewRecord): Map<string, Grade> {
  const turns = uniqueTurns(record);
  const grades = new Map<string, Grade>();
  const conflicting = new Set<string>();
  for (const decision of record.decisions) {
    const id = decision.gradedTurnId;
    const turn = id ? turns.get(id) : undefined;
    if (!id || !turn || turn.speaker !== "candidate" || !isGrade(decision.lastGrade)) {
      continue;
    }
    if (grades.has(id) && grades.get(id) !== decision.lastGrade) {
      conflicting.add(id);
    }
    grades.set(id, decision.lastGrade);
  }
  for (const id of Array.from(conflicting)) {
    grades.delete(id);
  }
  return grades;
}

export function evidenceStrengthOf(grades: readonly Grade[]): ClaimEvaluation["evidenceStrength"] {
  if (grades.length < 2) {
    return "thin";
  }
  return Math.max(...grades) - Math.min(...grades) >= 2 ? "mixed" : "strong";
}

/** Validate unknown model output; model-supplied strength, paths and removal counts are untrusted. */
export function validateEvaluation(record: InterviewRecord, raw: unknown): Evaluation {
  if (!isObject(raw) || !Array.isArray(raw.perClaim)) {
    throw new Error("Evaluation must contain a perClaim array.");
  }
  const turns = uniqueTurns(record);
  const grades = gradedAnswers(record);
  const claimCounts = new Map<string, number>();
  for (const claim of record.plan.claims) {
    claimCounts.set(claim.id, (claimCounts.get(claim.id) ?? 0) + 1);
  }
  const knownClaim = (id: unknown): id is string =>
    typeof id === "string" && claimCounts.get(id) === 1;
  const assessedClaim = (id: unknown): id is string =>
    knownClaim(id) &&
    Array.from(turns.values()).some(
      (turn) => turn.speaker === "candidate" && turn.claimId === id && turn.text.trim().length > 0,
    );

  const perClaim: ClaimEvaluation[] = [];
  const retained = new Set<string>();
  let removedUncited = 0;
  for (const item of raw.perClaim) {
    if (
      !isObject(item) ||
      !assessedClaim(item.claimId) ||
      retained.has(item.claimId) ||
      !isGrade(item.score) ||
      typeof item.rationale !== "string" ||
      item.rationale.trim().length === 0 ||
      !Array.isArray(item.citations)
    ) {
      removedUncited += 1;
      continue;
    }
    const citations: Citation[] = [];
    const seen = new Set<string>();
    for (const candidate of item.citations) {
      const citation = validateCitation(record, candidate, item.claimId);
      if (!citation) {
        continue;
      }
      const key = JSON.stringify(citation);
      if (!seen.has(key)) {
        citations.push(citation);
        seen.add(key);
      }
    }
    if (citations.length === 0) {
      removedUncited += 1;
      continue;
    }
    const answers = Array.from(turns.values()).filter(
      (turn) => turn.speaker === "candidate" && turn.claimId === item.claimId,
    );
    const answerGrades = answers.flatMap((turn) => {
      const grade = grades.get(turn.id);
      return grade === undefined ? [] : [grade];
    });
    const evidenceStrength = evidenceStrengthOf(answerGrades);
    perClaim.push({
      claimId: item.claimId,
      score: item.score,
      evidenceStrength,
      needsHumanReview: evidenceStrength !== "strong" || item.needsHumanReview === true,
      citations,
      rationale: item.rationale,
      ladderPath: answers.map((turn) => turn.rung),
    });
    retained.add(item.claimId);
  }

  const notes: Evaluation["notes"] = [];
  for (const note of Array.isArray(raw.notes) ? raw.notes : []) {
    if (
      !isObject(note) ||
      note.kind !== "dropOff" ||
      !retained.has(String(note.claimId)) ||
      typeof note.text !== "string" ||
      !note.text.trim() ||
      !Array.isArray(note.turnIds) ||
      note.turnIds.length === 0 ||
      !note.turnIds.every((id) => {
        const turn = typeof id === "string" ? turns.get(id) : undefined;
        return turn?.speaker === "candidate" && turn.claimId === note.claimId;
      })
    ) {
      continue;
    }
    notes.push({
      kind: "dropOff",
      claimId: String(note.claimId),
      text: note.text,
      turnIds: Array.from(new Set<string>(note.turnIds)),
    });
  }

  const result: Evaluation = { perClaim, notes, removedUncited };
  if (Array.isArray(raw.candidateFeedback)) {
    result.candidateFeedback = [];
    for (const item of raw.candidateFeedback) {
      if (
        !isObject(item) ||
        typeof item.claimId !== "string" ||
        !retained.has(item.claimId) ||
        typeof item.strength !== "string" ||
        typeof item.nextStep !== "string" ||
        !item.strength.trim() ||
        !item.nextStep.trim()
      ) {
        continue;
      }
      const citation = validateCitation(record, item.citation, item.claimId);
      if (citation) {
        result.candidateFeedback.push({
          claimId: item.claimId,
          strength: item.strength,
          nextStep: item.nextStep,
          citation,
        });
      }
    }
  }
  return result;
}
