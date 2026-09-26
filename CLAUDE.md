# CLAUDE.md: source of truth for the hackathon build

> If code and this file disagree, that is a bug. Fix whichever one is wrong, in the same change.
> Last updated: 2026-09-26. A2 PR #4 is merged (`383068c`); A3 plan/report orchestration is implemented on `feat/interview-engine` using B's merged modules. Shared contracts are unchanged. Storage remains mock memory; see [A3 handoff](docs/handoffs/a3-plan-report.md).
> Assignment checklist: [Team implementation plan](docs/superpowers/plans/2026-09-26-team-kickoff.md). A, B and C start now; D joins later. Planned additions below are requirements, not claims of implemented behavior.

## 1. Summary

We are building an AI interview platform on top of the FoloUp codebase (Next.js + Supabase). It interviews a candidate by voice about the specific claims on their resume that matter for the job, adapts each question with a rule simple enough to say out loud, produces an evaluation where every score is tied to the candidate's exact words, audits that evaluation for unfairness in a visible section, and reports integrity signals as a Low/Medium/High concern level for a human to review. It never gives a cheating verdict.

**Four things that differentiate this from a generic AI-interviewer clone** (FoloUp included):
1. **Structured, claim-based questioning.** The resume and JD are turned into ranked `Claim`s, each with a precomputed question ladder. There are no generic "tell me about X" questions.
2. **An explainable adaptive selection rule.** One deterministic rule, and every turn logs a machine-readable reason code shown live in the UI.
3. **Evidence-cited evaluation + scoped bias audit.** Every score cites character offsets in the transcript, validated in code. A separate auditor pass checks a fixed 3-item fairness checklist and is shown in the report.
4. **Integrity monitoring as a concern band.** Low / Medium / High with every signal, threshold and benign explanation visible. It never produces a verdict and never affects scores.

**Approved technical workspace:** adapt Aural's Monaco editor and Excalidraw whiteboard. Candidates write code or draw a design while explaining aloud; submissions are saved for recruiter review. This release scores spoken evidence only. Code execution, automated diagram grading and collaborative editing are outside this release.

## 2. Stack (pinned; anything else must be flagged to the team first)

| Piece | Choice | Why |
|---|---|---|
| App | Next.js 16 (`--webpack`), React 18, TypeScript | Already in FoloUp. API routes host the turn loop. |
| DB + storage | Supabase (`supabase_schema.sql`) | Already in FoloUp. Pipeline data goes in the existing `response.details` / `response.analytics` JSONB, so no migration is needed. |
| LLM | Gemini 2.5 Flash via `@google/genai`, JSON mode | Already in FoloUp. Fast and cheap enough for a grade call every turn. |
| Speech | Browser Web Speech API (`SpeechRecognition` + `speechSynthesis`) | No new library. We control every turn, so the selection rule and latency signal are possible. **Chrome only.** |
| Face / gaze signals | `@mediapipe/tasks-vision` Face Landmarker, **approved new library**, flag `NEXT_PUBLIC_FACE_SIGNALS=on\|off` | Runs in the browser, so no video leaves the device. Adds face-count and gaze signals. If it fails to load, the band ignores those signals. |
| PDF parsing | `src/actions/parse-pdf.ts` (LangChain PDFLoader) | Already in FoloUp. Reused for both resume and JD. |
| UI | Tailwind + shadcn/Radix (existing `src/components/ui`) | Already in FoloUp. |
| Code editor | `@monaco-editor/react` + `monaco-editor`, **approved new libraries; not installed yet** | Adapt Aural's editor wrapper; editing/submission and read-only review. Select React 18-compatible versions. |
| Whiteboard | `@excalidraw/excalidraw`, **approved new library; not installed yet** | Adapt Aural's canvas wrapper and styles; editable scenes and read-only review. Select a React 18-compatible version. |
| Hash chain | Node `crypto` sha256 | Built in. |
| Lint | Biome (`npm run check:ci` in CI) | Already in FoloUp. |

