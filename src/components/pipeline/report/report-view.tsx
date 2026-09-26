"use client";

import type { Citation } from "@/types/pipeline";
import Link from "next/link";
import { useState } from "react";
import type { ClientInterviewReport } from "../contract";
import { AuditSection } from "./audit-section";
import { IntegritySection } from "./integrity-section";
import { ScoreSection } from "./score-section";
import { TranscriptPanel } from "./transcript-panel";

// Fixed UTC format: a locale/timezone-dependent string would differ between server and browser
// render and break hydration.
function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

interface Props {
  report: ClientInterviewReport;
  fixture: boolean;
}

export function ReportView({ report, fixture }: Props) {
  const { record, evaluation, audit, integrity } = report;
  const [selected, setSelected] = useState<Citation | null>(null);
  const [focusTurnId, setFocusTurnId] = useState<string | null>(null);
  const focusTurn = (id: string) => {
    setSelected(null);
    // Reset first so clicking the same turn twice still scrolls.
    setFocusTurnId(null);
    requestAnimationFrame(() => setFocusTurnId(id));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{record.plan.roleTitle}</h1>
          <p className="text-sm text-gray-600">
            {record.candidateLabel} · started {formatStartedAt(record.startedAt)} ·{" "}
            {record.turns.filter((t) => t.speaker === "candidate").length} answers
          </p>
        </div>
        {fixture && (
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
            Sample fixture: precomputed report
          </span>
        )}
        <div className="ml-auto flex gap-3 text-sm">
          <Link href="/interview" className="text-indigo-700 hover:underline">
            New interview
          </Link>
          <Link href="/report/workspace-samples" className="text-indigo-700 hover:underline">
            Workspace samples
          </Link>
          {!fixture && (
            <Link href="/report/sample" className="text-indigo-700 hover:underline">
              Sample report (fixture)
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <ScoreSection
            plan={record.plan}
            turns={record.turns}
            evaluation={evaluation}
            selected={selected}
            onSelect={(c) => {
              setFocusTurnId(null);
              setSelected(c);
            }}
          />
          <AuditSection audit={audit} onFocusTurn={focusTurn} />
          <IntegritySection
            integrity={integrity}
            events={record.integrityEvents}
            onFocusTurn={focusTurn}
          />
        </div>
        <div className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <TranscriptPanel turns={record.turns} selected={selected} focusTurnId={focusTurnId} />
        </div>
      </div>
    </div>
  );
}
