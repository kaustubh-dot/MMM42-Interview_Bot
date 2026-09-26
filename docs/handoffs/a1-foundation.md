# A1 foundation handoff

Branch: `feat/interview-engine`. Merge the focused A1 PR into main before teammates integrate these interfaces. A2/A3 API routes and B/D service implementations are not part of A1.

## B: shared model adapter and grading types

```ts
import { generateJson } from "@/lib/llm";
import type { GradeInput, GradeResult, LlmRequest } from "@/types/pipeline-api";

const request: LlmRequest = {
  task: "grade",
  system: "Score only the spoken answer using the supplied rubric. Return JSON.",
  input: {
    claimId: "c2",
    questionText: "Explain the query's grouping.",
    answerText: "Grouping gives a count per customer.",
    rubric: [
      { grade: 0, label: "No evidence", anchor: "No relevant evidence." },
      { grade: 1, label: "Surface", anchor: "Names tools without a mechanism." },
      { grade: 2, label: "Working", anchor: "Mechanism and a concrete detail." },
      { grade: 3, label: "Deep", anchor: "Mechanism, trade-offs and failure modes." },
    ],
  },
  mockOutput: { grade: 2, term: "grouping", quote: "Grouping gives a count per customer." },
};
const raw: unknown = await generateJson(request);
// Validate raw with the grader's schema before returning GradeResult.
```

Use the actual `InterviewPlan.rubric` in production; the literal above is only a standalone API example. `LlmRequest.input` and `mockOutput` are JSON values. Build an explicit JSON object from typed domain inputs; do not cast unchecked model output to a pipeline type.

Set `LLM_MODE=mock` in the local environment for fixture development. It returns an independent copy of `mockOutput` without credentials or network access. Set `LLM_MODE=gemini` and `GEMINI_API_KEY` for live calls. There is no silent mode fallback. Missing mode/key, upstream failures and malformed replies throw `LlmError` with respectively `LLM_CONFIGURATION`, `LLM_UPSTREAM`, or `LLM_INVALID_RESPONSE`; errors do not expose provider payloads. The adapter uses Gemini 2.5 Flash JSON mode, a 30-second timeout, and one attempt. Route-level user retries belong to A2.

`generateJson` is server-only, not a callable Server Action. B owns the grade/evaluate/audit schemas and prompts. The adapter does not invent evaluation logic. Private `goldenReport` is still available from `@/fixtures/golden-interview` in server code; browser imports are now blocked. Raw `fixtures/golden-interview.json` is also private source data and must not enter client imports.

## C: safe fixtures and client types

```ts
import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import { workspaceExamples } from "@/fixtures/workspace-interview";
import type {
  ClientInterviewPlan,
  ClientInterviewRecord,
  ClientInterviewReport,
  SubmitTurnRequest,
  TurnReply,
} from "@/types/pipeline-api";
import type { AnswerArtifact } from "@/types/pipeline";
```

- `clientGoldenReport` is a generated, browser-safe full sample, with unchanged transcript/citations/decisions. It does not import the server fixture at runtime.
- `workspaceExamples` contains two standalone examples: code (`sql`) and whiteboard (Excalidraw-compatible rectangle/text scene). Each has `label`, `kind` and `record`. These isolated submission examples have no scored report or adaptive decision history; label them as samples.
- `QuestionLadder.workspace` selects `{ kind: "code" }` or `{ kind: "whiteboard", prompt }`. Absent workspace with an existing technical code snippet is the legacy code-mode fallback.
- Candidate turns may carry one `AnswerArtifact`: `{ kind: "code", language, code }` or `{ kind: "whiteboard", sceneJson }`. Code and drawings support human review; they are not automatic score sources.
- The submit request sends artifacts, text/timing, integrity events and face availability. It does not send a client-created grade, turn ID, or hidden answer. Set `faceSignals.available` false until capture actually loads.
- The declared `SubmitTurnRequest` does not accept `typedAnswer`; A2 derives that compatibility field from a code artifact on the server. Do not append artifact contents to spoken `text`.
- Keep empty code/cleared scenes as explicit submissions. A2 will enforce the planned byte/shape limits; this foundation does not yet contain the submit route.

Use fixtures directly while routes are being built. Send editor dependency version requests to A so shared manifests remain coordinated.

## A/D: server projections and session envelope

```ts
import { toClientPlan, toClientRecord, toClientReport } from "@/lib/pipeline/client-projection";
import type { SavedSession } from "@/types/pipeline-api";
```

Project before serializing to a browser. These functions copy only allowed fields and omit hidden coding issues/server metadata; TypeScript `Omit` alone would not strip runtime properties. They consume trusted server records, not unvalidated request JSON. Free text and scene strings must be validated at ingestion in A2; projection is not a general content-redaction or scene-validation tool.

`SavedSession` includes the private record, last accepted request/reply, completion flag and face availability. D stores session metadata alongside the top-level record fields in the existing details JSON object. Do not return the envelope directly. Chain entries are preserved for display, but verification remains a server-side stretch task against complete canonical payloads; the sanitized client projection is not the signed source of truth.

## Checks and regeneration

```sh
npm ci
npm run test:foundation
npm run fixture:golden
npm run fixture:client
```

`test:foundation` compiles an isolated CommonJS output into ignored `.foundation-build/` and runs Node's built-in tests under the `react-server` condition. This condition permits server-only modules in the test process; it must not be used to bypass Next.js client boundaries. No new test framework is installed.

The fixture commands write generated files. Review their diffs. The golden generator retains its existing rule, citation and integrity assertions. `fixture:client` uses the real server projection to create a separate checked-in safe TypeScript literal. Do not hand-edit either generated file.

Supported package installation for this handoff is `npm ci` with the checked-in npm lockfile. The Yarn lock also retains the matching server-only entry; avoid regenerating both locks independently on teammate branches.

## Validation recorded for A1

- Foundation: seven Node tests pass, including the server-only import guard, hidden-answer removal, exact citation preservation, fixture equality, workspace serialization, no-network mock behavior, configuration errors and intercepted Gemini success/failure responses.
- TypeScript: full `npx tsc --noEmit --pretty false` passes. Scoped Biome checks pass on the A1 code/config files.
- Golden regeneration retains 17 turns, 9 decisions, 27 chain entries and Medium/3 integrity; the golden JSON payload is unchanged.
- Repository-wide `npm run check:ci` still reports 99 errors in inherited files. No broad formatting cleanup is included in this foundation handoff.
- `npm run build` compiles and finishes TypeScript with font download access, then fails collecting page data because existing Supabase-dependent routes have no configured Supabase URL. Full app startup/build needs the project's environment setup; A1 does not supply credentials.
- Independent scoped code review found no actionable issues. Live Gemini credentials and rendered editor/canvas behavior have not been tested; editor integration is C's workstream.
