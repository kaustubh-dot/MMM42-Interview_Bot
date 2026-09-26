"use client";

// Single-instance browser integrity capture: tab blur/focus and paste.
// Mount this hook ONCE per interview page and pass its values down. (FoloUp instantiated its
// tab-switch hook twice, so the stored count and the warning dialog disagreed.)
//
// These are raw events for a concern level that prompts human review. They are never a
// cheating verdict, never block the candidate, and never change any score.

import type { IntegrityEvent } from "@/types/pipeline";
import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** Capture only while true (after the candidate has seen the disclosure and started). */
  active: boolean;
  /** performance.now() value treated as interview time 0. */
  startedAtPerf: number | null;
  /** The question the candidate is answering; attached to events for context. */
  currentTurnId?: string;
}

export interface BrowserIntegrity {
  events: IntegrityEvent[];
  tabBlurCount: number;
  pasteCount: number;
  /** True while the page is hidden; used to show the (non-blocking) notice. */
  showTabNotice: boolean;
  dismissTabNotice: () => void;
  /** Events not yet acknowledged by the server. */
  pendingEvents: () => IntegrityEvent[];
  /** Marks the first `count` events as delivered after a successful submit. */
  acknowledge: (count: number) => void;
}

export function useBrowserIntegrity({
  active,
  startedAtPerf,
  currentTurnId,
}: Options): BrowserIntegrity {
  const [events, setEvents] = useState<IntegrityEvent[]>([]);
  const [showTabNotice, setShowTabNotice] = useState(false);
  const eventsRef = useRef<IntegrityEvent[]>([]);
  const deliveredRef = useRef(0);
  const blurStartRef = useRef<number | null>(null);
  const turnRef = useRef(currentTurnId);
  turnRef.current = currentTurnId;

  const push = useCallback((event: IntegrityEvent) => {
    eventsRef.current = [...eventsRef.current, event];
    setEvents(eventsRef.current);
  }, []);

  useEffect(() => {
    if (!active || startedAtPerf === null) {
      return;
    }
    const now = () => Math.round(performance.now() - startedAtPerf);

    // visibilitychange only: moving focus into Monaco, Excalidraw or the transcript box does not
    // hide the page, so internal focus changes never count as leaving the tab.
    const onVisibility = () => {
      if (document.hidden) {
        blurStartRef.current = now();
        setShowTabNotice(true);
        return;
      }
      if (blurStartRef.current === null) {
        return;
      }
      const blurAt = blurStartRef.current;
      const focusAt = now();
      blurStartRef.current = null;
      push({
        kind: "tabBlur",
        atMs: blurAt,
        durationMs: focusAt - blurAt,
        turnId: turnRef.current,
      });
      push({ kind: "tabFocus", atMs: focusAt, turnId: turnRef.current });
    };

    // Record that a paste happened and its size. The pasted content is never stored or sent,
    // and pasting is not blocked.
    const onPaste = (e: ClipboardEvent) => {
      const length = e.clipboardData?.getData("text/plain").length ?? 0;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const where = target?.closest("[aria-label='Technical workspace']")
        ? "workspace"
        : "answer box";
      push({
        kind: "paste",
        atMs: now(),
        turnId: turnRef.current,
        detail: `${length} characters pasted into the ${where}`,
      });
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("paste", onPaste, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("paste", onPaste, true);
    };
  }, [active, startedAtPerf, push]);

  return {
    events,
    tabBlurCount: events.filter((e) => e.kind === "tabBlur").length,
    pasteCount: events.filter((e) => e.kind === "paste").length,
    showTabNotice,
    dismissTabNotice: () => setShowTabNotice(false),
    pendingEvents: () => eventsRef.current.slice(deliveredRef.current),
    acknowledge: (count: number) => {
      deliveredRef.current = Math.min(eventsRef.current.length, deliveredRef.current + count);
    },
  };
}
