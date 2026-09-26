import "server-only";

import type { InterviewRecord } from "../../types/pipeline";
import { redactIdentityText } from "../prompts/pipeline/blind";

// MOCK PRIVATE METADATA: D must persist this alongside the full record before durable integration.
// No shared/browser contract change. Never return this map or a masked copy as the saved transcript.
const processState = globalThis as typeof globalThis & {
  mmm42PlanIdentities?: Map<string, string[]>;
};
const contexts = processState.mmm42PlanIdentities ?? new Map<string, string[]>();
processState.mmm42PlanIdentities = contexts;

export function rememberPlanIdentities(interviewId: string, values: readonly string[]): void {
  contexts.set(interviewId, [...values]);
}

export function planIdentities(interviewId: string): string[] | null {
  const values = contexts.get(interviewId);
  return values ? [...values] : null;
}

export function scoringRecord(record: InterviewRecord): InterviewRecord {
  const identities = planIdentities(record.plan.interviewId) ?? [];
  const masked = structuredClone(record);
  for (const turn of masked.turns) {
    turn.text = redactIdentityText(turn.text, identities);
  }
  for (const claim of masked.plan.claims) {
    claim.claimText = redactIdentityText(claim.claimText, identities);
    claim.resumeEvidence = redactIdentityText(claim.resumeEvidence, identities);
    claim.skillArea = redactIdentityText(claim.skillArea, identities);
  }
  return masked;
}
