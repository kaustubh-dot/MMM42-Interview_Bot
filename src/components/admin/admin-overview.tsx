"use client";

import { NbButton, NbLinkButton } from "@/components/pipeline/ui";
import { fitSummary, rankByEvidence } from "@/lib/admin/insights";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSampleData, useAdmin } from "./admin-store";
import {
  ConcernPill,
  EmptyRow,
  FitBar,
  KindPill,
  PageHeader,
  Panel,
  StatRow,
  StatusPill,
  formatWhen,
  relativeWhen,
} from "./admin-ui";

const row = "flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa]";

export function AdminOverview() {
  const router = useRouter();
  const { state, reports } = useAdmin();
  const { jobs, candidates } = state;
  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title ?? "Unknown job";

  const upcoming = candidates
    .filter((c) => c.status === "scheduled" || c.status === "in_progress")
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const toReview = candidates.filter((c) => c.status === "completed" && c.decision === "undecided");

  const actions = (
    <>
      <NbLinkButton href="/admin/jobs">New job</NbLinkButton>
      <NbLinkButton href="/admin/schedule" variant="primary">
        Schedule interview
      </NbLinkButton>
    </>
  );

  if (jobs.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Overview" actions={actions} />
        <div className="nb-card space-y-3 p-5">
          <p className="font-bold">No jobs yet</p>
          <p className="text-sm text-gray-700">
            Create a job, schedule candidates, then compare their evidence here. Or load a sample
            job with one recorded interview to look around.
          </p>
          <div className="flex gap-2">
            <NbLinkButton href="/admin/jobs" variant="primary">
              Create a job
            </NbLinkButton>
            <NbButton onClick={() => router.push(`/admin/jobs/${loadSampleData().id}`)}>
              Load sample data
            </NbButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Overview" actions={actions} />

      <StatRow
        items={[
          { label: "Jobs", value: jobs.length },
          { label: "Upcoming", value: upcoming.length },
          { label: "Awaiting your call", value: toReview.length },
          {
            label: "Advanced",
            value: candidates.filter((c) => c.decision === "advance").length,
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Upcoming interviews">
          {upcoming.length === 0 ? (
            <EmptyRow>
              Nothing scheduled.{" "}
              <Link className="nb-link font-bold" href="/admin/schedule">
                Schedule one
              </Link>
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-[#111]/10">
              {upcoming.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/candidates/${c.id}`} className={row}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-gray-600">
                        {jobTitle(c.jobId)} · {formatWhen(c.scheduledAt)} (
                        {relativeWhen(c.scheduledAt)})
                      </span>
                    </span>
                    <KindPill kind={c.kind} />
                    <StatusPill status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Ready for your review">
          {toReview.length === 0 ? (
            <EmptyRow>No finished interviews waiting for a decision.</EmptyRow>
          ) : (
            <ul className="divide-y divide-[#111]/10">
              {toReview.map((c) => {
                const report = reports[c.interviewId];
                const summary = report ? fitSummary(report) : null;
                return (
                  <li key={c.id}>
                    <Link href={`/admin/candidates/${c.id}`} className={row}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c.name}</span>
                        <span className="block truncate text-xs text-gray-600">
                          {jobTitle(c.jobId)}
                        </span>
                      </span>
                      {summary ? (
                        <>
                          <FitBar value={summary.fit} />
                          <ConcernPill level={summary.integrityLevel} />
                        </>
                      ) : (
                        <span className="text-xs text-gray-600">
                          {c.statusNote ?? "Report loading…"}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Jobs">
        <ul className="divide-y divide-[#111]/10">
          {jobs.map((job) => {
            const pool = candidates.filter((c) => c.jobId === job.id);
            const { ranked } = rankByEvidence(pool, (c) => reports[c.interviewId] ?? null);
            const leader = ranked[0];
            return (
              <li key={job.id}>
                <Link href={`/admin/jobs/${job.id}`} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{job.title}</span>
                    <span className="block text-xs text-gray-600">
                      {pool.length} candidate{pool.length === 1 ? "" : "s"} · {ranked.length}{" "}
                      interviewed
                      {leader && ` · top evidence: ${leader.item.name}`}
                    </span>
                  </span>
                  {leader && <FitBar value={leader.summary.fit} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
