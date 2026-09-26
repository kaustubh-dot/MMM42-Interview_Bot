# CLAUDE.md: source of truth for the hackathon build

> If code and this file disagree, that is a bug. Fix whichever one is wrong, in the same change.
> Last updated: 2026-09-26, setup session (contract + fixture only, no feature code yet).

## 1. Summary

We are building an AI interview platform on top of the FoloUp codebase (Next.js + Supabase). It interviews a candidate by voice about the specific claims on their resume that matter for the job, adapts each question with a rule simple enough to say out loud, produces an evaluation where every score is tied to the candidate's exact words, audits that evaluation for unfairness in a visible section, and reports integrity signals as a Low/Medium/High concern level for a human to review. It never gives a cheating verdict.

**Four things that differentiate this from a generic AI-interviewer clone** (FoloUp included):
1. **Structured, claim-based questioning.** The resume and JD are turned into ranked `Claim`s, each with a precomputed question ladder. There are no generic "tell me about X" questions.
2. **An explainable adaptive selection rule.** One deterministic rule, and every turn logs a machine-readable reason code shown live in the UI.
3. **Evidence-cited evaluation + scoped bias audit.** Every score cites character offsets in the transcript, validated in code. A separate auditor pass checks a fixed 3-item fairness checklist and is shown in the report.
4. **Integrity monitoring as a concern band.** Low / Medium / High with every signal, threshold and benign explanation visible. It never produces a verdict and never affects scores.

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
| Hash chain | Node `crypto` sha256 | Built in. |
| Lint | Biome (`npm run check:ci` in CI) | Already in FoloUp. |

**Not used:** Retell (replaced by our turn loop), auth (see cut list), Prisma (listed in package.json but there's no schema; don't use it).

## 3. Pillars

Status values: `not started` → `in progress` → `demo path works` → `done`. **Update the status whenever it changes.**

### Pillar 1: Profile-aware questioning. Owner: **A** (C supports with UI)
- **Done looks like:** upload a resume PDF + paste or upload a JD → `InterviewPlan` with ranked `Claim[]`.
  - Each claim has verbatim `resumeEvidence` + `jdRequirement` and a full `QuestionLadder`.
  - Technical claims also get a `codeSnippet` with a planted issue.
  - Ranking is `jdWeight × (1 − specificity)`: vague claims about things the JD needs are probed first.
  - The first question must name a concrete resume detail and ask about mechanism, trade-off or failure. Reject "tell me about X".
- **Status:** not started. The fixture plan exists in `src/fixtures/golden-interview.ts`.

### Pillar 2: Adaptive interview engine. Owner: **A** (B supports with the grader)
- **Done looks like:** a spoken interview in Chrome. Each turn: STT → a grade call scores the answer 0–3 on the shared rubric → the pure function `selectNext()` applies the rule → the question text comes from the precomputed ladder (the LLM only fills `{{term}}` / `{{quote}}`) → TTS. Every turn appends a `Decision` with a `ReasonCode`, and a live decision-log panel shows them.
- **Status:** not started. The reference rule implementation is in `scripts/build-golden-fixture.mjs` (`selectNext`). The live version must match it.

### Pillar 3: Evidence-grounded evaluation + scoped audit. Owner: **B**
- **Done looks like:**
  - An `Evaluation` where every `ClaimEvaluation` has ≥1 `Citation {turnId, start, end, quote}`.
  - A **code validator** checks `turn.text.slice(start, end) === quote` and that the turn is a candidate turn. It removes failing scores and counts them in `removedUncited`.
  - Blind scoring: name, school and employer are redacted before the evaluator prompt.
  - `evidenceStrength` is `thin` (<2 graded answers), `mixed` (grade spread ≥2) or `strong`. Anything not `strong` gets `needsHumanReview: true`.
  - One separate auditor call (different system prompt) returns an `Audit` against the fixed 3-item checklist, rendered as a visible report section.
  - The counterfactual rescoring is **precomputed on the golden sample only**.
- **Status:** not started. The precomputed evaluation and audit for the sample are in the fixture (the stage backup already exists).

### Pillar 4: Integrity monitoring. Owner: **D** capture / **B** fusion
- **Done looks like:**
  - `IntegrityEvent`s captured during the interview: tab blur/focus (fix the FoloUp double-hook bug), paste, and the MediaPipe events faceMissing >3s, multipleFaces >1.5s and lookAway >12s.
  - Deterministic fusion into an `IntegrityReport` (points table in §5).
  - The recruiter sees the level + every signal's value, threshold, points and benign explanations.
  - The candidate is told before starting what is monitored.
- **HARD REQUIREMENT:** never output a binary "cheating: yes/no". The output is a concern level that prompts human review, and it never changes any score. This sentence must appear in the fusion code and in any prompt for this pillar.
- **Status:** not started. The reference fusion is in `scripts/build-golden-fixture.mjs` (`fuseIntegrity`), and the fixture shows `Medium (3 pts)`.

