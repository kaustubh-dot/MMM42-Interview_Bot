# A-Side Workspace Dependencies and Integration Handoff

Base: `26c9b30` (latest `main`). Branch: `feat/workspace-dependencies`.

## 1. Pinned Workspace Dependencies

Dependencies requested by C for Monaco and Excalidraw have been installed with exact versions into `package.json` and resolved in the canonical `package-lock.json`:
- `@monaco-editor/react`: `4.7.0`
- `monaco-editor`: `0.52.2`
- `@excalidraw/excalidraw`: `0.18.0`

Followed the repo's npm lockfile workflow; `yarn.lock` was preserved without regeneration.
`npm ls @monaco-editor/react monaco-editor @excalidraw/excalidraw` confirms clean resolution:
```
foloup-app@0.1.0
+-- @excalidraw/excalidraw@0.18.0
+-- @monaco-editor/react@4.7.0
|   `-- monaco-editor@0.52.2 deduped
`-- monaco-editor@0.52.2
```

## 2. Excalidraw Scene Allowlist Module

Exposed a shared client-safe allowlist module: `src/lib/pipeline/whiteboard-allowlist.ts`.
- **Pure module**: Does NOT import `server-only`, making it safe for browser consumption in C-owned components.
- **Exports**: `DRAWING_TYPES`, `ELEMENT_KEYS`, `BINDING_KEYS`, `FORBIDDEN_KEYS`, `SCENE_LIMIT`, `CODE_LIMIT`, `CLEARED_SCENE`.
- **Authoritative Validator**: `src/lib/pipeline/answer-artifact.ts` retains `import "server-only";` and its strict Zod validation (`elementShape`, `validateScene`, byte limits), consuming the shared constants from `./whiteboard-allowlist`.
- **Request for C**: C can now update `src/components/whiteboard/scene.ts` to import `DRAWING_TYPES`, `ELEMENT_KEYS`, and `BINDING_KEYS` directly from `@/lib/pipeline/whiteboard-allowlist` rather than maintaining duplicate sets.

## 3. Review of C's `practice` LLM Task and `/api/practice/*` Routes

Reviewed C's practice implementation for compatibility with A's contracts and server-side validation:
1. **Shared LLM Contract (`src/lib/llm.ts`, `src/types/pipeline-api.ts`)**:
   - `LlmRequest` in `src/types/pipeline-api.ts` defines `task: "plan" | "grade" | "evaluate" | "audit" | "practice"`.
   - `src/lib/practice/service.ts` calls `generateJson({ task: "practice", system, input, mockOutput })`.
   - In `LLM_MODE=mock`, it gracefully serves deterministic built-in notes grounded in the open-source dataset (`isMockMode()`).
   - Handles `LlmError` cleanly by falling back to built-in dataset notes without exposing internal provider errors.
2. **Server-Side Security & Boundaries**:
   - Both `src/lib/practice/service.ts` and `src/lib/practice/route-helpers.ts` correctly declare `import "server-only";`.
   - Input payloads are size-capped at 256 KiB and validated against strict Zod schemas (`setRequestSchema`, `helpRequestSchema`).
   - Reference solutions and test cases remain server-side only; they are never leaked in client problem projections.
   - No code execution service is involved.
3. **Route Isolation**:
   - Routes live under `/api/practice/problems` and `/api/practice/help`, cleanly decoupled from `/api/pipeline/*`.
4. **Conclusion**:
   - C's practice implementation is fully compatible with A's contracts. No contract changes are required.

## 4. Speech Completion & First-Speech Timing Coordination (B & C)

- **Timing Signal Status**: Browser Web Speech synthesis (`speechSynthesis.onend`) and first-speech onset (`speech.firstSpeechAtPerf`) can experience variability across operating systems and client devices (e.g. speech synthesis queue stalling, early candidate responses, typed submissions).
- **Latency Scoring Policy**: As established in `src/lib/pipeline/report.ts` (`const integrity = fuseIntegrity({ ...session.record, turns: [] }, session.faceSignals)`), turn-level latency input to integrity fusion **remains disabled / unavailable**.
- **Agreement**: Latency scoring must not be enabled until A, B, and C agree on and implement a reliable multi-party contract with deterministic browser-reported timestamps. Integrity event signals (tab focus, paste, MediaPipe face tracking) continue to fuse independently without altering evaluation scores.

## 5. Verification Checks

- `npm run test:foundation`: 7/7 tests passed.
- `npm run test:a2`: 16/16 tests passed.
- `npx tsc --noEmit`: 0 errors across the entire codebase.
- `npx @biomejs/biome check src/lib/pipeline/whiteboard-allowlist.ts src/lib/pipeline/answer-artifact.ts`: Clean, 0 errors.
- Clean dependency tree confirmed via `npm ls`.
