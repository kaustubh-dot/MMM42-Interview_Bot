import "server-only";

import { goldenReport } from "@/fixtures/golden-interview";
import { LlmError, generateJson } from "@/lib/llm";
import { AUDIT_SYSTEM_PROMPT } from "@/lib/prompts/pipeline/audit";
import { identityValuesFrom, redactIdentityText } from "@/lib/prompts/pipeline/blind";
import type { Audit, AuditCheck, Evaluation, InterviewRecord } from "@/types/pipeline";
import type { LlmRequest } from "@/types/pipeline-api";
import { validateEvaluation } from "./citations";
import { buildBlindEvaluationInput, isGoldenSpokenRecord, recordIdentityValues } from "./evaluate";

export const AUDIT_CHECK_TITLES = [
  "Leading or unfair questions",
  "Inconsistent scoring across similar-quality answers",
  "Unjustified bias toward phrasing or keywords",
] as const;

function sampleEvaluationSignature(evaluation: Evaluation): string {
  return JSON.stringify(
    evaluation.perClaim
      .map((claim) => ({
        claimId: claim.claimId,
        score: claim.score,
        evidenceStrength: claim.evidenceStrength,
        needsHumanReview: claim.needsHumanReview,
        rationale: claim.rationale,
        citations: claim.citations.map(({ turnId, start, end, quote }) => ({
          turnId,
          start,
          end,
          quote,
        })),
        ladderPath: claim.ladderPath,
      }))
      .sort((a, b) => a.claimId.localeCompare(b.claimId)),
  );
}

export function buildBlindAuditInput(record: InterviewRecord, evaluation: Evaluation) {
  const validated = validateEvaluation(record, evaluation);
  const identities = recordIdentityValues(
    record,
    identityValuesFrom(validated.perClaim.map((claim) => claim.rationale)),
  );
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

/** Exactly one auditor call, with no retries or rescoring. A caches completed reports on retry. */
export async function auditEvaluation(
  record: InterviewRecord,
  evaluation: Evaluation,
): Promise<Audit> {
  const source = structuredClone(record);
  const evaluated = structuredClone(evaluation);
  const sample =
    isGoldenSpokenRecord(source) &&
    sampleEvaluationSignature(evaluated) === sampleEvaluationSignature(goldenReport.evaluation);
  const mockOutput = sample
    ? {
        checks: goldenReport.audit.checks.map(({ id, status, findings }) => ({
          id,
          status,
          findings: findings.map(({ text, turnIds }) => ({ text, turnIds: [...turnIds] })),
        })),
      }
    : null;
  if (process.env.LLM_MODE === "mock" && mockOutput === null) {
    // MOCK ONLY: never fake a pass. Each check is marked for human review and says it was not run.
    return {
      precomputed: false,
      checks: AUDIT_CHECK_TITLES.map((title, index) => ({
        id: (index + 1) as 1 | 2 | 3,
        title,
        status: "concern" as const,
        findings: [
          {
            text: "Not checked: demo mode does not run the auditor. A person should review this check.",
            turnIds: [],
          },
        ],
      })),
    };
  }
  const request: LlmRequest = {
    task: "audit",
    system: AUDIT_SYSTEM_PROMPT,
    input: buildBlindAuditInput(source, evaluated),
    mockOutput,
  };
  const mode = process.env.LLM_MODE;
  const raw = await generateJson(request);
  let audit: Audit;
  try {
    audit = validateAudit(source, raw);
  } catch {
    throw new LlmError("LLM_INVALID_RESPONSE", "Auditor returned an invalid three-check audit.");
  }
  if (mode === "mock" && sample) {
    return {
      ...audit,
      precomputed: true,
      counterfactual: structuredClone(goldenReport.audit.counterfactual),
    };
  }
  if (
    audit.checks.some((check) =>
      check.findings.some((finding) =>
        /\b(?:counterfactual|placebo|rescoring)\b/i.test(finding.text),
      ),
    )
  ) {
    throw new LlmError(
      "LLM_INVALID_RESPONSE",
      "Live audit findings must not claim an unrequested counterfactual or placebo experiment.",
    );
  }
  return audit;
}
