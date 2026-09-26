// Shared client-safe allowlist definitions for Excalidraw whiteboard scenes (CLAUDE.md §4).
// Pure module: no "server-only" import and no server-specific dependencies, making it safe
// to import in both client-side components (sanitizer) and server validators.
// The server validator in src/lib/pipeline/answer-artifact.ts remains authoritative.

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
