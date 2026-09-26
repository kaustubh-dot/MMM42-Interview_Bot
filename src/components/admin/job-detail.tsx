"use client";

import { ScoreMeter } from "@/components/pipeline/report/score-section";
import { Explainer, NbButton, NbLinkButton, SectionHeading } from "@/components/pipeline/ui";
import { FIT_RULE, type FitSummary, type RankedEntry, rankByEvidence } from "@/lib/admin/insights";
import { toCsv } from "@/lib/admin/invite";
import type { AdminCandidate, HiringDecision } from "@/lib/admin/types";
import { Download, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJob, useAdmin } from "./admin-store";
import {
  ConcernPill,
  DECISION_META,
  DecisionPill,
  FitBar,
  KindPill,
  StatusPill,
  downloadFile,
  formatWhen,
  pct,
} from "./admin-ui";

const MAX_COMPARE = 3;

const BOARD: { key: string; title: string; match: (c: AdminCandidate) => boolean }[] = [
  {
    key: "scheduled",
    title: "Scheduled",
    match: (c) => c.decision === "undecided" && c.status === "scheduled",
  },
  {
    key: "in_progress",
    title: "Interviewing",
    match: (c) => c.decision === "undecided" && c.status === "in_progress",
  },
  {
    key: "review",
    title: "Awaiting your call",
    match: (c) => c.decision === "undecided" && c.status === "completed",
  },
  ...(["advance", "hold", "reject"] as HiringDecision[]).map((d) => ({
    key: d,
    title: DECISION_META[d].label,
    match: (c: AdminCandidate) => c.decision === d,
  })),
];

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { state, reports } = useAdmin();
  const [compare, setCompare] = useState<string[]>([]);
  const job = state.jobs.find((j) => j.id === jobId);

  if (!job) {
    return (
      <section className="nb-card mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-black">Job not found</h1>
        <p className="text-gray-700">
          It may have been deleted, or it was created in another browser.
        </p>
        <NbLinkButton href="/admin/jobs">All jobs</NbLinkButton>
      </section>
    );
  }

  const pool = state.candidates.filter((c) => c.jobId === job.id);
  const { ranked, unranked } = rankByEvidence(pool, (c) => reports[c.interviewId] ?? null);
  const leader = ranked[0];
  const expired = pool.filter((c) => c.status === "unavailable" && c.decision === "undecided");

  const toggleCompare = (id: string) =>
    setCompare((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < MAX_COMPARE
          ? [...cur, id]
          : cur,
    );

  const exportCsv = () => {
    const rankOf = new Map(ranked.map((r) => [r.item.id, r]));
    const rows: (string | number)[][] = [
      [
        "Rank",
        "Name",
        "Email",
        "Interview status",
        "Decision",
        "Fit",
        "Coverage",
        "Scores needing review",
        "Integrity concern level (not used in ranking)",
        "Scheduled",
        "Notes",
      ],
      ...pool
        .map((c) => ({ c, r: rankOf.get(c.id) }))
        .sort((a, b) => (a.r?.position ?? 1e9) - (b.r?.position ?? 1e9))
        .map(({ c, r }) => [
          r?.position ?? "",
          c.name,
          c.email,
          c.status,
          DECISION_META[c.decision].label,
          r ? pct(r.summary.fit) : "",
          r ? pct(r.summary.coverage) : "",
          r?.summary.needsReview ?? "",
          r?.summary.integrityLevel ?? "",
          c.scheduledAt,
          c.notes,
        ]),
    ];
    const slug = job.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadFile(`${slug || "job"}-candidates.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const remove = () => {
    if (
      window.confirm(
        `Delete "${job.title}" and its ${pool.length} candidate record(s) from this browser? This can't be undone.`,
      )
    ) {
      deleteJob(job.id);
      router.push("/admin/jobs");
    }
  };

  const compared = ranked.filter((r) => compare.includes(r.item.id));

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href="/admin/jobs" className="nb-link text-sm font-bold">
              ← All jobs
            </Link>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">{job.title}</h1>
            <p className="text-gray-600">
              {pool.length} candidate{pool.length === 1 ? "" : "s"} · {ranked.length} interviewed ·
              created {formatWhen(job.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <NbButton size="sm" onClick={exportCsv} disabled={pool.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </NbButton>
            <NbButton size="sm" onClick={remove} aria-label="Delete job">
              <Trash2 className="h-4 w-4" />
            </NbButton>
            <NbLinkButton
              href={`/admin/schedule?job=${encodeURIComponent(job.id)}`}
              variant="primary"
              size="sm"
            >
              Schedule a candidate
            </NbLinkButton>
          </div>
        </div>
        <details className="nb-card flat p-4">
          <summary className="cursor-pointer font-bold">Job description</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{job.jdText}</p>
        </details>
      </header>

      {leader && <LeaderCard entry={leader} tied={ranked[1]?.position === leader.position} />}

      <section className="space-y-4" aria-labelledby="ranking">
        <SectionHeading
          title={<span id="ranking">Ranking by evidence</span>}
          subtitle="Tick up to three candidates to compare them side by side."
        />
        <Explainer title="How is this ranked?">
          <p>{FIT_RULE}</p>
          <p>
            Candidates are asked about their own resumes, so their topics differ. Compare the
            quotes, not just the number. The ranking is a starting point for your judgment, never a
            decision.
          </p>
        </Explainer>
        {ranked.length === 0 ? (
          <p className="nb-card flat p-4 text-gray-700">
            No finished interviews yet. Rankings appear here as candidates complete them.
          </p>
        ) : (
          <div className="nb-card overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b-2 border-[#111] bg-[#f3f3f3]">
                <tr>
                  <th className="p-3">Compare</th>
                  <th className="p-3">#</th>
                  <th className="p-3">Candidate</th>
                  <th className="p-3">Fit</th>
                  <th className="p-3">Coverage</th>
                  <th className="p-3">Needs a look</th>
                  <th className="p-3">Strongest topic</th>
                  <th className="p-3" title="Shown for human review only. Not used in the ranking.">
                    Integrity*
                  </th>
                  <th className="p-3">Decision</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ item: c, summary: s, position }) => (
                  <tr key={c.id} className="border-b border-[#111]/15 last:border-0">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Compare ${c.name}`}
                        checked={compare.includes(c.id)}
                        disabled={!compare.includes(c.id) && compare.length >= MAX_COMPARE}
                        onChange={() => toggleCompare(c.id)}
                      />
                    </td>
                    <td className="p-3 font-black">{position}</td>
                    <td className="p-3">
                      <Link href={`/admin/candidates/${c.id}`} className="nb-link font-bold">
                        {c.name}
                      </Link>{" "}
                      <KindPill kind={c.kind} />
                    </td>
                    <td className="p-3">
                      <FitBar value={s.fit} />
                    </td>
                    <td className="p-3 font-mono">
                      {s.assessed}/{s.topics.length} ({pct(s.coverage)})
                    </td>
                    <td className="p-3">{s.needsReview > 0 ? `👀 ${s.needsReview}` : "—"}</td>
                    <td className="p-3">{s.strongest?.skillArea ?? "—"}</td>
                    <td className="p-3">
                      <ConcernPill level={s.integrityLevel} />
                    </td>
                    <td className="p-3">
                      <DecisionPill decision={c.decision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t-2 border-[#111] p-3 text-xs text-gray-600">
              * Integrity is a concern level to prompt human review, not a cheating determination.
              It never changes a score or the order above.
            </p>
          </div>
        )}
        {compared.length >= 2 && <CompareGrid entries={compared} />}
        {compared.length === 1 && (
          <p className="text-sm text-gray-600">Tick one more candidate to compare.</p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="board">
        <SectionHeading title={<span id="board">Pipeline</span>} star="#ffc3be" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {BOARD.map((col) => {
            const items = pool.filter(col.match);
            return (
              <div
                key={col.key}
                className="space-y-2 rounded-2xl border-2 border-[#111] bg-white/70 p-3"
              >
                <p className="flex items-center justify-between text-sm font-black">
                  {col.title}
                  <span className="nb-pill">{items.length}</span>
                </p>
                <ul className="space-y-2">
                  {items.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/candidates/${c.id}`}
                        className="block rounded-xl border-2 border-[#111] bg-white p-2 text-sm font-bold hover:shadow-[3px_3px_0_#111]"
                      >
                        {c.name}
                        {c.status !== "completed" && (
                          <span className="block text-xs font-medium text-gray-600">
                            {formatWhen(c.scheduledAt)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {expired.length > 0 && (
          <p className="text-sm text-gray-600">
            Expired links (server restarted before the interview finished):{" "}
            {expired.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link className="nb-link" href={`/admin/candidates/${c.id}`}>
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      {unranked.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Not interviewed yet" />
          <ul className="grid gap-3 md:grid-cols-2">
            {unranked.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/candidates/${c.id}`}
                  className="nb-card flat hoverable flex flex-wrap items-center gap-2 p-3"
                >
                  <span className="flex-1 font-bold">{c.name}</span>
                  <StatusPill status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LeaderCard({ entry, tied }: { entry: RankedEntry<AdminCandidate>; tied: boolean }) {
  const { item: c, summary: s } = entry;
  return (
    <section className="nb-card nb-bg-soft-lavender flex flex-wrap items-center gap-5 p-6">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#111] bg-white shadow-[3px_3px_0_#111]">
        <Trophy className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
          Strongest evidence so far{tied ? " (tied)" : ""}
        </p>
        <p className="text-2xl font-black">{c.name}</p>
        <p className="text-gray-800">
          Fit {pct(s.fit)} with {s.assessed} of {s.topics.length} topics backed by quotes
          {s.strongest ? `, strongest in ${s.strongest.skillArea}` : ""}.
          {s.needsReview > 0
            ? ` ${s.needsReview} score${s.needsReview === 1 ? "" : "s"} still need a human look.`
            : ""}
          {s.biggestGap ? ` Biggest gap: ${s.biggestGap.skillArea}.` : ""}
        </p>
      </div>
      <NbLinkButton href={`/admin/candidates/${c.id}`} variant="primary">
        Review & decide
      </NbLinkButton>
    </section>
  );
}

function CompareGrid({ entries }: { entries: RankedEntry<AdminCandidate>[] }) {
  // Topics differ per resume, so align rows by skill area name.
  const areas: [string, string][] = [];
  for (const t of entries.flatMap((e) => e.summary.topics)) {
    const key = t.skillArea.trim().toLowerCase();
    if (!areas.some(([k]) => k === key)) {
      areas.push([key, t.skillArea]);
    }
  }
  const topicFor = (s: FitSummary, key: string) =>
    s.topics.find((t) => t.skillArea.trim().toLowerCase() === key);

  return (
    <div className="nb-card overflow-x-auto" aria-label="Side-by-side comparison">
      <table className="w-full min-w-[640px] table-fixed text-left text-sm">
        <thead className="border-b-2 border-[#111] bg-[#f3f3f3]">
          <tr>
            <th className="w-40 p-3">Topic</th>
            {entries.map((e) => (
              <th key={e.item.id} className="p-3">
                #{e.position} {e.item.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#111]/15">
            <td className="p-3 font-bold">Fit</td>
            {entries.map((e) => (
              <td key={e.item.id} className="p-3">
                <FitBar value={e.summary.fit} />
              </td>
            ))}
          </tr>
          {areas.map(([key, label]) => (
            <tr key={key} className="border-b border-[#111]/15 align-top">
              <td className="p-3 font-bold">{label}</td>
              {entries.map((e) => {
                const t = topicFor(e.summary, key);
                return (
                  <td key={e.item.id} className="space-y-1 p-3">
                    {!t ? (
                      <span className="text-gray-400">Not on their resume</span>
                    ) : t.score === null ? (
                      <span className="text-gray-500">
                        {t.status === "not_assessed" ? "Not reached" : "No cited score"}
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center gap-2">
                          <ScoreMeter score={t.score} />
                          {t.score}/3 {t.needsHumanReview && "👀"}
                        </span>
                        {t.quote && (
                          <q className="block text-xs italic text-gray-700">{t.quote.quote}</q>
                        )}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="p-3 font-bold">Integrity*</td>
            {entries.map((e) => (
              <td key={e.item.id} className="p-3">
                <ConcernPill level={e.summary.integrityLevel} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
