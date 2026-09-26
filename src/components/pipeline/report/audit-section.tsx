"use client";

import type { Audit } from "@/types/pipeline";
import { GRADE_LABELS } from "../labels";

interface Props {
  audit: Audit;
  onFocusTurn: (turnId: string) => void;
}

/** The single fairness audit pass: a fixed three-item checklist. */
export function AuditSection({ audit, onFocusTurn }: Props) {
  return (
    <section className="space-y-3" aria-label="Fairness audit">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">Fairness audit</h2>
        <span className="text-xs text-gray-500">
          One separate review of the evaluation against a fixed three-item checklist.
        </span>
        {audit.precomputed && (
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">
            Precomputed on the sample
          </span>
        )}
      </div>
      <ol className="space-y-2">
        {[...audit.checks]
          .sort((a, b) => a.id - b.id)
          .map((check) => (
            <li key={check.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {check.id}. {check.title}
                </span>
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${
                    check.status === "pass"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {check.status === "pass" ? "Pass" : "Concern: review"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {check.findings.map((f) => (
                  <li key={f.text}>
                    {f.text}{" "}
                    {f.turnIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="mr-1 font-mono text-xs text-indigo-700 hover:underline"
                        onClick={() => onFocusTurn(id)}
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
        <div className="rounded-lg border bg-white p-3">
          <h3 className="text-sm font-medium">Counterfactual rescoring</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            {audit.precomputed
              ? "Sample only, precomputed before the demo. It is not run on live interviews."
              : "Counterfactual rescoring."}{" "}
            Rephrased: jargon replaced with plain wording, same substance. Placebo: a meaningless
            edit that sets the noise floor.
          </p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1 font-medium">Turn</th>
                <th className="py-1 font-medium">Original</th>
                <th className="py-1 font-medium">Rephrased</th>
                <th className="py-1 font-medium">Placebo</th>
              </tr>
            </thead>
            <tbody>
              {audit.counterfactual.map((r) => (
                <tr key={r.turnId} className="border-t">
                  <td className="py-1">
                    <button
                      type="button"
                      className="font-mono text-xs text-indigo-700 hover:underline"
                      onClick={() => onFocusTurn(r.turnId)}
                    >
                      {r.turnId}
                    </button>
                  </td>
                  <td className="py-1">
                    {r.originalScore} ({GRADE_LABELS[r.originalScore]})
                  </td>
                  <td
                    className={`py-1 ${r.rephrasedScore !== r.originalScore ? "font-semibold text-amber-800" : ""}`}
                  >
                    {r.rephrasedScore}
                  </td>
                  <td
                    className={`py-1 ${r.placeboScore !== r.originalScore ? "font-semibold text-amber-800" : ""}`}
                  >
                    {r.placeboScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
