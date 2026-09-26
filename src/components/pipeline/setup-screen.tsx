"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { PipelineApiError, createPlan } from "./api-client";
import type { ClientInterviewPlan } from "./contract";

interface Props {
  onPlan: (plan: ClientInterviewPlan) => void;
  onUseSample: () => void;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function SetupScreen({ onPlan, onUseSample }: Props) {
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
      setError({ message: `${file.name} is not a PDF.`, offerSample: false });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError({ message: `${file.name} is larger than 10 MB.`, offerSample: false });
      return;
    }
    set(file);
  };

  const canSubmit = !!resume && (!!jdFile || jdText.trim().length > 0) && !loading;

  const submit = async () => {
    if (!resume) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plan = await createPlan({
        resume,
        ...(jdFile ? { jd: jdFile } : { jdText: jdText.trim() }),
      });
      onPlan(plan);
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      setError({
        message: apiErr?.message ?? "Plan generation failed.",
        offerSample: apiErr ? apiErr.serviceUnavailable || apiErr.status >= 500 : true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Set up the interview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload the resume and job description. We rank the resume claims the job depends on and
          prepare a question ladder for each one.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border bg-white p-5">
        <div>
          <label htmlFor="resume" className="block text-sm font-medium">
            Resume (PDF)
          </label>
          <input
            id="resume"
            type="file"
            accept="application/pdf,.pdf"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700"
            onChange={(e) => pickPdf(e.target.files?.[0], setResume)}
          />
        </div>

        <div>
          <label htmlFor="jdText" className="block text-sm font-medium">
            Job description
          </label>
          <Textarea
            id="jdText"
            className="mt-1 min-h-[140px]"
            placeholder="Paste the job description here, or upload a PDF below."
            value={jdText}
            disabled={!!jdFile}
            onChange={(e) => setJdText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3 text-sm">
            <label htmlFor="jdFile" className="text-gray-600">
              or JD PDF:
            </label>
            <input
              id="jdFile"
              type="file"
              accept="application/pdf,.pdf"
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1"
              onChange={(e) => pickPdf(e.target.files?.[0], setJdFile)}
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <p className="text-red-800">{error.message}</p>
            {error.offerSample && (
              <p className="mt-1 text-red-700">
                You can continue with the labeled sample interview instead.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Reading resume and JD..." : "Generate ranked claims"}
          </Button>
          {loading && (
            <span className="text-xs text-gray-500">This usually takes 10–20 seconds.</span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-5">
        <h2 className="text-sm font-semibold text-indigo-900">Sample interview (fixture)</h2>
        <p className="mt-1 text-sm text-indigo-900/80">
          Uses a prepared backend-engineer resume and job description. Nothing you entered above is
          sent. Questions and decisions replay the recorded sample; answers are not graded.
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={onUseSample}>
          Use sample interview
        </Button>
      </section>
    </div>
  );
}
