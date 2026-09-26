# Four-teammate implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement the assigned workstream task by task. The user is assigning four human teammates; this document does not dispatch agents or create chats. Track completion with the checkboxes below.

**Goal:** Deliver a resume-aware voice interview with deterministic follow-ups, cited evaluation, one fairness audit, an integrity concern band, and saved Monaco/Excalidraw submissions.

**Architecture:** Build on the existing FoloUp app. A owns shared interfaces and server orchestration; B owns scoring and fusion; C owns browser interaction and report UI; D joins later to own durable persistence, face signals and deployment. Fixtures unblock all workstreams before live services are integrated.

**Tech stack:** Next.js 16 with webpack, React 18, TypeScript, Supabase, Gemini 2.5 Flash, Web Speech API in Chrome, Tailwind/shadcn, Monaco, Excalidraw, optional MediaPipe face capture.

**Spec:** [CLAUDE.md](../../../CLAUDE.md), especially §§3–7. Existing runtime types are in `src/types/pipeline.ts`; the approved optional artifact extensions are specified in §4 and must be implemented in A1.

## Scope and working rules

- A1 foundation is implemented on `feat/interview-engine`; its publication/merge is the first handoff. A2/A3 and B/C/D tasks remain unstarted in this checkout. Existing assets include the FoloUp shell, golden fixture and reference algorithms.
- A/B/C start now. D's arrival is unknown; use the arrival checklist below rather than blocking the first three teammates.
- Provisionally allow six hours of build time and one protected rehearsal hour. Record actual names, deadline and D's arrival in the kickoff discussion before assigning calendar times.
- Keep the selection rule, shared 0–3 rubric and integrity thresholds in `CLAUDE.md` unchanged.
- Every retained score needs a code-validated candidate transcript citation. Only spoken explanation is scored in this release; code/drawings are supporting artifacts for human review.
- Exactly one separate auditor pass. Counterfactual results are precomputed and labeled sample-only.
- Integrity never changes scores or produces a cheating verdict. Unavailable face signals contribute zero points.
- Monaco provides editing/submission only. No execution service, terminal, test runner or Run button. Excalidraw supports single-candidate shapes/text; no uploaded images or collaboration.
- The browser must never receive `plantedIssue`, including through fixtures or full-record/report responses.
- Aural reuse is limited to useful wrappers/styles. Retain its MIT notice and pin the copied source commit. Do not migrate the app to Aural.
- Existing JSONB fields hold the new record/report; no database migration is planned. Do not add libraries beyond the approved stack or change shared interfaces independently.
- Commit small deliverables on separate teammate branches. Merge A1 first, then module work; integrate early rather than waiting for all four branches to finish.

## Assignment board

| Person | Start | Main deliverable | Suggested branch | First action |
|---|---|---|---|---|
| A | Now | Shared contract, mock/Gemini adapter, plan generation and turn APIs | `feat/interview-engine` | Land A1 and publish interfaces |
| B | Now | Grader, validated evaluation, audit and integrity fusion | `feat/evaluation-integrity` | Start B1 using the existing golden record |
| C | Now | Candidate flow, browser speech, Monaco/Excalidraw and recruiter report | `feat/interview-workspace-ui` | Start C1 against the sanitized fixture |
| D | Later | Persistence/resume, deployment, face signals and demo integration | `feat/persistence-deploy` | Follow D's arrival checklist; start D1 |

Suggested branch names are assignments, not branches already created by this plan.

## File ownership

All paths in this document are repository-relative. Paths marked new do not exist yet.