### Stretch: hash-chained record. Owner: **D**
- `entryHash = sha256("v1|prevHash|seq|kind|refId|canonical_json(payload)")` over turns → decisions → evaluation. The genesis `prevHash` is 64 zeros. Canonical JSON uses sorted keys and drops undefined values.
- A "Verify" button recomputes the chain. It detects edits (hash mismatch), deletions (seq gap) and re-linking (prevHash mismatch).
- **Status:** not started. The reference `buildChain` is in the fixture script, and the fixture has 27 chain entries.

### Code-reasoning rung (technical roles). Owner: **A** + **C**, scheduled for 5:00–6:00
- On the `scenarioTwist` rung for claims with `isTechnical`, show `ladder.codeSnippet.code` read-only in a `<pre>`. The candidate explains the bug out loud and can optionally type a fix (`Turn.typedAnswer`). Same rule, rubric and validator. `plantedIssue` is never sent to the client.
- **Status:** not started. The fixture includes a SQL snippet on claim `c2`.

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

Build against the fixture until the upstream pillar is live. `LLM_MODE=mock` should make every LLM call return fixture data (to be implemented in the `src/lib/llm.ts` adapter).

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

## 7. Hour plan (6h build + 1h protected demo buffer; total hackathon length TODO(team))

| Time | A | B | C | D |
|---|---|---|---|---|
| 0:00–0:30 | Read this file + contract | same | same | same |
| 0:30–2:00 | P1 route: parse → claims + ladders | Grader + evaluator + citation validator on the fixture | Upload page + claims view (on the fixture) | `src/lib/llm.ts` adapter (`LLM_MODE`), turn-loop API skeleton, tab/paste capture |
| 2:00–3:30 | Live voice turn loop + `selectNext` | Auditor + integrity fusion | Live interview view + decision-log panel | MediaPipe capture, Supabase persistence |
| 3:30–5:00 | Integration | Precompute the backup run | Recruiter report page (click-to-highlight citations) | Deploy, end-to-end run |
| 5:00–6:00 | Code-reasoning rung | Fixes | Code-rung UI | Hash chain + Verify |
| **6:00** | **Feature freeze** | | | |
| 6:00–7:00 | Rehearse the demo twice, once on the fixture fallback | | | D owns the demo |

## 8. Judging criteria map (Design 5 · Functionality 14 · Innovation 10 · Feasibility 7 · Scalability 6 · Demonstration 8)

- **Functionality (14):** the end-to-end path through all 4 pillars comes first. The fixture fallback means the demo never dies.
- **Innovation (10):** none of the 7 reference repos combines all four differentiators (§1). Plus in-browser face signals and the hash chain.
- **Demonstration (8), 5-minute script:**
  1. Upload → ranked claims (30s).
  2. Live interview for 3–4 turns with the decision log ticking (90s).
  3. Report (90s): click a score to highlight its quote → audit section + counterfactual → concern band with its signals and benign explanations.
  4. Edit a DB row → Verify shows the chain broken (30s).
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
- the Gemini call pattern in `src/services/analytics.service.ts` (`new GoogleGenAI(...)`, `gemini-2.5-flash`, JSON mode). There's no shared helper yet, so `src/lib/llm.ts` is to be created by D.
- `src/components/ui/*` (shadcn)
- the Supabase services in `src/services/*`
- the camera `getUserMedia` setup in `src/components/call/index.tsx`

**Removed at repo init:** `api/response-webhook` (broken), `api/analyze-communication` + its prompt (never called), 4 unreferenced images, FoloUp's CONTRIBUTING.md and issue/PR templates.

**Avoid / known broken:**
- `src/components/call/tabSwitchPrevention.tsx`: the hook is instantiated twice (in `index.tsx` and inside `TabSwitchWarning`), so the stored count and the dialog have separate state. Use one instance.
- the Retell routes (`register-call`, `create-interviewer`, `get-call`), which the turn loop replaces
- hardcoded `"default-org"` in the contexts: leave it (auth is cut)

## 12. Cut list (running; add the date and reason for every cut)

| Cut | Why |
|---|---|
| Real auth | FoloUp has none. It doesn't score in judging, and D's time goes to making the demo work. |
| Retell voice | Its hosted LLM picks the questions, so the explicit logged rule is impossible. Replaced by the Web Speech API turn loop. |
| Full coding IDE + code execution | Needs a new library (Monaco) plus a sandbox (security/infra risk), and adds little Innovation. Replaced by the code-reasoning rung. |
| Recruiter-editable rubric | The rubric is fixed and shown, not editable. |
| Live counterfactual audit | Adds latency on stage. Precomputed on the golden sample only. |
| Webcam recording upload | Not needed by any pillar. |
| Candidate feedback view | **Cut first if time is tight** (the data already exists in `Evaluation.candidateFeedback`). |

## 13. Open TODO(team)

- Fill in the total hackathon length.
- Approve or deny any Supabase column additions (the current plan needs none).
- Confirm a Chrome-only demo machine (the Web Speech API requirement).