**Not used:** Retell (replaced by our turn loop), auth (see cut list), Prisma (listed in package.json but there's no schema; don't use it).

**A1 foundation:** `src/lib/llm.ts` and private fixture/projection modules use Next.js's `server-only` boundary marker. `LLM_MODE` must be set explicitly to `mock` or `gemini`; mock returns task fixture data without network access, and live mode requires `GEMINI_API_KEY`. Read [A1 handoff](docs/handoffs/a1-foundation.md) for imports, examples and checks.

## 3. Pillars

Status values: `not started` → `in progress` → `demo path works` → `done`. **Update the status whenever it changes.**

### Pillar 1: Profile-aware questioning. Owner: **A** (C supports with UI)
- **Done looks like:** upload a resume PDF + paste or upload a JD → `InterviewPlan` with ranked `Claim[]`.
  - Each claim has verbatim `resumeEvidence` + `jdRequirement` and a full `QuestionLadder`.
  - Coding workspaces get a `codeSnippet` with a planted issue; whiteboard workspaces get a concrete system-design prompt.
  - Ranking is `jdWeight × (1 − specificity)`: vague claims about things the JD needs are probed first.
  - The first question must name a concrete resume detail and ask about mechanism, trade-off or failure. Reject "tell me about X".
- **Status:** demo path works. A3 parses resume/JD PDFs, validates grounded claims/ladders/workspaces, and ranks in code. The complete mock PDF → interview → report path works; real Gemini planning is wired but has not been exercised with credentials.

### Pillar 2: Adaptive interview engine. Owner: **A** (B supports with the grader)
- **Done looks like:** a spoken interview in Chrome. Each turn: STT → a grade call scores the answer 0–3 on the shared rubric → the pure function `selectNext()` applies the rule → the question text comes from the precomputed ladder (the LLM only fills `{{term}}` / `{{quote}}`) → TTS. Every turn appends a `Decision` with a `ReasonCode`, and a live decision-log panel shows them.
- **Status:** demo path works. A2's deterministic engine now calls B's grader for A3 planned attempts. The legacy A2 demo entry retains labeled fixture grading. C's spoken browser flow and D's persistence remain integration work. See [A3 handoff](docs/handoffs/a3-plan-report.md).

### Pillar 3: Evidence-grounded evaluation + scoped audit. Owner: **B**
- **Done looks like:**
  - An `Evaluation` where every `ClaimEvaluation` has ≥1 `Citation {turnId, start, end, quote}`.
  - A **code validator** checks `turn.text.slice(start, end) === quote` and that the turn is a candidate turn. It removes failing scores and counts them in `removedUncited`.
  - Blind scoring: name, school and employer are redacted before the evaluator prompt.
  - `evidenceStrength` is `thin` (<2 graded answers), `mixed` (grade spread ≥2) or `strong`. Anything not `strong` gets `needsHumanReview: true`.
  - One separate auditor call (different system prompt) returns an `Audit` against the fixed 3-item checklist, rendered as a visible report section.
  - The counterfactual rescoring is **precomputed on the golden sample only**.
- **Status:** demo path works. B's merged evaluator/validator/auditor feed A3's cached report API. Exact citations are checked against saved transcript text; private identity values mask scoring copies without rewriting saved turns. Complete anonymization is not guaranteed.

### Pillar 4: Integrity monitoring. Owner: **C** tab/paste capture / **D** face capture / **B** fusion
- **Done looks like:**
  - `IntegrityEvent`s captured during the interview: tab blur/focus (fix the FoloUp double-hook bug), paste, and the MediaPipe events faceMissing >3s, multipleFaces >1.5s and lookAway >12s.
  - Deterministic fusion into an `IntegrityReport` (points table in §5).
  - The recruiter sees the level + every signal's value, threshold, points and benign explanations.
  - The candidate is told before starting what is monitored.
