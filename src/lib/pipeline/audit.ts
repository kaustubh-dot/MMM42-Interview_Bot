import { goldenReport } from "@/fixtures/golden-interview";
import { redactIdentityText } from "@/lib/prompts/pipeline/blind";
import type { Audit, AuditCheck, Evaluation, InterviewRecord } from "@/types/pipeline";
import { validateEvaluation } from "./citations";
import { buildBlindEvaluationInput, isGoldenSpokenRecord, recordIdentityValues } from "./evaluate";

export const AUDIT_CHECK_TITLES = [
  "Leading or unfair questions",
  "Inconsistent scoring across similar-quality answers",
  "Unjustified bias toward phrasing or keywords",
] as const;

export function buildBlindAuditInput(record: InterviewRecord, evaluation: Evaluation) {
  const validated = validateEvaluation(record, evaluation);
  const identities = recordIdentityValues(record);
  const redact = (text: string) => redactIdentityText(text, identities);
  return {
    ...buildBlindEvaluationInput(record),
    evaluation: {
      perClaim: validated.perClaim.map((claim) => ({
        claimId: claim.claimId,
        score: claim.score,
        evidenceStrength: claim.evidenceStrength,
        needsHumanReview: claim.needsHumanReview,
        rationale: redact(claim.rationale),
        citations: claim.citations.map(({ turnId, start, end, quote }) => ({
          turnId,
          start,
          end,
          quote: redact(quote),
        })),
      })),
    },
  };
}

/** Strict three-check shape; model precomputed flags/counterfactual fields never survive. */
export function validateAudit(record: InterviewRecord, raw: unknown): Audit {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !("checks" in raw) ||
    !Array.isArray(raw.checks) ||
    raw.checks.length !== 3
  ) {
    throw new Error("Fairness audit must contain exactly the three fixed checks.");
  }
  const turns = new Set(record.turns.map((turn) => turn.id));
  const checks: AuditCheck[] = [];
  const ids = new Set<number>();
  for (const item of raw.checks) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      (item.id !== 1 && item.id !== 2 && item.id !== 3) ||
      ids.has(item.id) ||
      (item.status !== "pass" && item.status !== "concern") ||
      !Array.isArray(item.findings)
    ) {
      throw new Error("Fairness audit returned a missing, duplicate or invalid check.");
    }
    const findings: AuditCheck["findings"] = [];
    for (const finding of item.findings) {
      if (
        typeof finding !== "object" ||
        finding === null ||
        Array.isArray(finding) ||
        typeof finding.text !== "string" ||
        !finding.text.trim() ||
        !Array.isArray(finding.turnIds) ||
        !finding.turnIds.every((id: unknown) => typeof id === "string" && turns.has(id))
      ) {
        throw new Error("Fairness audit finding must reference existing transcript turns.");
      }
      findings.push({ text: finding.text, turnIds: Array.from(new Set<string>(finding.turnIds)) });
    }
    checks.push({
      id: item.id,
      title: AUDIT_CHECK_TITLES[item.id - 1],
      status: item.status,
      findings,
    });
    ids.add(item.id);
  }
  return { checks: checks.sort((a, b) => a.id - b.id), precomputed: false };
}

/**
 * Precomputed fixture stub until A1. Live integration must make exactly one
 * generateJson({ task: "audit", ... }) call using AUDIT_SYSTEM_PROMPT and
 * buildBlindAuditInput, then validateAudit. Do not retry or rescore here;
 * A's report route must cache completed reports for request retries.
 */
export async function auditEvaluation(
  record: InterviewRecord,
  evaluation: Evaluation,
): Promise<Audit> {
  if (
    process.env.LLM_MODE !== "mock" ||
    !isGoldenSpokenRecord(record) ||
    JSON.stringify(evaluation.perClaim) !== JSON.stringify(goldenReport.evaluation.perClaim)
  ) {
    throw new Error(
      "Auditor integration is pending A1. Only the unchanged golden record/evaluation with LLM_MODE=mock has a precomputed audit.",
    );
  }
  const audit = validateAudit(record, structuredClone(goldenReport.audit));
  return {
    ...audit,
    precomputed: true,
    counterfactual: structuredClone(goldenReport.audit.counterfactual),
  };
}