| Owner | Files/directories | Boundary |
|---|---|---|
| A | `src/types/pipeline.ts`; new `src/types/pipeline-api.ts`, `src/lib/llm.ts`, `src/lib/pipeline/{plan,select-next,engine,client-projection}.ts`; new `src/app/api/pipeline/**`; `scripts/build-golden-fixture.mjs`; new `src/fixtures/workspace-interview.ts` | Sole editor for shared types, API routes and fixture generation |
| B | New `src/lib/pipeline/{grade,evaluate,citations,audit,integrity}.ts`; new `src/lib/prompts/pipeline/**` | Exports pure logic/service functions; no route or shared type edits without A |
| C | New `src/components/pipeline/**`, `src/components/code-editor/**`, `src/components/whiteboard/**`; new `src/hooks/{use-interview-speech,use-browser-integrity}.ts`; `src/components/call/index.tsx`, `src/components/call/tabSwitchPrevention.tsx`; user/client pages; `THIRD_PARTY_NOTICES.md` | Owns page composition and browser state; D contributes a hook, not concurrent page edits |
| D | `src/services/responses.service.ts`, `src/types/response.ts`; new `src/services/pipeline-records.service.ts`, `src/hooks/use-face-signals.ts`; environment examples and deployment config | Persistence adapter conforms to A's API types; A connects it in route handlers |

**Shared-file coordination:** A is the editor for `package.json`, the chosen lockfile and TypeScript config; C supplies exact compatible editor dependency requests, D supplies MediaPipe requests. A owns `CLAUDE.md` status updates before D joins; D takes over at an explicit handoff. Each teammate sends status and checks with their PR. Do not regenerate the golden fixture from multiple branches or edit generated fixture files by hand.

## Interfaces to publish in A1

These are implementation targets, not current exports. A1 introduces the optional workspace/artifact types from `CLAUDE.md` §4 and defines the following API/module types in `src/types/pipeline-api.ts` so all teammates import one definition.

```ts
type JsonValue = null | boolean | number | string | JsonValue[] |
  { [key: string]: JsonValue };

interface LlmRequest {
  task: "plan" | "grade" | "evaluate" | "audit";
  system: string;
  input: JsonValue;
  mockOutput: JsonValue;
}
// A: server-only; returns unknown until the caller validates its shape.
// generateJson(request: LlmRequest): Promise<unknown>

interface GradeResult {
  grade: Grade;
  term: string | null;
  quote: string | null;
}
interface GradeInput {
  rubric: RubricLevel[];
  claimId: string;
  questionText: string;
  answerText: string;
}
// B: gradeAnswer(input: GradeInput): Promise<GradeResult>
// No code, scene, identity, or integrity data is supplied to the grader.

interface FaceSignalAvailability {
  available: boolean;
  reason?: string;
}
// B: validateEvaluation(record: InterviewRecord, raw: unknown): Evaluation
// B: evaluateRecord(record: InterviewRecord): Promise<Evaluation>
// B: auditEvaluation(record: InterviewRecord, evaluation: Evaluation): Promise<Audit>
// B: fuseIntegrity(record: InterviewRecord,
//                  faceSignals: FaceSignalAvailability): IntegrityReport

type ClientCodeSnippet = Omit<CodeSnippet, "plantedIssue">;
type ClientClaim = Omit<Claim, "ladder"> & {
  ladder: Omit<QuestionLadder, "codeSnippet"> & {
    codeSnippet?: ClientCodeSnippet;
  };
};
type ClientInterviewPlan = Omit<InterviewPlan, "claims"> & {
  claims: ClientClaim[];
};
type ClientInterviewRecord = Omit<InterviewRecord, "plan"> & {
  plan: ClientInterviewPlan;
};
type ClientInterviewReport = Omit<InterviewReport, "record"> & {
  record: ClientInterviewRecord;
};

interface StartRequest { interviewId: string; requestId: string }
interface SubmitTurnRequest {
  interviewId: string;
  requestId: string;
  expectedTurnId: string;
  text: string;
  startMs: number;
  endMs: number;
  artifacts?: AnswerArtifact[];
  integrityEvents: IntegrityEvent[];
  faceSignals: FaceSignalAvailability;
}
interface TurnReply {
  record: ClientInterviewRecord;
  nextQuestion: Turn | null;
  decision: Decision;
  finished: boolean;
}
interface SavedSession {
  record: InterviewRecord;
  lastRequestId: string | null;
  lastReply: TurnReply | null;
  finished: boolean;
  faceSignals: FaceSignalAvailability;
}
// D: createSession(session: SavedSession): Promise<void>
// D: loadSession(interviewId: string): Promise<SavedSession | null>
// D: saveSession(session: SavedSession,
//                expectedLastRequestId: string | null): Promise<void>
// D: saveReport(interviewId: string, report: InterviewReport): Promise<void>
// D: loadReport(interviewId: string): Promise<InterviewReport | null>
```

