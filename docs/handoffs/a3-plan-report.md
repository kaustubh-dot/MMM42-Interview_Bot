# A3 plan and report handoff

Base: `383068c` (A2 PR #4 merged after user authorization). B PR #3 is available
and integrated. D's `pipeline-records.service.ts` is absent. No published shared
types, rule constants, dependencies, or lockfiles changed. Do not merge the A3 PR.

## APIs

All responses are allowlist projections with `Cache-Control: no-store`,
`X-Pipeline-Mode: mock|gemini` and `X-Pipeline-Storage: mock-memory`.

| Route | Input | Success (200) |
| --- | --- | --- |
| `POST /api/pipeline/plan` | multipart `resume` PDF + `jdText` or `jd` PDF | `{plan: ClientInterviewPlan}`; saves an unstarted session |
| `POST /api/pipeline/start` | `{interviewId, requestId}` | `TurnReply`; activates a saved plan |
| `POST /api/pipeline/turn` | existing `SubmitTurnRequest` | `TurnReply`; B grades spoken text only |
| `GET /api/pipeline/session?interviewId=…` | ID | `{record, finished}` |
| `POST /api/pipeline/report` | `{interviewId}` | `{report: ClientInterviewReport}`; requires finished session |
| `GET /api/pipeline/report?interviewId=…` | ID | same saved report shape |

Errors remain `{error:{code,message}}`: 400 `INVALID_PDF`, `INVALID_INPUT`,
`MOCK_INPUT_UNSUPPORTED` (plus A2 validation codes); 404 `UNKNOWN_ATTEMPT` or
`REPORT_NOT_FOUND`; 409 `NOT_STARTED`, `INTERVIEW_INCOMPLETE` or existing conflicts;
502 `PLAN_INVALID`, `EVALUATION_INVALID`, `UPSTREAM_FAILURE`. Provider payloads stay
private. PDFs must be readable text PDFs ≤5 MiB; extracted sources ≤100 KiB each.

Set `LLM_MODE=gemini` and `GEMINI_API_KEY` for arbitrary resume/JD inputs. The existing
adapter handles all model calls. Complete ladders, unique IDs, verbatim evidence,
0–1 weights, opening grounding/intent, and workspace consistency are validated;
rank is computed as `jdWeight * (1-specificity)`. Validation cannot guarantee
semantic question quality. Invalid plans create no session. Hidden issue fields
are never projected; artifacts are supporting material, never scored or executed.

## Mock path and exports for C

Set `LLM_MODE=mock`; upload a PDF containing the resume evidence lines from
`clientGoldenReport.record.plan.claims`, and paste their JD requirement lines.
Other documents fail explicitly. Start the returned ID and replay the golden
candidate answers. The mock plan adapts two follow-ups to B's exact fixture
question/answer expectations; it does not alter live generation or B's modules.
The legacy `mock-*` A2 entry keeps its Surface fallback and is not the A3 report demo.

- `plan.ts`: `validatePlan`, `generatePlan`, `createPlannedAttempt`, `mockPlanSources` (server only).
- `report.ts`: `generateReport`, `readReport` (server only).
- `report-status.ts`: browser-safe `claimAssessmentStatuses(report)` returns
  `assessed`, `no_supported_score`, or `not_assessed`; missing scores are not zero.
- Existing turn-service exports remain; `withInterviewLock` serializes reports/turns locally.

Reports call B's validated evaluator, then one auditor pass, then independent
integrity fusion. Original `removedUncited` survives. Report retries/reloads reuse
the saved result; a completed pending result survives a save failure in this process.
An evaluator/auditor failure leaves accepted turns intact for another report request.
Sample counterfactuals retain B's `precomputed:true` label; live output has no invented experiment.

## Remaining integration

- D: replace default `mockSessionStore` with the published create/load/CAS-save,
  saveReport/loadReport service. Persist server identity metadata from
  `scoring-context.ts` alongside session data, restoring it before grading/reports.
  Durable report uniqueness/coordination must replace local locks and pending cache.
  Memory is lost on restart and is not shared across instances.
- B: plan-time grounded identity values feed B's masking helper on scoring copies.
  Masks preserve UTF-16 offsets; exact saved turns remain untouched. This is
  best-effort redaction, not a guarantee of complete anonymization.
- B/C: agree on actual browser TTS completion before enabling latency scoring.
  Report fusion currently receives no turn timing, so latency is unavailable/zero;
  event signals still work and never affect evaluation scores.
- C/D: check one real Excalidraw scene through submission, persistence and reload.
  No matching C chat was identifiable in the available thread list; this gate is open.

## Checks

- Existing foundation 7/7, A2 16/16, B 36/36 passed. A2's existing runner gained
  alias resolution and one regression for a review-found generic-opening bug;
  no new test framework or suite was added.
- Full TypeScript and scoped Biome checks passed.
- One localhost Next HTTP smoke passed: PDF/JD → plan → start → eight B-graded
  answers → cached report POST/GET, exact transcript/citations, retained code,
  hidden-field exclusion, removed unsupported score and disabled latency.
- Gemini credentials/browser speech/real Excalidraw/durable storage are unverified.
  Full build was not rerun: inherited missing-Supabase page-collection blocker is unchanged.
