"use client";

// Recruiter console storage. MOCK ONLY: jobs, candidates, notes and decisions are kept in this
// browser's localStorage, and cached reports let the ranking survive a restart of the in-memory
// pipeline server. D's durable service can replace this module behind the same hook/actions.
// Candidate names stay here and are never sent to the scoring pipeline (blind scoring).

import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import type { AdminCandidate, AdminJob, AdminState } from "@/lib/admin/types";
import type { ClientInterviewReport } from "@/types/pipeline-api";
import { useSyncExternalStore } from "react";

const STATE_KEY = "mmm42:admin:v1";
const REPORT_PREFIX = "mmm42:admin:report:";
export const SAMPLE_INTERVIEW_ID = clientGoldenReport.record.plan.interviewId;

const EMPTY: AdminState = { version: 1, jobs: [], candidates: [] };

export interface AdminSnapshot {
  hydrated: boolean;
  state: AdminState;
  reports: Readonly<Record<string, ClientInterviewReport>>;
  /** The last write to browser storage failed (private window, quota). Data is kept in memory. */
  saveFailed: boolean;
}

const SERVER_SNAPSHOT: AdminSnapshot = {
  hydrated: false,
  state: EMPTY,
  reports: {},
  saveFailed: false,
};

let snapshot: AdminSnapshot | null = null;
const listeners = new Set<() => void>();

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function isState(value: unknown): value is AdminState {
  const v = value as AdminState | null;
  return !!v && v.version === 1 && Array.isArray(v.jobs) && Array.isArray(v.candidates);
}

function loadFromStorage(): AdminSnapshot {
  const stored = readJson<unknown>(STATE_KEY);
  const state = isState(stored) ? stored : EMPTY;
  const reports: Record<string, ClientInterviewReport> = {};
  for (const c of state.candidates) {
    if (c.kind === "sample") {
      reports[c.interviewId] = clientGoldenReport;
      continue;
    }
    const report = readJson<ClientInterviewReport>(REPORT_PREFIX + c.interviewId);
    if (report?.record?.plan) {
      reports[c.interviewId] = report;
    }
  }
  return { hydrated: true, state, reports, saveFailed: false };
}

function current(): AdminSnapshot {
  if (!snapshot) {
    snapshot = loadFromStorage();
  }
  return snapshot;
}

function emit(next: AdminSnapshot) {
  snapshot = next;
  for (const l of Array.from(listeners)) {
    l();
  }
}

function writeState(state: AdminState) {
  let saveFailed = false;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    saveFailed = true;
  }
  emit({ ...current(), state, saveFailed });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab (e.g. a second recruiter tab) changed the data: reload it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("mmm42:admin:")) {
      emit(loadFromStorage());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAdmin(): AdminSnapshot {
  return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

// ---------- actions ----------

export function addJob(job: Omit<AdminJob, "id" | "createdAt">): AdminJob {
  const created: AdminJob = { ...job, id: newId("job"), createdAt: new Date().toISOString() };
  const state = current().state;
  writeState({ ...state, jobs: [created, ...state.jobs] });
  return created;
}

export function updateJob(id: string, patch: Partial<Omit<AdminJob, "id">>) {
  const state = current().state;
  writeState({ ...state, jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
}

export function deleteJob(id: string) {
  const state = current().state;
  for (const c of state.candidates.filter((c) => c.jobId === id)) {
    forgetReport(c.interviewId);
  }
  writeState({
    ...state,
    jobs: state.jobs.filter((j) => j.id !== id),
    candidates: state.candidates.filter((c) => c.jobId !== id),
  });
}

export function addCandidate(
  candidate: Omit<AdminCandidate, "id" | "createdAt" | "decision" | "notes" | "status">,
): AdminCandidate {
  const created: AdminCandidate = {
    ...candidate,
    id: newId("cand"),
    createdAt: new Date().toISOString(),
    status: "scheduled",
    decision: "undecided",
    notes: "",
  };
  const state = current().state;
  writeState({ ...state, candidates: [created, ...state.candidates] });
  return created;
}

export function updateCandidate(id: string, patch: Partial<Omit<AdminCandidate, "id">>) {
  const state = current().state;
  const before = state.candidates.find((c) => c.id === id);
  if (!before || Object.entries(patch).every(([k, v]) => before[k as keyof AdminCandidate] === v)) {
    return; // no-op writes would wake every listener on each status poll
  }
  writeState({
    ...state,
    candidates: state.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}

export function removeCandidate(id: string) {
  const state = current().state;
  const target = state.candidates.find((c) => c.id === id);
  if (target) {
    forgetReport(target.interviewId);
  }
  writeState({ ...state, candidates: state.candidates.filter((c) => c.id !== id) });
}

export function cacheReport(interviewId: string, report: ClientInterviewReport) {
  let saveFailed = false;
  try {
    window.localStorage.setItem(REPORT_PREFIX + interviewId, JSON.stringify(report));
  } catch {
    // Large whiteboard scenes can exceed the quota: keep a copy without artifacts instead.
    try {
      const slim: ClientInterviewReport = {
        ...report,
        record: {
          ...report.record,
          turns: report.record.turns.map(({ artifacts: _omit, ...t }) => t),
        },
      };
      window.localStorage.setItem(REPORT_PREFIX + interviewId, JSON.stringify(slim));
    } catch {
      saveFailed = true;
    }
  }
  const snap = current();
  emit({ ...snap, reports: { ...snap.reports, [interviewId]: report }, saveFailed });
}

function forgetReport(interviewId: string) {
  try {
    window.localStorage.removeItem(REPORT_PREFIX + interviewId);
  } catch {
    // Nothing stored.
  }
  const snap = current();
  if (snap.reports[interviewId]) {
    const { [interviewId]: _omit, ...rest } = snap.reports;
    snapshot = { ...snap, reports: rest };
  }
}

/** A labeled sample job with the recorded golden interview, so the console demos with no setup. */
export function loadSampleData(): AdminJob {
  const plan = clientGoldenReport.record.plan;
  const state = current().state;
  const existing = state.candidates.find((c) => c.kind === "sample");
  const existingJob = existing && state.jobs.find((j) => j.id === existing.jobId);
  if (existingJob) {
    return existingJob;
  }
  const job: AdminJob = {
    id: newId("job"),
    title: plan.roleTitle,
    jdText: plan.claims.map((c) => c.jdRequirement).join("\n"),
    createdAt: new Date().toISOString(),
  };
  const sample: AdminCandidate = {
    id: newId("cand"),
    jobId: job.id,
    name: "Sample candidate (recorded)",
    email: "",
    scheduledAt: clientGoldenReport.record.startedAt,
    durationMin: 15,
    interviewId: SAMPLE_INTERVIEW_ID,
    kind: "sample",
    status: "completed",
    decision: "undecided",
    notes: "",
    createdAt: new Date().toISOString(),
  };
  const next = { ...state, jobs: [job, ...state.jobs], candidates: [sample, ...state.candidates] };
  writeState(next);
  const snap = current();
  emit({ ...snap, reports: { ...snap.reports, [SAMPLE_INTERVIEW_ID]: clientGoldenReport } });
  return job;
}

export function resetAll() {
  const { candidates } = current().state;
  for (const c of candidates) {
    forgetReport(c.interviewId);
  }
  try {
    window.localStorage.removeItem(STATE_KEY);
  } catch {
    // Nothing stored.
  }
  emit({ hydrated: true, state: EMPTY, reports: {}, saveFailed: false });
}
