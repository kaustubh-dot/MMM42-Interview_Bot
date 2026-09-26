# A2 interview engine handoff

Branch: `feat/interview-engine`. Base: A1 merge `97838f2`. A2 is a focused PR;
do not merge it from the implementation chat. A3 plan/report generation is not included.

## Endpoints and mock entry

Run `npm ci`, then in PowerShell:

```powershell
$env:LLM_MODE = 'mock'
npm run dev
```

All three routes return `Cache-Control: no-store` and `X-Pipeline-Mode: mock`.
The store is **mock process memory**, shared across route bundles in one process.
It survives a same-process dev recompile, but is lost on restart and is not durable
or shared across server instances. C must visibly label this mode.

| Route | Input | Success (200) |
| --- | --- | --- |
| `POST /api/pipeline/start` | Published `StartRequest` | Published `TurnReply` with opening question |
| `POST /api/pipeline/turn` | Published `SubmitTurnRequest` | Published `TurnReply` with next question or completion |
| `GET /api/pipeline/session?interviewId=…` | Attempt ID | `{ record: ClientInterviewRecord, finished: boolean }` |

Use a fresh `mock-*` attempt ID per candidate. `golden-sample-001` remains accepted
for fixture replay. IDs starting `mock-whiteboard-*` use a separately labeled
whiteboard variant of the golden plan's top claim. Start creates the server plan
from the private fixture, so no A3 endpoint or uploaded resume is needed.
Unrecognized IDs return 404. Start requires explicit `LLM_MODE=mock`; other modes
return 502 instead of silently pretending the mock is live.

Example from C's browser code:

```ts
const interviewId = `mock-${crypto.randomUUID()}`;
const opening = await fetch('/api/pipeline/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ interviewId, requestId: crypto.randomUUID() }),
}).then(r => r.json());

const submission = {
  interviewId,
  requestId: crypto.randomUUID(), // retain this ID and body while retrying
  expectedTurnId: opening.nextQuestion.id,
  text: 'The exact spoken transcript, without trimming or appended code.',
  startMs: 1200, // actual first speech time, relative to startedAt
  endMs: 4300,
  integrityEvents: [],
  faceSignals: { available: false },
};
const next = await fetch('/api/pipeline/turn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(submission),
}).then(r => r.json());
```

Check `response.ok` before using JSON as `TurnReply`. Retain the draft on all
failures. On 409, fetch the session to restore accepted state. A retry of the most
recent accepted answer returns its stored reply without a second grade/save.
Older question submissions are stale and return 409; A1 stores the last receipt,
not an unbounded request ledger. Reusing that receipt ID with different text,
timing, question, or artifact returns `REQUEST_ID_REUSED`.

The default grader is **fixture-backed mock behavior**: exact golden candidate
answers get their scripted grades; other answers get Surface (1). It always
returns null term/quote, exercising the safe question fallback. This is not a
performance estimate. Replay the first two answers from `clientGoldenReport`
to reach `scenarioTwist` (code by default; whiteboard for `mock-whiteboard-*`).

The closing AI turn is saved with `TIME_UP`; `nextQuestion` is null and `finished`
is true. No extra question consumes a budget during completion. Completion may
mean max questions or no unvisited claims. No evaluation/report is generated in A2.

### Errors

Every error has `{ error: { code: string, message: string } }`. Provider exceptions
are not forwarded. IDs use letters, digits, `_`, or `-` (maximum 128 characters).

| HTTP | Codes | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_INPUT` | Malformed JSON, missing/invalid fields, timings/events, contradictory legacy typedAnswer |
| 400 | `INVALID_ARTIFACT`, `ARTIFACT_TOO_LARGE` | Wrong workspace/kind, malformed scene, multiple artifacts, byte limit exceeded |
| 400 | `INVALID_PLAN` | Missing ranked claim/budget in a server-provided plan |
| 404 | `UNKNOWN_ATTEMPT` | No session or mock plan entry |
| 409 | `ALREADY_STARTED`, `REQUEST_ID_REUSED`, `STALE_TURN`, `INVALID_SESSION` | Attempt/request conflict or invalid saved state |
| 502 | `MOCK_ONLY`, `GRADER_UNAVAILABLE`, `GRADE_INVALID`, `UPSTREAM_FAILURE` | Mode mismatch, missing live grader, invalid grade, model/store failure |

## Exports and boundaries

- `select-next.ts`: `selectNext(plan, area, grade, totalAsked, visited): Selection`.
  Pure; inputs are never mutated. Uses A1 constants and exact fixture precedence.
- `engine.ts`: `createOpeningSession`, `advanceInterview`, `questionText`,
  `questionWorkspace`, `GradeAnswer`, `CLOSING_TEXT` and `PipelineError` re-export.
  Engine constructs a new session only after successful grading. Callers commit
  it atomically; failure leaves the last accepted session available for retry.
- `answer-artifact.ts`: `validateArtifacts` and `questionWorkspace`.
- `turn-service.ts`: `startAttempt(raw, store?)`,
  `submitCandidateTurn(raw, store?, grader?)`, `readSession(interviewId, store?)`.
  Validates public requests, serializes same-process submissions per attempt,
  and uses expected prior request ID for compare-and-swap saves.
- `mock-session-store.ts`: `SessionStore`, `MockSessionStore`, `mockSessionStore`.
  Implements the published D create/load/save signatures with cloning and CAS.
- `mock-grader.ts`: `mockGradeAnswer(input: GradeInput): Promise<GradeResult>`.
  Reuses A1 `generateJson`; refuses Gemini mode while B is absent.
- `http.ts`: response/JSON helpers, safe error mapping and explicit mock header.

Only `GradeInput` reaches the grader: rubric, claim ID, question text, and exact
spoken answer. Code, drawings, identity and integrity are excluded. No code is
executed. Integrity is retained for B, never used by selection/scoring. All API
records use A1's allowlist projection; `plantedIssue` and store metadata stay private.

### Artifacts for C

Find the active claim in `reply.record.plan.claims` using `nextQuestion.claimId`.
Open a workspace only for technical `scenarioTwist`; use explicit workspace
kind, falling back to code when a legacy code snippet exists. Read the whiteboard
prompt from `ladder.workspace.prompt` and code starter from `ladder.codeSnippet`.
Other rungs are spoken. Artifacts are supporting material for human review only.

- At most one artifact, matching the current question. Empty artifacts array is valid.
- Code: UTF-8 byte length <=102400; language is 1–32 letters/digits/`+.#_-`.
  An explicit empty code string remains saved. `typedAnswer` is derived on the
  server. New requests omit it; a legacy duplicate must equal the artifact code.
