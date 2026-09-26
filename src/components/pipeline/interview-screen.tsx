"use client";

import { TabSwitchWarning } from "@/components/call/tabSwitchPrevention";
import { useBrowserIntegrity } from "@/hooks/use-browser-integrity";
import { useFaceSignals } from "@/hooks/use-face-signals";
import { useInterviewSpeech } from "@/hooks/use-interview-speech";
import type { Turn } from "@/types/pipeline";
import { Keyboard, Loader2, Mic, MicOff, RotateCcw, SkipForward, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PipelineApiError, newRequestId, pipelineMode } from "./api-client";
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
import { clearDraft, loadDraft, saveDraft } from "./draft-store";
import type { InterviewDriver } from "./interview-driver";
import { FRIENDLY_REASONS, FRIENDLY_RUNGS } from "./labels";
import { TechnicalWorkspace, type TechnicalWorkspaceRef } from "./technical-workspace";
import { NbButton } from "./ui";

interface Props {
  driver: InterviewDriver;
  plan: ClientInterviewPlan;
  faceSignalsEnabled: boolean;
  onFinished: (reply: TurnReply) => void;
  /** Continue an attempt that already started (after a page refresh). */
  resume?: boolean;
  /** Offered when the server can't start the interview (e.g. demo needs LLM_MODE=mock). */
  onFallback?: () => void;
}

/** Plain-language label for how the server is running (from A's response headers). */
function ModeLabel() {
  const { engine, storage } = pipelineMode();
  if (!engine && !storage) {
    return null;
  }
  const engineText =
    engine === "mock"
      ? "Demo engine (mock grader)"
      : engine === "gemini" || engine === "groq"
        ? "Live AI engine"
        : engine;
  const storageText =
    storage === "mock-memory"
      ? "answers kept in server memory only, not saved permanently"
      : storage
        ? `storage: ${storage}`
        : "";
  return (
    <span className="nb-pill bg-[#fff3c4]" title="Reported by the interview server">
      {engineText}
      {storageText ? ` · ${storageText}` : ""}
    </span>
  );
}

/** performance.now() value matching the server's startedAt, so timings survive a refresh. */
function perfOrigin(startedAtIso: string): number {
  const elapsed = Date.now() - Date.parse(startedAtIso);
  // Guard against clock skew: fall back to "now" if the offset is implausible.
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 6 * 3600_000
    ? performance.now() - elapsed
    : performance.now();
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; stale: boolean; sendFailed: boolean };

// ── Live-conversation timing ──────────────────────────────────────────
// A pause this long after you have spoken is treated as the end of your answer.
const SILENCE_SEND_MS = 3000;
// The "sounds like you're done" countdown appears after this much silence.
const SILENCE_WARN_MS = 1200;
// The interviewer politely cuts in once a spoken answer runs this long (from your first word)...
const ANSWER_LIMIT_MS = 75_000;
// ...or this many words.
const ANSWER_WORD_LIMIT = 220;
// Code/whiteboard questions: silence is normal while working, so no auto-send, longer limit.
const WORKSPACE_LIMIT_MS = 240_000;
const WRAP_UP_WARNING_MS = 15_000;
// If you haven't said anything this long after the question, the interviewer checks in once.
const NUDGE_AFTER_MS = 12_000;

const INTERJECTIONS = [
  "Thanks, let me stop you there. That's helpful.",
  "Great, I've got enough on that one. Let's keep moving.",
  "Let me jump in there so we have time for the rest.",
];
const NUDGE_LINE =
  "Take your time. Start whenever you're ready, or press Repeat if you'd like to hear the question again.";

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function artifactTooLarge(artifact: AnswerArtifact | null): string | null {
  if (!artifact) {
    return null;
  }
  if (artifact.kind === "code" && utf8Bytes(artifact.code) > MAX_CODE_BYTES) {
    return "Your code is larger than 100 KB. Shorten it and send again; nothing is lost.";
  }
  if (artifact.kind === "whiteboard" && utf8Bytes(artifact.sceneJson) > MAX_SCENE_BYTES) {
    return "Your drawing is larger than 500 KB. Remove a few shapes and send again; nothing is lost.";
  }
  return null;
}

