"use client";

import { getSession } from "@/components/pipeline/api-client";
import type { ClientInterviewPlan, ClientInterviewReport } from "@/components/pipeline/contract";
import { ScoreMeter } from "@/components/pipeline/report/score-section";
import { Explainer, NbButton, NbLinkButton, SectionHeading } from "@/components/pipeline/ui";
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
  ConcernPill,
  DECISION_META,
  DecisionPill,
  FitBar,
  KindPill,
  StatusPill,
  copyText,
  downloadFile,
  formatWhen,
  pct,
  relativeWhen,
} from "./admin-ui";

const PRIORITY_TONE: Record<GuidePriority, string> = {
  must: "nb-bg-salmon",
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
      <section className="nb-card mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-black">Candidate not found</h1>
        <p className="text-gray-700">
          They may have been removed, or they were scheduled in another browser.
        </p>
        <NbLinkButton href="/admin">Back to overview</NbLinkButton>
      </section>
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
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Link href={`/admin/jobs/${job.id}`} className="nb-link text-sm font-bold">
            ← {job.title}
          </Link>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{candidate.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={candidate.status} />
            <DecisionPill decision={candidate.decision} />
            <KindPill kind={candidate.kind} />
            <span className="text-gray-600">
              {candidate.status === "completed" ? "Interviewed" : "Scheduled"}{" "}
              {formatWhen(candidate.scheduledAt)}
              {candidate.email && ` · ${candidate.email}`}
            </span>
          </div>
          {candidate.statusNote && (
            <p className="flex items-center gap-2 text-sm text-gray-700">
              {candidate.statusNote.endsWith("…") && <Loader2 className="h-4 w-4 animate-spin" />}
              {candidate.statusNote}
            </p>
          )}
        </div>
        <NbButton size="sm" onClick={remove} aria-label="Remove candidate">
          <Trash2 className="h-4 w-4" />
        </NbButton>
      </header>

      {report ? (
        <Results candidate={candidate} report={report} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
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
        description: `${message.body}`,
        url,
      }),
      "text/calendar;charset=utf-8",
    );

  return (
    <section className="nb-card space-y-4 p-6" aria-labelledby="invite">
      <h2 id="invite" className="text-2xl font-black">
        {expired ? "This link has expired" : "Send the invite"}
      </h2>
      {expired ? (
        <p className="text-gray-700">
          The interview server lost this attempt. Schedule the candidate again to get a new link.
        </p>
      ) : (
        <>
          <p className="text-gray-700">
            {candidate.status === "in_progress"
              ? "The candidate is in the interview now. Results appear here when they finish."
              : `Opens ${EARLY_JOIN_MIN} minutes before ${formatWhen(candidate.scheduledAt)} (${relativeWhen(candidate.scheduledAt)}).`}
          </p>
          <div className="flex items-center gap-2 rounded-xl border-2 border-[#111] bg-[#f3f3f3] p-2">
            <code className="min-w-0 flex-1 truncate px-2 text-sm">{url}</code>
            <NbButton size="sm" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </NbButton>
          </div>
          <div className="flex flex-wrap gap-3">
            {candidate.email ? (
              <a
                className="nb-btn sm"
                href={mailtoHref(candidate.email, message.subject, message.body)}
              >
                <Mail className="h-4 w-4" /> Email draft
              </a>
            ) : (
              <NbButton size="sm" onClick={() => copyText(`${message.subject}\n\n${message.body}`)}>
                <Mail className="h-4 w-4" /> Copy invite text
              </NbButton>
            )}
            <NbButton size="sm" onClick={calendar}>
              <CalendarDays className="h-4 w-4" /> Calendar file
            </NbButton>
            <a className="nb-btn sm" href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Open as candidate
            </a>
          </div>
        </>
      )}
      <NbButton size="sm" variant="primary" disabled={syncing} onClick={() => syncNow()}>
        {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
        Check status now
      </NbButton>
    </section>
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
    <section className="space-y-4" aria-labelledby="planned">
      <SectionHeading
        title={<span id="planned">What the AI will ask</span>}
        subtitle="Topics from their resume that this job needs, most important first."
        star="#ffc3be"
      />
      {state.kind === "loading" && (
        <p className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the plan…
        </p>
      )}
      {state.kind === "error" && <p className="nb-card flat p-4 text-gray-700">{state.message}</p>}
      {state.kind === "ready" && (
        <ol className="space-y-3">
          {[...state.plan.claims]
            .sort((a, b) => a.rank - b.rank)
            .map((c) => (
              <li key={c.id} className="nb-card flat space-y-2 p-4">
                <p className="flex items-center gap-2 font-black">
                  <span className="nb-pill">{c.rank}</span>
                  {c.skillArea}
                  {c.isTechnical && (
                    <span className="nb-pill nb-bg-soft-lavender">
                      {c.ladder.workspace?.kind === "whiteboard" ? "whiteboard" : "code"}
                    </span>
                  )}
                </p>
                <p className="text-sm italic text-gray-700">Resume: “{c.resumeEvidence}”</p>
                <p className="text-sm">
                  <span className="font-bold">Opening question: </span>
                  {c.ladder.initial}
                </p>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}

// ---------- After the interview ----------

function Results({
  candidate,
  report,
}: { candidate: AdminCandidate; report: ClientInterviewReport }) {
  const summary = fitSummary(report);
  const guide = interviewGuide(report);
  const [copied, setCopied] = useState(false);

  const copyGuide = async () => {
    setCopied(await copyText(guideToText(guide, `Follow-up interview guide: ${candidate.name}`)));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
        <div className="nb-card nb-bg-soft-lavender space-y-2 p-5 xl:col-span-2">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
            Evidence-weighted fit
          </p>
          <FitBar value={summary.fit} />
          <p className="text-sm text-gray-800">
            {summary.assessed} of {summary.topics.length} topics backed by quotes (
            {pct(summary.coverage)} of what the job weights).
            {summary.strongest && ` Strongest: ${summary.strongest.skillArea}.`}
            {summary.biggestGap && ` Biggest gap: ${summary.biggestGap.skillArea}.`}
          </p>
        </div>
        <div className="nb-card space-y-1 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-600">Needs a look</p>
          <p className="text-4xl font-black">{summary.needsReview}</p>
          <p className="text-sm text-gray-700">
            scores with mixed or thin evidence · {summary.auditConcerns} fairness item
            {summary.auditConcerns === 1 ? "" : "s"} to check
          </p>
        </div>
        <div className="nb-card space-y-2 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-600">Integrity notes</p>
          <ConcernPill level={summary.integrityLevel} />
          <p className="text-xs text-gray-700">
            A concern level to prompt human review, not a cheating determination. Never part of the
            fit or ranking.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <NbLinkButton href={`/admin/candidates/${candidate.id}/report`} variant="primary">
          Open the full cited report
        </NbLinkButton>
      </div>

      <section className="space-y-4" aria-labelledby="topics">
        <SectionHeading title={<span id="topics">Topic by topic</span>} />
        <div className="nb-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b-2 border-[#111] bg-[#f3f3f3]">
              <tr>
                <th className="p-3">Topic</th>
                <th className="p-3">Job weight</th>
                <th className="p-3">Score</th>
                <th className="p-3">Their words</th>
              </tr>
            </thead>
            <tbody>
              {summary.topics.map((t) => (
                <tr key={t.claimId} className="border-b border-[#111]/15 align-top last:border-0">
                  <td className="p-3 font-bold">{t.skillArea}</td>
                  <td className="p-3 font-mono">{pct(t.jdWeight)}</td>
                  <td className="p-3">
                    {t.score === null ? (
                      <span className="text-gray-500">
                        {t.status === "not_assessed" ? "Not reached" : "No cited score"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ScoreMeter score={t.score} /> {t.score}/3
                        {t.needsHumanReview && <span title="Needs a human look">👀</span>}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {t.quote ? <q className="italic">{t.quote.quote}</q> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="guide">
        <div className="flex flex-wrap items-end gap-3">
          <SectionHeading
            title={<span id="guide">What to ask in your interview</span>}
            subtitle="Built from the gaps in the evidence: topics never reached first, then scores to verify."
            star="#ffc3be"
          />
          <span className="ml-auto flex gap-3 print:hidden">
            <NbButton size="sm" onClick={copyGuide}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy guide"}
            </NbButton>
            <NbButton size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </NbButton>
          </span>
        </div>

        {guide.checks.length > 0 && (
          <div className="nb-card flat nb-bg-soft-salmon space-y-2 p-4">
            <p className="font-black">Before you start</p>
            <ul className="space-y-2 text-sm">
              {guide.checks.map((c) => (
                <li key={c.title}>
                  <span className="font-bold">{c.title}.</span> {c.detail}
                  {c.turnIds.length > 0 && (
                    <span className="text-gray-600"> (turns {c.turnIds.join(", ")})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="grid gap-4 md:grid-cols-2">
          {guide.items.map((item) => (
            <li key={item.claimId} className="nb-card flex flex-col gap-3 p-5">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`nb-pill ${PRIORITY_TONE[item.priority]}`}>
                  {GUIDE_PRIORITY_LABEL[item.priority]}
                </span>
                <span className="text-lg font-black">{item.topic}</span>
              </p>
              <p className="text-sm text-gray-700">{item.why}</p>
              <ul className="space-y-2">
                {item.questions.map((q) => (
                  <li key={q} className="rounded-xl border-2 border-[#111] bg-white p-3 text-sm">
                    {q}
                  </li>
                ))}
              </ul>
              {item.evidence && (
                <p className="mt-auto text-xs text-gray-600">
                  They said: <q className="italic">{item.evidence}</q>
                </p>
              )}
            </li>
          ))}
        </ol>
        <Explainer title="Where do these questions come from?">
          <p>
            Each topic already has a ladder of questions planned from the resume and job
            description. The guide picks the steps the AI interview didn't reach. For weak scores it
            goes back to basics, and for strong ones it offers a "defend your choice" question that
            quotes the candidate.
          </p>
          <p>Nothing here is a verdict. Use it to decide what to listen for.</p>
        </Explainer>
      </section>
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
    <section className="nb-card space-y-4 p-6 print:hidden" aria-labelledby="decision">
      <h2 id="decision" className="text-2xl font-black">
        Your decision
      </h2>
      <p className="text-sm text-gray-700">
        The console never decides for you. Record your call and why, for your team.
      </p>
      <fieldset className="flex flex-wrap gap-3" aria-label="Decision">
        {DECISIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={candidate.decision === d}
            onClick={() => updateCandidate(candidate.id, { decision: d })}
            className={`rounded-lg border-2 border-[#111] px-4 py-2 font-bold ${
              candidate.decision === d
                ? `${DECISION_META[d].className} shadow-[3px_3px_0_#111]`
                : "bg-white"
            }`}
          >
            {d === "undecided" ? "Undecided" : DECISION_META[d].label}
          </button>
        ))}
      </fieldset>
      <label htmlFor="cand-notes" className="block font-bold">
        Notes
      </label>
      <textarea
        id="cand-notes"
        className="nb-input min-h-[120px]"
        placeholder="What stood out, what to check next…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </section>
  );
}