- Scene: UTF-8 byte length <=512000; top-level `elements` array and optional
  `appState` only. Display state only allows hex `viewBackgroundColor`.
  Drawing elements support rectangle, ellipse, diamond, text, arrow, line and
  freedraw with finite geometry. Unknown element fields, images, external links,
  binary/file and collaborator data are rejected. Send only the supported scene
  snapshot, not the entire Excalidraw application state. The explicit `sceneJson`
  empty string becomes `{"elements":[],"appState":{}}`; a JSON empty-elements
  scene is also valid. Saved nonempty scene strings are unchanged.
- `Turn.text` is never normalized or rewritten, even for whitespace, Unicode,
  cleared answers, or artifact submissions. Citations continue using its offsets.

### B integration

No `src/lib/pipeline/grade.ts` or other B exports exist at this base. Once B's
`gradeAnswer(input: GradeInput): Promise<GradeResult>` is merged, replace the
default `mockGradeAnswer` import/argument in `turn-service.ts` with that export.
The engine's injection point already matches it. B owns prompts and schemas;
no competing live grader/evaluator/audit/citation/integrity module was added.
Keep A1's adapter, validate grade 0–3, and supply only spoken scoring evidence.
Update the mode header and mock start gating when wiring live mode. A3 owns
real plan generation and report orchestration after this PR's review.

### D integration

No `src/services/pipeline-records.service.ts` exists at this base. After D's
service merges, provide its `createSession`, `loadSession`, and `saveSession`
methods as `SessionStore` in `turn-service.ts` (or change the default store).
Store full server `SavedSession` fields in the existing `response.details`
mapping. Make create unique per attempt and save atomic against
`expectedLastRequestId`; translate database conflicts to `PipelineError` 409.
The process lock is a mock convenience, not distributed protection: CAS must
remain authoritative across instances. A retry after process restart relies on
persisted `lastRequestId`/`lastReply`. No database/schema changes were made.

## Contract and risks for review

No published shared type, rubric, rule constant, fixture, or adapter changed.
There are no new dependencies or lockfile changes. Existing yarn changes caused
by install scripts were reverted to the initially clean copy.

- Store/grader remain mocks. No live Gemini grading, durable reload, or UI/editor
  rendering is claimed. C's safe fixture replay remains independent.
- AI `startMs=endMs` denotes server question issuance, not observed browser TTS
  completion. The published submit contract has no TTS completion timestamp.
  B/C/A must agree on that additional timing handoff before deriving first-word
  latency from live records; do not score latency against these issuance times.
  Candidate timing is passed through unchanged. This is an unresolved integration
  risk, not a fabricated speech measurement.
- A1's last-receipt model supports retrying the most recent answer; delayed retries
  for older answers conflict safely. A durable history of all request replies
  would need a coordinated storage extension.
- The scene allowlist must be checked against C's selected Excalidraw version.
  Submitted scenes use A1's example format; uploads and collaboration stay disabled.

## Next integration gates

A2 review found no blocker for the labeled mock flow. PR #4 stays unmerged until
explicit merge authorization; A3 remains on hold.

- [ ] A/B/C coordinate actual browser TTS-completion timing before enabling
  latency-based integrity scoring.
- [ ] A/C/D check one real Excalidraw scene through submission, persistence,
  and reload with C's selected editor version.

For follow-up work, reuse existing tests. Ordinary changes use TypeScript, scoped
lint, and one focused end-to-end smoke check. Run relevant checks once per meaningful
change; repeat only after a failure or further change. Add a small regression only
for an important uncovered bug. Preserve useful tests and skip repeated builds
while the known Supabase configuration blocker is unchanged.

## Validation

- `npm ci`: passed with network/cache access; initial sandbox cache attempt failed
  with EPERM. Existing dependencies reported 35 audit vulnerabilities; no dependency
  upgrades were included in this focused PR.
- `npm run test:foundation`: 7/7 passed.
- `npm run test:a2`: 15/15 passed, covering golden sequence, precedence,
  recovery/budgets/exhaustion, stable IDs, exact transcript, templates, workspace
  selection, artifact validation/clearing, spoken-only handoff, retry/stale/concurrent,
  endpoint projection/errors, and recovery from grading failures.
- Localhost Next HTTP smoke: start `t01` → accepted answer → next `t03`, with
  three turns recovered from the separate session route and no hidden answer field.
- Scoped review findings fixed: explicit whiteboard prompt, standard arrowhead
  fields, and malformed/missing freehand pressure data. Regression checks passed.
- `npx tsc --noEmit --pretty false`: passed.
- Scoped Biome check: passed for A2 modules, routes, test, config and package manifest.
- `npm run build`: compiled and passed TypeScript, then failed collecting page data
  for inherited Supabase-dependent routes because no Supabase environment is set.
  Full build does not pass in this environment; same limitation recorded in A1.
