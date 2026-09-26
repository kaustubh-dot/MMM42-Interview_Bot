"use client";

import { NbButton, SectionHeading } from "@/components/pipeline/ui";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addJob, loadSampleData, useAdmin } from "./admin-store";
import { Field } from "./admin-ui";

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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="space-y-4">
        <SectionHeading
          title="Your jobs"
          subtitle="Open a job to see its candidates and ranking."
        />
        {state.jobs.length === 0 ? (
          <div className="nb-card flat space-y-3 p-5">
            <p className="text-gray-700">No jobs yet. Create one, or load the sample job.</p>
            <NbButton size="sm" onClick={() => router.push(`/admin/jobs/${loadSampleData().id}`)}>
              Load sample data
            </NbButton>
          </div>
        ) : (
          <ul className="space-y-3">
            {state.jobs.map((job) => {
              const pool = state.candidates.filter((c) => c.jobId === job.id);
              const done = pool.filter((c) => c.status === "completed").length;
              return (
                <li key={job.id}>
                  <Link
                    href={`/admin/jobs/${job.id}`}
                    className="nb-card hoverable group flex items-center gap-4 p-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-black">{job.title}</span>
                      <span className="block text-sm text-gray-600">
                        {pool.length} candidate{pool.length === 1 ? "" : "s"} · {done} interviewed
                      </span>
                    </span>
                    <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="nb-card space-y-5 p-6" aria-labelledby="new-job">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="new-job" className="text-2xl font-black">
            Create a job
          </h2>
          <button type="button" className="nb-link ml-auto text-sm font-bold" onClick={fillSample}>
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
            className="nb-input min-h-[220px]"
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
        <NbButton variant="primary" size="lg" onClick={create}>
          Create job
        </NbButton>
      </section>
    </div>
  );
}
