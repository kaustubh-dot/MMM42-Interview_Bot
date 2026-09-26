"use client";

import type { ClientClaim, ClientInterviewPlan } from "./contract";
import { priorityScore } from "./labels";
import { Explainer } from "./ui";

const TONES = ["nb-bg-1", "nb-bg-2", "nb-bg-3", "nb-bg-4"];
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function workspaceLabel(claim: ClientClaim): string | null {
  if (!claim.isTechnical) {
    return null;
  }
  if (claim.ladder.workspace?.kind === "whiteboard") {
    return "includes a whiteboard sketch";
  }
  if (claim.ladder.codeSnippet) {
    return "includes a code editor";
  }
  return null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** "What we'll ask about": ranked topics in plain language. */
export function ClaimsView({ plan }: { plan: ClientInterviewPlan }) {
  const claims = [...plan.claims].sort((a, b) => a.rank - b.rank);
  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">What we'll ask you about</h1>
        <p className="text-lg text-gray-700">
          We found {claims.length} topics on the resume that matter for{" "}
          <strong>{plan.roleTitle}</strong>. We start with the one the job needs most and the resume
          explains least. There are up to {plan.maxQuestions} questions in total.
        </p>
      </header>

      <ol className="grid gap-5 md:grid-cols-2">
        {claims.map((claim, i) => {
          const ws = workspaceLabel(claim);
          return (
            <li key={claim.id} className="nb-card flex flex-col overflow-hidden">
              <div
                className={`nb-tile ${TONES[i % TONES.length]} -m-[2px] flex items-center gap-3 rounded-b-none p-4 shadow-none`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#111] bg-white text-sm font-black text-[#111]">
                  {ORDINAL[claim.rank - 1] ?? claim.rank}
                </span>
                <div>
                  <p className="text-xl font-black">{claim.skillArea}</p>
                  {ws && <p className="text-sm text-white/95">Technical · {ws}</p>}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Resume says
                  </p>
                  <p className="italic">“{claim.resumeEvidence}”</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    The job needs
                  </p>
                  <p className="italic">“{claim.jdRequirement}”</p>
                </div>
                <div className="mt-auto space-y-1.5 rounded-xl bg-[#f3f3f3] p-3 text-sm">
                  <Meter label="How much the job cares" value={claim.jdWeight} />
                  <Meter label="How specific the resume is" value={claim.specificity} />
                  <p className="pt-1 text-xs text-gray-600">
                    Priority = {pct(claim.jdWeight)} × (100% − {pct(claim.specificity)}) ={" "}
                    <strong className="font-mono">
                      {priorityScore(claim.jdWeight, claim.specificity).toFixed(2)}
                    </strong>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <Explainer title="Why this order?">
        <p>
          A claim goes first when the job cares about it a lot and the resume says little about how
          it was done. That's where a real interviewer would dig first.
        </p>
        <p>
          Each topic has a ladder: opening question → follow-up on your own words → a real-world
          twist → defend your choice. A good answer climbs one step; a tough one steps back to
          basics once. Topics we don't reach are marked "not assessed", never scored.
        </p>
      </Explainer>
    </section>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-gray-700">{label}</span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#111] bg-white">
        <span className="block h-full nb-bg-lavender" style={{ width: pct(value) }} />
      </span>
      <span className="w-10 text-right font-mono text-xs">{pct(value)}</span>
    </div>
  );
}