Use `InterviewRecord.plan.interviewId` as the attempt ID for this hackathon: create a fresh ID for each candidate attempt. It must map to one response row, rather than sharing a mutable record among candidates. D stores the small session metadata alongside the record in the existing `details` JSON object; `details` still contains all `InterviewRecord` fields at its top level. Return only the contracted record through API projections. No new SQL columns are needed. Initialize face availability as false until capture successfully loads; retain off/failed state for report generation and display missing signals as unavailable.

For module grading/evaluation, B removes identity fields and artifacts before constructing LLM input. Preserve original transcript offsets when scoring redacted text: either use an offset-preserving redaction or map returned offsets back before validation. Never rewrite the saved transcript after citations have been produced.

| Endpoint (A owns) | Request | Response / behavior |
|---|---|---|
| `POST /api/pipeline/plan` | Multipart `resume` PDF and either `jdText` or `jd` PDF | `{ plan: ClientInterviewPlan }`; server keeps full plan for the new attempt |
| `POST /api/pipeline/start` | `StartRequest` | `TurnReply` containing the opening question |
| `POST /api/pipeline/turn` | `SubmitTurnRequest` | `TurnReply`; repeat request ID returns stored reply; stale expected turn returns conflict |
| `GET /api/pipeline/session?interviewId=…` | Attempt ID | Sanitized saved record plus `finished` for refresh recovery |
| `POST /api/pipeline/report` | `{ interviewId }` | `{ report: ClientInterviewReport }`; reuse completed report on retry |
| `GET /api/pipeline/report?interviewId=…` | Attempt ID | Previously saved sanitized report |

Use `{ error: { code: string; message: string } }` for errors. Invalid input is 400, unknown attempt 404, stale state 409, and upstream failure 502. C retains unsent text/artifacts and offers retry on failed saves. The server, not the client, assigns turn IDs, claims, rungs, grades and decisions.

## A — Engine and shared foundation

### A1. Publish the foundation first

**Files:** A-owned shared types, `llm.ts`, `client-projection.ts`, workspace fixture, package/config files.

- [x] Add the optional workspace/artifact contract and API types above. Leave existing golden data valid.
- [x] Implement explicit allowlisted client projections that remove `plantedIssue` at every nested level. Export sanitized fixture data for C; do not import the full server fixture into client bundles.
- [x] Implement server-only `generateJson`: `LLM_MODE=mock` returns the supplied fixture output with no network call; `gemini` calls Gemini 2.5 Flash in JSON mode. Reject unknown modes and missing live credentials clearly; do not silently present mock results as live.
- [x] Add a separate workspace fixture with a code submission and a small shapes/text scene. Keep original golden transcript/citations/chain unchanged.
- [ ] Publish this shared commit to B/C and agree package/lockfile ownership. B can work on existing types before this lands; C can build presentation against sanitized data.

**Acceptance:** old golden data still satisfies its contract; client fixture and serialized responses contain no `plantedIssue`; mock mode works without a Gemini key; optional artifact fields do not break old records.

### A2. Deliver a deterministic interview before live generation

**Files:** new `select-next.ts`, `engine.ts`, pipeline start/turn/session routes.

