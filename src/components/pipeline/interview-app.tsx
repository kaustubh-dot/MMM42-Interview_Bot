"use client";

import { useInterviewSpeech } from "@/hooks/use-interview-speech";
import { useEffect, useMemo, useState } from "react";
import { newRequestId } from "./api-client";
import { ClaimsView } from "./claims-view";
import type { ClientInterviewPlan, ClientInterviewReport, TurnReply } from "./contract";
import { type InterviewDriver, createFixtureDriver, createLiveDriver } from "./interview-driver";
import { InterviewScreen } from "./interview-screen";
import { MonitoringDisclosure } from "./monitoring-disclosure";
import { SetupScreen } from "./setup-screen";
import { ArtifactReview } from "./technical-workspace";
import { DemoBadge, NbButton, NbLinkButton, StepTracker } from "./ui";

type Phase = "setup" | "claims" | "disclosure" | "interview";
/**
 * live:    plan generated from the candidate's resume + JD (A3 /plan).
 * demo:    the real turn API in the server's mock mode (A2 `mock-*` attempts on the sample plan).
 * fixture: offline replay of the recorded sample, used only if the server can't run the demo.
 */
type Mode = "live" | "demo" | "fixture";
const PHASE_STEP: Record<Phase, number> = { setup: 0, claims: 1, disclosure: 2, interview: 3 };
const ACTIVE_KEY = "mmm42:active-attempt";

interface Props {
  /** Browser-safe golden sample (no hidden answers). */
  sample: ClientInterviewReport;
}

interface ActiveAttempt {
  interviewId: string;
  mode: "live" | "demo";
}

const FACE_FLAG_ON = process.env.NEXT_PUBLIC_FACE_SIGNALS === "on";

function readActive(): ActiveAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveAttempt) : null;
  } catch {
    return null;
  }
}

