import "server-only";

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { InterviewRecord, InterviewReport } from "../../types/pipeline";
import type { FaceSignalAvailability, SavedSession, TurnReply } from "../../types/pipeline-api";
import { PipelineError } from "./errors";
import type { AttemptMeta, ReportStore } from "./mock-session-store";
import { planIdentities, rememberPlanIdentities } from "./scoring-context";

// Durable session/report store on FoloUp's existing `response` table (CLAUDE.md §4, no migration):
//   call_id          = pipeline attempt ID (plan.interviewId); one row per attempt
//   interview_id     = FoloUp role (interview.id) when the attempt was started from a role link
//   details          = InterviewRecord + `pipeline` session metadata (server-only fields)
//   analytics        = { evaluation, audit, integrity } once the report is generated
//   is_ended         = interview finished; tab_switch_count = number of tabBlur events
// Every write is compare-and-set on details.pipeline.lastRequestId, so a stale writer is
// rejected rather than overwriting a newer turn, even across server instances.

const TABLE = "response";
const LAST_REQUEST = "details->pipeline->>lastRequestId";

interface PipelineMeta {
  version: 1;
  lastRequestId: string | null;
  lastReply: TurnReply | null;
  finished: boolean;
  faceSignals: FaceSignalAvailability;
  // Private resume values for blind scoring. null marks A2's demo attempts (mock grader).
  identityValues: string[] | null;
}

type StoredDetails = InterviewRecord & { pipeline: PipelineMeta };

interface StoredAnalytics {
  evaluation: InterviewReport["evaluation"];
  audit: InterviewReport["audit"];
  integrity: InterviewReport["integrity"];
}

interface RowRef {
  id: number;
  identityValues: string[] | null;
}

function storageError(): never {
  throw new PipelineError(
    "STORAGE_UNAVAILABLE",
    "The interview could not be saved. Your answer was not lost; retry in a moment.",
    503,
  );
}

function isStoredDetails(value: unknown): value is StoredDetails {
  const v = value as StoredDetails | null;
  return (
    !!v &&
    typeof v === "object" &&
    !!v.plan &&
    Array.isArray(v.turns) &&
    !!v.pipeline &&
    v.pipeline.version === 1
  );
}

function recordOf(details: StoredDetails): InterviewRecord {
  const { pipeline: _meta, ...record } = details;
  return record;
}

function tabSwitches(record: InterviewRecord): number {
  return record.integrityEvents.filter((e) => e.kind === "tabBlur").length;
}

function durationSeconds(record: InterviewRecord): number {
  return Math.round(Math.max(0, ...record.turns.map((t) => t.endMs)) / 1000);
}

function toDetails(session: SavedSession, identityValues: string[] | null): StoredDetails {
  return {
    ...session.record,
    pipeline: {
      version: 1,
      lastRequestId: session.lastRequestId,
      lastReply: session.lastReply,
      finished: session.finished,
      faceSignals: session.faceSignals,
      identityValues,
    },
  };
}

function rowColumns(session: SavedSession, identityValues: string[] | null) {
  return {
    details: toDetails(session, identityValues),
    is_ended: session.finished,
    tab_switch_count: tabSwitches(session.record),
    duration: durationSeconds(session.record),
  };
}

export class SupabaseSessionStore implements ReportStore {
  // Row IDs and private identity values by attempt, so each save doesn't re-read them.
  private readonly refs = new Map<string, RowRef>();

  constructor(private readonly client: SupabaseClient) {}

  private remember(interviewId: string, id: number, details: StoredDetails) {
    const identityValues = details.pipeline.identityValues;
    this.refs.set(interviewId, { id, identityValues });
    // Rehydrate the blind-scoring context after a restart or on another instance.
    if (identityValues && planIdentities(interviewId) === null) {
      rememberPlanIdentities(interviewId, identityValues);
    }
  }

  /** Oldest row wins if a create race ever inserted two rows for one attempt. */
  private async firstRow(interviewId: string) {
    const { data, error } = await this.client
      .from(TABLE)
      .select("id, details, analytics")
      .eq("call_id", interviewId)
      .order("id", { ascending: true })
      .limit(1);
    if (error) {
      storageError();
    }
    return (data?.[0] as { id: number; details: unknown; analytics: unknown } | undefined) ?? null;
  }

  private async ref(interviewId: string): Promise<RowRef | null> {
    const cached = this.refs.get(interviewId);
    if (cached) {
      return cached;
    }
    const row = await this.firstRow(interviewId);
    if (!row || !isStoredDetails(row.details)) {
      return null;
    }
    this.remember(interviewId, row.id, row.details);
    return this.refs.get(interviewId) ?? null;
  }