- [ ] Port the fixture selection rule into a pure function, preserving its exact precedence and constants.
- [ ] Implement opening, candidate submission, grade application, next question selection and completion. Validate filled `term`/`quote` against the candidate text; use a safe template fallback if absent.
- [ ] Select code/whiteboard only on the technical `scenarioTwist` rung using the agreed workspace field and legacy code-snippet fallback.
- [ ] Implement artifact shape/size validation, server-derived `typedAnswer`, stable IDs and request deduplication. Reject mismatched workspace submissions; accept an explicit empty artifact when a candidate clears it.
- [ ] Use a clearly labeled mock in-memory store until D's service is available. C's fixture replay stays usable independently; an in-memory session is not advertised as durable.
- [ ] Wire B's `gradeAnswer` and expose the agreed routes. Connect D's persistence service in the same handlers at integration.

**Acceptance:** golden reason sequence matches the reference, including strong/weak budget precedence, recovery from fundamental and max-question termination; the same retried submission does not append another turn or decision; a stale submit cannot overwrite a newer answer.

### A3. Generate plans and complete orchestration

**Files:** new `plan.ts`, plan/report routes; reuse `src/actions/parse-pdf.ts`.

- [ ] Parse resume PDF and pasted/uploaded JD; return useful errors for empty or unreadable input.
- [ ] Generate ranked claims, full ladders and appropriate technical workspaces. Verify resume/JD excerpts against the source text, calculate ranking in code, and reject generic openings.
- [ ] A code workspace must have code/language/hidden issue. A whiteboard workspace must have a concrete system-design prompt; do not require a coding submission for that question.
- [ ] Connect B's evaluation, validator, audit and fusion into report generation; connect D's report storage. Reuse an existing report on retry to avoid unnecessary repeated auditor calls.
- [ ] Mark claims never reached as unassessed in the report data/UI mapping. Publish a live plan → turn → report handoff for C.

**Acceptance:** a new resume/JD reaches a question naming a concrete claim; full server plans persist but hidden issues never reach browser responses; report generation retains only supported scores and invokes one auditor pass per new evaluation.

## B — Scoring, citations, audit and integrity fusion

### B1. Establish the evidence and grading boundary

**Files:** new `grade.ts`, `citations.ts`, `evaluate.ts`, prompts under `src/lib/prompts/pipeline/`.

- [ ] Implement `gradeAnswer` against the shared rubric. Return a validated integer 0–3 and optional candidate-derived term/quote using A's adapter.
- [ ] Implement `validateEvaluation`: require existing candidate turns, integer offsets within bounds and exact quote slices. Retain a score only when it has at least one valid supporting citation; count removed scores in `removedUncited`.
- [ ] Implement blind evaluator input, preserving or mapping offsets across redaction. Exclude code/drawings and integrity data from scoring inputs.
- [ ] Derive evidence strength deterministically from graded answers: fewer than two means thin; otherwise grade spread ≥2 means mixed; otherwise strong. Non-strong results require human review.
- [ ] Publish mock evaluation outputs and grader interface to A immediately. Give C report data and labels before live calls are complete.

**Acceptance cases:** wrong quote, AI-turn citation, out-of-range offset, empty citations, unknown/unassessed claim, redaction offset mapping, thin/mixed evidence, and a valid exact quotation. Artifact content cannot justify a score in this version.

### B2. Finish audit and fusion

**Files:** new `audit.ts`, `integrity.ts`, corresponding prompts.

- [ ] Implement exactly one auditor call with the three fixed checks: unfair/leading questions, scoring consistency, keyword/phrasing bias.
- [ ] Use the fixture's labeled counterfactual only on the sample. Live audit output has `precomputed: false` and no invented counterfactual experiment.
- [ ] Port integrity points and bands from the fixture reference; include value, threshold, points, availability and benign explanations for every signal.
- [ ] Calculate first-word latency from actual candidate speech start relative to question completion; do not substitute the Submit button timestamp. Apply the CV rule only with at least four usable answers.
- [ ] Encode the required no-verdict/no-score-effect statement in fusion code and any relevant prompts. Give A one report assembly example and C all display labels.

**Acceptance cases:** golden sample remains Medium/3; 0–2/3–5/6+ band boundaries; unavailable face signals score zero; insufficient latency data does not trigger uniformity; the audit has exactly three checks; scores are unchanged when integrity events change.

## C — Candidate UI, technical workspace and report

