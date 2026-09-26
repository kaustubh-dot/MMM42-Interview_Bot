import "server-only";

import { z } from "zod";

import type { AnswerArtifact, Claim, Rung } from "../../types/pipeline";
import { PipelineError } from "./errors";

const CODE_LIMIT = 100 * 1024;
const SCENE_LIMIT = 500 * 1024;
const DRAWING_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
]);
const ELEMENT_KEYS = new Set([
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
const FORBIDDEN_KEYS = new Set([
  "files",
  "collaborators",
  "fileId",
  "dataURL",
  "src",
  "url",
  "base64",
  "binary",
]);
const CLEARED_SCENE = '{"elements":[],"appState":{}}';
const finite = z.number().finite();
const point = z.tuple([finite, finite]);
const nullableId = z.string().nullable().optional();
const binding = z
  .object({
    elementId: z.string(),
    focus: finite,
    gap: finite,
    fixedPoint: point.nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();
const elementShape = z
  .object({
    id: z.string().min(1),
    type: z.string(),
    x: finite,
    y: finite,
    width: finite.nonnegative(),
    height: finite.nonnegative(),
    angle: finite.optional(),
    strokeWidth: finite.optional(),
    roughness: finite.optional(),
    opacity: finite.optional(),
    seed: finite.optional(),
    version: finite.optional(),
    versionNonce: finite.optional(),
    updated: finite.optional(),
    fontSize: finite.optional(),
    fontFamily: finite.optional(),
    lineHeight: finite.optional(),
    strokeColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    fillStyle: z.string().optional(),
    strokeStyle: z.string().optional(),
    index: z.string().nullable().optional(),
    text: z.string().optional(),
    originalText: z.string().optional(),
    textAlign: z.string().optional(),
    verticalAlign: z.string().optional(),
    isDeleted: z.boolean().optional(),
    locked: z.boolean().optional(),
    autoResize: z.boolean().optional(),
    simulatePressure: z.boolean().optional(),
    elbowed: z.boolean().optional(),
    flipHorizontal: z.boolean().optional(),
    flipVertical: z.boolean().optional(),
    groupIds: z.array(z.string()).optional(),
    frameId: nullableId,
    containerId: nullableId,
    roundness: z.object({ type: finite, value: finite.optional() }).strict().nullable().optional(),
    boundElements: z
      .array(z.object({ id: z.string(), type: z.string() }).strict())
      .nullable()
      .optional(),
    points: z.array(point).optional(),
    pressures: z.array(finite).optional(),
    lastCommittedPoint: point.nullable().optional(),
    scale: point.optional(),
    startBinding: binding,
    endBinding: binding,
    startArrowhead: z.string().nullable().optional(),
    endArrowhead: z.string().nullable().optional(),
    fixedSegments: z
      .array(z.object({ start: point, end: point, index: finite }).strict())
      .nullable()
      .optional(),
    startIsSpecial: z.boolean().nullable().optional(),
    endIsSpecial: z.boolean().nullable().optional(),
    link: z.null().optional(),
    arrowType: z.string().optional(),
  })
  .strict();

function invalid(message: string): never {
  throw new PipelineError("INVALID_ARTIFACT", message, 400);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenContent(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      for (const child of item) {
        stack.push(child);
      }
    } else if (object(item)) {
      for (const [key, child] of Object.entries(item)) {
        if (FORBIDDEN_KEYS.has(key)) {
          return true;
        }
        stack.push(child);
      }
    }
  }
  return false;
}

export function questionWorkspace(claim: Claim, rung: Rung): "code" | "whiteboard" | null {
  if (!claim.isTechnical || rung !== "scenarioTwist") {
    return null;
  }
  if (claim.ladder.workspace?.kind === "whiteboard") {
    return "whiteboard";
  }
  if (claim.ladder.workspace?.kind === "code" || claim.ladder.codeSnippet) {
    return "code";
  }
  return null;
}

function validateScene(sceneJson: string): string {
  if (Buffer.byteLength(sceneJson, "utf8") > SCENE_LIMIT) {
    throw new PipelineError("ARTIFACT_TOO_LARGE", "Whiteboard scene exceeds 500 KiB.", 400);
  }
  if (sceneJson === "") {
    return CLEARED_SCENE;
  }
  let scene: unknown;
  try {
    scene = JSON.parse(sceneJson);
  } catch {
    return invalid("Whiteboard scene must be valid JSON.");
  }
  if (!object(scene) || Object.keys(scene).some((key) => !["elements", "appState"].includes(key))) {
    return invalid("Whiteboard scene may contain only elements and display state.");
  }
  if (!Array.isArray(scene.elements)) {
    return invalid("Whiteboard elements must be an array.");
  }
  if (
    scene.appState !== undefined &&
    (!object(scene.appState) ||
      Object.keys(scene.appState).some((key) => key !== "viewBackgroundColor") ||
      (scene.appState.viewBackgroundColor !== undefined &&
        (typeof scene.appState.viewBackgroundColor !== "string" ||
          !/^#[0-9a-fA-F]{3,8}$/.test(scene.appState.viewBackgroundColor))))
  ) {
    return invalid("Whiteboard display state is invalid.");
  }
  for (const element of scene.elements) {
    if (
      !object(element) ||
      Object.keys(element).some((key) => !ELEMENT_KEYS.has(key)) ||
      hasForbiddenContent(element) ||
      !elementShape.safeParse(element).success ||
      typeof element.id !== "string" ||
      !element.id ||
      !DRAWING_TYPES.has(String(element.type)) ||
      ![element.x, element.y, element.width, element.height].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      (element.link !== undefined && element.link !== null)
    ) {
      return invalid("Whiteboard contains an unsupported element or external content.");
    }
    if (
      (["arrow", "line", "freedraw"].includes(String(element.type)) &&
        !Array.isArray(element.points)) ||
      (element.type === "text" && typeof element.text !== "string")
    ) {
      return invalid("Whiteboard element content is missing or malformed.");
    }
    if (
      element.type === "freedraw" &&
      (!Array.isArray(element.pressures) ||
        typeof element.simulatePressure !== "boolean" ||
        (!element.simulatePressure &&
          element.pressures.length !== (element.points as unknown[]).length))
    ) {
      return invalid("Freehand strokes need valid pressure data.");
    }
  }
  return sceneJson;
}

export function validateArtifacts(raw: unknown, claim: Claim, rung: Rung): AnswerArtifact[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || raw.length > 1) {
    return invalid("Submit at most one artifact.");
  }
  if (raw.length === 0) {
    return [];
  }
  const artifact: unknown = raw[0];
  const workspace = questionWorkspace(claim, rung);
  if (!object(artifact) || artifact.kind !== workspace || !workspace) {
    return invalid("Artifact kind must match the active technical workspace.");
  }
  if (workspace === "code") {
    if (
      typeof artifact.code !== "string" ||
      typeof artifact.language !== "string" ||
      !/^[a-zA-Z0-9+.#_-]{1,32}$/.test(artifact.language) ||
      Object.keys(artifact).some((key) => !["kind", "language", "code"].includes(key))
    ) {
      return invalid("Code artifact must contain a language and code string.");
    }
    if (Buffer.byteLength(artifact.code, "utf8") > CODE_LIMIT) {
      throw new PipelineError("ARTIFACT_TOO_LARGE", "Code exceeds 100 KiB.", 400);
    }
    return [{ kind: "code", language: artifact.language, code: artifact.code }];
  }
  if (
    typeof artifact.sceneJson !== "string" ||
    Object.keys(artifact).some((key) => !["kind", "sceneJson"].includes(key))
  ) {
    return invalid("Whiteboard artifact must contain a scene JSON string.");
  }
  return [{ kind: "whiteboard", sceneJson: validateScene(artifact.sceneJson) }];
}
