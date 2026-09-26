"use client";

import type { Audit } from "@/types/pipeline";
import { Explainer, SectionHeading } from "../ui";

interface Props {
  audit: Audit;
  onFocusTurn: (turnId: string) => void;
}

const CHECK_PLAIN: Record<number, string> = {
  1: "Did any question give away its answer or put the candidate at a disadvantage?",
  2: "Were answers of similar quality given similar scores?",
  3: "Did fancy words or buzzwords get rewarded instead of real understanding?",
};

/** The single fairness audit pass: a fixed three-item checklist. */
export function AuditSection({ audit, onFocusTurn }: Props) {
  return (
    <section id="fairness" className="scroll-mt-24 space-y-4" aria-label="Fairness audit">
      <SectionHeading
        title="Fairness check"
        star="#ffc3be"
        subtitle="A second, separate review of the scoring."
      />
      <Explainer title="What is the fairness check?">
        <p>
          After scoring, a separate reviewer (with different instructions) checks the evaluation
          against the same three questions every time. "Concern" means a person should double-check
          that part; it doesn't change any score by itself.
        </p>
        {audit.precomputed && <p>This sample's fairness check was prepared in advance.</p>}
      </Explainer>
      <ol className="space-y-3">
        {[...audit.checks]
          .sort((a, b) => a.id - b.id)
          .map((check) => (
            <li key={check.id} className="nb-card flat space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">
                  {check.id}. {check.title}
                </span>
                <span
                  className={`nb-pill ml-auto ${check.status === "pass" ? "bg-emerald-100" : "nb-bg-salmon"}`}
                >
                  {check.status === "pass" ? "✓ Looks fair" : "⚠ Worth a second look"}
                </span>
              </div>
              <p className="text-sm text-gray-600">{CHECK_PLAIN[check.id]}</p>
              <ul className="space-y-1 text-sm">
                {check.findings.map((f) => (
                  <li key={f.text}>
                    {f.text}{" "}
                    {f.turnIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="mr-1 rounded border border-[#111] bg-white px-1 font-mono text-xs hover:bg-[#eeeefe]"
                        onClick={() => onFocusTurn(id)}
                        title="Show in transcript"
                      >
                        {id}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ol>

      {audit.counterfactual && audit.counterfactual.length > 0 && (
        <div className="nb-card flat space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black">Buzzword test</h3>
            {audit.precomputed && (
              <span className="nb-pill nb-bg-soft-lavender">Sample only, prepared in advance</span>
            )}
          </div>
          <p className="text-sm text-gray-700">
            We re-scored some answers after swapping jargon for plain words (same meaning), and
            after a meaningless edit. If the scores stay the same, wording alone isn't earning
            points.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[#111]">
                  <th className="py-2 font-bold">Answer</th>
                  <th className="py-2 font-bold">Original</th>
                  <th className="py-2 font-bold">Plain words</th>
                  <th className="py-2 font-bold">Meaningless edit</th>
                </tr>
              </thead>
              <tbody>
                {audit.counterfactual.map((r) => (
                  <tr key={r.turnId} className="border-b border-[#111]/15">
                    <td className="py-2">
                      <button
                        type="button"
                        className="rounded border border-[#111] bg-white px-1 font-mono text-xs hover:bg-[#eeeefe]"
                        onClick={() => onFocusTurn(r.turnId)}
                      >
                        {r.turnId}
                      </button>
                    </td>
                    <td className="py-2">{r.originalScore}/3</td>
                    <td
                      className={`py-2 ${r.rephrasedScore !== r.originalScore ? "font-bold text-[#b4232f]" : ""}`}
                    >
                      {r.rephrasedScore}/3 {r.rephrasedScore === r.originalScore && "✓"}
                    </td>
                    <td
                      className={`py-2 ${r.placeboScore !== r.originalScore ? "font-bold text-[#b4232f]" : ""}`}
                    >
                      {r.placeboScore}/3 {r.placeboScore === r.originalScore && "✓"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