### C1. Adapt the two workspace components

**Files:** new `src/components/code-editor/code-editor-canvas.tsx`, `src/components/whiteboard/{whiteboard-canvas.tsx,whiteboard-overrides.css}`, `src/components/pipeline/technical-workspace.tsx`, `THIRD_PARTY_NOTICES.md`.

Reuse sources:

- https://github.com/1146345502/aural-oss/blob/main/src/components/code-editor/code-editor-canvas.tsx
- https://github.com/1146345502/aural-oss/blob/main/src/components/whiteboard/whiteboard-canvas.tsx
- https://github.com/1146345502/aural-oss/blob/main/src/components/whiteboard/whiteboard-overrides.css

- [ ] Record the source commit and retained MIT copyright/license when copying; list local adaptations in the notice.
- [ ] Ask A to land the selected React 18-compatible editor dependencies in the shared manifest/lockfile. Import browser-only libraries lazily and show a retryable load error instead of an endless spinner.
- [ ] Use the upstream `readOnly`, `initialData`, autosave and snapshot patterns. Add explicit current-state capture on Submit and serialize empty/cleared content, not only nonempty content.
- [ ] Use one technical workspace per question. Seed Monaco from the safe snippet; use a blank or saved scene for whiteboard mode. Disable image insertion and collaboration.
- [ ] Keep local drafts keyed by attempt and question turn ID. Restore on refresh; remove only that acknowledged draft after a successful save. Show storage failure rather than promising a saved draft.
- [ ] Emit the agreed `AnswerArtifact` on submit; no raw editor internals, uploaded files or collaborators enter the payload.

**Acceptance:** type/draw → switch view → restore retains content; submitting before the debounce interval captures the latest edit; clear → save → reload remains cleared; two questions do not share drafts; read-only review cannot modify the submission. Network failure retains the draft and offers retry. No Run control is displayed.

### C2. Connect candidate flow and speech

**Files:** new pipeline setup/interview components and speech/browser-integrity hooks; existing call page/component and tab-switch hook.

- [ ] Build resume/JD input, ranked claims and a clear sample-mode entry using A's sanitized fixture. Avoid sending real inputs when the user selects a fixture demo.
- [ ] Show monitoring disclosure before starting. Use one browser integrity hook for tab blur/focus and paste; internal editor focus changes must not count as leaving the tab. Do not import upstream paste blocking.
- [ ] Implement Chrome speech recognition/synthesis with start/stop, permission errors and retry states. Stop recognition while TTS is playing; prevent AI audio from becoming a candidate answer.
- [ ] Track actual first speech time for `startMs`; retain the transcript and current artifact while A's submit request is pending. Disable duplicate Submit and retry with the same request ID.
- [ ] Render question, workspace, transcript and decision log from `TurnReply`. Do not predict the next question on the client.
- [ ] Connect session reload when D's service lands. Preserve an unsent local draft while loading the last accepted server turn.

**Acceptance:** a live answer advances once; the reason appears immediately; microphone denial and speech failure have a visible recovery path; camera disabled/unavailable is represented honestly; fixture replay works without live LLM credentials.

### C3. Deliver the recruiter report

**Files:** new `src/components/pipeline/report/**`; client report entry page; existing call details UI as needed.

- [ ] Render B's scores, evidence strength, human-review flags and unassessed claims.
- [ ] Clicking a citation highlights the exact saved transcript slice. Show the removed-score count when nonzero.
- [ ] Render the three audit checks, sample-only counterfactual label and integrity signals with thresholds/benign explanations.
- [ ] Show submitted code or scene beside its candidate turn in read-only mode, labeled supporting artifact for human review. Do not add an artifact score.
- [ ] Offer a clearly labeled golden fallback at setup, interview and report. Add the workspace fixture replay; never import a hidden answer into the browser for fallback convenience.

**Acceptance:** every displayed score links to valid evidence; report reopening shows the saved artifact rather than the candidate's current draft; no UI labels imply automatic code execution, drawing correctness or a cheating determination.