- **HARD REQUIREMENT:** never output a binary "cheating: yes/no". The output is a concern level that prompts human review, and it never changes any score. This sentence must appear in the fusion code and in any prompt for this pillar.
- **Status:** in progress. B's fusion is connected; browser capture remains C/D integration work. A3 marks latency unavailable until actual browser TTS completion is coordinated. Integrity never changes scores.

### Stretch: hash-chained record. Owner: **D**
- `entryHash = sha256("v1|prevHash|seq|kind|refId|canonical_json(payload)")` over turns → decisions → evaluation. The genesis `prevHash` is 64 zeros. Canonical JSON uses sorted keys and drops undefined values.
- A "Verify" button recomputes the chain. It detects edits (hash mismatch), deletions (seq gap) and re-linking (prevHash mismatch).
- **Status:** not started. The reference `buildChain` is in the fixture script, and the fixture has 27 chain entries.
- Lower priority than the four pillars, saved code/whiteboard submissions, deployment and rehearsal. Include artifacts in their parent turn payload when hashing; a transcript-only check must not be presented as protecting drawings or code.

### Technical workspace: Monaco + Excalidraw. Owner: **C** UI / **A** question and turn integration / **D** persistence / **B** evidence boundaries
- On a technical claim's `scenarioTwist` rung, open either the code editor or whiteboard according to the plan. Other rungs keep the spoken flow. This does not add a new ladder rung or change selection budgets.
- Code mode: preload `ladder.codeSnippet.code` and language in Monaco; accept edited code and a spoken explanation. No Run button or execution service. `plantedIssue` stays on the server, including in plan, record, fixture and report responses sent to the browser.
- Whiteboard mode: show a system-design prompt, let the candidate draw and explain, and retain the editable scene for read-only recruiter review. Images, uploads and collaboration are disabled in the first version.
- Link final snapshots to the candidate turn; save drafts separately from submitted answers. Submit captures current state immediately rather than waiting for a debounced callback. Explicitly save cleared content, and show save failure/retry without losing edits.
- For this release, the grader and evaluator score only the spoken explanation. Code and drawings are labeled **supporting artifact — human review**. No code/diagram score or correctness verdict is implied. Citations remain offsets into `Turn.text`; do not silently append code or diagram descriptions to it.
- Adapt the upstream components with local loading/error fallbacks, React 18-compatible dependencies, and retained MIT attribution. Aural's relay servers, tRPC, auth and database migrations are not needed for these wrappers.
- **Status:** in progress. A1's separate code/whiteboard examples remain valid; A2 selects and validates submitted workspaces/artifacts, including cleared content. C owns editable/read-only UI and D owns durability. The original golden fixture is unchanged.

## 4. Data contract (the most important section)

**Source of truth: `src/types/pipeline.ts`.** Changing it affects more than one person, so agree with the team first and then update this section.

| From → To | Hand-off | Notes |
|---|---|---|
| P1 → P2 | `InterviewPlan { interviewId, roleTitle, claims: Claim[], rubric: RubricLevel[], maxQuestions }` | `rubric` is the anchored 0–3 scale, **shared by the P2 grader and the P3 evaluator** so they can't drift. |
| P2 → UI | `Decision` per AI turn | `{ turnId, claimId, lastGrade, gradedTurnId, reason, fromRung, toRung, areaState }` |
| P2 + P4 → P3 | `InterviewRecord { plan, candidateLabel, startedAt, turns: Turn[], decisions: Decision[], integrityEvents: IntegrityEvent[], chain? }` | Turn IDs `t01…` are stable and are what citations point at. `candidateLabel` is already redacted. |
| P3 → UI | `Evaluation`, `Audit` | Every score is cited. `Audit.precomputed` marks sample-only output. |
| P4 → UI | `IntegrityReport { level, totalPoints, signals[], disclaimer }` | Band only, never a verdict. |
| All → UI | `InterviewReport { record, evaluation, audit, integrity }` | What the recruiter report page renders. |

