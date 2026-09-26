"use client";

// This is a concern level to prompt human review, not a cheating determination. Every signal
// has innocent explanations, and none of them affect the candidate's scores.

import type { ConcernLevel, IntegrityEvent, IntegrityReport } from "@/types/pipeline";
import { Explainer, SectionHeading } from "../ui";

interface Props {
  integrity: IntegrityReport;
  events: IntegrityEvent[];
  onFocusTurn: (turnId: string) => void;
}

const LEVEL_STYLE: Record<ConcernLevel, string> = {
  Low: "bg-emerald-100",
  Medium: "bg-[#fff3c4]",
  High: "nb-bg-salmon",
};

const LEVEL_PLAIN: Record<ConcernLevel, string> = {
  Low: "Nothing stood out.",
  Medium: "A few things are worth a quick look by a person.",
  High: "Several things are worth a careful look by a person.",
};

const EVENT_LABELS: Record<IntegrityEvent["kind"], string> = {
  tabBlur: "Left the tab",
  tabFocus: "Came back to the tab",
  paste: "Pasted text",
  faceMissing: "Face not visible",
  multipleFaces: "More than one face",
  lookAway: "Looked away",
  faceSignalsUnavailable: "Camera signals unavailable",
};

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatValue(value: number, unit: string): string {
  return unit === "cv" ? value.toFixed(2) : `${value}`;
}

export function IntegritySection({ integrity, events, onFocusTurn }: Props) {
  const shownEvents = events.filter((e) => e.kind !== "tabFocus");
  return (
    <section id="integrity" className="scroll-mt-24 space-y-4" aria-label="Integrity concern level">
      <SectionHeading
        title="Integrity notes"
        subtitle="For a person to review. Never part of the score."
      />

      <div className={`nb-card space-y-2 p-5 ${LEVEL_STYLE[integrity.level]}`}>
        <p className="text-sm font-bold uppercase tracking-wide">Concern level</p>
        <p className="text-3xl font-black">
          {integrity.level}{" "}
          <span className="text-lg font-bold">
            ({integrity.totalPoints} point{integrity.totalPoints === 1 ? "" : "s"})
          </span>
        </p>
        <p className="font-medium">{LEVEL_PLAIN[integrity.level]}</p>
        <p className="text-sm">{integrity.disclaimer}</p>
      </div>

      <Explainer title="How is this worked out?">
        <p>
          Each signal gets 0, 1 or 2 points: 2 if it reaches its limit, 1 if it happened at all.
          Points add up to a level: <strong>0–2 Low</strong>, <strong>3–5 Medium</strong>,{" "}
          <strong>6+ High</strong>. Signals that couldn't be measured count as 0.
        </p>
        <p>
          It never ends the interview, never changes a score, and never says someone cheated. There
          is always an innocent explanation to consider.
        </p>
      </Explainer>

      <div className="grid gap-3 md:grid-cols-2">
        {integrity.signals.map((s) => (
          <article
            key={s.name}
            className={`nb-card flat space-y-2 p-4 ${s.available ? "" : "opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <h3 className="font-black">{s.name}</h3>
              <span className={`nb-pill ml-auto ${s.points > 0 ? "nb-bg-salmon" : ""}`}>
                {s.points} pt{s.points === 1 ? "" : "s"}
              </span>
            </div>
            {s.available ? (
              <>
                <p className="text-sm">
                  Measured: <strong>{formatValue(s.value, s.unit)}</strong> · limit:{" "}
                  {s.unit === "cv" ? `below ${s.threshold}` : `${s.threshold} or more`}
                </p>
                <div className="text-sm text-gray-700">
                  <p className="font-bold">Could simply mean:</p>
                  <ul className="list-disc pl-5">
                    {s.benignExplanations.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm">Not measured in this interview, so it adds 0 points.</p>
            )}
          </article>
        ))}
      </div>

      {shownEvents.length > 0 && (
        <details className="nb-card flat p-4 text-sm">
          <summary className="cursor-pointer font-black">
            When things happened ({shownEvents.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {shownEvents.map((e) => (
              <li key={`${e.kind}-${e.atMs}`}>
                <span className="font-mono">{fmt(e.atMs)}</span> {EVENT_LABELS[e.kind]}
                {e.durationMs !== undefined && ` for ${Math.round(e.durationMs / 1000)}s`}
                {e.detail && `: ${e.detail}`}
                {e.turnId && (
                  <button
                    type="button"
                    className="ml-1 rounded border border-[#111] bg-white px-1 font-mono text-xs hover:bg-[#eeeefe]"
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