## D — Arrival checklist, persistence and delivery

When joining, read `CLAUDE.md`, this plan and the A1 interfaces. Ask A for the latest integration commit, C for the fixture-demo entry point, and B for the golden report output. Confirm which checks are passing. Reuse those interfaces; do not start a second turn API or another app shell.

### D1. Make sessions and reports durable; deploy early

**Files:** new `pipeline-records.service.ts`; existing responses service/types; environment example and deployment configuration.

- [ ] Implement the published session/report service using `response.details` and `response.analytics`. Create one response row per attempt, respecting existing required response/interview fields.
- [ ] Persist full server records, session request metadata and submitted artifacts. Project safe views in A's routes; do not serve raw database rows to candidate or recruiter pages.
- [ ] Use the expected prior request ID to reject stale writes atomically against the stored metadata; surface a conflict to A rather than overwriting newer content. Return the stored reply for retries of an accepted request.
- [ ] Update queries/types that currently depend on Retell `call_analysis` so new pipeline responses are listed and opened. Keep `tab_switch_count` in sync.
- [ ] Persist final evaluation/audit/integrity together and reuse stored reports. Hand the service to A for route wiring and C for refresh/reopen checks.
- [ ] Add `LLM_MODE`, `NEXT_PUBLIC_FACE_SIGNALS`, Gemini and Supabase configuration instructions. Keep server keys server-side; do not copy Aural voice credentials or relay setup.
- [ ] Publish an early preview, then exercise a saved technical answer and report on the actual Chrome demo machine.

**Acceptance:** refresh after submission restores the accepted turn and artifact; reports reopen from Supabase; old Retell-specific filters do not hide new responses; concurrent/stale submissions cannot silently overwrite data; save failure is visible; preview requires no Retell key.

### D2. Add face signals after the saved demo path works

**Files:** new `src/hooks/use-face-signals.ts`; A coordinates package changes; C connects the hook.

- [ ] Load MediaPipe behind `NEXT_PUBLIC_FACE_SIGNALS=on|off`; perform face processing in the browser.
- [ ] Emit persisted missing-face (>3s), multiple-face (>1.5s) and look-away (>12s) events; emit once per qualifying episode rather than once per frame.
- [ ] On feature off, denied permission or load failure, report unavailable state to B's fusion; stop streams and release resources on exit.
- [ ] Give C a hook result containing events and availability. Camera/video recording upload remains outside scope.

**Acceptance:** short episodes below thresholds do not count; a sustained episode counts once; unavailable state contributes zero points; camera tracks stop when the interview ends. If incomplete at freeze, label unavailable instead of presenting simulated events as live.

### D3. Freeze, rehearse and optionally add the chain

- [ ] Run the integration checklist below and record the deployed URL, environment mode, current cuts and demo-machine readiness in the handoff.
- [ ] Rehearse the five-minute script once live and once entirely through the labeled fixture fallback; protect the last hour for this.
- [ ] Only after core checks pass, implement hash chaining and verification with artifacts included in parent turn payloads. Own a new `src/lib/pipeline/chain.ts`; ask A to connect it and C to add Verify.
- [ ] Check tampered payload, missing sequence and changed previous-hash cases. Omit the Verify demo if the stretch is incomplete.

## Integration checkpoints and fallback ownership

| Gate | Target | Owner | If blocked |
|---|---|---|---|
| G0 | First 30 minutes: shared types, safe fixture and interface commit published | A | B uses old golden record; C builds safe presentation components |
| G1 | Around 90 minutes: mock turn flow, grader interface, editable code/scene snapshots | A/B/C | Fix these before adding secondary UI |
| G2 | Mid-build: live answer → grade → next question with visible reason | A + C | Continue a visibly labeled fixture replay while debugging |
| G3 | At least one hour before freeze: persisted full interview → cited report + artifact replay | D, or A/C if absent | Reassign D1 to A and deployment to C; B coordinates checks; drop stretch work |
| G4 | Feature freeze: stable deployed path and clearly labeled fallback | D, or C if absent | Stop additions; disclose incomplete features and use the fallback |
| G5 | Protected final hour: two rehearsals | Whole team; D leads, otherwise B | Simplify demonstration, keep evidence/integrity guarantees |