  async createSession(session: SavedSession, meta: AttemptMeta = {}): Promise<void> {
    const interviewId = session.record.plan.interviewId;
    if (await this.firstRow(interviewId)) {
      throw new PipelineError("ALREADY_STARTED", "This attempt has already started.", 409);
    }
    if (meta.roleId) {
      const { data, error } = await this.client
        .from("interview")
        .select("id")
        .eq("id", meta.roleId)
        .limit(1);
      if (error) {
        storageError();
      }
      if (!data?.length) {
        throw new PipelineError("UNKNOWN_ROLE", "This interview link's role was not found.", 400);
      }
    }
    const identityValues = meta.identityValues ? [...meta.identityValues] : null;
    const { data, error } = await this.client
      .from(TABLE)
      .insert({
        call_id: interviewId,
        interview_id: meta.roleId ?? null,
        name: meta.candidateName ?? null,
        email: meta.candidateEmail ?? null,
        ...rowColumns(session, identityValues),
      })
      .select("id");
    const inserted = (data?.[0] as { id: number } | undefined)?.id;
    if (error || inserted === undefined) {
      storageError();
    }
    // No unique index on call_id (no migration), so resolve a concurrent create explicitly.
    const winner = await this.firstRow(interviewId);
    if (winner && winner.id !== inserted) {
      await this.client.from(TABLE).delete().eq("id", inserted);
      throw new PipelineError("ALREADY_STARTED", "This attempt has already started.", 409);
    }
    this.refs.set(interviewId, { id: inserted, identityValues });
  }

  async loadSession(interviewId: string): Promise<SavedSession | null> {
    const row = await this.firstRow(interviewId);
    if (!row || !isStoredDetails(row.details)) {
      return null;
    }
    this.remember(interviewId, row.id, row.details);
    const { pipeline } = row.details;
    return {
      record: recordOf(row.details),
      lastRequestId: pipeline.lastRequestId,
      lastReply: pipeline.lastReply,
      finished: pipeline.finished,
      faceSignals: pipeline.faceSignals,
    };
  }

  async saveSession(session: SavedSession, expectedLastRequestId: string | null): Promise<void> {
    const interviewId = session.record.plan.interviewId;
    const ref = await this.ref(interviewId);
    if (!ref) {
      throw new PipelineError("UNKNOWN_ATTEMPT", "Interview attempt not found.", 404);
    }
    const update = this.client
      .from(TABLE)
      .update(rowColumns(session, ref.identityValues))
      .eq("id", ref.id);
    const guarded =
      expectedLastRequestId === null
        ? update.is(LAST_REQUEST, null)
        : update.eq(LAST_REQUEST, expectedLastRequestId);
    const { data, error } = await guarded.select("id");
    if (error) {
      storageError();
    }
    if (!data?.length) {
      throw new PipelineError(
        "STALE_TURN",
        "Session changed while this answer was graded. Reload and retry.",
        409,
      );
    }
  }

  async saveReport(interviewId: string, report: InterviewReport): Promise<void> {
    const ref = await this.ref(interviewId);
    if (!ref) {
      throw new PipelineError("UNKNOWN_ATTEMPT", "Interview attempt not found.", 404);
    }
    const analytics: StoredAnalytics = {
      evaluation: report.evaluation,
      audit: report.audit,
      integrity: report.integrity,
    };
    const { data, error } = await this.client
      .from(TABLE)
      .update({
        analytics,
        is_analysed: true,
        is_ended: true,
        tab_switch_count: tabSwitches(report.record),
      })
      .eq("id", ref.id)
      .select("id");
    if (error || !data?.length) {
      storageError();
    }
  }

  async loadReport(interviewId: string): Promise<InterviewReport | null> {
    const row = await this.firstRow(interviewId);
    const analytics = row?.analytics as Partial<StoredAnalytics> | null | undefined;
    if (
      !row ||
      !isStoredDetails(row.details) ||
      !analytics?.evaluation ||
      !analytics.audit ||
      !analytics.integrity
    ) {
      return null;
    }
    this.remember(interviewId, row.id, row.details);
    return {
      record: recordOf(row.details),
      evaluation: analytics.evaluation,
      audit: analytics.audit,
      integrity: analytics.integrity,
    };
  }
}

/**
 * Server-side client with the service-role key. The key bypasses RLS, so it must only ever be
 * read on the server (no NEXT_PUBLIC_ prefix) and is never sent to the browser.
 */
export function createSupabaseSessionStore(): SupabaseSessionStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new PipelineError(
      "STORAGE_MISCONFIGURED",
      "PIPELINE_STORAGE=supabase needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      503,
    );
  }
  return new SupabaseSessionStore(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
}
