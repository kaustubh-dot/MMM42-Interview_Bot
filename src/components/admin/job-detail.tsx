"use client";

import { ScoreMeter } from "@/components/pipeline/report/score-section";
import { NbButton, NbLinkButton } from "@/components/pipeline/ui";
import { FIT_RULE, type FitSummary, type RankedEntry, rankByEvidence } from "@/lib/admin/insights";
import { toCsv } from "@/lib/admin/invite";
import type { AdminCandidate } from "@/lib/admin/types";
import { Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJob, useAdmin } from "./admin-store";
import {
  ConcernPill,
  DECISION_META,
  DecisionPill,
  EmptyRow,
  FitBar,
  KindPill,
  PageHeader,
  Panel,
  StatusPill,
  downloadFile,
  formatWhen,
  pct,
} from "./admin-ui";

const MAX_COMPARE = 3;

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
    <div className="space-y-5">
      <PageHeader
        back={
          <Link href="/admin/jobs" className="nb-link text-sm font-semibold">
            ← Jobs
          </Link>
        }
        title={job.title}
        subtitle={`${pool.length} candidate${pool.length === 1 ? "" : "s"} · ${ranked.length} interviewed`}
        actions={
          <>
            <NbButton onClick={exportCsv} disabled={pool.length === 0} title="Export CSV">
              <Download className="h-4 w-4" /> CSV
            </NbButton>
            <NbButton onClick={remove} aria-label="Delete job" title="Delete job">
              <Trash2 className="h-4 w-4" />
            </NbButton>
            <NbLinkButton
              href={`/admin/schedule?job=${encodeURIComponent(job.id)}`}
              variant="primary"
            >
              Schedule candidate
            </NbLinkButton>
          </>
        }
      />

      {leader && (
        <p className="nb-card nb-bg-soft-lavender px-4 py-2.5 text-sm">
          🏆 <strong>Strongest evidence so far:</strong>{" "}
          <Link href={`/admin/candidates/${leader.item.id}`} className="nb-link font-semibold">
            {leader.item.name}
          </Link>{" "}
          — fit {pct(leader.summary.fit)}, {leader.summary.assessed}/{leader.summary.topics.length}{" "}
          topics cited
          {ranked[1]?.position === leader.position ? " (tied)" : ""}. A starting point, not a
          decision.
        </p>
      )}

      <Panel
        title="Ranking by evidence"
        actions={
          compare.length > 0 && (
            <span className="text-xs text-gray-600">
              {compare.length < 2 ? "Tick one more to compare" : `Comparing ${compare.length}`}
            </span>
          )
        }
      >
        {ranked.length === 0 ? (
          <EmptyRow>No finished interviews yet. Rankings appear as candidates finish.</EmptyRow>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f7f7f7]">
                <tr>
                  <th className="w-10 px-3 py-2" aria-label="Compare" />
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Fit</th>
                  <th className="px-3 py-2">Topics cited</th>
                  <th className="px-3 py-2">Integrity*</th>
                  <th className="px-3 py-2">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111]/10">
                {ranked.map(({ item: c, summary: s, position }) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Compare ${c.name}`}
                        checked={compare.includes(c.id)}
                        disabled={!compare.includes(c.id) && compare.length >= MAX_COMPARE}
                        onChange={() => toggleCompare(c.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-bold">{position}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/candidates/${c.id}`} className="nb-link font-semibold">
                        {c.name}
                      </Link>{" "}
                      <KindPill kind={c.kind} />
                      {s.needsReview > 0 && (
                        <span className="ml-1 text-xs text-gray-500">
                          👀 {s.needsReview} to check
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <FitBar value={s.fit} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.assessed}/{s.topics.length}
                    </td>
                    <td className="px-3 py-2">
                      <ConcernPill level={s.integrityLevel} />
                    </td>
                    <td className="px-3 py-2">
                      <DecisionPill decision={c.decision} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-[#111]/10 px-4 py-2 text-xs text-gray-500">
              {FIT_RULE} *Integrity is a concern level for human review, not a cheating
              determination.
            </p>
          </div>
        )}
      </Panel>

      {compared.length >= 2 && <CompareGrid entries={compared} />}

      {unranked.length > 0 && (
        <Panel title="Not interviewed yet">
          <ul className="divide-y divide-[#111]/10">
            {unranked.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/candidates/${c.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa]"
                >
                  <span className="flex-1 font-semibold">{c.name}</span>
                  <span className="text-xs text-gray-600">{formatWhen(c.scheduledAt)}</span>
                  <StatusPill status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-gray-700">Job description</summary>
        <p className="mt-2 whitespace-pre-wrap text-gray-700">{job.jdText}</p>
      </details>
    </div>
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
        <thead className="bg-[#f7f7f7]">
          <tr>
            <th className="w-40 px-3 py-2">Topic</th>
            {entries.map((e) => (
              <th key={e.item.id} className="px-3 py-2">
                #{e.position} {e.item.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#111]/10">
            <td className="px-3 py-2 font-bold">Fit</td>
            {entries.map((e) => (
              <td key={e.item.id} className="px-3 py-2">
                <FitBar value={e.summary.fit} />
              </td>
            ))}
          </tr>
          {areas.map(([key, label]) => (
            <tr key={key} className="border-b border-[#111]/10 align-top">
              <td className="px-3 py-2 font-bold">{label}</td>
              {entries.map((e) => {
                const t = topicFor(e.summary, key);
                return (
                  <td key={e.item.id} className="space-y-1 px-3 py-2">
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
            <td className="px-3 py-2 font-bold">Integrity*</td>
            {entries.map((e) => (
              <td key={e.item.id} className="px-3 py-2">
                <ConcernPill level={e.summary.integrityLevel} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
