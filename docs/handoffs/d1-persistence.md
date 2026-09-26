# D1 persistence handoff

Branch: `feat/persistence-deploy`, based on `origin/main` `26c9b30`. There is no schema migration, no new library (`@supabase/supabase-js` is already a dependency) and no new auth layer.

## What changed

- **`src/lib/pipeline/supabase-session-store.ts`** implements `SessionStore`/`ReportStore` on the existing `response` table:
  - One row per attempt. `call_id` is the pipeline attempt ID (`plan.interviewId`). FoloUp already treats `call_id` as the per-attempt key for list clicks, view and status updates.
  - `interview_id` is the FoloUp role (`interview.id`) when the attempt came from a role link, otherwise null. It is a foreign key, so an unknown role is rejected with 400 `UNKNOWN_ROLE` before any row is written.
  - `details` holds the full server `InterviewRecord` (turns, artifacts, decisions, integrity events) plus `details.pipeline`: `lastRequestId`, `lastReply`, `finished`, `faceSignals` and the private `identityValues` used for blind scoring.
  - `analytics` is `{ evaluation, audit, integrity }`, written together when the report is saved. That write also sets `is_analysed`.
  - `is_ended` is set as soon as the interview finishes, so it lists right away and the report generates when first opened. `tab_switch_count` is the number of `tabBlur` events, and `duration` is the last turn end in seconds.
  - **CAS:** every save is `UPDATE … WHERE id = <row> AND details->pipeline->>lastRequestId = <expected>` (or `IS NULL` when expected is null). No matching row means 409 `STALE_TURN`; newer content is never overwritten, including across server instances. Retrying an accepted request returns the stored `lastReply`.
  - There is no unique index on `call_id` (that would need a migration). A create race is resolved explicitly: the oldest row wins, the loser deletes its own row and gets 409 `ALREADY_STARTED`.
  - Storage errors surface as 503 `STORAGE_UNAVAILABLE`, which is retryable and visible in C's error state.
  - Identity values are rehydrated into `scoring-context` on load. After a restart, planned attempts still use B's blind grader instead of falling back to the demo grader.
- **`src/lib/pipeline/session-store.ts`** chooses the store. `PIPELINE_STORAGE=supabase` uses the Supabase store; unset or `mock` uses the labeled in-memory mock. `X-Pipeline-Storage` now reports the real mode, and C's UI already displays it.
- **Service-role client:** created on the server only, from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix, so the key never reaches the browser). If `PIPELINE_STORAGE=supabase` is set and a key is missing, the first request fails with 503 `STORAGE_MISCONFIGURED` rather than silently using memory.
- **Role link:** the dashboard role page has an "AI interview link" button that copies `/interview?role=<interview.id>`. The role flows to `/api/pipeline/plan` (form field `roleId`) and to `/api/pipeline/start` (the additive contract field `StartRequest.roleId`, used for demo attempts). `/plan` also accepts optional `candidateName` / `candidateEmail`. They are stored in `response.name` / `email` only, never in the scored record.
- **`responses.service.ts` `getAllResponses`:** removed the Retell-only `.or("details.is.null, details->call_analysis.not.is.null")`. Rows of any shape are listed, and the page branches on shape.
- **Dashboard (`/interviews/[interviewId]`):**
  - Pipeline rows (`details.pipeline` or `analytics.evaluation`) render with `PipelineResponseItem`: name/email, average cited score, the evidence-strength mix, the integrity level (labeled as not a verdict), and a link to `/report/<call_id>`.
  - Retell rows keep the original code path; only the array they map over excludes pipeline rows.

## Checks run

- `npm run test:a2`: 16/16 pass.
- `npm run test:foundation`: 7/7 pass.
- `npm run test:persistence` (new), 8/8 pass. It runs the real turn/report services against an in-process fake of the Supabase query builder, with JSON round-trips:
  - a full planned attempt ending with `details`/`analytics`/`is_ended`/`tab_switch_count`/`duration` on one row, reopened by a fresh store instance;
  - cross-instance stale CAS rejection;
  - concurrent submits with a retry returning the stored reply;
  - a create race leaving one row;
  - an unknown role;
  - identity rehydration after a restart;
  - storage failure returning 503.
- HTTP smoke with `LLM_MODE=mock` (memory store): start → 8 turns → session all return 200.

## Not verified here

- **Live Supabase:** this checkout has no `.env`. Run with `PIPELINE_STORAGE=supabase`, the URL and service-role key, then check that the row appears, the dashboard lists it and `/report/<call_id>` renders.
- **Pre-existing mock-mode blocker** (engine/evaluator, not persistence):
  - A2 demo attempts (`mock-*`, `golden-sample-001`) use the demo grader, which returns no `{{term}}`. The follow-ups at t03/t15 are therefore worded generically, and B's mock evaluator only accepts the exact golden record, so `POST /api/pipeline/report` returns 502 for every demo attempt in mock mode. Reproduced over HTTP on this branch; those files are unchanged from main.
  - A mock-mode end-to-end report needs A3's planned path (`createPlannedAttempt` with the golden excerpts), which `test:persistence` exercises. A's fix would be for the demo path to use the same adjusted templates and B's golden grader.

## Known risks

- The legacy dashboard reads `response` rows in the browser with the anon key (`select("*")`), so pipeline `details` (transcript, planted issue, identity values) reach the recruiter's browser. What the anon key can read is decided by your RLS policies. A server route returning projected rows would close this; it was not in this task's scope.
- Attempts started without `?role=` are saved with `interview_id` null. They reopen at `/report/<id>` but aren't listed under any role.
