"use client";

import type { Decision } from "@/types/pipeline";
import { useEffect, useRef } from "react";
import type { ClientInterviewPlan } from "./contract";
import { GRADE_LABELS, REASON_LABELS, RUNG_LABELS, SELECTION_RULE } from "./labels";

interface Props {
  decisions: Decision[];
  plan: ClientInterviewPlan;
}

/** Live decision log: one machine-readable reason code per AI turn, newest last. */
export function DecisionLog({ decisions, plan }: Props) {
  const endRef = useRef<HTMLLIElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a decision is added
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [decisions.length]);

  const skill = (claimId: string) =>
    plan.claims.find((c) => c.id === claimId)?.skillArea ?? claimId;

  return (
    <section aria-label="Decision log" className="flex h-full flex-col rounded-lg border bg-white">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Decision log</h2>
        <details className="mt-1 text-xs text-gray-600">
          <summary className="cursor-pointer">The rule</summary>
          <p className="mt-1">{SELECTION_RULE}</p>
        </details>
      </header>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {decisions.length === 0 && (
          <li className="text-sm text-gray-500">Decisions appear here as the interview runs.</li>
        )}
        {decisions.map((d, i) => (
          <li
            key={d.turnId}
            ref={i === decisions.length - 1 ? endRef : undefined}
            className="rounded-md border border-gray-200 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-gray-500">{d.turnId}</span>
              <code className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-800">
                {d.reason}
              </code>
            </div>
            <p className="mt-1 text-gray-800">{REASON_LABELS[d.reason]}</p>
            <p className="mt-1 text-gray-600">
              {d.lastGrade !== null && (
                <>
                  Last answer {d.gradedTurnId}: grade {d.lastGrade} ({GRADE_LABELS[d.lastGrade]})
                  {" · "}
                </>
              )}
              {skill(d.claimId)}: {d.fromRung ? RUNG_LABELS[d.fromRung] : "start"} →{" "}
              {RUNG_LABELS[d.toRung]}
            </p>
            <p className="mt-0.5 text-gray-500">
              Area: {d.areaState.asked} asked · {d.areaState.consecutiveWeak} weak in a row ·
              fundamental {d.areaState.usedFundamental ? "used" : "unused"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
