# Workspace Dependencies and A-Side Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete A-side integration by pinning Monaco and Excalidraw dependencies in `package.json` and `package-lock.json`, exposing the Excalidraw scene allowlist in a client-safe module while keeping the server validator authoritative, reviewing C's practice routes/LLM task, and coordinating speech timing while keeping latency scoring disabled.

**Architecture:** 
1. Pinned client workspace dependencies (`@monaco-editor/react@4.7.0`, `monaco-editor@0.52.2`, `@excalidraw/excalidraw@0.18.0`) managed via the canonical `package-lock.json` npm workflow.
2. Allowlist constants (`DRAWING_TYPES`, `ELEMENT_KEYS`, `BINDING_KEYS`, `FORBIDDEN_KEYS`, `SCENE_LIMIT`, `CODE_LIMIT`, `CLEARED_SCENE`) extracted into `src/lib/pipeline/whiteboard-allowlist.ts` (browser-safe, no `server-only`), while `src/lib/pipeline/answer-artifact.ts` retains `server-only` and authoritative Zod validation.
3. Review C's `/api/practice/*` routes and `"practice"` LLM task for security, server-only boundaries, and mock fallback compatibility.
4. Formalize speech timing coordination with B and C, keeping latency scoring disabled in `src/lib/pipeline/report.ts`.

**Tech Stack:** Next.js 16, React 18, TypeScript, Monaco Editor, Excalidraw, npm.

**Spec:** User prompt requirements for A-side integration on branch `feat/workspace-dependencies`.

## Global Constraints
- Target branch is `feat/workspace-dependencies`, created from `main`.
- Dependencies must match: `@monaco-editor/react@4.7.0`, `monaco-editor@0.52.2`, `@excalidraw/excalidraw@0.18.0`.
- Use npm lockfile workflow (`package-lock.json`); do NOT regenerate `yarn.lock`.
- Keep changes scoped strictly to A-owned files; do NOT edit C's branch or C-owned files (`src/components/whiteboard/scene.ts`, etc.).
- Expose scene allowlist without crossing the `server-only` boundary; server validator remains authoritative.
- Latency scoring remains disabled until an agreed multi-party contract between A, B, and C is established.
- Clean dependency install and focused checks (`test:foundation`, `test:a2`, Biome check on modified files).

---

### Task 1: Pin Monaco and Excalidraw Dependencies in package.json and package-lock.json

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: npm registry
- Produces: Installed `@monaco-editor/react@4.7.0`, `monaco-editor@0.52.2`, `@excalidraw/excalidraw@0.18.0` in `package.json` and `package-lock.json`

- [ ] **Step 1: Install pinned dependencies using npm**
Run: `npm install --save-exact @monaco-editor/react@4.7.0 monaco-editor@0.52.2 @excalidraw/excalidraw@0.18.0`

- [ ] **Step 2: Verify package.json contains exact versions**
Check `package.json` to verify:
```json
"@excalidraw/excalidraw": "0.18.0",
"@monaco-editor/react": "4.7.0",
"monaco-editor": "0.52.2"
```

- [ ] **Step 3: Verify git status confirms only package.json and package-lock.json modified**
Verify that `yarn.lock` was untouched.

- [ ] **Step 4: Commit dependency update**
```bash
git add package.json package-lock.json
git commit -m "build: pin Monaco and Excalidraw dependencies in package.json and package-lock.json"
```

---

### Task 2: Expose Excalidraw Scene Allowlist in Shared Client-Safe Module

**Files:**
- Create: `src/lib/pipeline/whiteboard-allowlist.ts`
- Modify: `src/lib/pipeline/answer-artifact.ts`

**Interfaces:**
- Consumes: Allowlist definitions in `answer-artifact.ts`
- Produces: Client-safe exports (`DRAWING_TYPES`, `ELEMENT_KEYS`, `BINDING_KEYS`, `FORBIDDEN_KEYS`, `SCENE_LIMIT`, `CODE_LIMIT`, `CLEARED_SCENE`) in `src/lib/pipeline/whiteboard-allowlist.ts` without `server-only`. Server validator in `answer-artifact.ts` consumes them with `server-only` retained.