export function InterviewScreen({
  driver,
  plan: initialPlan,
  faceSignalsEnabled,
  onFinished,
  resume,
  onFallback,
}: Props) {
  const attemptId = driver.interviewId;
  const [reply, setReply] = useState<TurnReply | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedAtPerf, setStartedAtPerf] = useState<number | null>(null);
  const [transcript, setTranscript] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");
  const [interjection, setInterjection] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const workspaceRef = useRef<TechnicalWorkspaceRef>(null);
  const latestArtifactRef = useRef<AnswerArtifact | null>(null);
  const transcriptRef = useRef("");
  transcriptRef.current = transcript;
  // One request ID per question until the server accepts it, so a retry is deduplicated.
  const requestIdRef = useRef<string>(newRequestId());
  const spokenRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const interruptingRef = useRef(false);
  const listenStartRef = useRef<number | null>(null);
  const nudgedRef = useRef(false);

  // The server's record is the source of truth once the interview has started.
  const plan = reply?.record.plan ?? initialPlan;
  // On completion the live API returns nextQuestion: null; show the saved closing turn instead.
  const question: Turn | null =
    reply?.nextQuestion ??
    (reply?.finished
      ? ([...reply.record.turns].reverse().find((t) => t.speaker === "ai") ?? null)
      : null);
  const workspace = question && !reply?.finished ? workspaceForQuestion(plan, question) : null;
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

  const face = useFaceSignals({
    enabled: faceSignalsEnabled && driver.mode !== "fixture",
    active: startedAtPerf !== null && question !== null && !finished,
    startedAtPerf,
    currentTurnId: question?.id,
    onEvent: integrity.pushEvent,
    pendingEventCount: () => integrity.pendingEvents().length,
  });

  const speech = useInterviewSpeech({
    onFinalChunk: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
  });
  const mode: "voice" | "type" = speech.supported.recognition ? inputMode : "type";
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const interimRef = useRef("");
  interimRef.current = speech.interim;

  /** What the candidate has said so far, including words still being recognized. */
  const currentAnswer = () =>
    [transcriptRef.current.trim(), interimRef.current.trim()].filter(Boolean).join(" ");

  // ── Start ────────────────────────────────────────────────────────
  const startedRef = useRef(false);
  const start = useCallback(async () => {
    setStartError(null);
    try {
      let first: TurnReply;
      if (resume && driver.recover) {
        first = await driver.recover();
      } else {
        try {
          first = await driver.start();
        } catch (err) {
          // Already started (double click, React dev double effect, another tab): continue it.
          if (err instanceof PipelineApiError && err.status === 409 && driver.recover) {
            first = await driver.recover();
          } else {
            throw err;
          }
        }
      }
      setStartedAtPerf(perfOrigin(first.record.startedAt));
      setReply(first);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start the interview.");
    }
  }, [driver, resume]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: start once on mount
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      start();
    }
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

  const beginListening = useCallback(() => {
    listenStartRef.current = performance.now();
    if (modeRef.current === "voice") {
      speech.startListening();
    }
  }, [speech.startListening]);

  // New question: restore this question's draft, read it aloud, then listen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per question ID
  useEffect(() => {
    if (!question || finished) {
      return;
    }
    const draft = questionDraft;
    setTranscript(draft?.transcript ?? "");
    latestArtifactRef.current = draft?.artifact ?? null;
    setDraftNotice(draft ? "We restored what you had said before the page reloaded." : null);
    setSubmitState({ kind: "idle" });
    setInterjection(null);
    nudgedRef.current = false;
    listenStartRef.current = null;
    speech.resetAnswerTiming();
    if (spokenRef.current !== question.id) {
      spokenRef.current = question.id;
      speech.speak(question.text).then(beginListening);
    }
  }, [question?.id]);

  // Last question reached: stop the microphone and say goodbye.
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
    // Never advance while the question is still being read aloud.
    if (!question || !startedAtPerf || submittingRef.current || speech.status === "speaking") {
      return;
    }
    // Capture the editor/canvas state now; never wait for the debounced autosave.
    const artifact = workspace
      ? (workspaceRef.current?.capture() ?? latestArtifactRef.current)
      : null;
    latestArtifactRef.current = artifact;
    const text = currentAnswer();
    persistDraft(text, artifact);

    const tooLarge = artifactTooLarge(artifact);
    if (tooLarge) {
      setSubmitState({ kind: "error", message: tooLarge, stale: false, sendFailed: false });
      return;
    }
    if (!text) {
      setSubmitState({
        kind: "error",
        message: "We didn't catch an answer yet. Say something (or type it), then send.",
        stale: false,
        sendFailed: false,
      });
      return;
    }

    submittingRef.current = true;
    speech.stopListening();
    setTranscript(text);
    setSubmitState({ kind: "submitting" });
    const endMs = Math.round(performance.now() - startedAtPerf);
    const startMs =
      speech.firstSpeechAtPerf !== null
        ? Math.min(endMs, Math.round(speech.firstSpeechAtPerf - startedAtPerf))
        : endMs;
    face.checkpoint();
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
      faceSignals: face.currentAvailability(),
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
      // The server moved on (another tab or a delayed retry): load its last accepted state.
      if (stale && apiErr?.code !== "REQUEST_ID_REUSED" && driver.recover) {
        try {
          const latest = await driver.recover();
          requestIdRef.current = newRequestId();
          setReply(latest);
          setDraftNotice(
            "This question was already answered, so we loaded the latest one. What you wrote is still saved as a draft for the old question.",
          );
          return;
        } catch {
          // fall through to the visible error below
        }
      }
      setSubmitState({
        kind: "error",
        stale,
        sendFailed: true,
        message: stale
          ? "This question was already answered (maybe in another tab). Reload to continue; your words are saved."
          : `${apiErr?.message ?? (err instanceof Error ? err.message : "Sending failed.")} Your answer${workspace ? " and work" : ""} are saved here. Press "Try sending again".`,
      });
    } finally {
      submittingRef.current = false;
      interruptingRef.current = false;
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  /** The interviewer cuts in (answer too long), says a short line, then moves on. */
  const interrupt = async () => {
    if (interruptingRef.current || submittingRef.current) {
      return;
    }
    interruptingRef.current = true;
    const line = INTERJECTIONS[Math.floor(Math.random() * INTERJECTIONS.length)];
    setInterjection(line);
    speech.stopListening();
    await speech.speak(line);
    await submitRef.current();
  };
  const interruptRef = useRef(interrupt);
  interruptRef.current = interrupt;

  // ── Live loop: auto-send on pause, cut in when long, nudge when silent ──
  const autoActive =
    !!question &&
    !finished &&
    !!startedAtPerf &&
    submitState.kind !== "submitting" &&
    submitState.kind !== "error";
  const tickRef = useRef<() => void>(() => {});
  tickRef.current = () => {
    const t = performance.now();
    setNow(t);
    if (!autoActive || interruptingRef.current || submittingRef.current || mode !== "voice") {
      return;
    }
    const answer = currentAnswer();
    const firstWord = speech.firstSpeechAtPerf;
    const limit = workspace ? WORKSPACE_LIMIT_MS : ANSWER_LIMIT_MS;
    if (firstWord !== null && t - firstWord >= limit) {
      interruptRef.current();
      return;
    }
    if (!workspace && wordCount(answer) >= ANSWER_WORD_LIMIT) {
      interruptRef.current();
      return;
    }
    if (speech.status !== "listening") {
      return;
    }
    const heard = speech.lastHeardAt();
    if (!workspace && heard !== null && answer && t - heard >= SILENCE_SEND_MS) {
      submitRef.current();
      return;
    }
    const listenedFrom = listenStartRef.current;
    if (
      heard === null &&
      listenedFrom !== null &&
      !nudgedRef.current &&
      t - listenedFrom >= NUDGE_AFTER_MS
    ) {
      nudgedRef.current = true;
      speech.speak(NUDGE_LINE).then(() => {
        listenStartRef.current = performance.now();
      });
    }
  };
  useEffect(() => {
    const id = setInterval(() => tickRef.current(), 200);
    return () => clearInterval(id);
  }, []);

  const skipQuestionReading = () => speech.cancelSpeech();
  const repeatQuestion = () => {
    if (question) {
      speech.speak(question.text).then(() => {
        listenStartRef.current = performance.now();
      });
    }
  };
  const switchToTyping = () => {
    speech.stopListening();
    setTranscript(currentAnswer());
    setInputMode("type");
  };
  const switchToVoice = () => {
    setInputMode("voice");
    setSubmitState({ kind: "idle" });
    listenStartRef.current = performance.now();
    speech.startListening();
  };

  // ── Render ───────────────────────────────────────────────────────
  if (startError) {
    return (
      <div role="alert" className="nb-card mx-auto max-w-xl space-y-3 p-6">
        <p className="text-lg font-black">We couldn't start the interview.</p>
        <p className="text-gray-700">{startError}</p>
        <div className="flex flex-wrap gap-3">
          <NbButton variant="primary" onClick={start}>
            Try again
          </NbButton>
          {onFallback && (
            <NbButton onClick={onFallback}>Use the offline sample replay instead</NbButton>
          )}
        </div>
        {onFallback && (
          <p className="text-sm text-gray-600">
            The demo needs the server to run in mock mode (LLM_MODE=mock). The offline replay works
            without it: questions are pre-recorded and answers aren't graded.
          </p>
        )}
      </div>
    );
  }
  if (!reply || !question) {
    return (
      <div className="nb-card mx-auto flex max-w-xl items-center gap-3 p-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Getting your first question ready...
      </div>
    );
  }

  const claim = plan.claims.find((c) => c.id === question.claimId);
  const questionNumber = reply.record.turns.filter((t) => t.speaker === "ai").length;
  const submitting = submitState.kind === "submitting";
  const heard = speech.lastHeardAt();
  const answerNow = [transcript.trim(), speech.interim.trim()].filter(Boolean).join(" ");
  const silenceMs = heard !== null && speech.status === "listening" ? now - heard : 0;
  const finishing =
    !workspace && autoActive && mode === "voice" && !!answerNow && silenceMs >= SILENCE_WARN_MS;
  const limit = workspace ? WORKSPACE_LIMIT_MS : ANSWER_LIMIT_MS;
  const elapsed = speech.firstSpeechAtPerf !== null ? now - speech.firstSpeechAtPerf : 0;
  const remaining = limit - elapsed;
  const lastDecision = reply.decision;

  let status: { tone: string; icon: React.ReactNode; text: string };
  if (finished) {
    status = {
      tone: "bg-emerald-100",
      icon: "🎉",
      text: "That's the end of the interview. Nice work!",
    };
  } else if (submitting) {
    status = {
      tone: "nb-bg-soft-lavender",
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      text: "Sending your answer...",
    };
  } else if (interjection) {
    status = {
      tone: "nb-bg-salmon",
      icon: "✋",
      text: `The interviewer cut in: "${interjection}"`,
    };
  } else if (speech.status === "speaking") {
    status = {
      tone: "nb-bg-soft-lavender",
      icon: "🗣️",
      text: "The interviewer is talking. Listen, or skip to answer now.",
    };
  } else if (mode === "type") {
    status = {
      tone: "bg-white",
      icon: <Keyboard className="h-5 w-5" />,
      text: "Typing mode: write your answer, then press Send.",
    };
  } else if (speech.status === "listening" && workspace) {
    status = {
      tone: "nb-bg-soft-salmon",
      icon: "🧑‍💻",
      text: 'Work in the editor and talk through your thinking. Press "I\'m done" when finished.',
    };
  } else if (finishing) {
    status = {
      tone: "nb-bg-soft-salmon",
      icon: "⏳",
      text: "Sounds like you're done. Sending soon; keep talking to continue.",
    };
  } else if (speech.status === "listening" && answerNow) {
    status = {
      tone: "nb-bg-soft-salmon",
      icon: "🎙️",
      text: `Listening... pause for ${SILENCE_SEND_MS / 1000} seconds when you're finished.`,
    };
  } else if (speech.status === "listening") {
    status = {
      tone: "nb-bg-soft-salmon",
      icon: "🎙️",
      text: "Your turn. Start talking whenever you're ready.",
    };
  } else {
    status = {
      tone: "bg-white",
      icon: <MicOff className="h-5 w-5" />,
      text: "The microphone is paused.",
    };
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <TabSwitchWarning open={integrity.showTabNotice} onUnderstand={integrity.dismissTabNotice} />

      <div className="min-w-0 space-y-5">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-black">
              {reply.finished
                ? "Interview complete"
                : `Question ${Math.min(questionNumber, plan.maxQuestions)} of up to ${plan.maxQuestions}`}
            </span>
            {claim && <span className="nb-pill">{claim.skillArea}</span>}
            <span className="nb-pill nb-bg-soft-lavender">{FRIENDLY_RUNGS[question.rung]}</span>
            {driver.mode === "live" && <ModeLabel />}
            {speech.voiceEngine && (
              <span
                className="nb-pill"
                title={
                  speech.voiceEngine === "natural"
                    ? "Spoken by a natural-sounding AI voice"
                    : "Natural voice unavailable right now; using the browser's built-in voice"
                }
              >
                {speech.voiceEngine === "natural" ? "🔊 Natural voice" : "🔈 Browser voice"}
              </span>
            )}
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[#111] bg-white">
            <div
              className="h-full nb-bg-lavender transition-all"
              style={{ width: `${Math.min(100, (questionNumber / plan.maxQuestions) * 100)}%` }}
            />
          </div>
        </div>

        {/* Interviewer stage */}
        <section className="nb-card space-y-4 p-5 md:p-6" aria-live="polite">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#111] nb-bg-lavender text-2xl ${
                speech.status === "speaking" ? "nb-speaking" : ""
              }`}
              aria-hidden="true"
            >
              🤖
            </span>
            <div className="min-w-0">
              <p className="font-black">AI interviewer</p>
              <p className="text-sm text-gray-600">{FRIENDLY_REASONS[lastDecision.reason].title}</p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {speech.status === "speaking" && !finished ? (
                <NbButton size="sm" variant="secondary" onClick={skipQuestionReading}>
                  <SkipForward className="h-4 w-4" /> Skip to my answer
                </NbButton>
              ) : (
                !finished && (
                  <NbButton
                    size="sm"
                    onClick={repeatQuestion}
                    disabled={!speech.supported.synthesis || submitting}
                  >
                    <Volume2 className="h-4 w-4" /> Repeat
                  </NbButton>
                )
              )}
            </div>
          </div>
          <p className="text-xl font-medium leading-snug md:text-2xl">{question.text}</p>
          <div
            className={`flex items-center gap-3 rounded-xl border-2 border-[#111] px-4 py-3 text-sm font-medium ${status.tone}`}
          >
            <span className="flex h-6 w-6 items-center justify-center">{status.icon}</span>
            <span>{status.text}</span>
            {speech.status === "listening" && !finishing && (
              <span className="nb-eq ml-auto text-[#ff697c]" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
          {finishing && (
            <div
              className="h-2 w-full overflow-hidden rounded-full border border-[#111] bg-white"
              aria-hidden="true"
            >
              <div
                className="h-full bg-[#ff697c]"
                style={{
                  width: `${Math.min(100, ((silenceMs - SILENCE_WARN_MS) / (SILENCE_SEND_MS - SILENCE_WARN_MS)) * 100)}%`,
                }}
              />
            </div>
          )}
          {!speech.supported.synthesis && !finished && (
            <p className="rounded-xl border-2 border-[#111] bg-[#fff3c4] px-4 py-2 text-sm">
              This browser can't read questions aloud, so read each question above. Everything else
              works the same.
            </p>
          )}
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
          <section className="nb-card space-y-4 p-5 md:p-6" aria-label="Your answer">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black">Your answer</h2>
              {speech.firstSpeechAtPerf !== null && mode === "voice" && (
                <span
                  className={`nb-pill ml-auto ${remaining <= WRAP_UP_WARNING_MS ? "nb-bg-salmon" : ""}`}
                >
                  {remaining <= WRAP_UP_WARNING_MS
                    ? `Wrap up: ${mmss(remaining)} left`
                    : `${mmss(elapsed)} / ${mmss(limit)}`}
                </span>
              )}
            </div>

            {mode === "voice" ? (
              <div className="min-h-[96px] rounded-xl bg-[#f3f3f3] p-4 text-base leading-relaxed">
                {transcript || speech.interim ? (
                  <>
                    {transcript} <span className="text-gray-500">{speech.interim}</span>
                  </>
                ) : (
                  <span className="text-gray-500">Your words will appear here as you speak.</span>
                )}
              </div>
            ) : (
              <>
                <label htmlFor="answer" className="sr-only">
                  Your answer
                </label>
                <textarea
                  id="answer"
                  className="nb-input min-h-[140px]"
                  placeholder="Type your answer here."
                  value={transcript}
                  disabled={submitting}
                  onChange={(e) => {
                    speech.markFirstSpeech();
                    setTranscript(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      submit();
                    }
                  }}
                />
              </>
            )}

            {speech.error && (
              <div
                role="alert"
                className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
              >
                <p>{speech.error.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <NbButton size="sm" onClick={switchToVoice}>
                    <Mic className="h-4 w-4" /> Try the microphone again
                  </NbButton>
                  <NbButton size="sm" onClick={switchToTyping}>
                    <Keyboard className="h-4 w-4" /> Type instead
                  </NbButton>
                </div>
              </div>
            )}
            {draftNotice && <p className="text-sm text-gray-600">{draftNotice}</p>}
            {storageWarning && (
              <p role="alert" className="text-sm text-[#b4232f]">
                {storageWarning}
              </p>
            )}
            {submitState.kind === "error" && (
              <div
                role="alert"
                className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
              >
                <p>{submitState.message}</p>
                {submitState.stale && (
                  <NbButton size="sm" className="mt-2" onClick={() => window.location.reload()}>
                    <RotateCcw className="h-4 w-4" /> Reload
                  </NbButton>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {mode === "voice" ? (
                <>
                  <NbButton
                    variant={workspace || submitState.kind === "error" ? "primary" : "default"}
                    onClick={() => submit()}
                    disabled={submitting || speech.status === "speaking"}
                    title={
                      speech.status === "speaking"
                        ? "Wait for the question to finish, or skip it"
                        : undefined
                    }
                  >
                    {submitState.kind === "error" && submitState.sendFailed
                      ? "Try sending again"
                      : "I'm done, send now"}
                  </NbButton>
                  {speech.status === "listening" ? (
                    <NbButton size="sm" onClick={() => speech.stopListening()}>
                      <MicOff className="h-4 w-4" /> Pause mic
                    </NbButton>
                  ) : (
                    speech.status !== "speaking" && (
                      <NbButton size="sm" onClick={switchToVoice} disabled={submitting}>
                        <Mic className="h-4 w-4" /> Resume mic
                      </NbButton>
                    )
                  )}
                  <NbButton size="sm" onClick={switchToTyping} disabled={submitting}>
                    <Keyboard className="h-4 w-4" /> Type instead
                  </NbButton>
                </>
              ) : (
                <>
                  <NbButton
                    variant="primary"
                    onClick={() => submit()}
                    disabled={submitting || speech.status === "speaking"}
                    title={
                      speech.status === "speaking"
                        ? "Wait for the question to finish, or skip it"
                        : undefined
                    }
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitState.kind === "error" && submitState.sendFailed
                      ? "Try sending again"
                      : "Send answer"}
                  </NbButton>
                  {speech.supported.recognition && (
                    <NbButton size="sm" onClick={switchToVoice} disabled={submitting}>
                      <Mic className="h-4 w-4" /> Use my voice
                    </NbButton>
                  )}
                </>
              )}
              {driver.sampleAnswerFor?.(question) && (
                <button
                  type="button"
                  className="nb-link ml-auto text-sm font-medium text-[#494cf3] underline-offset-4 hover:underline"
                  disabled={submitting}
                  onClick={() => {
                    const sample = driver.sampleAnswerFor?.(question);
                    if (sample) {
                      speech.stopListening();
                      speech.markFirstSpeech();
                      setTranscript(sample);
                      setTimeout(() => submitRef.current(), 900);
                    }
                  }}
                >
                  Answer for me (sample answer)
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        {faceSignalsEnabled && driver.mode !== "fixture" && (
          <section className="nb-card flat space-y-2 p-4 text-sm" aria-label="Camera preview">
            <h2 className="font-black">Your camera</h2>
            {/* Frames have no audio or captions; this is only the local camera preview. */}
            <video
              ref={face.attachVideo}
              autoPlay
              muted
              playsInline
              aria-label="Live camera preview"
              className={`aspect-video w-full rounded-lg bg-black object-cover ${face.previewOn ? "" : "hidden"}`}
              style={{ transform: "scaleX(-1)" }}
            />
            <p aria-live="polite">
              {finished
                ? "Camera stopped."
                : face.previewOn
                  ? "Camera on. Video stays on your device."
                  : face.availability.reason}
            </p>
            {!finished && !face.availability.available && (
              <>
                {face.previewOn && <p className="text-gray-600">{face.availability.reason}</p>}
                <NbButton size="sm" onClick={face.retry}>
                  {face.previewOn ? "Retry face signals" : "Enable camera / Retry camera"}
                </NbButton>
                <p className="text-gray-600">
                  If access was blocked, allow Camera in Chrome’s site settings, then retry. Chrome
                  reuses permission already granted.
                </p>
              </>
            )}
            {face.observation && !finished && (
              <p aria-live="polite" className="font-bold">
                {face.observation.faces === 0
                  ? "Face not visible"
                  : face.observation.faces > 1
                    ? "Multiple faces detected"
                    : face.observation.away
                      ? "Looking away detected"
                      : "One face visible, facing the screen"}
              </p>
            )}
            {!finished && (
              <p className="text-gray-600">
                Sustained signals are saved when you return or send your answer.
              </p>
            )}
            <p className="text-gray-600">
              Only derived face signals reach the report. No video is recorded or uploaded.
            </p>
          </section>
        )}
        <WhyThisQuestion reply={reply} plan={plan} />
        <MonitoringStatus
          tabBlurs={integrity.tabBlurCount}
          pastes={integrity.pasteCount}
          faceSignals={face.availability}
        />
        <TranscriptHistory turns={reply.record.turns} currentId={question.id} />
      </aside>
    </div>
  );
}

/** Plain-language decision log: why the interviewer chose each question. */
function WhyThisQuestion({ reply, plan }: { reply: TurnReply; plan: ClientInterviewPlan }) {
  const decisions = reply.record.decisions;
  const latest = reply.decision;
  const friendly = FRIENDLY_REASONS[latest.reason];
  const skill = (claimId: string) =>
    plan.claims.find((c) => c.id === claimId)?.skillArea ?? claimId;
  return (
    <section aria-label="Decision log" className="nb-card space-y-3 p-4">
      <h2 className="font-black">Why this question?</h2>
      <div className="rounded-xl border-2 border-[#111] nb-bg-soft-lavender p-3">
        <p className="font-bold">{friendly.title}</p>
        <p className="mt-1 text-sm text-gray-700">{friendly.detail}</p>
        <p className="mt-2 font-mono text-[11px] text-gray-500">rule: {latest.reason}</p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold">
          Every decision so far ({decisions.length})
        </summary>
        <ol className="mt-2 space-y-2">
          {decisions.map((d) => (
            <li key={d.turnId} className="border-l-4 border-[#b6b7fd] pl-2">
              <p className="font-medium">{FRIENDLY_REASONS[d.reason].title}</p>
              <p className="text-xs text-gray-600">
                {skill(d.claimId)} · {FRIENDLY_RUNGS[d.toRung]}
                {d.lastGrade !== null && ` · last answer ${d.lastGrade}/3`}
              </p>
              <p className="font-mono text-[11px] text-gray-500">{d.reason}</p>
            </li>
          ))}
        </ol>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold">The rule, in one sentence</summary>
        <p className="mt-1 text-gray-700">
          Good answer (2+ out of 3)? One level deeper. Struggling (1 or less)? Back to basics, once
          per topic. After 4 questions on a topic, or 2 tough answers in a row, we move to the next
          topic.
        </p>
      </details>
    </section>
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
    <section className="nb-card flat space-y-1 p-4 text-sm" aria-label="Monitoring">
      <h2 className="font-black">What we notice</h2>
      <p className="text-gray-600">For a person to review later. It never changes your score.</p>
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
    <details className="nb-card flat p-4 text-sm">
      <summary className="cursor-pointer font-black">Conversation so far ({past.length})</summary>
      <ol className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {past.map((t) => (
          <li key={t.id}>
            <span className="font-bold">{t.speaker === "ai" ? "Interviewer" : "You"}:</span>{" "}
            {t.text}
            {t.artifacts?.length ? (
              <span className="nb-pill ml-1 text-[11px]">
                + {t.artifacts[0].kind === "code" ? "code" : "drawing"}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
