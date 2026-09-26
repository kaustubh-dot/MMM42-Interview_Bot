"use client";

// Keeps each scheduled candidate's status in step with the pipeline server, using only the
// existing session/report routes. When an interview finishes, the report is loaded (or
// generated once) and cached for ranking. No pipeline route or contract is changed.

import {
  PipelineApiError,
  generateReport,
  getSession,
  loadReport,
} from "@/components/pipeline/api-client";
import type { AdminCandidate } from "@/lib/admin/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { cacheReport, updateCandidate, useAdmin } from "./admin-store";

const POLL_MS = 20_000;

// Module-level so remounts (navigation between admin pages) don't start duplicate requests.
const inFlight = new Set<string>();
// Report generation that failed is retried only when the recruiter asks, to avoid repeated
// evaluator/auditor calls against a failing provider.
const reportFailed = new Set<string>();

async function syncReport(c: AdminCandidate) {
  updateCandidate(c.id, { status: "completed", statusNote: "Preparing the report…" });
  try {
    let report: Awaited<ReturnType<typeof loadReport>>;
    try {
      report = await loadReport(c.interviewId);
    } catch (err) {
      if (!(err instanceof PipelineApiError) || err.status !== 404 || err.serviceUnavailable) {
        throw err;
      }
      report = await generateReport(c.interviewId);
    }
    cacheReport(c.interviewId, report);
    reportFailed.delete(c.interviewId);
    updateCandidate(c.id, { status: "completed", statusNote: undefined });
  } catch (err) {
    reportFailed.add(c.interviewId);
    updateCandidate(c.id, {
      status: "completed",
      statusNote: `Report not ready: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}

async function syncOne(c: AdminCandidate, hasReport: boolean, force: boolean) {
  if (c.kind === "sample" || inFlight.has(c.interviewId)) {
    return;
  }
  if (c.status === "completed" && (hasReport || (!force && reportFailed.has(c.interviewId)))) {
    return;
  }
  if (c.status === "unavailable" && !force) {
    return;
  }
  inFlight.add(c.interviewId);
  try {
    const session = await getSession(c.interviewId);
    if (session.finished) {
      await syncReport(c);
    } else if (session.record.turns.length > 0) {
      updateCandidate(c.id, { status: "in_progress", statusNote: undefined });
    } else {
      updateCandidate(c.id, { status: "scheduled", statusNote: undefined });
    }
  } catch (err) {
    if (!(err instanceof PipelineApiError) || err.serviceUnavailable) {
      updateCandidate(c.id, {
        statusNote: "Couldn't reach the interview server. Status may be out of date.",
      });
    } else if (err.status === 404 && c.kind === "demo" && c.status === "scheduled") {
      // Demo attempts are created when the candidate presses start.
      updateCandidate(c.id, { statusNote: undefined });
    } else if (err.status === 404) {
      updateCandidate(c.id, {
        status: "unavailable",
        statusNote:
          "The interview server no longer has this attempt. It keeps interviews in memory, so a restart clears them. Schedule a new invite.",
      });
    } else {
      updateCandidate(c.id, { statusNote: err.message });
    }
  } finally {
    inFlight.delete(c.interviewId);
  }
}

export interface SyncControls {
  syncing: boolean;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
}

export function useInterviewSync(): SyncControls {
  const { hydrated, state, reports } = useAdmin();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const latest = useRef({ candidates: state.candidates, reports });
  latest.current = { candidates: state.candidates, reports };

  const run = useCallback(async (force: boolean) => {
    const { candidates, reports: cached } = latest.current;
    setSyncing(true);
    await Promise.all(candidates.map((c) => syncOne(c, !!cached[c.interviewId], force)));
    setSyncing(false);
    setLastSyncedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    run(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        run(false);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hydrated, run]);

  const syncNow = useCallback(() => run(true), [run]);
  return { syncing, lastSyncedAt, syncNow };
}
