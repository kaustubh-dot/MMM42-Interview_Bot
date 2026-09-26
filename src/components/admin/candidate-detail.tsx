"use client";

import { getSession } from "@/components/pipeline/api-client";
import type { ClientInterviewPlan, ClientInterviewReport } from "@/components/pipeline/contract";
import { ScoreMeter } from "@/components/pipeline/report/score-section";
import { NbButton, NbLinkButton } from "@/components/pipeline/ui";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import {
  GUIDE_PRIORITY_LABEL,
  type GuidePriority,
  fitSummary,
  guideToText,
  interviewGuide,
} from "@/lib/admin/insights";
import { EARLY_JOIN_MIN, icsEvent, inviteMessage, inviteUrl, mailtoHref } from "@/lib/admin/invite";
import type { AdminCandidate, AdminJob, HiringDecision } from "@/lib/admin/types";
import {
  CalendarDays,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Mail,
  Printer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSync } from "./admin-shell";
import { removeCandidate, updateCandidate, useAdmin } from "./admin-store";
import {
  DECISION_META,
  DecisionPill,
  EmptyRow,
  KindPill,
  PageHeader,
  Panel,
  StatRow,
  StatusPill,
  copyText,
  downloadFile,
  formatWhen,
  pct,
  relativeWhen,
} from "./admin-ui";

const PRIORITY_TONE: Record<GuidePriority, string> = {
  must: "nb-bg-soft-salmon",
  verify: "bg-[#fff3c4]",
  stretch: "nb-bg-soft-lavender",
};

