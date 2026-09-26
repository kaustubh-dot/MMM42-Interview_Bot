"use client";

import type { Citation } from "@/types/pipeline";
import { useState } from "react";
import type { ClientInterviewReport } from "../contract";
import { NbLinkButton } from "../ui";
import { AuditSection } from "./audit-section";
import { IntegritySection } from "./integrity-section";
import { ScoreMeter, ScoreSection } from "./score-section";
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

const JUMP = [
  { href: "#scores", label: "Scores" },
  { href: "#fairness", label: "Fairness check" },
  { href: "#integrity", label: "Integrity notes" },
  { href: "#transcript", label: "Transcript" },
];

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

  const scored = evaluation.perClaim.length;
  const total = record.plan.claims.length;
  const review = evaluation.perClaim.filter((e) => e.needsHumanReview).length;
  const concerns = audit.checks.filter((c) => c.status === "concern").length;
  const skill = (id: string) => record.plan.claims.find((c) => c.id === id)?.skillArea ?? id;

  return (
    <div className="nb-orbs">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {fixture && (
              <span className="nb-pill nb-bg-salmon">Sample report (prepared in advance)</span>
            )}
            <span className="text-sm text-gray-600">
              {record.candidateLabel} · {formatStartedAt(record.startedAt)} ·{" "}
              {record.turns.filter((t) => t.speaker === "candidate").length} answers
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">
            {record.plan.roleTitle}
          </h1>
          <p className="max-w-3xl text-lg text-gray-700">
            Interview report. Every score quotes the candidate's own words. Names are hidden so
            scoring stays blind.
          </p>
        </header>

        <section aria-label="At a glance" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="nb-card space-y-3 p-5 xl:col-span-2">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
              Scores at a glance
            </p>
            <ul className="space-y-2">
              {evaluation.perClaim.map((e) => (
                <li key={e.claimId} className="flex items-center gap-3">
                  <span className="w-40 truncate font-bold">{skill(e.claimId)}</span>
                  <ScoreMeter score={e.score} />
                  <span className="text-sm">{e.score}/3</span>
                  {e.needsHumanReview && (
                    <span className="text-sm" title="Needs a human look">
                      👀
                    </span>
                  )}
                </li>
              ))}
              {record.plan.claims
                .filter((c) => !evaluation.perClaim.some((e) => e.claimId === c.id))
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-gray-500">
                    <span className="w-40 truncate font-bold">{c.skillArea}</span>
                    <span className="text-sm">not reached</span>
                  </li>
                ))}
            </ul>
          </div>
          <a href="#scores" className="nb-card hoverable nb-bg-soft-lavender block space-y-1 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
              Needs a human look
            </p>
            <p className="text-4xl font-black">{review}</p>
            <p className="text-sm text-gray-700">
              of {scored} scored topics ({total - scored} not reached). Mixed or thin evidence gets
              flagged.
            </p>
          </a>
          <a href="#integrity" className="nb-card hoverable nb-bg-soft-salmon block space-y-1 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
              Integrity notes
            </p>
            <p className="text-4xl font-black">{integrity.level}</p>
            <p className="text-sm text-gray-700">
              A concern level for a person to review, not a verdict. Fairness check: {concerns} item
              {concerns === 1 ? "" : "s"} to double-check.
            </p>
          </a>
        </section>

        <nav aria-label="Report sections" className="flex flex-wrap gap-3">
          {JUMP.map((j) => (
            <a key={j.href} href={j.href} className="nb-btn sm">
              {j.label}
            </a>
          ))}
          <span className="ml-auto flex flex-wrap gap-3">
            <NbLinkButton href="/interview" size="sm" variant="primary">
              New interview
            </NbLinkButton>
            <NbLinkButton href="/report/workspace-samples" size="sm">
              Saved code &amp; drawings
            </NbLinkButton>
          </span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-12">
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
          <div
            id="transcript"
            className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
          >
            <TranscriptPanel turns={record.turns} selected={selected} focusTurnId={focusTurnId} />
          </div>
        </div>
      </div>
    </div>
  );
}
