// Scene serialization for whiteboard submissions (CLAUDE.md §4: `sceneJson` contains only the
// drawing elements and whitelisted display state, with no binary files or collaborators).
// Pure functions, no Excalidraw import, so they are safe to use anywhere.
//
// The allowlists below mirror A's server validator in src/lib/pipeline/answer-artifact.ts
// (DRAWING_TYPES, ELEMENT_KEYS, binding shape, appState). Keep them in sync: the server rejects
// any scene with other element types or fields.

type SceneElement = Record<string, unknown>;

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

const BINDING_KEYS = ["elementId", "focus", "gap", "fixedPoint"] as const;

export interface SafeScene {
  elements: SceneElement[];
  appState: { viewBackgroundColor?: string };
}

export const EMPTY_SCENE: SafeScene = { elements: [], appState: {} };

function safeBinding(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value ?? null;
  }
  const b = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of BINDING_KEYS) {
    if (b[key] !== undefined) {
      out[key] = b[key];
    }
  }
  return out;
}

function safeElement(el: SceneElement): SceneElement {
  const out: SceneElement = {};
  for (const [key, value] of Object.entries(el)) {
    if (ELEMENT_KEYS.has(key) && value !== undefined) {
      out[key] = key === "startBinding" || key === "endBinding" ? safeBinding(value) : value;
    }
  }
  // Links are external content; the server only accepts `link: null` or no link.
  if (Array.isArray(out.boundElements)) {
    out.boundElements = (out.boundElements as Record<string, unknown>[]).map((b) => ({
      id: b.id,
      type: b.type,
    }));
  }
  return out;
}

export function toSafeScene(
  elements: readonly SceneElement[],
  appState: Record<string, unknown> | undefined,
): SafeScene {
  const safeElements = elements
    // Only plain drawing shapes: no images, frames, embeds or deleted history.
    .filter((el) => DRAWING_TYPES.has(String(el.type)) && el.isDeleted !== true)
    .map(safeElement);
  const bg = appState?.viewBackgroundColor;
  return {
    elements: safeElements,
    appState:
      typeof bg === "string" && /^#[0-9a-fA-F]{3,8}$/.test(bg) ? { viewBackgroundColor: bg } : {},
  };
}

export function serializeScene(scene: SafeScene): string {
  return JSON.stringify(scene);
}

/** Parses stored scene JSON back into a safe scene. Returns null for invalid input. */
export function parseScene(sceneJson: string): SafeScene | null {
  try {
    const raw = JSON.parse(sceneJson) as { elements?: unknown; appState?: unknown };
    if (!raw || !Array.isArray(raw.elements)) {
      return null;
    }
    return toSafeScene(
      raw.elements as SceneElement[],
      (raw.appState as Record<string, unknown>) ?? undefined,
    );
  } catch {
    return null;
  }
}
