"use client";

import type { ClientClaim, ClientInterviewPlan } from "./contract";
import { priorityScore } from "./labels";

function workspaceLabel(claim: ClientClaim): string | null {
  if (!claim.isTechnical) {
    return null;
  }
  const ws = claim.ladder.workspace;
  if (ws?.kind === "whiteboard") {
    return "Whiteboard";
  }
  if (claim.ladder.codeSnippet) {
    return "Code editor";
  }
  return null;
}

/** Ranked claims: vague claims about things the JD needs are probed first. */
export function ClaimsView({ plan }: { plan: ClientInterviewPlan }) {
  const claims = [...plan.claims].sort((a, b) => a.rank - b.rank);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Ranked claims for {plan.roleTitle}</h2>
        <p className="text-sm text-gray-600">
          Priority = JD weight × (1 − specificity). Up to {plan.maxQuestions} questions, starting
          with rank 1.
        </p>
      </div>
      <ol className="space-y-3">
        {claims.map((claim) => {
          const ws = workspaceLabel(claim);
          return (
            <li key={claim.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                  {claim.rank}
                </span>
                <span className="font-medium">{claim.skillArea}</span>
                {claim.isTechnical && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    Technical
                  </span>
                )}
                {ws && (
                  <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
                    {ws} on the scenario question
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-gray-600">
                  {claim.jdWeight.toFixed(2)} × (1 − {claim.specificity.toFixed(2)}) ={" "}
                  <strong>{priorityScore(claim.jdWeight, claim.specificity).toFixed(2)}</strong>
                </span>
              </div>
              <p className="mt-2 text-sm">{claim.claimText}</p>
              <dl className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded bg-gray-50 p-2">
                  <dt className="text-xs font-medium text-gray-500">Resume says</dt>
                  <dd className="italic">“{claim.resumeEvidence}”</dd>
                </div>
                <div className="rounded bg-gray-50 p-2">
                  <dt className="text-xs font-medium text-gray-500">JD requires</dt>
                  <dd className="italic">“{claim.jdRequirement}”</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Opening question:</span> {claim.ladder.initial}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
