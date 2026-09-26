"use client";

import type { Citation, ClaimEvaluation, Evaluation } from "@/types/pipeline";
import type { ClientInterviewPlan, ClientTurn } from "../contract";
import { FRIENDLY_RUNGS, GRADE_LABELS } from "../labels";
import { Explainer, SectionHeading } from "../ui";

interface Props {
  plan: ClientInterviewPlan;
  turns: ClientTurn[];
  evaluation: Evaluation;
  selected: Citation | null;
  onSelect: (c: Citation) => void;
}

const STRENGTH: Record<ClaimEvaluation["evidenceStrength"], { label: string; hint: string }> = {
  strong: { label: "Clear evidence", hint: "Answers on this topic agreed with each other." },
  mixed: { label: "Mixed evidence", hint: "Some answers were much stronger than others." },
  thin: { label: "Not much evidence", hint: "Fewer than two graded answers on this topic." },
};

/** Display-side check only; B's validator is the authority and removes failing scores. */
function citationIsExact(c: Citation, turns: ClientTurn[]): boolean {
  const turn = turns.find((t) => t.id === c.turnId);
  return !!turn && turn.speaker === "candidate" && turn.text.slice(c.start, c.end) === c.quote;
}

export function ScoreMeter({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${score} out of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-3 w-7 rounded-full border-2 border-[#111] ${n <= score ? "nb-bg-lavender" : "bg-white"}`}
        />
      ))}
    </span>
  );
}

export function ScoreSection({ plan, turns, evaluation, selected, onSelect }: Props) {
  const claims = [...plan.claims].sort((a, b) => a.rank - b.rank);
  return (
    <section id="scores" className="scroll-mt-24 space-y-4" aria-label="Scores">
      <SectionHeading
        title="Scores by topic"
        subtitle="Click any quote to see where it was said."
      />
      <Explainer title="How to read the scores">
        <p>
          Each topic is scored 0–3: <strong>0</strong> no evidence, <strong>1</strong> surface
          (names tools, no how/why), <strong>2</strong> working (explains how it works with a real
          detail), <strong>3</strong> deep (how, trade-offs and what can go wrong, from real
          experience).
        </p>
        <p>
          Only what was <em>said</em> is scored. Every score must quote the candidate's exact words;
          if a quote doesn't match the transcript, the score is removed.
        </p>
      </Explainer>
      {evaluation.removedUncited > 0 && (
        <p className="nb-card flat bg-[#f3f3f3] p-3 text-sm">
          🧹 {evaluation.removedUncited} score{evaluation.removedUncited === 1 ? " was" : "s were"}{" "}
          thrown out because the quoted words didn't match the transcript.
        </p>
      )}
      {claims.map((claim) => {
        const ev = evaluation.perClaim.find((e) => e.claimId === claim.id);
        const notes = evaluation.notes.filter((n) => n.claimId === claim.id);
        if (!ev) {
          return (
            <article key={claim.id} className="nb-card flat border-dashed p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black">{claim.skillArea}</span>
                <span className="nb-pill bg-[#f3f3f3]">Not assessed</span>
              </div>
              <p className="mt-1 text-gray-600">
                The interview ended before reaching this topic, so it has no score.
              </p>
            </article>
          );
        }
        return (
          <article key={claim.id} className="nb-card space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-black">{claim.skillArea}</span>
              <ScoreMeter score={ev.score} />
              <span className="font-bold">
                {ev.score}/3 · {GRADE_LABELS[ev.score]}
              </span>
              <span className="nb-pill" title={STRENGTH[ev.evidenceStrength].hint}>
                {STRENGTH[ev.evidenceStrength].label}
              </span>
              {ev.needsHumanReview && (
                <span className="nb-pill nb-bg-salmon">👀 Needs a human look</span>
              )}
            </div>
            <p className="text-gray-800">{ev.rationale}</p>
            <p className="text-sm text-gray-600">
              Questions on this topic: {ev.ladderPath.map((r) => FRIENDLY_RUNGS[r]).join(" → ")}
            </p>
            <div className="space-y-2">
              <p className="text-sm font-bold">Evidence (the candidate's own words)</p>
              <ul className="space-y-2">
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
                        className={`w-full rounded-xl border-2 px-3 py-2 text-left transition-colors hover:bg-[#fff8c5] ${
                          isSel
                            ? "border-[#111] bg-[#fff3a3] shadow-[3px_3px_0_#111]"
                            : "border-[#111]/20 bg-white"
                        }`}
                      >
                        <span className="italic">“{c.quote}”</span>
                        <span className="ml-2 whitespace-nowrap text-xs font-medium text-[#494cf3]">
                          show in transcript →
                        </span>
                        {!exact && (
                          <span className="ml-2 text-xs font-bold text-[#b4232f]">
                            (doesn't match transcript)
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {notes.map((n) => (
              <p
                key={`${n.kind}-${n.turnIds.join()}`}
                className="rounded-xl border-2 border-[#111] nb-bg-soft-lavender p-3 text-sm"
              >
                <span className="font-bold">📉 Drop-off noticed:</span> {n.text}
              </p>
            ))}
          </article>
        );
      })}
    </section>
  );
}