**Storage mapping (no schema change):** `response.details = InterviewRecord` and `response.analytics = { evaluation, audit, integrity }`. The existing `tab_switch_count` column stays in sync with the `tabBlur` count. Any new column needs team approval (TODO(team)).

**Fixture:** `src/fixtures/golden-interview.ts` (typed) and `fixtures/golden-interview.json` (same data). Regenerate with `npm run fixture:golden`. The script asserts:
- decisions follow the rule
- citation offsets are exact
- no score is uncited
- the integrity output has no verdict-like keys or yes/no fields

Build against the fixture until the upstream pillar is live. `LLM_MODE=mock` makes `generateJson()` return its supplied task fixture output. B/A must route new pipeline calls through this adapter; legacy FoloUp calls have not yet been migrated. Browser code imports `src/fixtures/client-golden-interview.ts`, never the private golden fixture. Run `npm run fixture:client` after changing the golden fixture or projection.

### A1 contract additions (implemented; A owns further changes)

The optional workspace/artifact types below exist in `src/types/pipeline.ts`; API/module types are in `src/types/pipeline-api.ts`. A1 projections, A2 state transitions and A3 plan/report APIs are implemented. B's modules are integrated. Persistence uses an explicitly labeled mock until D's durable service is connected. Any further contract change still follows §6.

- Add optional `QuestionLadder.workspace`: `{ kind: "code" } | { kind: "whiteboard"; prompt: string }`. A code workspace requires `codeSnippet`. Existing technical plans with a snippet and no workspace continue to select code mode. A whiteboard workspace uses its prompt at `scenarioTwist`; other rungs use the existing ladder.
- Add optional `Turn.artifacts: AnswerArtifact[]`, where `AnswerArtifact` is `{ kind: "code"; language: string; code: string } | { kind: "whiteboard"; sceneJson: string }`. Version 1 allows at most one artifact per candidate turn, matching that question's workspace. The parent turn provides ID, claim and timing; no new artifact citation format is introduced.
- `sceneJson` contains only the drawing elements and whitelisted display state, with no binary files or collaborators. Validate it on the server. Limit code to 100 KiB UTF-8 and scene JSON to 500 KiB UTF-8; reject oversized submissions visibly while retaining the local draft.
- Keep `typedAnswer` for compatibility: for code submissions, the server derives it from the code artifact and rejects contradictory duplicate input. Whiteboard submissions do not populate it. Existing turns without artifacts remain valid.
- Client-safe plan/record/report types recursively omit `plantedIssue`. Server prompts receive only the fields they need; artifacts are excluded from scoring inputs in this release. A browser fallback must also use the sanitized fixture.
- Store submitted artifacts inside `response.details.turns`; drafts do not become graded turns. `response.analytics` remains `{ evaluation, audit, integrity }`. Session metadata (last accepted request/reply, completion and face-signal availability) can accompany the record in the existing details JSON object; expose only contracted fields through client projections. No SQL column additions or migrations are planned.
- The existing golden fixture remains the regression reference. A owns its generator; add an independent workspace fixture for code/scene examples so existing citation offsets and chain expectations remain stable.

## 5. Rules (state these out loud in the demo)

### Selection rule (Pillar 2)
> **"A strong answer (grade ≥2) climbs one rung: initial → term follow-up → scenario twist → why-defense. A weak answer (≤1) drops to a fundamental question, once per area. After 4 questions in an area, or 2 weak answers in a row, we move to the next highest-ranked claim."**

