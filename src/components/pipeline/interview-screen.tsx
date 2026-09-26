"use client";

import { TabSwitchWarning } from "@/components/call/tabSwitchPrevention";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBrowserIntegrity } from "@/hooks/use-browser-integrity";
import { useInterviewSpeech } from "@/hooks/use-interview-speech";
import type { Turn } from "@/types/pipeline";
import { Loader2, Mic, MicOff, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PipelineApiError, newRequestId } from "./api-client";
import {
  type AnswerArtifact,
  type ClientInterviewPlan,
  type ClientTurn,
  type FaceSignalAvailability,
  MAX_CODE_BYTES,
  MAX_SCENE_BYTES,
  type SubmitTurnRequest,
  type TurnReply,
  workspaceForQuestion,
} from "./contract";
import { DecisionLog } from "./decision-log";
import { clearDraft, loadDraft, saveDraft } from "./draft-store";
import type { InterviewDriver } from "./interview-driver";
import { RUNG_LABELS } from "./labels";
import { TechnicalWorkspace, type TechnicalWorkspaceRef } from "./technical-workspace";

interface Props {
  driver: InterviewDriver;
  plan: ClientInterviewPlan;
  faceSignals: FaceSignalAvailability;
  onFinished: (reply: TurnReply) => void;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; stale: boolean; sendFailed: boolean };

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

function artifactTooLarge(artifact: AnswerArtifact | null): string | null {
  if (!artifact) {
    return null;
  }
  if (artifact.kind === "code" && utf8Bytes(artifact.code) > MAX_CODE_BYTES) {
    return "The code is larger than 100 KB. Shorten it before submitting; your draft is kept.";
  }
  if (artifact.kind === "whiteboard" && utf8Bytes(artifact.sceneJson) > MAX_SCENE_BYTES) {
    return "The drawing is larger than 500 KB. Remove some elements before submitting; your draft is kept.";
  }
  return null;
}

