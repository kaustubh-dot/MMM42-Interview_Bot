import "server-only";

import type { SavedSession } from "../../types/pipeline-api";
import { PipelineError } from "./errors";

// MOCK ONLY: process-local memory is lost on restart and is not safe across server instances.
// D's service replaces this object with the same create/load/CAS-save methods.
export interface SessionStore {
  createSession(session: SavedSession): Promise<void>;
  loadSession(interviewId: string): Promise<SavedSession | null>;
  saveSession(session: SavedSession, expectedLastRequestId: string | null): Promise<void>;
}

export class MockSessionStore implements SessionStore {
  private readonly sessions = new Map<string, SavedSession>();

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
