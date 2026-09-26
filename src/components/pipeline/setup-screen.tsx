"use client";

import { FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { PipelineApiError, createPlan } from "./api-client";
import type { ClientInterviewPlan } from "./contract";
import { Explainer, NbButton } from "./ui";

interface Props {
  /** FoloUp role from a /interview?role= link. */
  roleId?: string;
  onPlan: (plan: ClientInterviewPlan) => void;
  /** Start the demo; the technical question opens a code editor or a whiteboard. */
  onUseSample: (workspace: "code" | "whiteboard") => void;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function FilePicker({
  id,
  label,
  hint,
  file,
  onPick,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | undefined) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-[#111] bg-[#f3f3f3] p-4 transition-colors hover:bg-white"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
        {file ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{label}</span>
        <span className="block truncate text-sm text-gray-600">{file ? file.name : hint}</span>
      </span>
      <input
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </label>
  );
}

export function SetupScreen({ roleId, onPlan, onUseSample }: Props) {
  const [demoWorkspace, setDemoWorkspace] = useState<"code" | "whiteboard">("code");
  const [resume, setResume] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; offerSample: boolean } | null>(null);

  const pickPdf = (file: File | undefined, set: (f: File | null) => void) => {
    setError(null);
    if (!file) {
      set(null);
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError({
        message: `"${file.name}" isn't a PDF. Please choose a PDF file.`,
        offerSample: false,
      });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError({ message: `"${file.name}" is bigger than 10 MB.`, offerSample: false });
      return;
    }
    set(file);
  };

  const missing = !resume
    ? "Add your resume first."
    : !jdFile && !jdText.trim()
      ? "Add the job description."
      : null;

  const submit = async () => {
    if (!resume) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plan = await createPlan({
        resume,
        roleId,
        ...(jdFile ? { jd: jdFile } : { jdText: jdText.trim() }),
      });
      onPlan(plan);
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      setError({
        message: apiErr?.serviceUnavailable
          ? "Live interviews from your own resume aren't switched on yet. The demo interview works right now."
          : (apiErr?.message ?? "Something went wrong while reading your files."),
        offerSample: apiErr ? apiErr.serviceUnavailable || apiErr.status >= 500 : true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          Let's set up your interview
        </h1>
        <p className="text-lg text-gray-700">
          Pick one: try the demo right away, or use your own resume.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Demo */}
        <section className="nb-card nb-bg-soft-lavender flex flex-col gap-4 p-6">
          <span className="nb-pill self-start nb-bg-lavender">
            <Sparkles className="h-3.5 w-3.5" /> Best for a first try
          </span>
          <h2 className="text-2xl font-black">Demo interview</h2>
          <p className="text-gray-700">
            No upload needed. You play a backend-engineer candidate on a sample resume. The real
            interview engine picks each question from your answers, using its demo grader.
          </p>
          <ul className="space-y-1 text-sm text-gray-700">
            <li>✓ Voice conversation with follow-ups and interruptions</li>
            <li>✓ One technical question with a code editor or whiteboard</li>
            <li>✓ Ends with a report built from your answers</li>
          </ul>
          <p className="rounded-xl border-2 border-[#111] bg-white p-3 text-xs text-gray-700">
            Demo grader: the sample answers ("Answer for me") get their recorded grades and any
            other answer counts as 1/3. It shows the flow; it isn't a real assessment.
          </p>
          <fieldset
            className="flex flex-wrap items-center gap-2 text-sm"
            aria-label="Technical question"
          >
            <span className="font-bold">Technical question uses:</span>
            {(["code", "whiteboard"] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={demoWorkspace === w}
                onClick={() => setDemoWorkspace(w)}
                className={`rounded-lg border-2 border-[#111] px-3 py-1 font-bold ${
                  demoWorkspace === w ? "nb-bg-lavender shadow-[3px_3px_0_#111]" : "bg-white"
                }`}
              >
                {w === "code" ? "💻 Code editor" : "🖍️ Whiteboard"}
              </button>
            ))}
          </fieldset>
          <NbButton
            variant="primary"
            size="lg"
            className="mt-auto self-start"
            onClick={() => onUseSample(demoWorkspace)}
          >
            Start the demo
          </NbButton>
        </section>

        {/* Own resume */}
        <section className="nb-card flex flex-col gap-4 p-6">
          <h2 className="text-2xl font-black">Use my resume</h2>
          <FilePicker
            id="resume"
            label="1. Your resume (PDF)"
            hint="Click to choose a file"
            file={resume}
            onPick={(f) => pickPdf(f, setResume)}
          />
          <div className="space-y-2">
            <label htmlFor="jdText" className="block font-bold">
              2. The job description
            </label>
            <textarea
              id="jdText"
              className="nb-input min-h-[120px]"
              placeholder="Paste the job posting here..."
              value={jdText}
              disabled={!!jdFile}
              onChange={(e) => setJdText(e.target.value)}
            />
            <FilePicker
              id="jdFile"
              label="...or upload it as a PDF"
              hint="Optional"
              file={jdFile}
              onPick={(f) => pickPdf(f, setJdFile)}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
            >
              <p className="font-medium">{error.message}</p>
              {error.offerSample && (
                <button
                  type="button"
                  className="nb-link mt-1 font-bold text-[#494cf3]"
                  onClick={() => onUseSample("code")}
                >
                  Try the demo interview instead →
                </button>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-3">
            <NbButton
              variant="secondary"
              size="lg"
              disabled={!!missing || loading}
              onClick={submit}
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? "Reading your files..." : "Build my interview"}
            </NbButton>
            <span className="text-sm text-gray-600">
              {loading ? "About 10–20 seconds." : missing}
            </span>
          </div>
        </section>
      </div>

      <Explainer title="What happens to my files?">
        <p>
          We read your resume and the job description to find the claims that matter for this job,
          for example "optimized slow queries". Each one becomes a topic with a short ladder of
          questions, from an opening question up to "defend your choice".
        </p>
        <p>The demo doesn't send anything you typed or uploaded here.</p>
      </Explainer>
    </div>
  );
}
