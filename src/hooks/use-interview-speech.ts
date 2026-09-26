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

  const recognitionRef = useRef<Recognition | null>(null);
  const wantListeningRef = useRef(false);
  const speakingRef = useRef(false);
  const firstSpeechRef = useRef<number | null>(null);
  const onFinalRef = useRef(onFinalChunk);
  onFinalRef.current = onFinalChunk;

  useEffect(() => {
    setSupported({
      recognition: getRecognitionCtor() !== null,
      synthesis: typeof window !== "undefined" && "speechSynthesis" in window,
    });
  }, []);

  const markFirstSpeech = useCallback(() => {
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

  /** Speaks the question. Recognition is paused for the duration and resumed if it was on. */
  const speak = useCallback(
    (text: string): Promise<void> => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return Promise.resolve();
      }
      const resume = wantListeningRef.current;
      stopRecognition();
      speakingRef.current = true;
      setStatus("speaking");
      window.speechSynthesis.cancel();
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) {
            return;
          }
          done = true;
          clearTimeout(guard);
          speakingRef.current = false;
          setStatus("idle");
          if (resume) {
            wantListeningRef.current = true;
            startRecognition();
          }
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
    [lang, startRecognition, stopRecognition],
  );

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /** Clears the first-speech timestamp before a new question. */
  const resetAnswerTiming = useCallback(() => {
    firstSpeechRef.current = null;
    setFirstSpeechAtPerf(null);
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      stopRecognition();
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
    /** Call when the candidate types, so typed answers also get a start time. */
    markFirstSpeech,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    resetAnswerTiming,
  };
}
