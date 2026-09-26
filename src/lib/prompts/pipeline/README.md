# B1–B2 handoff

A1 (`97838f2`) is merged into `feat/evaluation-integrity`. All model calls use A's server-only `generateJson` and the shared `GradeInput`, `GradeResult`, `LlmRequest` and `FaceSignalAvailability` types. No shared contract, route, dependency, fixture or UI changes are included.

## Imports and report assembly

```ts
import { gradeAnswer } from "@/lib/pipeline/grade";
import { validateEvaluation } from "@/lib/pipeline/citations";
import { evaluateRecord } from "@/lib/pipeline/evaluate";
import { auditEvaluation } from "@/lib/pipeline/audit";
import { fuseIntegrity } from "@/lib/pipeline/integrity";
import { toClientReport } from "@/lib/pipeline/client-projection";

// Use the trusted server record and persisted face availability.
const evaluation = await evaluateRecord(record);
const audit = await auditEvaluation(record, evaluation);
const integrity = fuseIntegrity(record, faceSignals);
const report = { record, evaluation, audit, integrity };
// Persist the full report, then project before returning it to C.
return toClientReport(report);
```

`gradeAnswer` takes the actual plan rubric, claim ID, AI question and spoken answer. It returns a validated 0–3 grade plus candidate-derived term/quote, or null for unsupported optional words. Silence deterministically returns grade 0; no artifact can change it. Nonempty answers make one model call.

`validateEvaluation(record, raw)` is pure and accepts unknown output. It keeps only exact nonempty candidate quotations from the same assessed claim, rejects ambiguous IDs and invalid scores, filters invalid citations, deduplicates retained claims, and counts removed scores. It derives strength and ladder paths from recorded turns/grades. Revalidation of an already filtered evaluation recounts removals from that input; use `evaluateRecord`'s returned `removedUncited` in the report rather than validating it a second time.

`evaluateRecord` makes one blind evaluation call and validates citations against both the visible projection and original transcript. `auditEvaluation` makes exactly one separate auditor call, with the three fixed checks, no internal retries and no rescoring. A must cache completed reports so a retried report request does not repeat the auditor. Live audits have `precomputed: false`; model-supplied experiment fields are discarded and experiment claims in live findings are rejected.

`fuseIntegrity` is pure, has no evaluation input and never changes a score. The returned disclaimer is required in C's display. The six signals contain names, values, units, thresholds, points, availability and benign explanations. Missing face signals contribute zero. `Turn.startMs` must be actual first-word speech time, relative to the preceding question's completion, never the Submit timestamp. Empty, overlapping or invalid timing is excluded; at least four usable delays and a positive mean are needed for the CV rule.

## Fixture development and labels for C

Set `LLM_MODE=mock`. No Gemini key or network is used. The grader supports the golden question/answer pairs. Evaluation/audit require identical golden spoken content, questions, rubric and recorded grades; a fresh attempt ID is allowed. Unknown mock interviews fail explicitly rather than receiving invented fixture scores.

The sample produces PostgreSQL 2 / mixed / human review; Caching 1 / strong; Distributed systems 3 / strong. Collaboration is unassessed and absent from `perClaim`. One unsupported score is removed. Integrity is **Medium / 3 points**: two tab switches contribute 2 and one sustained look-away contributes 1. The three audit checks and counterfactual results exactly match the existing golden fixture, with `precomputed: true`. Counterfactuals are sample-only. Saved code/drawings are **supporting artifact — human review**; they are absent from all scoring/audit model inputs.

The private golden fixture and scoring services are server-only. C should consume A's safe fixture/API projections, not import these services into client components.

## Redaction boundary and integration request to A

`buildBlindEvaluationInput`, `buildBlindGradeInput`, `buildBlindAuditInput`, `recordIdentityValues` and the helpers in `blind.ts` use explicit field allowlists. They omit candidate labels, raw resume/JD evidence, artifacts, hidden answers, timing and integrity. Contextual name/school/employer introductions and email addresses seed redaction, including repeated mentions. Masks preserve every original UTF-16 offset; hidden spans cannot be cited, and the saved transcript is never rewritten.

The shared record does not carry a complete list of original names, schools or employers. Contextual detection cannot guarantee removal of every unmarked identity mention in arbitrary speech. **A: coordinate a complete identity-values/spans handoff or upstream anonymized projection before describing live evaluation as fully blind.** The local projection helpers accept known values, but the documented service signatures and shared types remain unchanged pending that agreement. Grading should receive the same anonymized spoken text. No identity-extraction model pass is added.

## Focused checks

```sh
npm ci
npm run test:foundation
node --conditions=react-server --test src/lib/prompts/pipeline/evaluation-integrity.test.cjs
npx tsc --noEmit --pretty false
npx biome check src/lib/pipeline/{citations,grade,evaluate,audit,integrity}.ts src/lib/prompts/pipeline
```

The B-owned suite uses Node's built-in test runner and the existing TypeScript dependency. It covers exact citation rejection, artifact boundaries, thin/mixed strength, offset-preserving redaction, full mock fixture equality, validated/intercepted Gemini responses, one audit pass on success and failure, sample-only experiments, integrity bands/availability, and first-word latency boundaries. Live Gemini credentials, A2/A3 routes and browser capture are outside these module checks.
