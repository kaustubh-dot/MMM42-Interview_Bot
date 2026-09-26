"use client";

// This is a concern level to prompt human review, not a cheating determination. Every signal
// has innocent explanations, and none of them affect the candidate's scores.

import type { IntegrityEvent, IntegrityReport } from "@/types/pipeline";
import { CONCERN_STYLES } from "../labels";

interface Props {
  integrity: IntegrityReport;
  events: IntegrityEvent[];
  onFocusTurn: (turnId: string) => void;
}

const EVENT_LABELS: Record<IntegrityEvent["kind"], string> = {
  tabBlur: "Left the tab",
  tabFocus: "Returned to the tab",
  paste: "Pasted text",
  faceMissing: "Face not visible",
  multipleFaces: "More than one face",
  lookAway: "Looked away",
  faceSignalsUnavailable: "Face signals unavailable",
};

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatValue(value: number, unit: string): string {
  if (unit === "cv") {
    return value.toFixed(2);
  }
  return `${value} ${unit}`;
}

export function IntegritySection({ integrity, events, onFocusTurn }: Props) {
  const shownEvents = events.filter((e) => e.kind !== "tabFocus");
  return (
    <section className="space-y-3" aria-label="Integrity concern level">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">Integrity signals</h2>
        <span className="text-xs text-gray-500">For human review. Does not affect any score.</span>
      </div>

      <div className={`rounded-lg border p-4 ${CONCERN_STYLES[integrity.level]}`}>
        <p className="text-sm">
          Concern level: <strong className="text-base">{integrity.level}</strong> (
          {integrity.totalPoints} point{integrity.totalPoints === 1 ? "" : "s"})
        </p>
        <p className="mt-1 text-xs">Band: 0–2 points Low · 3–5 Medium · 6 or more High.</p>
        <p className="mt-2 text-sm">{integrity.disclaimer}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Signal</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Threshold</th>
              <th className="px-3 py-2 font-medium">Points</th>
              <th className="px-3 py-2 font-medium">Innocent explanations</th>
            </tr>
          </thead>
          <tbody>
            {integrity.signals.map((s) => (
              <tr
                key={s.name}
                className={`border-t align-top ${s.available ? "" : "text-gray-400"}`}
              >
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2">
                  {s.available ? formatValue(s.value, s.unit) : "Unavailable"}
                </td>
                <td className="px-3 py-2">
                  {s.unit === "cv" ? `< ${s.threshold}` : `≥ ${s.threshold}`}
                </td>
                <td className="px-3 py-2">{s.points}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {s.available ? (
                    <ul className="list-disc pl-4">
                      {s.benignExplanations.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    "Not captured in this interview, so it adds 0 points."
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shownEvents.length > 0 && (
        <details className="rounded-lg border bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Event timeline ({shownEvents.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-700">
            {shownEvents.map((e) => (
              <li key={`${e.kind}-${e.atMs}`}>
                <span className="font-mono">{fmt(e.atMs)}</span> {EVENT_LABELS[e.kind]}
                {e.durationMs !== undefined && ` for ${Math.round(e.durationMs / 1000)}s`}
                {e.detail && `: ${e.detail}`}
                {e.turnId && (
                  <button
                    type="button"
                    className="ml-1 font-mono text-indigo-700 hover:underline"
                    onClick={() => e.turnId && onFocusTurn(e.turnId)}
                  >
                    {e.turnId}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
