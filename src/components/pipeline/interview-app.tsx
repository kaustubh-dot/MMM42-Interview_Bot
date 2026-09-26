"use client";

import { useInterviewSpeech } from "@/hooks/use-interview-speech";
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
import { DemoBadge, NbButton, NbLinkButton, StepTracker } from "./ui";

type Phase = "setup" | "claims" | "disclosure" | "interview";
const PHASE_STEP: Record<Phase, number> = { setup: 0, claims: 1, disclosure: 2, interview: 3 };

interface Props {
  /** Browser-safe golden sample (no hidden answers). */
  sample: ClientInterviewReport;
}

const FACE_FLAG_ON = process.env.NEXT_PUBLIC_FACE_SIGNALS === "on";

// TODO(C + D): replace with D's use-face-signals hook result when it lands. Until then the
// signals are reported as unavailable, which contributes zero points.
const FACE_SIGNALS: FaceSignalAvailability = {
  available: false,
  reason: FACE_FLAG_ON ? "camera capture not connected yet" : "off for this interview",
};

export function InterviewApp({ sample }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [plan, setPlan] = useState<ClientInterviewPlan | null>(null);
  const [mode, setMode] = useState<"live" | "fixture">("live");
  const [finalReply, setFinalReply] = useState<TurnReply | null>(null);
  const [runKey, setRunKey] = useState(0);
  // Only used to tell the candidate about Chrome support before starting.
  const speechProbe = useInterviewSpeech({ onFinalChunk: () => {} });

  // runKey gives a fresh replay driver when the demo is restarted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runKey intentionally resets
  const driver: InterviewDriver | null = useMemo(() => {
    if (!plan) {
      return null;
    }
    return mode === "fixture" ? createFixtureDriver(sample) : createLiveDriver(plan.interviewId);
  }, [plan, mode, sample, runKey]);

  const reportHref =
    mode === "fixture" || !plan
      ? "/report/sample"
      : `/report/${encodeURIComponent(plan.interviewId)}`;
  const step = finalReply ? 4 : PHASE_STEP[phase];

  return (
    <div className="nb-orbs min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StepTracker current={step} />
          {mode === "fixture" && phase !== "setup" && <DemoBadge />}
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
          <div className="mx-auto max-w-5xl space-y-6">
            <ClaimsView plan={plan} />
            <div className="flex flex-wrap gap-3">
              <NbButton onClick={() => setPhase("setup")}>Back</NbButton>
              <NbButton variant="primary" size="lg" onClick={() => setPhase("disclosure")}>
                Looks good, next
              </NbButton>
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
                reportHref={reportHref}
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
    <section className="nb-card nb-bg-soft-lavender space-y-4 p-6">
      <h2 className="text-2xl font-black">🎉 Interview complete!</h2>
      <p className="text-gray-800">
        {fixture
          ? "That was the demo. The sample report shows how the recorded candidate was scored, with every score linked to their exact words."
          : "Your answers are in. The report is ready for the reviewer."}
      </p>
      <div className="flex flex-wrap gap-3">
        <NbLinkButton href={reportHref} variant="primary" size="lg">
          {fixture ? "See the sample report" : "Open the report"}
        </NbLinkButton>
        <NbButton size="lg" onClick={onRestart}>
          Start over
        </NbButton>
      </div>
      {fixture && submitted.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold">
            What you submitted in this demo (only on this page, read-only)
          </h3>
          {submitted.map((t) => (
            <div key={t.id} className="nb-card flat space-y-2 bg-white p-3">
              <p className="text-sm text-gray-600">Saved for a person to review. Not scored.</p>
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
