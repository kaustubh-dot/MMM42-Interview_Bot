"use client";

import { Button } from "@/components/ui/button";
import { useInterviewSpeech } from "@/hooks/use-interview-speech";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ClaimsView } from "./claims-view";
import type {
  ClientInterviewPlan,
  ClientInterviewReport,
  FaceSignalAvailability,
  TurnReply,
} from "./contract";
import { type InterviewDriver, createFixtureDriver, createLiveDriver } from "./interview-driver";
import { InterviewScreen } from "./interview-screen";
import { MonitoringDisclosure } from "./monitoring-disclosure";
import { SetupScreen } from "./setup-screen";
import { ArtifactReview } from "./technical-workspace";

type Phase = "setup" | "claims" | "disclosure" | "interview";

interface Props {
  /** Sanitized golden sample (no hidden answers), prepared on the server. */
  sample: ClientInterviewReport;
}

const FACE_FLAG_ON = process.env.NEXT_PUBLIC_FACE_SIGNALS === "on";

// TODO(C + D): replace with D's use-face-signals hook result when it lands. Until then the
// signals are reported as unavailable, which contributes zero points.
const FACE_SIGNALS: FaceSignalAvailability = {
  available: false,
  reason: FACE_FLAG_ON ? "face capture not connected yet" : "turned off for this interview",
};

export function FixtureBadge() {
  return (
    <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
      Sample fixture: replayed, not graded live
    </span>
  );
}

export function InterviewApp({ sample }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [plan, setPlan] = useState<ClientInterviewPlan | null>(null);
  const [mode, setMode] = useState<"live" | "fixture">("live");
  const [finalReply, setFinalReply] = useState<TurnReply | null>(null);
  const [runKey, setRunKey] = useState(0);
  // Only used to tell the candidate about Chrome support before starting.
  const speechProbe = useInterviewSpeech({ onFinalChunk: () => {} });

  // runKey gives a fresh replay driver when the sample is restarted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runKey intentionally resets
  const driver: InterviewDriver | null = useMemo(() => {
    if (!plan) {
      return null;
    }
    return mode === "fixture" ? createFixtureDriver(sample) : createLiveDriver(plan.interviewId);
  }, [plan, mode, sample, runKey]);

  const reportHref = plan ? `/report/${encodeURIComponent(plan.interviewId)}` : "/report/sample";

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-gray-800">MMM42 Interview</span>
        {mode === "fixture" && phase !== "setup" && <FixtureBadge />}
        {mode === "live" && phase === "interview" && (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            Live
          </span>
        )}
        <Link href="/report/sample" className="ml-auto text-xs text-indigo-700 hover:underline">
          Open sample report (fixture)
        </Link>
      </div>

      {phase === "setup" && (
        <SetupScreen
          onPlan={(p) => {
            setMode("live");
            setPlan(p);
            setPhase("claims");
          }}
          onUseSample={() => {
            setMode("fixture");
            setPlan(sample.record.plan);
            setPhase("claims");
          }}
        />
      )}

      {phase === "claims" && plan && (
        <div className="mx-auto max-w-4xl space-y-4">
          <ClaimsView plan={plan} />
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setPhase("setup")}>
              Back
            </Button>
            <Button type="button" onClick={() => setPhase("disclosure")}>
              Continue to interview
            </Button>
          </div>
        </div>
      )}

      {phase === "disclosure" && (
        <MonitoringDisclosure
          faceSignalsEnabled={FACE_SIGNALS.available}
          speechSupported={speechProbe.supported.recognition}
          onBack={() => setPhase("claims")}
          onStart={() => {
            setFinalReply(null);
            setPhase("interview");
          }}
        />
      )}

      {phase === "interview" && plan && driver && (
        <>
          {finalReply && (
            <DonePanel
              reply={finalReply}
              fixture={mode === "fixture"}
              reportHref={mode === "fixture" ? "/report/sample" : reportHref}
              onRestart={() => {
                setRunKey((k) => k + 1);
                setFinalReply(null);
                setPhase("setup");
              }}
            />
          )}
          <InterviewScreen
            key={`${mode}:${plan.interviewId}:${runKey}`}
            driver={driver}
            plan={plan}
            faceSignals={FACE_SIGNALS}
            onFinished={setFinalReply}
          />
        </>
      )}
    </div>
  );
}

function DonePanel({
  reply,
  fixture,
  reportHref,
  onRestart,
}: {
  reply: TurnReply;
  fixture: boolean;
  reportHref: string;
  onRestart: () => void;
}) {
  const submitted = reply.record.turns.filter((t) => t.artifacts?.length);
  return (
    <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="font-semibold text-emerald-900">Interview complete</h2>
      <p className="text-sm text-emerald-900/80">
        {fixture
          ? "This was the sample replay. The sample report shows the recorded candidate's evaluation, not the answers you just gave."
          : "Your answers have been submitted. The report is generated for the recruiter."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild type="button">
          <Link href={reportHref}>{fixture ? "Open sample report" : "Open recruiter report"}</Link>
        </Button>
        <Button type="button" variant="outline" onClick={onRestart}>
          Start over
        </Button>
      </div>
      {fixture && submitted.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-emerald-900">
            What you submitted in this replay (kept on this page only, read-only)
          </h3>
          {submitted.map((t) => (
            <div key={t.id} className="rounded-md border bg-white p-2">
              <p className="mb-2 text-xs text-gray-600">
                {t.id}: supporting artifact for human review. Not scored.
              </p>
              {t.artifacts?.map((a) => (
                <ArtifactReview key={`${t.id}-${a.kind}`} artifact={a} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