export function InterviewScreen({ driver, plan, faceSignals, onFinished }: Props) {
  const attemptId = driver.interviewId;
  const [reply, setReply] = useState<TurnReply | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedAtPerf, setStartedAtPerf] = useState<number | null>(null);
  const [transcript, setTranscript] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [micWanted, setMicWanted] = useState(true);

  const workspaceRef = useRef<TechnicalWorkspaceRef>(null);
  const latestArtifactRef = useRef<AnswerArtifact | null>(null);
  const transcriptRef = useRef("");
  transcriptRef.current = transcript;
  // One request ID per question until the server accepts it, so a retry is deduplicated.
  const requestIdRef = useRef<string>(newRequestId());
  const spokenRef = useRef<string | null>(null);

  const question: Turn | null = reply?.nextQuestion ?? null;
  const workspace = question ? workspaceForQuestion(plan, question) : null;
  const finished = reply?.finished ?? false;
  // Read synchronously per question so the workspace mounts with this question's draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by question ID only
  const questionDraft = useMemo(
    () => (question && !finished ? loadDraft(attemptId, question.id) : null),
    [question?.id, finished, attemptId],
  );

  const integrity = useBrowserIntegrity({
    active: startedAtPerf !== null && !finished,
    startedAtPerf,
    currentTurnId: question?.id,
  });

  const speech = useInterviewSpeech({
    onFinalChunk: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
  });

  // ── Start ────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setStartError(null);
    try {
      const first = await driver.start();
      setStartedAtPerf(performance.now());
      setReply(first);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start the interview.");
    }
  }, [driver]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: start once on mount
  useEffect(() => {
    start();
  }, []);

  // ── Draft persistence ────────────────────────────────────────────
  const persistDraft = useCallback(
    (nextTranscript: string, artifact: AnswerArtifact | null) => {
      if (!question || finished) {
        return;
      }
      const res = saveDraft(attemptId, question.id, { transcript: nextTranscript, artifact });
      setStorageWarning(
        res.ok ? null : `${res.reason} Your answer is kept on this page but not saved as a draft.`,
      );
    },
    [attemptId, question, finished],
  );

  // New question: restore this question's draft (drafts never leak across questions), speak it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per question ID
  useEffect(() => {
    if (!question || finished) {
      return;
    }
    const draft = questionDraft;
    setTranscript(draft?.transcript ?? "");
    latestArtifactRef.current = draft?.artifact ?? null;
    setDraftNotice(draft ? "Restored your unsent draft for this question." : null);
    setSubmitState({ kind: "idle" });
    speech.resetAnswerTiming();
    if (spokenRef.current !== question.id) {
      spokenRef.current = question.id;
      speech.speak(question.text).then(() => {
        if (micWanted && speech.supported.recognition) {
          speech.startListening();
        }
      });
    }
  }, [question?.id]);

  // Final question reached: stop the microphone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to finish only
  useEffect(() => {
    if (finished && reply) {
      speech.stopListening();
      if (question) {
        speech.speak(question.text);
      }
      onFinished(reply);
    }
  }, [finished]);

  // Debounced transcript draft save.
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce on transcript only
  useEffect(() => {
    const t = setTimeout(() => persistDraft(transcript, latestArtifactRef.current), 400);
    return () => clearTimeout(t);
  }, [transcript]);

  // ── Submit ───────────────────────────────────────────────────────
  const submit = async () => {
    if (!question || !startedAtPerf || submitState.kind === "submitting") {
      return;
    }
    // Capture the editor/canvas state now; never wait for the debounced autosave.
    const artifact = workspace
      ? (workspaceRef.current?.capture() ?? latestArtifactRef.current)
      : null;
    latestArtifactRef.current = artifact;
    const text = transcriptRef.current.trim();
    persistDraft(transcriptRef.current, artifact);

    const tooLarge = artifactTooLarge(artifact);
    if (tooLarge) {
      setSubmitState({ kind: "error", message: tooLarge, stale: false, sendFailed: false });
      return;
    }
    if (!text) {
      setSubmitState({
        kind: "error",
        message:
          "Say or type your answer before submitting. Only the spoken explanation is scored.",
        stale: false,
        sendFailed: false,
      });
      return;
    }

    speech.stopListening();
    setSubmitState({ kind: "submitting" });
    const endMs = Math.round(performance.now() - startedAtPerf);
    const startMs =
      speech.firstSpeechAtPerf !== null
        ? Math.min(endMs, Math.round(speech.firstSpeechAtPerf - startedAtPerf))
        : endMs;
    const pending = integrity.pendingEvents();
    const req: SubmitTurnRequest = {
      interviewId: attemptId,
      requestId: requestIdRef.current,
      expectedTurnId: question.id,
      text,
      startMs,
      endMs,
      ...(artifact ? { artifacts: [artifact] } : {}),
      integrityEvents: pending,
      faceSignals,
    };
    try {
      const next = await driver.submit(req);
      integrity.acknowledge(pending.length);
      clearDraft(attemptId, question.id);
      requestIdRef.current = newRequestId();
      setReply(next);
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      const stale = apiErr?.status === 409;
      setSubmitState({
        kind: "error",
        stale,
        sendFailed: true,
        message: stale
          ? "The interview has moved on from this question (it may have been answered in another tab). Reload to continue from the last saved answer; your draft is kept."
          : `${apiErr?.message ?? (err instanceof Error ? err.message : "Submit failed.")} Your answer and ${workspace ? "workspace are" : "draft is"} kept. Retry when ready.`,
      });
      if (micWanted) {
        speech.startListening();
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  if (startError) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-5 text-sm"
      >
        <p className="font-medium text-red-800">Could not start the interview.</p>
        <p className="mt-1 text-red-700">{startError}</p>
        <Button type="button" className="mt-3" onClick={start}>
          Retry
        </Button>
      </div>
    );
  }
  if (!reply || !question) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparing the first question...
      </div>
    );
  }

  const claim = plan.claims.find((c) => c.id === question.claimId);
  const questionNumber = reply.record.turns.filter((t) => t.speaker === "ai").length;
  const submitting = submitState.kind === "submitting";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <TabSwitchWarning open={integrity.showTabNotice} onUnderstand={integrity.dismissTabNotice} />

      <div className="min-w-0 space-y-4">
        <section className="rounded-lg border bg-white p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="font-medium">
              Question {questionNumber} of up to {plan.maxQuestions}
            </span>
            {claim && <span className="rounded bg-gray-100 px-2 py-0.5">{claim.skillArea}</span>}
            <span className="rounded bg-gray-100 px-2 py-0.5">{RUNG_LABELS[question.rung]}</span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-indigo-700 hover:underline"
              onClick={() => speech.speak(question.text)}
              disabled={!speech.supported.synthesis}
            >
              <Volume2 className="h-3.5 w-3.5" /> Replay question
            </button>
          </div>
          <p className="mt-2 text-lg leading-snug">{question.text}</p>
        </section>

        {workspace && !finished && (
          <TechnicalWorkspace
            key={`${attemptId}:${question.id}`}
            ref={workspaceRef}
            mode={workspace}
            initialArtifact={questionDraft?.artifact ?? null}
            disabled={submitting}
            onArtifactChange={(a) => {
              latestArtifactRef.current = a;
              persistDraft(transcriptRef.current, a);
            }}
          />
        )}

        {!finished && (
          <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="Your answer">
            <div className="flex flex-wrap items-center gap-2">
              {speech.supported.recognition ? (
                speech.status === "listening" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMicWanted(false);
                      speech.stopListening();
                    }}
                  >
                    <MicOff className="mr-1 h-4 w-4" /> Stop microphone
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={speech.status === "speaking" || submitting}
                    onClick={() => {
                      setMicWanted(true);
                      speech.startListening();
                    }}
                  >
                    <Mic className="mr-1 h-4 w-4" />{" "}
                    {speech.error ? "Retry microphone" : "Start microphone"}
                  </Button>
                )
              ) : (
                <span className="text-xs text-amber-800">
                  Voice input needs Chrome. Type your answer below.
                </span>
              )}
              <span className="text-xs text-gray-500" aria-live="polite">
                {speech.status === "speaking" && "Reading the question (microphone paused)..."}
                {speech.status === "listening" && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Listening
                  </span>
                )}
              </span>
              {driver.sampleAnswerFor && (
                <button
                  type="button"
                  className="ml-auto text-xs text-indigo-700 hover:underline"
                  onClick={() => {
                    const sample = driver.sampleAnswerFor?.(question.id);
                    if (sample) {
                      speech.markFirstSpeech();
                      setTranscript(sample);
                    }
                  }}
                >
                  Fill with the sample answer
                </button>
              )}
            </div>

            {speech.error && (
              <p
                role="alert"
                className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
              >
                {speech.error.message}
              </p>
            )}
            {draftNotice && <p className="text-xs text-gray-600">{draftNotice}</p>}
            {storageWarning && (
              <p role="alert" className="text-xs text-amber-800">
                {storageWarning}
              </p>
            )}

            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <Textarea
              id="answer"
              className="min-h-[120px]"
              placeholder="Your spoken answer appears here. You can correct it or type."
              value={transcript}
              disabled={submitting}
              onChange={(e) => {
                speech.markFirstSpeech();
                setTranscript(e.target.value);
              }}
            />
            {speech.interim && <p className="text-sm italic text-gray-500">{speech.interim}</p>}

            {submitState.kind === "error" && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
              >
                {submitState.message}
                {submitState.stale && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => window.location.reload()}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reload
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting
                  ? "Submitting..."
                  : submitState.kind === "error" && submitState.sendFailed
                    ? "Retry submit"
                    : "Submit answer"}
              </Button>
              <span className="text-xs text-gray-500">
                {workspace
                  ? "Submits your answer and the current workspace."
                  : "Submits your answer."}
              </span>
            </div>
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:h-[calc(100vh-140px)]">
        <div className="min-h-[240px] flex-1">
          <DecisionLog decisions={reply.record.decisions} plan={plan} />
        </div>
        <MonitoringStatus
          tabBlurs={integrity.tabBlurCount}
          pastes={integrity.pasteCount}
          faceSignals={faceSignals}
        />
        <TranscriptHistory turns={reply.record.turns} currentId={question.id} />
      </aside>
    </div>
  );
}