function writeActive(a: ActiveAttempt | null) {
  try {
    if (a) {
      window.sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    } else {
      window.sessionStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // Resume after refresh just won't be offered.
  }
}

/** The sample plan as shown before a whiteboard demo starts (the server swaps the top claim's workspace). */
function demoPlan(
  sample: ClientInterviewReport,
  workspace: "code" | "whiteboard",
  id: string,
): ClientInterviewPlan {
  const plan = sample.record.plan;
  const top = [...plan.claims].sort((a, b) => a.rank - b.rank)[0];
  return {
    ...plan,
    interviewId: id,
    claims:
      workspace === "code"
        ? plan.claims
        : plan.claims.map((c) =>
            c.id === top.id
              ? {
                  ...c,
                  ladder: { ...c.ladder, workspace: { kind: "whiteboard" as const, prompt: "" } },
                }
              : c,
          ),
  };
}

export function InterviewApp({ sample }: Props) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [plan, setPlan] = useState<ClientInterviewPlan | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [resuming, setResuming] = useState(false);
  const [pendingResume, setPendingResume] = useState<ActiveAttempt | null>(null);
  const [finalReply, setFinalReply] = useState<TurnReply | null>(null);
  const [runKey, setRunKey] = useState(0);
  // Only used to tell the candidate about Chrome support before starting.
  const speechProbe = useInterviewSpeech({ onFinalChunk: () => {} });

  useEffect(() => {
    setPendingResume(readActive());
  }, []);

  // runKey gives a fresh driver when the interview is restarted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runKey intentionally resets
  const driver: InterviewDriver | null = useMemo(() => {
    if (!plan) {
      return null;
    }
    if (mode === "fixture") {
      return createFixtureDriver(sample);
    }
    return createLiveDriver(plan.interviewId, mode === "demo" ? sample : undefined);
  }, [plan, mode, sample, runKey]);

  const reportHref =
    mode === "fixture" || !plan
      ? "/report/sample"
      : `/report/${encodeURIComponent(plan.interviewId)}`;
  const step = finalReply ? 4 : PHASE_STEP[phase];

  const restart = () => {
    writeActive(null);
    setRunKey((k) => k + 1);
    setFinalReply(null);
    setResuming(false);
    setPhase("setup");
  };

  return (
    <div className="nb-orbs min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <StepTracker current={step} />
          {mode === "fixture" && phase !== "setup" && (
            <DemoBadge>
              Offline sample replay: questions are pre-recorded, answers not graded
            </DemoBadge>
          )}
        </div>

        {phase === "setup" && pendingResume && (
          <section
            className="nb-card nb-bg-soft-salmon flex flex-wrap items-center gap-3 p-4"
            aria-label="Resume"
          >
            <p className="font-bold">You have an unfinished interview in this tab.</p>
            <NbButton
              variant="primary"
              size="sm"
              onClick={() => {
                setMode(pendingResume.mode);
                setPlan({ ...sample.record.plan, interviewId: pendingResume.interviewId });
                setResuming(true);
                setFinalReply(null);
                setPhase("interview");
              }}
            >
              Resume it
            </NbButton>
            <NbButton
              size="sm"
              onClick={() => {
                writeActive(null);
                setPendingResume(null);
              }}
            >
              Discard
            </NbButton>
          </section>
        )}

        {phase === "setup" && (
          <SetupScreen
            onPlan={(p) => {
              setMode("live");
              setPlan(p);
              setPhase("claims");
            }}
            onUseSample={(workspace) => {
              const id = `${workspace === "whiteboard" ? "mock-whiteboard" : "mock"}-${newRequestId()}`;
              setMode("demo");
              setPlan(demoPlan(sample, workspace, id));
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
            faceSignalsEnabled={FACE_FLAG_ON && mode !== "fixture"}
            speechSupported={speechProbe.supported.recognition}
            onBack={() => setPhase("claims")}
            onStart={() => {
              setFinalReply(null);
              setResuming(false);
              if (plan && mode !== "fixture") {
                writeActive({ interviewId: plan.interviewId, mode });
              }
              setPhase("interview");
            }}
          />
        )}

        {phase === "interview" && plan && driver && (
          <>
            {finalReply && (
              <DonePanel
                reply={finalReply}
                mode={mode}
                reportHref={reportHref}
                onRestart={restart}
              />
            )}
            <InterviewScreen
              key={`${mode}:${plan.interviewId}:${runKey}`}
              driver={driver}
              plan={plan}
              faceSignalsEnabled={FACE_FLAG_ON}
              resume={resuming}
              onFinished={(r) => {
                writeActive(null);
                setFinalReply(r);
              }}
              onFallback={
                mode === "demo"
                  ? () => {
                      writeActive(null);
                      setMode("fixture");
                      setPlan(sample.record.plan);
                      setRunKey((k) => k + 1);
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

function DonePanel({
  reply,
  mode,
  reportHref,
  onRestart,
}: {
  reply: TurnReply;
  mode: Mode;
  reportHref: string;
  onRestart: () => void;
}) {
  const submitted = reply.record.turns.filter((t) => t.artifacts?.length);
  const message =
    mode === "fixture"
      ? "That was the offline replay. The sample report shows how the recorded candidate was scored, with every score linked to their exact words."
      : mode === "demo"
        ? "That was the demo. Your report is built from your own answers, graded by the demo grader, so treat the scores as a walkthrough rather than an assessment."
        : "Your answers are in. The report is ready for the reviewer.";
  return (
    <section className="nb-card nb-bg-soft-lavender space-y-4 p-6">
      <h2 className="text-2xl font-black">🎉 Interview complete!</h2>
      <p className="text-gray-800">{message}</p>
      <div className="flex flex-wrap gap-3">
        <NbLinkButton href={reportHref} variant="primary" size="lg">
          {mode === "fixture" ? "See the sample report" : "Open the report"}
        </NbLinkButton>
        <NbButton size="lg" onClick={onRestart}>
          Start over
        </NbButton>
      </div>
      {submitted.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold">What you submitted (read-only)</h3>
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