- Constants: `STRONG_GRADE_MIN=2`, `AREA_QUESTION_BUDGET=4`, `MAX_CONSECUTIVE_WEAK=2` (in `pipeline.ts`). The budget is 4, not 3, so the full ladder is reachable.
- The order of checks is exactly this:
  1. `TIME_UP` when `maxQuestions` is reached.
  2. If the answer was strong: reset the weak count → `AREA_BUDGET_EXHAUSTED` → `STRONG_DEEPEN` (from `ladderRung`) → `LADDER_COMPLETE_NEXT_CLAIM`.
  3. If the answer was weak: increment the weak count → `REPEATED_WEAK_MOVE_ON` → `AREA_BUDGET_EXHAUSTED` → `WEAK_FUNDAMENTAL` (once) → `NEXT_RANKED_CLAIM`.
- The first question is `OPENING_TOP_RANKED_CLAIM`.
- The sample produces: `OPENING > STRONG_DEEPEN > STRONG_DEEPEN > WEAK_FUNDAMENTAL > AREA_BUDGET_EXHAUSTED > WEAK_FUNDAMENTAL > REPEATED_WEAK_MOVE_ON > STRONG_DEEPEN > TIME_UP`.
- Claims never reached (c4 in the sample) are shown as "not assessed", never scored.

### Integrity fusion (Pillar 4)
> This is a concern level to prompt human review, not a cheating determination. Every signal has innocent explanations, and none of them affect the candidate's scores.

- **Count signals:** a signal scores 2 points at or above its threshold, 1 point if it's above 0, and 0 otherwise. The signals and thresholds are:
  - tab switches (2)
  - paste (1)
  - lookAway >12s (2)
  - faceMissing >3s (2)
  - multipleFaces >1.5s (1)
- **Latency uniformity:** the coefficient of variation of time-to-first-word across candidate turns. It scores 2 points if CV <0.15 and there are ≥4 answers.
- **Unavailable signals** (face signals off or failed to load) score 0 points and are shown as unavailable.
- **Band:** 0–2 points → Low, 3–5 → Medium, 6 or more → High.
- **Not copied from other tools:** auto-terminating the interview after N warnings, and folding integrity into the score. Both act as verdicts.

### Evaluation rubric (shared P2/P3)
0 No evidence · 1 Surface (names tools, no mechanism) · 2 Working (correct mechanism + a concrete detail) · 3 Deep (mechanism + trade-offs + failure modes, unprompted, first-hand). The full anchors are in the fixture's `plan.rubric`.

## 6. HARD CONSTRAINTS (verbatim from the brief; do not paraphrase or drop)

* Do not introduce a new database, auth provider, or major library outside
  the stated stack without flagging it to us first.
* Do not drop the "cited evidence" requirement or the "confidence band,
  not verdict" requirement to save time. If time is short, cut a whole
  feature rather than weakening these two constraints, and tell us what
  you cut.
* If any pillar can't be finished in time, ship it as a clearly labeled
  stub with mock data rather than a live call that might break on stage.
* Stop and ask before making any decision that affects more than one
  person's workstream (e.g. changing the data contract between the
  interview engine and the evaluation module).

Also from the brief: the auditor is **exactly one** extra pass. Don't build a multi-agent framework or add more "contradicting agents".

## 7. Team plan (A/B/C start now; D joins later)

Use this as a provisional 6-hour build plus 1-hour protected demo buffer. Confirm the actual deadline and D's arrival at kickoff; milestones depend on deliverables, not an assumed arrival time. Detailed tasks, file ownership, interfaces and acceptance checks are in the [assignment plan](docs/superpowers/plans/2026-09-26-team-kickoff.md).

