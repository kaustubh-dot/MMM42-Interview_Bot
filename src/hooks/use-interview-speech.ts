"use client";

// Chrome Web Speech API wrapper for the interview turn loop (CLAUDE.md §2: Chrome only).
// - Recognition is always stopped while the interviewer's question is being spoken, so AI audio
//   never becomes part of a candidate answer.
// - Records the time of the candidate's first recognized speech for `startMs` (the latency
//   signal uses real speech onset, not the Submit click).

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal Web Speech API types (not in the TS DOM lib).
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

export type SpeechStatus = "idle" | "listening" | "speaking";
export type VoiceEngine = "natural" | "browser" | null;

export interface SpeechError {
  code: string;
  message: string;
  /** Whether retrying start is likely to help. */
  retryable: boolean;
}

const ERROR_MESSAGES: Record<string, Omit<SpeechError, "code">> = {
  "not-allowed": {
    message:
      "Microphone access was denied. Allow the microphone in Chrome's site settings (lock icon in the address bar), then press Retry. You can also type your answer.",
    retryable: true,
  },
  "service-not-allowed": {
    message:
      "Chrome's speech service is not allowed on this page. Type your answer, or retry in Chrome over https or localhost.",
    retryable: true,
  },
  "audio-capture": {
    message: "No microphone was found. Connect one and press Retry, or type your answer.",
    retryable: true,
  },
  network: {
    message:
      "Chrome's speech service could not be reached. Check the connection and press Retry, or type your answer.",
    retryable: true,
  },
};

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Options {
  /** Receives each finalized chunk of recognized speech. */
  onFinalChunk: (text: string) => void;
  lang?: string;
}

export function useInterviewSpeech({ onFinalChunk, lang = "en-US" }: Options) {
  const [supported, setSupported] = useState({ recognition: false, synthesis: false });
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const [firstSpeechAtPerf, setFirstSpeechAtPerf] = useState<number | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>(null);

  const recognitionRef = useRef<Recognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantListeningRef = useRef(false);
  const speakingRef = useRef(false);
  const firstSpeechRef = useRef<number | null>(null);
  // Last time any candidate speech (interim or final) was heard: drives "you paused, so your
  // answer is sent" in the live interview.
  const lastHeardRef = useRef<number | null>(null);
  const onFinalRef = useRef(onFinalChunk);
  onFinalRef.current = onFinalChunk;

  useEffect(() => {
    setSupported({
      recognition: getRecognitionCtor() !== null,
      synthesis: typeof window !== "undefined" && "speechSynthesis" in window,
    });
  }, []);

  const markFirstSpeech = useCallback(() => {
    lastHeardRef.current = performance.now();
    if (firstSpeechRef.current === null) {
      firstSpeechRef.current = performance.now();
      setFirstSpeechAtPerf(firstSpeechRef.current);
    }
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || speakingRef.current) {
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onspeechstart = markFirstSpeech;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (text.trim()) {
          markFirstSpeech();
        }
        if (result.isFinal) {
          if (text.trim()) {
            onFinalRef.current(text.trim());
          }
        } else {
          interimText += text;
        }
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine; Chrome ends the session and we restart it.
      if (e.error === "no-speech" || e.error === "aborted") {
        return;
      }
      const known = ERROR_MESSAGES[e.error] ?? {
        message: `Speech recognition stopped (${e.error}). Press Retry or type your answer.`,
        retryable: true,
      };
      setError({ code: e.error, ...known });
      wantListeningRef.current = false;
    };
    rec.onend = () => {
      setInterim("");
      if (recognitionRef.current !== rec) {
        return;
      }
      // Chrome ends continuous sessions after silence; keep listening until told to stop.
      if (wantListeningRef.current && !speakingRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to idle
        }
      }
      recognitionRef.current = null;
      setStatus(speakingRef.current ? "speaking" : "idle");
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      recognitionRef.current = null;
      setError({
        code: "start-failed",
        message: "Could not start the microphone.",
        retryable: true,
      });
    }
  }, [lang, markFirstSpeech]);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
    setInterim("");
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    wantListeningRef.current = true;
    if (!recognitionRef.current) {
      startRecognition();
    }
  }, [startRecognition]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    stopRecognition();
    setStatus(speakingRef.current ? "speaking" : "idle");
  }, [stopRecognition]);

  /** Tries the natural-voice API. Resolves false (never rejects) on any failure or absence. */
  const speakNatural = useCallback((text: string): Promise<boolean> => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return Promise.resolve(false);
    }
    return fetch("/api/pipeline/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then(
        (blob) =>
          new Promise<boolean>((resolve) => {
            if (!blob || !blob.size) {
              resolve(false);
              return;
            }
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            let done = false;
            const finish = (ok: boolean) => {
              if (done) {
                return;
              }
              done = true;
              clearTimeout(guard);
              URL.revokeObjectURL(url);
              if (audioRef.current === audio) {
                audioRef.current = null;
              }
              resolve(ok);
            };
            // The audio element reliably fires onended/onerror, but guard anyway.
            const guard = setTimeout(() => finish(true), 4000 + text.length * 90);
            audio.onended = () => finish(true);
            audio.onerror = () => finish(false);
            audio.play().catch(() => finish(false));
          }),
      )
      .catch(() => false);
  }, []);

  /** Browser speechSynthesis fallback. Always resolves. */
  const speakBrowser = useCallback(
    (text: string): Promise<void> => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return Promise.resolve();
      }
      window.speechSynthesis.cancel();
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) {
            return;
          }
          done = true;
          clearTimeout(guard);
          resolve();
        };
        // Chrome sometimes never fires onend; cap by a generous reading-time estimate.
        const guard = setTimeout(finish, 4000 + text.length * 90);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      });
    },
    [lang],
  );

  /**
   * Speaks the question: tries the natural voice API first, falls back to the browser voice on
   * any failure (feature off, terms not accepted, rate limited, offline). Recognition is paused
   * for the duration and resumed if it was on, exactly as before.
   */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      const resume = wantListeningRef.current;
      stopRecognition();
      speakingRef.current = true;
      setStatus("speaking");
      const ok = await speakNatural(text);
      setVoiceEngine(ok ? "natural" : "browser");
      if (!ok) {
        await speakBrowser(text);
      }
      speakingRef.current = false;
      setStatus("idle");
      if (resume) {
        wantListeningRef.current = true;
        startRecognition();
      }
    },
    [speakNatural, speakBrowser, startRecognition, stopRecognition],
  );

  const cancelSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const lastHeardAt = useCallback(() => lastHeardRef.current, []);

  /** Clears the first-speech timestamp before a new question. */
  const resetAnswerTiming = useCallback(() => {
    firstSpeechRef.current = null;
    lastHeardRef.current = null;
    setFirstSpeechAtPerf(null);
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      stopRecognition();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopRecognition]);

  return {
    supported,
    status,
    interim,
    error,
    firstSpeechAtPerf,
    /** Which voice spoke the last question: "natural" (server TTS) or "browser" (fallback). */
    voiceEngine,
    /** Call when the candidate types, so typed answers also get a start time. */
    markFirstSpeech,
    /** performance.now() of the last heard speech in this answer, or null. */
    lastHeardAt,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    resetAnswerTiming,
  };
}