Late-arrival priority for D: **persistence → deployment/integration → rehearsal → face signals → hash chain**. A/B/C do not wait for MediaPipe or deployment before building local workflows. If time is shorter than the provisional schedule, cut candidate feedback UI, hash chain and visual polish first. If whiteboard cannot be completed, explicitly label its fixture/stub or defer the whole feature; never claim an unsaved canvas is a completed submission flow.

## Validation before declaring a deliverable ready

Use the repository's existing tooling; do not introduce a test framework merely for this plan. Add focused checks for the deterministic rule, citation bounds, fusion thresholds and serialization where needed. Each PR records what was actually run and any failures.

- [ ] A: golden decision sequence and citation/chain fixture invariants remain valid; safe projections exclude hidden answers in real and mock paths.
- [ ] B: citation rejection/redaction cases, evidence-strength rules, one audit pass and integrity boundaries pass focused checks.
- [ ] C/D: Chrome flow covers speech permission failure, editor load failure, immediate submit, cleared content, refresh, retry, artifact replay and unavailable face signals.
- [ ] D: deployment uses the same working package lock and configuration; no Retell dependency remains on the active demo path.
- [ ] Integrator: run `npm run check:ci` and `npm run build`; triage inherited failures separately from changed-code regressions. A runs `npm run fixture:golden` when generator changes are made and reviews generated diffs; the command writes files.
- [ ] All: confirm no score is uncited, integrity never affects scoring, and mocks/counterfactuals/artifacts are labeled accurately.

## Copyable teammate briefs

### Send to A

> Own the interview engine and shared foundation in `docs/superpowers/plans/2026-09-26-team-kickoff.md`, tasks A1–A3. Read `CLAUDE.md` first. Start with the optional workspace/artifact types, safe fixture projections, shared API/module interfaces and mock/Gemini adapter so B/C can integrate. Then implement the deterministic turn loop, resume/JD planning and report orchestration. Own shared manifests/types/routes; publish A1 immediately. Coordinate with B's grader, C's UI and D's persistence service. Monaco is edit/submit only; never send `plantedIssue` to the browser. Report changed files, checks and remaining blockers.

### Send to B

> Own evaluation and integrity logic in `docs/superpowers/plans/2026-09-26-team-kickoff.md`, tasks B1–B2. Start from the golden fixture while A publishes interfaces. Implement the grader, exact transcript citation validator, blind evaluator, one fairness audit and deterministic integrity fusion. Only spoken evidence is scored; code/drawings are supporting artifacts for human review. Preserve citation offsets across redaction and prevent integrity from changing scores. Export the documented functions for A and fixture outputs for C. Report changed files, checks and remaining blockers.

### Send to C

> Own candidate UI and recruiter report in `docs/superpowers/plans/2026-09-26-team-kickoff.md`, tasks C1–C3. Build against A's sanitized fixtures first. Adapt Aural's Monaco/Excalidraw wrappers with attribution, current-snapshot submission, empty-state saving, per-question drafts and read-only review. Add resume/JD setup, Chrome speech, decision log, single-instance tab/paste capture and the cited report. No code execution or artifact grading. Coordinate dependencies through A and persistence/face-hook integration with D. Report changed files, checks and remaining blockers.

### Send to D when joining

> Own durable storage, deployment and final integration in `docs/superpowers/plans/2026-09-26-team-kickoff.md`, tasks D1–D3. Read the arrival checklist and get A's latest interfaces before coding. Prioritize Supabase session/artifact/report persistence, retry-safe writes, query compatibility and deployment. Then add MediaPipe if time allows; otherwise make unavailable state explicit. Lead the live and fixture rehearsals. Hash-chain verification is last. Coordinate route edits through A and page edits through C. Report deployed URL, checks, environment mode and remaining cuts.