| Time | A | B | C | D |
|---|---|---|---|---|
| 0:00–0:30 | Land contract, client-safe projections and mock adapter interfaces | Read rubric and fixture; start pure citation/fusion logic | Set up fixture screens and inspect Aural wrappers | Not on the critical path; read handoff when joining |
| 0:30–2:00 | Implement `selectNext`, mock turn API and resume/JD plan generation | Grader, citation validator and evaluator on fixture | Upload/claims flow, interview shell, Monaco and Excalidraw with local snapshots | When available: environment/deploy baseline, then persistence service |
| 2:00–3:30 | Connect live grading and turn state; workspace question selection | Auditor, integrity fusion, sample-only counterfactual | Browser speech, decision log, tab/paste capture, report components | Persist/resume records and artifacts; publish preview |
| 3:30–5:00 | Integrate save/resume service and report endpoint | Verify transcript-only scores and report evidence | Complete report, artifact replay and one-click fallback | End-to-end integration; MediaPipe after saved demo path works |
| 5:00–6:00 | Fixes and integration support | Fixes and evidence review | Fixes and report polish | Deployment/rehearsal; hash chain only if everything above is ready |
| **6:00** | **Feature freeze** | | | |
| 6:00–7:00 | Rehearse the demo twice, once on the fixture fallback | | | D owns the demo |

**If D is late:** A/B/C keep building against fixture and local drafts. D's priority is persistence, deployment and rehearsal. If D misses the integration checkpoint, A takes persistence, C takes deployment, B coordinates checks; drop hash chain and label face signals unavailable until working. Announce any deferred feature rather than presenting a mock as live.

## 8. Judging criteria map (Design 5 · Functionality 14 · Innovation 10 · Feasibility 7 · Scalability 6 · Demonstration 8)

- **Functionality (14):** the end-to-end path through all 4 pillars comes first. The fixture fallback means the demo never dies.
- **Innovation (10):** none of the 7 reference repos combines all four differentiators (§1). Plus in-browser face signals and the hash chain.
- **Demonstration (8), 5-minute script:**
  1. Upload → ranked claims (30s).
  2. Live interview and one technical submission with the decision log ticking (90s); use a short fixture replay if live turns exceed the time box.
  3. Report (90s): click a score to highlight its quote → saved code/drawing for human review → audit section + labeled sample counterfactual → concern band and benign explanations.
  4. Reopen the submitted workspace to show retained code/drawing (30s). Substitute the tamper/Verify demonstration only if the hash-chain stretch is completed and checked.
  5. Close on the cut list and the "not a verdict" principle (30s).
  
  One-click fixture fallback at every step.
- **Feasibility (7):** honest scope, a visible cut list, deterministic rules instead of LLM magic.
- **Scalability (6):** see §9.
- **Design (5):** the recruiter report is what judges look at longest, so C polishes it.

## 9. Scaling notes

- **Stateless turn API.** All interview state is in `InterviewRecord` (Supabase), so any instance can serve any turn.
- **Heavy work before the call, light work during it.** The ladders are precomputed in P1, so each live turn needs one small grade call. Cost per interview ≈ `maxQuestions` grade calls + 1 evaluation + 1 audit, with Gemini Flash pricing.
- **No servers for speech or video.** STT/TTS run in the browser and face signals run in the browser (MediaPipe), so there's no video processing on the server.
- **Swappable providers.** The `src/lib/llm.ts` adapter (`LLM_MODE=mock|gemini`) lets us swap providers without touching pillar code.

## 10. Research: what we took from other open-source projects

