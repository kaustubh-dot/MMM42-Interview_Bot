"use client";

import { PipelineApiError, createPlan, newRequestId } from "@/components/pipeline/api-client";
import { NbButton, NbLinkButton } from "@/components/pipeline/ui";
import { EARLY_JOIN_MIN, toLocalInputValue } from "@/lib/admin/invite";
import type { CandidateKind } from "@/lib/admin/types";
import { FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addCandidate, useAdmin } from "./admin-store";
import { Field, PageHeader } from "./admin-ui";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // the plan route's limit
const DURATIONS = [15, 20, 30];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nextSlot(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalInputValue(d);
}

type Source = "resume" | "demo";

export function ScheduleForm({ initialJobId }: { initialJobId?: string }) {
  const router = useRouter();
  const { state } = useAdmin();
  const [jobId, setJobId] = useState(
    state.jobs.some((j) => j.id === initialJobId)
      ? (initialJobId ?? "")
      : (state.jobs[0]?.id ?? ""),
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [when, setWhen] = useState(nextSlot);
  const [duration, setDuration] = useState(15);
  const [source, setSource] = useState<Source>("resume");
  const [workspace, setWorkspace] = useState<"code" | "whiteboard">("code");
  const [resume, setResume] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.jobs.length === 0) {
    return (
      <section className="nb-card mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-black">Create a job first</h1>
        <p className="text-gray-700">
          Interviews are built from a job description, so every candidate needs a job.
        </p>
        <NbLinkButton href="/admin/jobs" variant="primary">
          Create a job
        </NbLinkButton>
      </section>
    );
  }

  const job = state.jobs.find((j) => j.id === jobId);
  const at = new Date(when);
  const problem = !job
    ? "Choose a job."
    : !name.trim()
      ? "Add the candidate's name."
      : email.trim() && !EMAIL_RE.test(email.trim())
        ? "That email address doesn't look right."
        : Number.isNaN(at.getTime())
          ? "Pick a date and time."
          : source === "resume" && !resume
            ? "Upload the candidate's resume (PDF)."
            : null;

  const pickResume = (file: File | undefined) => {
    setError(null);
    if (!file) {
      setResume(null);
    } else if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(`"${file.name}" isn't a PDF.`);
    } else if (file.size > MAX_PDF_BYTES) {
      setError(`"${file.name}" is bigger than 5 MB.`);
    } else {
      setResume(file);
    }
  };

  const submit = async () => {
    if (problem || !job) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let interviewId: string;
      let kind: CandidateKind;
      if (source === "resume" && resume) {
        // A3's plan route reads the resume against this job's description and stores the plan.
        const plan = await createPlan({
          resume,
          jdText: job.jdText,
          candidateName: name.trim(),
          candidateEmail: email.trim() || undefined,
        });
        interviewId = plan.interviewId;
        kind = "live";
      } else {
        // A2's labeled demo attempt: the sample plan, created when the candidate starts.
        interviewId = `${workspace === "whiteboard" ? "mock-whiteboard" : "mock"}-${newRequestId()}`;
        kind = "demo";
      }
      const created = addCandidate({
        jobId: job.id,
        name: name.trim(),
        email: email.trim(),
        scheduledAt: at.toISOString(),
        durationMin: duration,
        interviewId,
        kind,
      });
      router.push(`/admin/candidates/${created.id}`);
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      setError(
        apiErr?.code === "MOCK_INPUT_UNSUPPORTED"
          ? "The server is in demo mode, which can't read real resumes. Choose “Demo candidate” below, or run the server with LLM_MODE=gemini."
          : apiErr?.serviceUnavailable
            ? "The interview server isn't reachable right now. Try again in a moment."
            : (apiErr?.message ?? "Something went wrong while building the interview."),
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Schedule an interview"
        subtitle={`We plan the questions from the resume and job now. The candidate's link opens ${EARLY_JOIN_MIN} minutes before their time.`}
      />

      <section className="nb-card space-y-4 p-4">
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="sched-job" label="Job">
            <select
              id="sched-job"
              className="nb-input"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              {state.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sched-name" label="Candidate name" hint="Only you see this. Scoring is blind.">
            <input
              id="sched-name"
              className="nb-input"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field id="sched-email" label="Email (optional)" hint="Used for the invite email draft.">
            <input
              id="sched-email"
              type="email"
              className="nb-input"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field id="sched-when" label="Date & time">
              <input
                id="sched-when"
                type="datetime-local"
                className="nb-input"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </Field>
            <Field id="sched-duration" label="Length">
              <select
                id="sched-duration"
                className="nb-input"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-1.5 font-bold">Questions come from</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["resume", "Their resume", "Upload a PDF. Needs the live AI engine."],
                [
                  "demo",
                  "Demo candidate",
                  "Sample resume with the demo grader. For trying it out.",
                ],
              ] as const
            ).map(([value, title, body]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-[1.5px] border-[#111] p-3 ${source === value ? "nb-bg-soft-lavender shadow-[3px_3px_0_#111]" : "bg-white"}`}
              >
                <input
                  type="radio"
                  name="source"
                  className="mt-1"
                  checked={source === value}
                  onChange={() => {
                    setSource(value);
                    setError(null);
                  }}
                />
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="block text-sm text-gray-600">{body}</span>
                </span>
              </label>
            ))}
          </div>
          {source === "resume" ? (
            <label
              htmlFor="sched-resume"
              className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-[#111] bg-[#f3f3f3] p-4 transition-colors hover:bg-white"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
                {resume ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              </span>
              <span className="min-w-0">
                <span className="block font-bold">Resume (PDF, up to 5 MB)</span>
                <span className="block truncate text-sm text-gray-600">
                  {resume ? resume.name : "Click to choose a file"}
                </span>
              </span>
              <input
                id="sched-resume"
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => pickResume(e.target.files?.[0])}
              />
            </label>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">Technical question uses:</span>
              {(["code", "whiteboard"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={workspace === w}
                  onClick={() => setWorkspace(w)}
                  className={`rounded-lg border-2 border-[#111] px-3 py-1 font-bold ${workspace === w ? "nb-bg-lavender shadow-[3px_3px_0_#111]" : "bg-white"}`}
                >
                  {w === "code" ? "💻 Code editor" : "🖍️ Whiteboard"}
                </button>
              ))}
              <span className="text-gray-600">Requires the server in mock mode.</span>
            </div>
          )}
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <NbButton variant="primary" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            {busy ? "Planning the questions…" : "Schedule & get invite link"}
          </NbButton>
          <span className="text-sm text-gray-600">
            {busy ? "Reading the resume takes about 10–20 seconds." : problem}
          </span>
        </div>
      </section>
    </div>
  );
}