export function CandidateDetail({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const { state, reports } = useAdmin();
  const candidate = state.candidates.find((c) => c.id === candidateId);
  const job = candidate && state.jobs.find((j) => j.id === candidate.jobId);

  if (!candidate || !job) {
    return (
      <div className="nb-card space-y-3 p-5">
        <p className="font-bold">Candidate not found</p>
        <p className="text-sm text-gray-700">
          They may have been removed, or were scheduled in another browser.
        </p>
        <NbLinkButton href="/admin">Back to overview</NbLinkButton>
      </div>
    );
  }

  const report = reports[candidate.interviewId] ?? null;
  const remove = () => {
    if (window.confirm(`Remove ${candidate.name} from this browser? This can't be undone.`)) {
      removeCandidate(candidate.id);
      router.push(`/admin/jobs/${job.id}`);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link href={`/admin/jobs/${job.id}`} className="nb-link text-sm font-semibold">
            ← {job.title}
          </Link>
        }
        title={candidate.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={candidate.status} />
            <DecisionPill decision={candidate.decision} />
            <KindPill kind={candidate.kind} />
            <span>
              {formatWhen(candidate.scheduledAt)}
              {candidate.email && ` · ${candidate.email}`}
            </span>
            {candidate.statusNote && (
              <span className="flex items-center gap-1 text-gray-700">
                {candidate.statusNote.endsWith("…") && <Loader2 className="h-3 w-3 animate-spin" />}
                {candidate.statusNote}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {report && (
              <NbLinkButton href={`/admin/candidates/${candidate.id}/report`} variant="primary">
                Full cited report
              </NbLinkButton>
            )}
            <NbButton onClick={remove} aria-label="Remove candidate" title="Remove candidate">
              <Trash2 className="h-4 w-4" />
            </NbButton>
          </>
        }
      />

      {report ? (
        <Results candidate={candidate} report={report} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <InviteCard candidate={candidate} job={job} />
          <PlannedTopics candidate={candidate} />
        </div>
      )}

      <DecisionPanel candidate={candidate} />
    </div>
  );
}

// ---------- Before the interview ----------

function InviteCard({ candidate, job }: { candidate: AdminCandidate; job: AdminJob }) {
  const { syncNow, syncing } = useSync();
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(window.location.origin, candidate);
  const message = inviteMessage(job, candidate, url, formatWhen(candidate.scheduledAt));
  const expired = candidate.status === "unavailable";

  const copy = async () => {
    setCopied(await copyText(url));
    window.setTimeout(() => setCopied(false), 2000);
  };

  const calendar = () =>
    downloadFile(
      "interview.ics",
      icsEvent({
        uid: candidate.interviewId,
        start: new Date(candidate.scheduledAt),
        durationMin: candidate.durationMin,
        title: `Interview: ${job.title}`,
        description: message.body,
        url,
      }),
      "text/calendar;charset=utf-8",
    );

  return (
    <Panel
      title={expired ? "Link expired" : "Invite"}
      actions={
        <button
          type="button"
          className="nb-link text-xs font-semibold"
          disabled={syncing}
          onClick={() => syncNow()}
        >
          {syncing ? "Checking…" : "Check status"}
        </button>
      }
    >
      <div className="space-y-3 p-4">
        {expired ? (
          <p className="text-sm text-gray-700">
            The interview server lost this attempt. Schedule the candidate again for a new link.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {candidate.status === "in_progress"
                ? "They're in the interview now. Results appear here when they finish."
                : `Opens ${EARLY_JOIN_MIN} min before ${formatWhen(candidate.scheduledAt)} (${relativeWhen(candidate.scheduledAt)}).`}
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-[#f3f3f3] p-1.5 pl-3">
              <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
              <NbButton onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </NbButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidate.email ? (
                <a
                  className="nb-btn"
                  href={mailtoHref(candidate.email, message.subject, message.body)}
                >
                  <Mail className="h-4 w-4" /> Email
                </a>
              ) : (
                <NbButton onClick={() => copyText(`${message.subject}\n\n${message.body}`)}>
                  <Mail className="h-4 w-4" /> Copy invite text
                </NbButton>
              )}
              <NbButton onClick={calendar}>
                <CalendarDays className="h-4 w-4" /> Calendar
              </NbButton>
              <a className="nb-btn" href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Open as candidate
              </a>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

type PlanState =
  | { kind: "loading" }
  | { kind: "ready"; plan: ClientInterviewPlan }
  | { kind: "error"; message: string };

function PlannedTopics({ candidate }: { candidate: AdminCandidate }) {
  const [state, setState] = useState<PlanState>({ kind: "loading" });

  useEffect(() => {
    if (candidate.kind !== "live") {
      setState({ kind: "ready", plan: clientGoldenReport.record.plan });
      return;
    }
    let cancelled = false;
    getSession(candidate.interviewId)
      .then((s) => !cancelled && setState({ kind: "ready", plan: s.record.plan }))
      .catch(
        (err: Error) =>
          !cancelled &&
          setState({ kind: "error", message: err.message || "Couldn't load the plan." }),
      );
    return () => {
      cancelled = true;
    };
  }, [candidate.interviewId, candidate.kind]);

  return (
    <Panel title="What the AI will ask">
      {state.kind === "loading" && <EmptyRow>Loading the plan…</EmptyRow>}
      {state.kind === "error" && <EmptyRow>{state.message}</EmptyRow>}
      {state.kind === "ready" && (
        <ol className="divide-y divide-[#111]/10">
          {[...state.plan.claims]
            .sort((a, b) => a.rank - b.rank)
            .map((c) => (
              <li key={c.id} className="space-y-0.5 px-4 py-2.5 text-sm">
                <p className="font-semibold">
                  {c.rank}. {c.skillArea}
                  {c.isTechnical && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {c.ladder.workspace?.kind === "whiteboard" ? "whiteboard" : "code"}
                    </span>
                  )}
                </p>
                <p className="text-gray-700">{c.ladder.initial}</p>
              </li>
            ))}
        </ol>
      )}
    </Panel>
  );
}

// ---------- After the interview ----------

function Results({
  candidate,
  report,
}: {
  candidate: AdminCandidate;
  report: ClientInterviewReport;
}) {
  const summary = fitSummary(report);
  const guide = interviewGuide(report);
  const [copied, setCopied] = useState(false);

  const copyGuide = async () => {
    setCopied(await copyText(guideToText(guide, `Follow-up interview guide: ${candidate.name}`)));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <StatRow
        items={[
          { label: "Fit", value: pct(summary.fit), hint: "weighted by the job" },
          {
            label: "Topics cited",
            value: `${summary.assessed}/${summary.topics.length}`,
            hint: `${pct(summary.coverage)} coverage`,
          },
          {
            label: "Needs a look",
            value: summary.needsReview + summary.auditConcerns,
            hint: "mixed evidence + fairness items",
          },
          {
            label: "Integrity",
            value: summary.integrityLevel,
            hint: "for review, not a verdict",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="Topics">
          <ul className="divide-y divide-[#111]/10">
            {summary.topics.map((t) => (
              <li key={t.claimId} className="space-y-1 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-semibold">{t.skillArea}</span>
                  {t.score === null ? (
                    <span className="text-xs text-gray-500">
                      {t.status === "not_assessed" ? "Not reached" : "No cited score"}
                    </span>
                  ) : (
                    <>
                      {t.needsHumanReview && <span title="Needs a human look">👀</span>}
                      <ScoreMeter score={t.score} />
                    </>
                  )}
                </div>
                {t.quote && <q className="block text-xs italic text-gray-600">{t.quote.quote}</q>}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="What to ask next"
          actions={
            <span className="flex gap-2 print:hidden">
              <NbButton onClick={copyGuide}>
                {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </NbButton>
              <NbButton onClick={() => window.print()} aria-label="Print guide">
                <Printer className="h-4 w-4" />
              </NbButton>
            </span>
          }
        >
          {guide.checks.length > 0 && (
            <ul className="space-y-1 border-b border-[#111]/10 bg-[#fffaf0] px-4 py-2.5 text-xs text-gray-700">
              {guide.checks.map((c) => (
                <li key={c.title}>
                  <strong>{c.title}.</strong> {c.detail}
                </li>
              ))}
            </ul>
          )}
          <ol className="divide-y divide-[#111]/10">
            {guide.items.map((item) => (
              <li key={item.claimId} className="space-y-1.5 px-4 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`nb-pill ${PRIORITY_TONE[item.priority]}`}>
                    {GUIDE_PRIORITY_LABEL[item.priority]}
                  </span>
                  <span className="font-semibold">{item.topic}</span>
                </p>
                <p className="text-xs text-gray-600">{item.why}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {item.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}

// ---------- Decision ----------

const DECISIONS: HiringDecision[] = ["advance", "hold", "reject", "undecided"];

function DecisionPanel({ candidate }: { candidate: AdminCandidate }) {
  const [notes, setNotes] = useState(candidate.notes);
  // Save typed notes shortly after typing stops rather than on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => updateCandidate(candidate.id, { notes }), 400);
    return () => window.clearTimeout(timer);
  }, [candidate.id, notes]);

  return (
    <Panel title="Your decision">
      <div className="space-y-3 p-4 print:hidden">
        <fieldset className="flex flex-wrap gap-1.5" aria-label="Decision">
          {DECISIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={candidate.decision === d}
              onClick={() => updateCandidate(candidate.id, { decision: d })}
              className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                candidate.decision === d
                  ? `border-[#111] ${DECISION_META[d].className}`
                  : "border-[#111]/20 bg-white text-gray-600 hover:border-[#111]"
              }`}
            >
              {d === "undecided" ? "Undecided" : DECISION_META[d].label}
            </button>
          ))}
        </fieldset>
        <textarea
          aria-label="Notes"
          className="nb-input min-h-[80px]"
          placeholder="Notes for your team…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Panel>
  );
}
