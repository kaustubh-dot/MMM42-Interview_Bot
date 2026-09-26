"use client";

// Candidate side of a recruiter-scheduled interview: /invite/<interviewId>?at=<ISO time>.
// It reuses C's interview screens unchanged and the existing pipeline routes. The candidate
// never sees the recruiter report; results go to the recruiter console.

import { PipelineApiError, getSession } from "@/components/pipeline/api-client";
import { ClaimsView } from "@/components/pipeline/claims-view";
import type { ClientInterviewPlan, ClientInterviewReport } from "@/components/pipeline/contract";
import { createLiveDriver } from "@/components/pipeline/interview-driver";
import { InterviewScreen } from "@/components/pipeline/interview-screen";
import { MonitoringDisclosure } from "@/components/pipeline/monitoring-disclosure";
import { DemoBadge, NbButton } from "@/components/pipeline/ui";
import { useInterviewSpeech } from "@/hooks/use-interview-speech";
import { EARLY_JOIN_MIN } from "@/lib/admin/invite";
import { CalendarClock, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const FACE_FLAG_ON = process.env.NEXT_PUBLIC_FACE_SIGNALS === "on";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "done" }
  | { kind: "waiting" }
  | { kind: "topics" }
  | { kind: "ready" }
  | { kind: "interview" };

/** Demo attempts use the sample plan; the server swaps the top claim's workspace for whiteboard IDs. */
function demoPlan(sample: ClientInterviewReport, interviewId: string): ClientInterviewPlan {
  const plan = sample.record.plan;
  const whiteboard = interviewId.startsWith("mock-whiteboard-");
  const top = [...plan.claims].sort((a, b) => a.rank - b.rank)[0];
  return {
    ...plan,
    interviewId,
    claims: plan.claims.map((c) =>
      whiteboard && c.id === top.id
        ? { ...c, ladder: { ...c.ladder, workspace: { kind: "whiteboard" as const, prompt: "" } } }
        : c,
    ),
  };
}

function formatWhen(d: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(d);
}

export function InviteInterview({
  interviewId,
  at,
  sample,
}: {
  interviewId: string;
  at: string | null;
  sample: ClientInterviewReport;
}) {
  const demo = interviewId.startsWith("mock-");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [plan, setPlan] = useState<ClientInterviewPlan | null>(null);
  const [resume, setResume] = useState(false);
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const speechProbe = useInterviewSpeech({ onFinalChunk: () => {} });

  const scheduled = at ? new Date(at) : null;
  const opensAt =
    scheduled && !Number.isNaN(scheduled.getTime())
      ? scheduled.getTime() - EARLY_JOIN_MIN * 60_000
      : null;
  const tooEarly = opensAt !== null && now < opensAt;

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const session = await getSession(interviewId);
      if (session.finished) {
        setPhase({ kind: "done" });
        return;
      }
      setPlan(session.record.plan);
      setResume(session.record.turns.length > 0);
      setPhase({ kind: "topics" });
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      if (apiErr?.status === 404 && !apiErr.serviceUnavailable && demo) {
        // Demo attempts are created on the server when the interview starts.
        setPlan(demoPlan(sample, interviewId));
        setResume(false);
        setPhase({ kind: "topics" });
      } else if (apiErr?.status === 404 && !apiErr.serviceUnavailable) {
        setPhase({
          kind: "error",
          message:
            "We couldn't find this interview. The link may have expired. Please ask the recruiter for a new one.",
          retry: false,
        });
      } else {
        setPhase({
          kind: "error",
          message: apiErr?.message ?? "We couldn't reach the interview server.",
          retry: true,
        });
      }
    }
  }, [interviewId, demo, sample]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick while waiting for the link to open.
  useEffect(() => {
    if (!tooEarly) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [tooEarly]);

  const driver = useMemo(
    () => (plan ? createLiveDriver(plan.interviewId, demo ? sample : undefined) : null),
    [plan, demo, sample],
  );

  return (
    <div className="nb-orbs min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
        {demo && phase.kind !== "done" && <DemoBadge>Practice interview: sample resume</DemoBadge>}

        {phase.kind === "loading" && (
          <div className="nb-card mx-auto flex max-w-md items-center justify-center gap-3 p-8 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" /> Getting your interview ready…
          </div>
        )}

        {phase.kind === "error" && (
          <div role="alert" className="nb-card mx-auto max-w-xl space-y-3 p-6">
            <p className="text-xl font-black">This interview can't open right now.</p>
            <p className="text-gray-700">{phase.message}</p>
            {phase.retry && (
              <NbButton variant="primary" onClick={load}>
                Try again
              </NbButton>
            )}
          </div>
        )}

        {phase.kind === "done" && <ThankYou />}

        {phase.kind === "topics" && plan && (
          <div className="mx-auto max-w-5xl space-y-6">
            <section className="nb-card nb-bg-soft-lavender space-y-2 p-6">
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                You're invited to interview for {plan.roleTitle}
              </h1>
              <p className="text-lg text-gray-800">
                It's a voice conversation of up to {plan.maxQuestions} questions, about 15 minutes.
                {scheduled && opensAt !== null && ` Scheduled for ${formatWhen(scheduled)}.`}
              </p>
              {resume && (
                <p className="font-bold">
                  You already started this interview. You'll continue where you left off.
                </p>
              )}
            </section>
            {tooEarly && opensAt !== null ? (
              <section className="nb-card flex flex-wrap items-center gap-4 p-6">
                <CalendarClock className="h-10 w-10 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xl font-black">
                    Opens at{" "}
                    {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(opensAt)}
                  </p>
                  <p className="text-gray-700">
                    You can join {EARLY_JOIN_MIN} minutes before your time. Keep this page open; the
                    button appears automatically. Meanwhile, here's what we'll talk about.
                  </p>
                </div>
              </section>
            ) : null}
            <ClaimsView plan={plan} />
            <div className="flex flex-wrap gap-3">
              <NbButton
                variant="primary"
                size="lg"
                disabled={tooEarly}
                onClick={() => setPhase({ kind: "ready" })}
              >
                {tooEarly ? "Not open yet" : resume ? "Continue" : "Next: get ready"}
              </NbButton>
            </div>
          </div>
        )}

        {phase.kind === "ready" && (
          <MonitoringDisclosure
            faceSignalsEnabled={FACE_FLAG_ON}
            speechSupported={speechProbe.supported.recognition}
            onBack={() => setPhase({ kind: "topics" })}
            onStart={() => setPhase({ kind: "interview" })}
          />
        )}

        {phase.kind === "interview" && plan && driver && (
          <>
            {/* Keep the screen mounted so the closing line is still spoken. */}
            {finished && <ThankYou />}
            <InterviewScreen
              driver={driver}
              plan={plan}
              faceSignalsEnabled={FACE_FLAG_ON}
              resume={resume}
              onFinished={() => setFinished(true)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ThankYou() {
  return (
    <section className="nb-card nb-bg-soft-lavender mx-auto max-w-2xl space-y-3 p-8 text-center">
      <p className="text-5xl" aria-hidden="true">
        🎉
      </p>
      <h1 className="text-3xl font-black">Thanks, you're all done!</h1>
      <p className="text-lg text-gray-800">
        Your answers were sent to the hiring team. A person reviews every interview before any
        decision is made. You can close this tab.
      </p>
    </section>
  );
}