function MonitoringStatus({
  tabBlurs,
  pastes,
  faceSignals,
}: {
  tabBlurs: number;
  pastes: number;
  faceSignals: FaceSignalAvailability;
}) {
  return (
    <section
      className="rounded-lg border bg-white p-3 text-xs text-gray-700"
      aria-label="Monitoring"
    >
      <h2 className="mb-1 font-semibold">Monitoring (for human review only)</h2>
      <p>
        Tab switches: {tabBlurs} · Pastes: {pastes} · Face signals:{" "}
        {faceSignals.available
          ? "on"
          : `unavailable${faceSignals.reason ? ` (${faceSignals.reason})` : ""}`}
      </p>
    </section>
  );
}

function TranscriptHistory({ turns, currentId }: { turns: ClientTurn[]; currentId: string }) {
  const past = turns.filter((t) => t.id !== currentId);
  return (
    <details className="rounded-lg border bg-white p-3 text-xs">
      <summary className="cursor-pointer font-semibold">
        Transcript so far ({past.length} turns)
      </summary>
      <ol className="mt-2 max-h-60 space-y-2 overflow-y-auto">
        {past.map((t) => (
          <li key={t.id}>
            <span className="font-mono text-gray-500">{t.id}</span>{" "}
            <span className="font-medium">{t.speaker === "ai" ? "Interviewer" : "You"}:</span>{" "}
            {t.text}
            {t.artifacts?.length ? (
              <span className="ml-1 rounded bg-sky-50 px-1 text-sky-800">
                + {t.artifacts[0].kind === "code" ? "code" : "drawing"} submitted
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
