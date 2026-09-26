"use client";

// Adapted from Aural (https://github.com/1146345502/aural-oss), MIT License,
// Copyright (c) 2025 Aural. Source: src/components/whiteboard/whiteboard-canvas.tsx
// at commit ff366fbf52f2adb15d288bd2ce659e925cbbaafc. Local changes are listed in
// THIRD_PARTY_NOTICES.md. Single candidate, shapes and text only: no images or collaboration.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import "@excalidraw/excalidraw/index.css";
import "./whiteboard-overrides.css";
import { EMPTY_SCENE, type SafeScene, toSafeScene } from "./scene";

// Minimal slice of the Excalidraw imperative API (avoids deep type imports).
interface ExcalidrawAPI {
  getSceneElements: () => readonly Record<string, unknown>[];
  getAppState: () => Record<string, unknown>;
  updateScene: (scene: Record<string, unknown>) => void;
  resetScene: () => void;
}

export interface WhiteboardCanvasRef {
  hasContent: () => boolean;
  /** Current sanitized scene, read synchronously from the live canvas. Empty scenes are returned. */
  getSnapshot: () => SafeScene;
  loadSnapshot: (scene: SafeScene) => void;
  resetScene: () => void;
}

interface WhiteboardCanvasProps {
  readOnly?: boolean;
  /** Initial scene. Read once on mount. */
  initialScene?: SafeScene;
  /** Debounced change callback for draft autosave. Fires for cleared scenes too. */
  onAutoSave?: (scene: SafeScene) => void;
  autoSaveInterval?: number;
  onDirty?: () => void;
  fillParent?: boolean;
  dark?: boolean;
  loadTimeoutMs?: number;
}

type LoadState = "loading" | "ready" | "error";

type AnyComponent = React.ComponentType<Record<string, unknown>>;

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasRef, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
    {
      readOnly = false,
      initialScene,
      onAutoSave,
      autoSaveInterval = 800,
      onDirty,
      fillParent = false,
      dark = false,
      loadTimeoutMs = 20000,
    },
    ref,
  ) {
    const [lib, setLib] = useState<{
      Excalidraw: AnyComponent;
      MainMenu: AnyComponent & { DefaultItems: Record<string, React.ComponentType> };
    } | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [loadAttempt, setLoadAttempt] = useState(0);

    const apiRef = useRef<ExcalidrawAPI | null>(null);
    // Latest known scene: kept current from onChange so capture works even before the API is set.
    const sceneRef = useRef<SafeScene>(initialScene ?? EMPTY_SCENE);
    const initialRef = useRef<SafeScene>(initialScene ?? EMPTY_SCENE);
    const lastElementsJson = useRef(JSON.stringify(sceneRef.current.elements));
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onAutoSaveRef = useRef(onAutoSave);
    onAutoSaveRef.current = onAutoSave;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;

    // ── Lazy import (Excalidraw cannot be server-rendered) with a timeout ──
    // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt re-runs the import on Retry
    useEffect(() => {
      let cancelled = false;
      setLoadState("loading");
      const timer = setTimeout(() => {
        if (!cancelled) {
          setLoadState((s) => (s === "loading" ? "error" : s));
        }
      }, loadTimeoutMs);
      import("@excalidraw/excalidraw")
        .then((mod) => {
          if (cancelled) {
            return;
          }
          setLib({
            Excalidraw: mod.Excalidraw as unknown as AnyComponent,
            MainMenu: mod.MainMenu as unknown as AnyComponent & {
              DefaultItems: Record<string, React.ComponentType>;
            },
          });
          setLoadState("ready");
        })
        .catch(() => {
          if (!cancelled) {
            setLoadState("error");
          }
        });
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [loadAttempt, loadTimeoutMs]);

    const current = useCallback((): SafeScene => {
      if (apiRef.current) {
        sceneRef.current = toSafeScene(
          apiRef.current.getSceneElements(),
          apiRef.current.getAppState(),
        );
      }
      return sceneRef.current;
    }, []);

    const handleChange = useCallback(
      (elements: readonly Record<string, unknown>[], appState: Record<string, unknown>) => {
        if (readOnly) {
          return;
        }
        const scene = toSafeScene(elements, appState);
        sceneRef.current = scene;
        // onChange also fires for selection and cursor moves; only real edits count.
        const json = JSON.stringify(scene.elements);
        if (json === lastElementsJson.current) {
          return;
        }
        lastElementsJson.current = json;
        onDirtyRef.current?.();
        if (!onAutoSaveRef.current) {
          return;
        }
        if (autoSaveTimer.current) {
          clearTimeout(autoSaveTimer.current);
        }
        autoSaveTimer.current = setTimeout(() => {
          // An empty scene is saved too, so clearing the canvas persists.
          onAutoSaveRef.current?.(sceneRef.current);
        }, autoSaveInterval);
      },
      [readOnly, autoSaveInterval],
    );

    useEffect(() => {
      return () => {
        if (autoSaveTimer.current) {
          clearTimeout(autoSaveTimer.current);
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        hasContent() {
          return current().elements.length > 0;
        },
        getSnapshot() {
          return current();
        },
        loadSnapshot(scene: SafeScene) {
          sceneRef.current = scene;
          apiRef.current?.updateScene({ elements: scene.elements, appState: scene.appState });
        },
        resetScene() {
          apiRef.current?.resetScene();
          sceneRef.current = EMPTY_SCENE;
        },
      }),
      [current],
    );

    const frame = fillParent
      ? "h-full w-full overflow-hidden"
      : "h-[420px] w-full overflow-hidden rounded-lg border";

    if (loadState === "error") {
      return (
        <div
          className={`${frame} flex flex-col items-center justify-center gap-3 p-6 text-center text-sm`}
          role="alert"
        >
          <p className="font-medium text-red-700">The whiteboard did not load.</p>
          <p className="text-gray-600">
            {readOnly
              ? `The saved drawing has ${initialRef.current.elements.length} element(s). Retry to view it.`
              : "Your saved draft is kept. Retry, or explain your design out loud."}
          </p>
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
            onClick={() => setLoadAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      );
    }

    if (!lib) {
      return (
        <div className={`${frame} flex items-center justify-center text-sm text-gray-500`}>
          Loading whiteboard...
        </div>
      );
    }

    const { Excalidraw, MainMenu } = lib;
    return (
      <div className={frame}>
        <Excalidraw
          excalidrawAPI={(api: unknown) => {
            apiRef.current = api as ExcalidrawAPI;
          }}
          initialData={{
            elements: initialRef.current.elements,
            appState: { ...initialRef.current.appState, viewModeEnabled: readOnly },
            scrollToContent: true,
          }}
          viewModeEnabled={readOnly}
          onChange={handleChange}
          // Images need binary files, which are out of scope for this release.
          onPaste={(data: { files?: Record<string, unknown> }) =>
            !(data.files && Object.keys(data.files).length > 0)
          }
          aiEnabled={false}
          theme={dark ? "dark" : "light"}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: false,
              saveAsImage: false,
            },
            tools: { image: false },
          }}
        >
          <MainMenu>
            {!readOnly && <MainMenu.DefaultItems.ClearCanvas />}
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    );
  },
);
