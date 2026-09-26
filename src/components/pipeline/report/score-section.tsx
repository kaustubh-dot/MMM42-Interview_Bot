"use client";

import type { Citation, ClaimEvaluation, Evaluation } from "@/types/pipeline";
import type { ClientInterviewPlan, ClientTurn } from "../contract";
import { GRADE_LABELS, RUNG_LABELS } from "../labels";

interface Props {
  plan: ClientInterviewPlan;
  turns: ClientTurn[];
  evaluation: Evaluation;
  selected: Citation | null;
  onSelect: (c: Citation) => void;
}

const STRENGTH_STYLES: Record<ClaimEvaluation["evidenceStrength"], string> = {
  strong: "bg-emerald-50 text-emerald-800",
  mixed: "bg-amber-50 text-amber-900",
  thin: "bg-gray-100 text-gray-700",
};

/** Display-side check only; B's validator is the authority and removes failing scores. */
function citationIsExact(c: Citation, turns: ClientTurn[]): boolean {
  const turn = turns.find((t) => t.id === c.turnId);
  return !!turn && turn.speaker === "candidate" && turn.text.slice(c.start, c.end) === c.quote;
}

export function ScoreSection({ plan, turns, evaluation, selected, onSelect }: Props) {
  const claims = [...plan.claims].sort((a, b) => a.rank - b.rank);
  return (
    <section className="space-y-3" aria-label="Scores">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">Scores by claim</h2>
        <span className="text-xs text-gray-500">
          Spoken evidence only. Every score cites the candidate's exact words.
        </span>
      </div>
      {evaluation.removedUncited > 0 && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
          {evaluation.removedUncited} score{evaluation.removedUncited === 1 ? " was" : "s were"}{" "}
          removed because the cited evidence did not match the transcript.
        </p>
      )}
      {claims.map((claim) => {
        const ev = evaluation.perClaim.find((e) => e.claimId === claim.id);
        const notes = evaluation.notes.filter((n) => n.claimId === claim.id);
        if (!ev) {
          return (
            <article key={claim.id} className="rounded-lg border border-dashed bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{claim.skillArea}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Not assessed
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                The interview ended before this claim was reached. No score is given.
              </p>
            </article>
          );
        }
        return (
          <article key={claim.id} className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{claim.skillArea}</span>
              <span className="rounded bg-indigo-600 px-2 py-0.5 text-sm font-semibold text-white">
                {ev.score}/3 · {GRADE_LABELS[ev.score]}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${STRENGTH_STYLES[ev.evidenceStrength]}`}
              >
                {ev.evidenceStrength} evidence
              </span>
              {ev.needsHumanReview && (
                <span className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-900">
                  Needs human review
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-800">{ev.rationale}</p>
            <p className="mt-1 text-xs text-gray-500">
              Path: {ev.ladderPath.map((r) => RUNG_LABELS[r]).join(" → ")}
            </p>
            <ul className="mt-2 space-y-1">
              {ev.citations.map((c) => {
                const exact = citationIsExact(c, turns);
                const isSel =
                  selected?.turnId === c.turnId &&
                  selected.start === c.start &&
                  selected.end === c.end;
                return (
                  <li key={`${c.turnId}-${c.start}-${c.end}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(c)}
                      aria-pressed={isSel}
                      className={`w-full rounded-md border px-2 py-1 text-left text-sm transition-colors hover:bg-yellow-50 ${
                        isSel ? "border-yellow-400 bg-yellow-50" : "border-gray-200"
                      }`}
                    >
                      <span className="mr-2 font-mono text-xs text-gray-500">{c.turnId}</span>
                      <span className="italic">“{c.quote}”</span>
                      {!exact && (
                        <span className="ml-2 text-xs text-red-700">
                          (does not match transcript)
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {notes.map((n) => (
              <p
                key={`${n.kind}-${n.turnIds.join()}`}
                className="mt-2 rounded bg-sky-50 p-2 text-xs text-sky-900"
              >
                <span className="font-medium">Drop-off note ({n.turnIds.join(", ")}):</span>{" "}
                {n.text}
              </p>
            ))}
          </article>
        );
      })}
    </section>
  );
}