- [ ] **Step 1: Create client-safe `src/lib/pipeline/whiteboard-allowlist.ts`**
Extract:
```typescript
// Shared client-safe allowlists for whiteboard scenes (CLAUDE.md §4).
// Safe to import in both browser components and server validators (no "server-only").

export const CODE_LIMIT = 100 * 1024;
export const SCENE_LIMIT = 500 * 1024;

export const DRAWING_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
]);

export const ELEMENT_KEYS = new Set([
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "groupIds",
  "frameId",
  "roundness",
  "seed",
  "version",
  "versionNonce",
  "isDeleted",
  "boundElements",
  "updated",
  "link",
  "locked",
  "index",
  "text",
  "originalText",
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "containerId",
  "autoResize",
  "lineHeight",
  "points",
  "pressures",
  "simulatePressure",
  "lastCommittedPoint",
  "startBinding",
  "endBinding",
  "elbowed",
  "arrowType",
  "flipHorizontal",
  "flipVertical",
  "scale",
  "startArrowhead",
  "endArrowhead",
  "fixedSegments",
  "startIsSpecial",
  "endIsSpecial",
]);

export const BINDING_KEYS = ["elementId", "focus", "gap", "fixedPoint"] as const;

export const FORBIDDEN_KEYS = new Set([
  "files",
  "collaborators",
  "fileId",
  "dataURL",
  "src",
  "url",
  "base64",
  "binary",
]);

export const CLEARED_SCENE = '{"elements":[],"appState":{}}';
```

- [ ] **Step 2: Update `src/lib/pipeline/answer-artifact.ts` to import allowlist**
Update imports to bring in the shared constants from `./whiteboard-allowlist`, retaining `import "server-only";` and authoritative Zod validation.

- [ ] **Step 3: Run existing foundation and A2 tests**
Run: `npm run test:foundation && npm run test:a2`
Verify: All 7/7 and 16/16 tests pass.

- [ ] **Step 4: Run Biome check on modified files**
Run: `npx @biomejs/biome check src/lib/pipeline/whiteboard-allowlist.ts src/lib/pipeline/answer-artifact.ts`

- [ ] **Step 5: Commit allowlist refactor**
```bash
git add src/lib/pipeline/whiteboard-allowlist.ts src/lib/pipeline/answer-artifact.ts
git commit -m "feat(pipeline): expose client-safe Excalidraw scene allowlist module"
```

---

### Task 3: Review C's Practice LLM Task and Routes for Contract Compatibility

**Files:**
- Review: `src/types/pipeline-api.ts`
- Review: `src/app/api/practice/help/route.ts`
- Review: `src/app/api/practice/problems/route.ts`
- Review: `src/lib/practice/service.ts`
- Review: `src/lib/practice/route-helpers.ts`

**Interfaces:**
- Consumes: A's `generateJson` in `src/lib/llm.ts`, `LlmRequest` in `src/types/pipeline-api.ts`
- Produces: Documented compatibility review and confirmation of server-side validation.

- [ ] **Step 1: Check server-only boundary and isolation**
Confirm `src/lib/practice/service.ts` and `src/lib/practice/route-helpers.ts` include `import "server-only";`.

- [ ] **Step 2: Verify `LlmRequest` contract in `src/types/pipeline-api.ts`**
Confirm `"practice"` task is typed in union: `task: "plan" | "grade" | "evaluate" | "audit" | "practice";`.

- [ ] **Step 3: Verify request validation and error handling**
Confirm `handleJson` validates max body size (256 KB) and Zod schema. Confirm `getHelp` catches `LlmError` and falls back to deterministic built-in notes without leaking internal provider details or throwing unhandled errors.

- [ ] **Step 4: Document review findings for C**
Confirm no breaking changes or contract adjustments needed.

---

### Task 4: Formalize Speech Timing Coordination with B and C (Keep Latency Scoring Disabled)

**Files:**
- Review: `src/lib/pipeline/report.ts`
- Document: Handoff / PR coordination notes

**Interfaces:**
- Consumes: `fuseIntegrity` in `src/lib/pipeline/integrity.ts`
- Produces: Verified disabled latency input in `src/lib/pipeline/report.ts` (`turns: []`) pending agreement.

- [ ] **Step 1: Verify `src/lib/pipeline/report.ts` keeps latency disabled**
Confirm lines 60-63 in `report.ts` pass `{ ...session.record, turns: [] }` to `fuseIntegrity`.

- [ ] **Step 2: Document timing coordination requirements**
Document requirements for B and C regarding speech completion (browser `speechSynthesis.onend` / speech queue draining) vs candidate first-speech onset (`firstSpeechAtPerf`). Latency scoring remains disabled until all parties sign off.

---

### Task 5: Verification, Clean Build Checks, and PR Preparation

**Files:**
- Review: Git diff against `main`

- [ ] **Step 1: Run clean dependency install check**
Run: `npm ls @monaco-editor/react monaco-editor @excalidraw/excalidraw`
Verify exact dependency tree resolution.

- [ ] **Step 2: Run test suites**
Run: `npm run test:foundation && npm run test:a2`
Verify: All tests pass.

- [ ] **Step 3: Run Biome check on modified files**
Run: `npx @biomejs/biome check src/lib/pipeline/whiteboard-allowlist.ts src/lib/pipeline/answer-artifact.ts`

- [ ] **Step 4: Create handoff and summary for PR targeting `main`**
Review full diff against `main` ensuring only A-owned files are touched.
