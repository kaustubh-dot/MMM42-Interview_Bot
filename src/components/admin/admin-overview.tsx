"use client";

import { NbButton, NbLinkButton, SectionHeading } from "@/components/pipeline/ui";
import { fitSummary, rankByEvidence } from "@/lib/admin/insights";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSampleData, useAdmin } from "./admin-store";
import {
  ConcernPill,
  FitBar,
  KindPill,
  StatTile,
  StatusPill,
  formatWhen,
  relativeWhen,
} from "./admin-ui";

export function AdminOverview() {
  const router = useRouter();
  const { state, reports } = useAdmin();
  const { jobs, candidates } = state;
  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title ?? "Unknown job";

  const upcoming = candidates
    .filter((c) => c.status === "scheduled" || c.status === "in_progress")
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const toReview = candidates.filter((c) => c.status === "completed" && c.decision === "undecided");
  const advanced = candidates.filter((c) => c.decision === "advance").length;

  const steps = [
    { label: "Create a job", done: jobs.length > 0, href: "/admin/jobs" },
    { label: "Schedule a candidate", done: candidates.length > 0, href: "/admin/schedule" },
    {
      label: "Candidate takes the AI interview",
      done: candidates.some((c) => c.status === "completed"),
      href: upcoming[0] ? `/admin/candidates/${upcoming[0].id}` : "/admin/schedule",
    },
    {
      label: "Compare the evidence",
      done: Object.keys(reports).length > 0,
      href: jobs[0] ? `/admin/jobs/${jobs[0].id}` : "/admin/jobs",
    },
    {
      label: "Make the call",
      done: candidates.some((c) => c.decision !== "undecided"),
      href: toReview[0] ? `/admin/candidates/${toReview[0].id}` : "/admin/jobs",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Hiring overview</h1>
          <p className="max-w-2xl text-lg text-gray-700">
            Schedule AI interviews, see who has the strongest evidence for each job, and get the
            questions to ask next. You make every decision.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          <NbLinkButton href="/admin/jobs" size="sm">
            New job
          </NbLinkButton>
          <NbLinkButton href="/admin/schedule" variant="primary" size="sm">
            Schedule an interview
          </NbLinkButton>
        </div>
      </header>

      <ol className="grid gap-3 md:grid-cols-5" aria-label="Hiring workflow">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={`nb-card flat hoverable flex h-full items-start gap-3 p-4 ${s.done ? "nb-bg-soft-lavender" : "bg-white"}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[#111] text-sm font-black ${s.done ? "bg-[#111] text-white" : "bg-white"}`}
              >
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="font-bold leading-tight">{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>

      {jobs.length === 0 ? (
        <section className="nb-card nb-bg-soft-salmon space-y-4 p-6">
          <h2 className="text-2xl font-black">Start here</h2>
          <p className="max-w-2xl text-gray-800">
            Create a job with its description, then schedule candidates for it. Want to look around
            first? Load the sample job: it includes one recorded interview, so the ranking and
            follow-up guide have something to show.
          </p>
          <div className="flex flex-wrap gap-3">
            <NbLinkButton href="/admin/jobs" variant="primary">
              Create a job
            </NbLinkButton>
            <NbButton onClick={() => router.push(`/admin/jobs/${loadSampleData().id}`)}>
              Load sample data
            </NbButton>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="At a glance">
          <StatTile label="Open jobs" value={jobs.length} />
          <StatTile
            label="Upcoming"
            value={upcoming.length}
            hint="Scheduled or in progress"
            tone="bg-[#fff3c4]"
          />
          <StatTile
            label="Awaiting your call"
            value={toReview.length}
            hint="Interview done, no decision yet"
            tone="nb-bg-soft-lavender"
          />
          <StatTile label="Advanced" value={advanced} tone="bg-[#c9f5ea]" />
        </section>
      )}

      {jobs.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="space-y-4">
            <SectionHeading title="Upcoming interviews" />
            {upcoming.length === 0 ? (
              <p className="nb-card flat p-4 text-gray-700">
                Nothing scheduled.{" "}
                <Link className="nb-link font-bold" href="/admin/schedule">
                  Schedule an interview
                </Link>
              </p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/candidates/${c.id}`}
                      className="nb-card flat hoverable flex flex-wrap items-center gap-3 p-4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{c.name}</span>
                        <span className="block truncate text-sm text-gray-600">
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
          </section>

          <section className="space-y-4">
            <SectionHeading title="Ready for your review" star="#ffc3be" />
            {toReview.length === 0 ? (
              <p className="nb-card flat p-4 text-gray-700">
                No finished interviews waiting for a decision.
              </p>
            ) : (
              <ul className="space-y-3">
                {toReview.map((c) => {
                  const report = reports[c.interviewId];
                  const summary = report ? fitSummary(report) : null;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/admin/candidates/${c.id}`}
                        className="nb-card flat hoverable flex flex-wrap items-center gap-3 p-4"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{c.name}</span>
                          <span className="block truncate text-sm text-gray-600">
                            {jobTitle(c.jobId)}
                          </span>
                        </span>
                        {summary ? (
                          <>
                            <FitBar value={summary.fit} />
                            <ConcernPill level={summary.integrityLevel} />
                          </>
                        ) : (
                          <span className="text-sm text-gray-600">
                            {c.statusNote ?? "Report loading…"}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {jobs.length > 0 && (
        <section className="space-y-4">
          <SectionHeading
            title="Jobs"
            subtitle="Strongest evidence so far for each job. Open a job for the full ranking."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const pool = candidates.filter((c) => c.jobId === job.id);
              const { ranked } = rankByEvidence(pool, (c) => reports[c.interviewId] ?? null);
              const leader = ranked[0];
              return (
                <Link
                  key={job.id}
                  href={`/admin/jobs/${job.id}`}
                  className="nb-card hoverable group flex flex-col gap-3 p-5"
                >
                  <span className="flex items-start gap-2">
                    <span className="flex-1 text-xl font-black leading-tight">{job.title}</span>
                    <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="text-sm text-gray-600">
                    {pool.length} candidate{pool.length === 1 ? "" : "s"} · {ranked.length}{" "}
                    interviewed
                  </span>
                  {leader ? (
                    <span className="mt-auto space-y-1 rounded-xl bg-[#f3f3f3] p-3 text-sm">
                      <span className="block font-bold">Top evidence: {leader.item.name}</span>
                      <FitBar value={leader.summary.fit} />
                    </span>
                  ) : (
                    <span className="mt-auto text-sm text-gray-600">
                      No finished interviews yet.
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
