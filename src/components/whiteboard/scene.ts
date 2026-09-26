// Scene serialization for whiteboard submissions (CLAUDE.md §4: `sceneJson` contains only the
// drawing elements and whitelisted display state, with no binary files or collaborators).
// Pure functions, no Excalidraw import, so they are safe to use anywhere.

type SceneElement = Record<string, unknown>;

const APP_STATE_ALLOWLIST = ["viewBackgroundColor", "gridSize"] as const;

export interface SafeScene {
  elements: SceneElement[];
  appState: Partial<Record<(typeof APP_STATE_ALLOWLIST)[number], unknown>>;
}

export const EMPTY_SCENE: SafeScene = { elements: [], appState: {} };

export function toSafeScene(
  elements: readonly SceneElement[],
  appState: Record<string, unknown> | undefined,
): SafeScene {
  const safeElements = elements.filter(
    // Images need binary files, which are out of scope; deleted elements are history, not content.
    (el) => el.type !== "image" && el.isDeleted !== true,
  );
  const safeAppState: SafeScene["appState"] = {};
  for (const key of APP_STATE_ALLOWLIST) {
    if (appState && appState[key] !== undefined && appState[key] !== null) {
      safeAppState[key] = appState[key];
    }
  }
  return { elements: safeElements.map((el) => ({ ...el })), appState: safeAppState };
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
