import "server-only";

import type { InterviewReport } from "../../types/pipeline";
import { auditEvaluation } from "./audit";
import { validateCitation } from "./citations";
import { toClientReport } from "./client-projection";
import { PipelineError } from "./errors";
import { evaluateRecord } from "./evaluate";
import { fuseIntegrity } from "./integrity";
import type { ReportStore } from "./mock-session-store";
import { scoringRecord } from "./scoring-context";
import { sessionStore } from "./session-store";
import { id, withInterviewLock } from "./turn-service";

// Retain a completed result if saving fails so retrying does not run another auditor.
// MOCK ONLY: D needs durable coordination for multiple processes and restarts.
const state = globalThis as typeof globalThis & {
  mmm42PendingReports?: Map<string, InterviewReport>;
};
const pending = state.mmm42PendingReports ?? new Map<string, InterviewReport>();
state.mmm42PendingReports = pending;

export async function generateReport(raw: unknown, store: ReportStore = sessionStore) {
  const interviewId = id(
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).interviewId : null,
    "interviewId",
  );
  return withInterviewLock(interviewId, async () => {
    const existing = await store.loadReport(interviewId);
    if (existing) {
      return { report: toClientReport(existing) };
    }
    const session = await store.loadSession(interviewId);
    if (!session) {
      throw new PipelineError("UNKNOWN_ATTEMPT", "Interview attempt not found.", 404);
    }
    if (!session.finished) {
      throw new PipelineError(
        "INTERVIEW_INCOMPLETE",
        "Finish the interview before generating a report.",
        409,
      );
    }
    let report = pending.get(interviewId);
    if (!report) {
      const blindRecord = scoringRecord(session.record);
      // B returns the validated evaluation, including its original removedUncited count.
      const evaluation = await evaluateRecord(blindRecord);
      const citations = [
        ...evaluation.perClaim.flatMap((claim) => claim.citations),
        ...(evaluation.candidateFeedback ?? []).map((item) => item.citation),
      ];
      if (citations.some((citation) => !validateCitation(session.record, citation))) {
        throw new PipelineError(
          "EVALUATION_INVALID",
          "Evidence does not match the saved transcript. Retry report generation.",
          502,
        );
      }
      const audit = await auditEvaluation(blindRecord, evaluation);
      // Question issue timestamps are not browser TTS-completion timestamps. Suppress only
      // the latency input until C's timing contract is coordinated; event signals still fuse.
      const integrity = fuseIntegrity({ ...session.record, turns: [] }, session.faceSignals);
      report = { record: session.record, evaluation, audit, integrity };
      pending.set(interviewId, report);
    }
    await store.saveReport(interviewId, report);
    pending.delete(interviewId);
    return { report: toClientReport(report) };
  });
}

export async function readReport(interviewId: string, store: ReportStore = sessionStore) {
  const report = await store.loadReport(id(interviewId, "interviewId"));
  if (!report) {
    throw new PipelineError("REPORT_NOT_FOUND", "No saved report exists for this attempt.", 404);
  }
  return { report: toClientReport(report) };
}
