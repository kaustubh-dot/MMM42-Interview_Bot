"use client";

import { FaceOccurrenceTracker } from "@/lib/face-signals";
import type { IntegrityEvent } from "@/types/pipeline";
import type { FaceSignalAvailability } from "@/types/pipeline-api";
import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  enabled: boolean;
  active: boolean;
  startedAtPerf: number | null;
  currentTurnId?: string;
  onEvent: (event: IntegrityEvent) => void;
  pendingEventCount: () => number;
}

/** Optional monitoring: failures never interrupt speech, submissions or completion.
 * CPU inference runs in a worker so a slow/stuck detector cannot freeze the interview.
 */
export function useFaceSignals({
  enabled,
  active,
  startedAtPerf,
  currentTurnId,
  onEvent,
  pendingEventCount,
}: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [observation, setObservation] = useState<{ faces: number; away: boolean } | null>(null);
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoReady(node !== null);
  }, []);
  const trackerRef = useRef(new FaceOccurrenceTracker());
  const callbackRef = useRef(onEvent);
  const pendingCountRef = useRef(pendingEventCount);
  const emitRef = useRef<(events: IntegrityEvent[]) => void>(() => {});
  const turnRef = useRef(currentTurnId);
  const lastSampleRef = useRef<number | null>(null);
  const availabilityRef = useRef<FaceSignalAvailability>({
    available: false,
    reason: enabled ? "Camera signals are starting." : "Off for this interview.",
  });
  const [availability, setAvailability] = useState(availabilityRef.current);
  const [previewOn, setPreviewOn] = useState(false);
  callbackRef.current = onEvent;
  pendingCountRef.current = pendingEventCount;
  turnRef.current = currentTurnId;

  const checkpoint = useCallback(() => {
    if (startedAtPerf === null || !availabilityRef.current.available) {
      return;
    }
    const now = performance.now();
    if (document.hidden || lastSampleRef.current === null || now - lastSampleRef.current > 1200) {
      trackerRef.current.reset();
      return;
    }
    emitRef.current(trackerRef.current.checkpoint(Math.round(now - startedAtPerf)));
  }, [startedAtPerf]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: videoReady triggers capture after ref attachment; retryAttempt intentionally restarts capture.
  useEffect(() => {
    // The screen can render its loading state before the video exists. The callback
    // ref triggers another effect when it mounts; missing DOM is not camera failure.
    if (!active || startedAtPerf === null || !enabled || !videoRef.current) {
      return;
    }
    availabilityRef.current = {
      available: false,
      reason: "Requesting camera permission and starting face signals.",
    };
    setAvailability(availabilityRef.current);
    setObservation(null);
    let stopped = false;
    let worker: Worker | null = null;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let workerReady = false;
    let busy = false;
    let lastVideoTime = -1;
    let lastFreshSampleAt = performance.now();
    const video = videoRef.current;
    trackerRef.current.reset();
    lastSampleRef.current = null;

    const stop = () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(startupTimeout);
      worker?.terminate();
      for (const track of stream?.getTracks() ?? []) {
        track.onended = null;
        track.onmute = null;
        track.stop();
      }
      if (video) {
        video.srcObject = null;
      }
      trackerRef.current.reset();
      emitRef.current = () => {};
    };
    const fail = (reason: string) => {
      if (stopped) {
        return;
      }
      availabilityRef.current = { available: false, reason };
      setAvailability(availabilityRef.current);
      callbackRef.current({
        kind: "faceSignalsUnavailable",
        atMs: Math.max(0, Math.round(performance.now() - startedAtPerf)),
        turnId: turnRef.current,
        detail: reason,
      });
      setPreviewOn(false);
      setObservation(null);
      stop();
    };
    const startupTimeout = setTimeout(
      () => fail("Camera or face detector did not start in time."),
      20000,
    );

    emitRef.current = (events) => {
      for (const event of events) {
        // Preserve raw durations for fusion, but noisy optional capture must not
        // overflow the turn API's 100-event limit. Reserve room for browser events
        // and the unavailable marker, then continue with browser monitoring only.
        if (pendingCountRef.current() >= 90) {
          fail("Face signal capture produced too many events and was disabled.");
          return;
        }
        callbackRef.current(event);
      }
    };

    const onVisibility = () => {
      // No observations in a hidden tab: never turn throttled timers into a face event.
      trackerRef.current.reset();
      lastSampleRef.current = null;
      lastFreshSampleAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const start = async () => {
      try {
        if (
          !video ||
          !navigator.mediaDevices?.getUserMedia ||
          typeof Worker === "undefined" ||
          typeof createImageBitmap === "undefined"
        ) {
          fail("Camera signals are unsupported in this browser.");
          return;
        }
        const acquired = await navigator.mediaDevices.getUserMedia({ video: true });
        if (stopped) {
          for (const track of acquired.getTracks()) {
            track.stop();
          }
          return;
        }
        stream = acquired;
        for (const track of stream.getVideoTracks()) {
          track.onended = () => fail("Camera disconnected.");
          track.onmute = () => fail("Camera stopped providing frames.");
        }
        video.srcObject = stream;
        await video.play();
        if (stopped) {
          return;
        }
        setPreviewOn(true);
        worker = new Worker(new URL("../lib/face-signals-worker.ts", import.meta.url));
        worker.onerror = (event) =>
          fail(`Face detector could not run: ${(event.message || "worker error").slice(0, 140)}`);
        worker.onmessageerror = () => fail("Face detector could not read frames.");
        worker.onmessage = ({ data }) => {
          if (stopped) {
            return;
          }
          if (data.kind === "error") {
            fail(
              `Face detector unavailable: ${String(data.detail ?? "Could not load or process frames.").slice(0, 160)}`,
            );
          } else if (data.kind === "ready") {
            workerReady = true;
          } else if (data.kind === "sample") {
            busy = false;
            const now = performance.now();
            if (document.hidden || now - data.atPerf > 1200) {
              trackerRef.current.reset();
              return;
            }
            if (lastSampleRef.current !== null && data.atPerf - lastSampleRef.current > 1200) {
              trackerRef.current.reset();
            }
            lastSampleRef.current = data.atPerf;
            setObservation({ faces: data.count, away: data.away });
            lastFreshSampleAt = now;
            clearTimeout(startupTimeout);
            if (!availabilityRef.current.available) {
              availabilityRef.current = { available: true };
              setAvailability(availabilityRef.current);
            }
            const events = trackerRef.current.observe(
              data.count,
              data.away,
              Math.max(0, Math.round(data.atPerf - startedAtPerf)),
              turnRef.current,
            );
            emitRef.current(events);
          }
        };
        worker.postMessage({ kind: "init" });
        timer = setInterval(async () => {
          if (stopped || document.hidden) {
            return;
          }
          const now = performance.now();
          if (availabilityRef.current.available && now - lastFreshSampleAt > 5000) {
            fail("Camera or face detector stopped providing signals.");
            return;
          }
          if (!workerReady || busy || video.readyState < 2 || video.currentTime === lastVideoTime) {
            return;
          }
          busy = true;
          lastVideoTime = video.currentTime;
          try {
            const frame = await createImageBitmap(video, {
              resizeWidth: 640,
              resizeHeight: Math.max(1, Math.round((640 * video.videoHeight) / video.videoWidth)),
            });
            if (stopped) {
              frame.close();
              return;
            }
            worker?.postMessage({ kind: "frame", frame, atPerf: now }, [frame]);
          } catch {
            fail("Camera frames could not be processed.");
          }
        }, 250);
      } catch (error) {
        const detail =
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Camera permission or device unavailable.";
        fail(`Camera could not start: ${detail.slice(0, 160)}`);
      }
    };
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      setPreviewOn(false);
      stop();
    };
  }, [enabled, active, startedAtPerf, videoReady, retryAttempt]);

  return {
    videoRef,
    attachVideo,
    retry: () => setRetryAttempt((attempt) => attempt + 1),
    observation,
    previewOn,
    availability,
    checkpoint,
    currentAvailability: () => availabilityRef.current,
  };
}
