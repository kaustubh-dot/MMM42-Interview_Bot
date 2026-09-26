"use client";

import { NbButton } from "@/components/pipeline/ui";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addJob, loadSampleData, useAdmin } from "./admin-store";
import { EmptyRow, Field, PageHeader, Panel } from "./admin-ui";

const MIN_JD_CHARS = 40;

export function JobsPage() {
  const router = useRouter();
  const { state } = useAdmin();
  const [title, setTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [tried, setTried] = useState(false);

  const titleError = !title.trim() ? "Give the job a title." : null;
  const jdError =
    jdText.trim().length < MIN_JD_CHARS
      ? `Paste the job description (at least ${MIN_JD_CHARS} characters). Questions are built from it.`
      : null;

  const create = () => {
    setTried(true);
    if (titleError || jdError) {
      return;
    }
    const job = addJob({ title: title.trim(), jdText: jdText.trim() });
    router.push(`/admin/jobs/${job.id}`);
  };

  const fillSample = () => {
    const plan = clientGoldenReport.record.plan;
    setTitle(plan.roleTitle);
    setJdText(plan.claims.map((c) => c.jdRequirement).join("\n"));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Jobs" subtitle="Open a job to see its candidates and ranking." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title="Your jobs">
          {state.jobs.length === 0 ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-gray-700">
                No jobs yet. Create one, or load the sample job.
              </p>
              <NbButton onClick={() => router.push(`/admin/jobs/${loadSampleData().id}`)}>
                Load sample data
              </NbButton>
            </div>
          ) : (
            <ul className="divide-y divide-[#111]/10">
              {state.jobs.map((job) => {
                const pool = state.candidates.filter((c) => c.jobId === job.id);
                const done = pool.filter((c) => c.status === "completed").length;
                return (
                  <li key={job.id}>
                    <Link
                      href={`/admin/jobs/${job.id}`}
                      className="block px-4 py-2.5 hover:bg-[#fafafa]"
                    >
                      <span className="block truncate font-semibold">{job.title}</span>
                      <span className="block text-xs text-gray-600">
                        {pool.length} candidate{pool.length === 1 ? "" : "s"} · {done} interviewed
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <section className="nb-card space-y-4 p-4" aria-labelledby="new-job">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="new-job" className="font-bold">
              Create a job
            </h2>
            <button
              type="button"
              className="nb-link ml-auto text-sm font-bold"
              onClick={fillSample}
            >
              Fill with the sample job
            </button>
          </div>
          <Field id="job-title" label="Job title">
            <input
              id="job-title"
              className="nb-input"
              placeholder="e.g. Backend Engineer (Node.js / PostgreSQL)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field
            id="job-jd"
            label="Job description"
            hint="Paste the full posting. Each candidate's questions come from what their resume says about these requirements."
          >
            <textarea
              id="job-jd"
              className="nb-input min-h-[160px]"
              placeholder="Paste the job description here…"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
          </Field>
          {tried && (titleError || jdError) && (
            <p
              role="alert"
              className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
            >
              {titleError ?? jdError}
            </p>
          )}
          <NbButton variant="primary" onClick={create}>
            Create job
          </NbButton>
        </section>
      </div>
    </div>
  );
}
