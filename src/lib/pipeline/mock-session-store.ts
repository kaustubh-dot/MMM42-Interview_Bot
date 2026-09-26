import "server-only";

import type { InterviewReport } from "../../types/pipeline";
import type { SavedSession } from "../../types/pipeline-api";
import { PipelineError } from "./errors";

/** Row metadata set once when an attempt is created. Never part of the scored record. */
export interface AttemptMeta {
  roleId?: string; // FoloUp interview (role) ID from a role link
  candidateName?: string;
  candidateEmail?: string;
  identityValues?: readonly string[]; // private resume values for blind scoring
}

// MOCK ONLY: process-local memory is lost on restart and is not safe across server instances.
// supabase-session-store.ts implements the same create/load/CAS-save methods durably.
export interface SessionStore {
  createSession(session: SavedSession, meta?: AttemptMeta): Promise<void>;
  loadSession(interviewId: string): Promise<SavedSession | null>;
  saveSession(session: SavedSession, expectedLastRequestId: string | null): Promise<void>;
}

export interface ReportStore extends SessionStore {
  saveReport(interviewId: string, report: InterviewReport): Promise<void>;
  loadReport(interviewId: string): Promise<InterviewReport | null>;
}

export class MockSessionStore implements ReportStore {
  private readonly sessions = new Map<string, SavedSession>();
  private readonly reports = new Map<string, InterviewReport>();

  async saveReport(interviewId: string, report: InterviewReport): Promise<void> {
    this.reports.set(interviewId, structuredClone(report));
  }

  async loadReport(interviewId: string): Promise<InterviewReport | null> {
    const report = this.reports.get(interviewId);
    return report ? structuredClone(report) : null;
  }

  async createSession(session: SavedSession): Promise<void> {
    const id = session.record.plan.interviewId;
    if (this.sessions.has(id)) {
      throw new PipelineError("ALREADY_STARTED", "This attempt has already started.", 409);
    }
    this.sessions.set(id, structuredClone(session));
  }

  async loadSession(interviewId: string): Promise<SavedSession | null> {
    const session = this.sessions.get(interviewId);
    return session ? structuredClone(session) : null;
  }

  async saveSession(session: SavedSession, expectedLastRequestId: string | null): Promise<void> {
    const id = session.record.plan.interviewId;
    const stored = this.sessions.get(id);
    if (!stored || stored.lastRequestId !== expectedLastRequestId) {
      throw new PipelineError(
        "STALE_TURN",
        "Session changed while this answer was graded. Reload and retry.",
        409,
      );
    }
    this.sessions.set(id, structuredClone(session));
  }
}

// Share the mock across separately bundled Next route handlers and dev recompiles.
const processState = globalThis as typeof globalThis & { mmm42MockSessionStore?: MockSessionStore };
export const mockSessionStore = processState.mmm42MockSessionStore ?? new MockSessionStore();
processState.mmm42MockSessionStore = mockSessionStore;
