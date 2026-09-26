"use client";

// Small presentational pieces shared by the recruiter console, in the app's .nb theme.

import type { CandidateKind, HiringDecision, InterviewStatus } from "@/lib/admin/types";
import type { ConcernLevel } from "@/types/pipeline";
import type { ReactNode } from "react";

export const STATUS_META: Record<InterviewStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-white" },
  in_progress: { label: "In progress", className: "bg-[#fff3c4]" },
  completed: { label: "Interview done", className: "nb-bg-soft-lavender" },
  unavailable: { label: "Link expired", className: "bg-[#f3f3f3] text-gray-600" },
};

export const DECISION_META: Record<HiringDecision, { label: string; className: string }> = {
  undecided: { label: "Awaiting decision", className: "bg-white" },
  advance: { label: "Advance", className: "bg-[#c9f5ea]" },
  hold: { label: "On hold", className: "bg-[#fff3c4]" },
  reject: { label: "Not moving forward", className: "nb-bg-soft-salmon" },
};

const CONCERN_CLASS: Record<ConcernLevel, string> = {
  Low: "bg-white",
  Medium: "bg-[#fff3c4]",
  High: "nb-bg-soft-salmon",
};

export function StatusPill({ status }: { status: InterviewStatus }) {
  const meta = STATUS_META[status];
  return <span className={`nb-pill ${meta.className}`}>{meta.label}</span>;
}

export function DecisionPill({ decision }: { decision: HiringDecision }) {
  const meta = DECISION_META[decision];
  return <span className={`nb-pill ${meta.className}`}>{meta.label}</span>;
}

export function KindPill({ kind }: { kind: CandidateKind }) {
  if (kind === "live") {
    return null;
  }
  return (
    <span
      className="nb-pill nb-bg-salmon"
      title={
        kind === "sample"
          ? "The recorded sample interview bundled with the app"
          : "Sample resume with the demo grader (server in mock mode)"
      }
    >
      {kind === "sample" ? "Sample" : "Demo"}
    </span>
  );
}

/** Integrity concern band. Always labeled as not part of the score or ranking. */
export function ConcernPill({ level }: { level: ConcernLevel }) {
  return (
    <span
      className={`nb-pill ${CONCERN_CLASS[level]}`}
      title="Concern level for a person to review. Not a verdict, and never part of the score or ranking."
    >
      Integrity: {level}
    </span>
  );
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function FitBar({ value, label }: { value: number; label?: string }) {
  return (
    <span className="flex min-w-[8rem] items-center gap-2">
      <span
        className="h-3 flex-1 overflow-hidden rounded-full border-2 border-[#111] bg-white"
        role="img"
        aria-label={`${label ?? "Fit"} ${pct(value)}`}
      >
        <span className="block h-full nb-bg-lavender" style={{ width: pct(value) }} />
      </span>
      <span className="w-10 text-right font-mono text-sm font-bold">{pct(value)}</span>
    </span>
  );
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** "in 2 hours", "3 days ago" — relative to now. */
export function relativeWhen(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now;
  if (!Number.isFinite(diff)) {
    return "";
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diff);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 3_600_000
      ? [Math.round(diff / 60_000), "minute"]
      : abs < 86_400_000
        ? [Math.round(diff / 3_600_000), "hour"]
        : [Math.round(diff / 86_400_000), "day"];
  return rtf.format(value, unit);
}

export function StatTile({
  label,
  value,
  hint,
  tone = "bg-white",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`nb-card ${tone} space-y-1 p-5`}>
      <p className="text-sm font-bold uppercase tracking-wide text-gray-600">{label}</p>
      <p className="text-4xl font-black">{value}</p>
      {hint && <p className="text-sm text-gray-700">{hint}</p>}
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-gray-600">{hint}</p>}
    </div>
  );
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