| Repo | Adopted | Rejected |
|---|---|---|
| [1146345502/aural-oss](https://github.com/1146345502/aural-oss) | Monaco and Excalidraw wrappers, snapshot/restore and read-only review patterns; retain MIT attribution and record the source commit | Whole-platform migration, voice relays, tRPC/auth/schema, paste blocking, automatic artifact grading |
| [thrinay296/InterviewAI](https://github.com/thrinay296/InterviewAI) | The 4-rung chain (initial → term follow-up → scenario twist → why-defense); resume-specific questions; the "drop-off" note; persistence thresholds for face signals | Auto-terminating after 3 warnings; integrity weighted into the score |
| [ngoanpv/DeepInterview](https://github.com/ngoanpv/DeepInterview) | Heavy work before the call, light during it (precomputed ladders); mock-first provider adapters; ScoreCard next steps → candidate feedback | LiveKit / LangGraph (too heavy for 6h) |
| [abhay-yemekar/hirelens](https://github.com/abhay-yemekar/hirelens) | Character-offset evidence validated in code; click-to-highlight; anchored rubric | Recruiter-editable rubric (cut) |
| [malex4hire/interview-eval-platform](https://github.com/malex4hire/interview-eval-platform) | Confidence as uncertainty → `needsHumanReview`; the hash-chain formula with `seq` | Full audit-log tables |
| [re-cinq/hiring-bias](https://github.com/re-cinq/hiring-bias) | Counterfactual + placebo rescoring (precomputed only) | Multi-model, multi-variant study |
| [Codseg/openproctor](https://github.com/Codseg/openproctor) | Confirmed in-browser face detection is feasible | BlazeFace (MediaPipe chosen for gaze) |
| [IliaLarchenko/Interviewer](https://github.com/IliaLarchenko/Interviewer) | Provider configuration through env vars | Nothing else |

## 11. FoloUp code: reuse vs. avoid

**Reuse:**
- `src/actions/parse-pdf.ts` (PDF → text)
- `src/lib/llm.ts` now provides the shared Gemini JSON adapter, based on the existing pattern in `src/services/analytics.service.ts`. B uses its published `generateJson(LlmRequest): Promise<unknown>` interface and validates the returned task shape.
- `src/components/ui/*` (shadcn)
- the Supabase services in `src/services/*`
- the camera `getUserMedia` setup in `src/components/call/index.tsx`

**Removed at repo init:** `api/response-webhook` (broken), `api/analyze-communication` + its prompt (never called), 4 unreferenced images, FoloUp's CONTRIBUTING.md and issue/PR templates.

**Avoid / known broken:**
- `src/components/call/tabSwitchPrevention.tsx`: the hook is instantiated twice (in `index.tsx` and inside `TabSwitchWarning`), so the stored count and the dialog have separate state. Use one instance.
- the Retell routes (`register-call`, `create-interviewer`, `get-call`), which the turn loop replaces
- hardcoded `"default-org"` in the contexts: leave it (auth is cut)

**Aural reuse targets (C owns adaptation):**
- `src/components/code-editor/code-editor-canvas.tsx`
- `src/components/whiteboard/whiteboard-canvas.tsx`
- `src/components/whiteboard/whiteboard-overrides.css`
- Inspect the upstream functional harnesses for useful save/load cases. Pin the source commit and record local modifications in `THIRD_PARTY_NOTICES.md` when copying. Copy only the needed wrappers/styles; inspect package compatibility instead of importing Aural's package manifest.

## 12. Cut list (running; add the date and reason for every cut)

| Cut | Why |
|---|---|
| Real auth | FoloUp has none. It doesn't score in judging, and D's time goes to making the demo work. |
| Retell voice | Its hosted LLM picks the questions, so the explicit logged rule is impossible. Replaced by the Web Speech API turn loop. |
| Code execution / sandbox / terminal | 2026-09-26 revision: Monaco editing and submission are approved; running candidate code needs a separate execution service and remains deferred. |
| Automated artifact scoring and code/diagram citations | 2026-09-26: keep validated spoken evidence as the scoring basis; saved artifacts are available for human review. |
| Collaborative whiteboard and image uploads | 2026-09-26: single-candidate shapes/text drawing is sufficient for the technical demo. |
| Recruiter-editable rubric | The rubric is fixed and shown, not editable. |
| Live counterfactual audit | Adds latency on stage. Precomputed on the golden sample only. |
| Webcam recording upload | Not needed by any pillar. |
| Candidate feedback view | **Cut first if time is tight** (the data already exists in `Evaluation.candidateFeedback`). |

## 13. Open TODO(team)

- Fill in the total hackathon length.
- Assign actual names to A/B/C/D and record D's expected joining time in the team plan. Unknown arrival time does not block A/B/C.
- Approve or deny any Supabase column additions (the current plan needs none).
- Confirm a Chrome-only demo machine (the Web Speech API requirement).
