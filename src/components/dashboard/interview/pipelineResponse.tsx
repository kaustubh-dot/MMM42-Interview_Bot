"use client";

import { formatTimestampToDateHHMM } from "@/lib/utils";
import type { ClaimEvaluation, Evaluation, IntegrityReport } from "@/types/pipeline";
import type { Response } from "@/types/response";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

// Rows written by the AI interview pipeline (src/lib/pipeline/supabase-session-store.ts):
// call_id = attempt ID, details.pipeline = session metadata, analytics = { evaluation, audit,
// integrity } once the report exists. Retell rows keep their own rendering.

export function isPipelineResponse(response: Response): boolean {
  return !!response.details?.pipeline || !!response.analytics?.evaluation;
}

const LEVEL_CLASS: Record<IntegrityReport["level"], string> = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-yellow-100 text-yellow-800",
  High: "bg-red-100 text-red-800",
};

function summary(evaluation: Evaluation | undefined, plannedTopics: number) {
  const scores = evaluation?.perClaim ?? [];
  const avg = scores.length ? scores.reduce((sum, c) => sum + c.score, 0) / scores.length : null;
  const needsReview = scores.filter((c) => c.needsHumanReview).length;
  const strength = (s: ClaimEvaluation["evidenceStrength"]) =>
    scores.filter((c) => c.evidenceStrength === s).length;
  return { avg, scored: scores.length, plannedTopics, needsReview, strength };
}

/** One pipeline attempt in the dashboard list. Opens the cited report; never shows raw rows. */
export function PipelineResponseItem({
  response,
  onOpen,
}: {
  response: Response;
  onOpen: (response: Response) => void;
}) {
  const evaluation: Evaluation | undefined = response.analytics?.evaluation;
  const integrity: IntegrityReport | undefined = response.analytics?.integrity;
  const s = summary(evaluation, response.details?.plan?.claims?.length ?? 0);

  return (
    <a
      href={`/report/${encodeURIComponent(response.call_id)}`}
      target="_blank"
      rel="noreferrer"
      onClick={() => onOpen(response)}
      className="p-2 rounded-md hover:bg-indigo-100 border-2 border-indigo-100 my-1 text-left text-xs flex flex-col gap-1 w-full"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          {response.name ? `${response.name}'s AI interview` : "AI interview (anonymous)"}
        </p>
        {!response.is_viewed && <span className="text-indigo-500 text-xl leading-none">●</span>}
      </div>
      <p>{formatTimestampToDateHHMM(String(response.created_at))}</p>
      {evaluation ? (
        <p className="text-slate-700">
          Avg {s.avg === null ? "–" : s.avg.toFixed(1)}/3 · {s.scored}/{s.plannedTopics} topics
          cited
          {s.needsReview > 0 && ` · ${s.needsReview} needs review`}
          <span className="block text-slate-500">
            Evidence: {s.strength("strong")} strong, {s.strength("mixed")} mixed,{" "}
            {s.strength("thin")} thin
          </span>
        </p>
      ) : (
        <p className="text-slate-500">Report not generated yet. Opening it generates it.</p>
      )}
      <div className="flex items-center justify-between gap-2">
        {integrity ? (
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${LEVEL_CLASS[integrity.level]}`}
            title="A concern level to prompt human review, not a cheating determination. It never changes any score."
          >
            Integrity: {integrity.level}
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1 text-indigo-600 font-semibold">
          Cited report <ExternalLink size={12} />
        </span>
      </div>
    </a>
  );
}

/** Copies the role's AI interview link (/interview?role=<id>) so attempts land in this list. */
export function PipelineLinkButton({ interviewId }: { interviewId: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-xs text-indigo-600 hover:scale-105"
      title="Copy the AI interview link for this role"
      onClick={async () => {
        const url = `${window.location.origin}/interview?role=${encodeURIComponent(interviewId)}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("AI interview link copied", { description: url });
        } catch {
          toast.error("Couldn't copy", { description: url });
        }
      }}
    >
      <Link2 size={16} /> AI interview link
    </button>
  );
}
