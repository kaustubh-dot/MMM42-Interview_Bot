import "server-only";

import { type ReportStore, mockSessionStore } from "./mock-session-store";
import { createSupabaseSessionStore } from "./supabase-session-store";

// PIPELINE_STORAGE=supabase keeps sessions and reports in the `response` table so any server
// instance can serve any turn. Unset (or "mock") keeps the labeled in-memory mock.
export type StorageMode = "supabase" | "mock-memory";

export const storageMode: StorageMode =
  process.env.PIPELINE_STORAGE === "supabase" ? "supabase" : "mock-memory";

const processState = globalThis as typeof globalThis & { mmm42SessionStore?: ReportStore };

function select(): ReportStore {
  if (storageMode === "mock-memory") {
    return mockSessionStore;
  }
  if (!processState.mmm42SessionStore) {
    processState.mmm42SessionStore = createSupabaseSessionStore();
  }
  return processState.mmm42SessionStore;
}

/** The configured store, created on first use so a missing key fails as a visible 503. */
export const sessionStore: ReportStore = {
  createSession: (session, meta) => select().createSession(session, meta),
  loadSession: (interviewId) => select().loadSession(interviewId),
  saveSession: (session, expected) => select().saveSession(session, expected),
  saveReport: (interviewId, report) => select().saveReport(interviewId, report),
  loadReport: (interviewId) => select().loadReport(interviewId),
};
