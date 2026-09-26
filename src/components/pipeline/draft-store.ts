// Local drafts for unsent answers, keyed by attempt (interviewId) and question turn ID so two
// questions or two attempts never share a draft. Drafts are never graded turns; the server
// only sees what Submit sends. Every accessor reports failure instead of pretending to save.

import type { AnswerArtifact } from "./contract";

export interface AnswerDraft {
  transcript: string;
  artifact: AnswerArtifact | null;
  savedAt: number;
}

export type DraftWriteResult = { ok: true } | { ok: false; reason: string };

const PREFIX = "mmm42:draft:v1";

export function draftKey(attemptId: string, questionTurnId: string): string {
  return `${PREFIX}:${attemptId}:${questionTurnId}`;
}

export function loadDraft(attemptId: string, questionTurnId: string): AnswerDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId, questionTurnId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AnswerDraft;
    if (typeof parsed.transcript !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(
  attemptId: string,
  questionTurnId: string,
  draft: Omit<AnswerDraft, "savedAt">,
): DraftWriteResult {
  try {
    window.localStorage.setItem(
      draftKey(attemptId, questionTurnId),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
    return { ok: true };
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "QuotaExceededError"
        ? "Browser storage is full."
        : "Browser storage is unavailable (private window or blocked site data).";
    return { ok: false, reason };
  }
}

/** Remove only the draft the server acknowledged. */
export function clearDraft(attemptId: string, questionTurnId: string): void {
  try {
    window.localStorage.removeItem(draftKey(attemptId, questionTurnId));
  } catch {
    // Nothing to do: a stale draft is harmless because it is keyed to an answered question.
  }
}
