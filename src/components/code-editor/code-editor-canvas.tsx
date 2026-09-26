"use client";

// Adapted from Aural (https://github.com/1146345502/aural-oss), MIT License,
// Copyright (c) 2025 Aural. Source: src/components/code-editor/code-editor-canvas.tsx
// at commit ff366fbf52f2adb15d288bd2ce659e925cbbaafc. Local changes are listed in
// THIRD_PARTY_NOTICES.md. Editing and submission only: there is no code execution.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface CodeSnapshot {
  code: string;
  language: string;
}

export interface CodeEditorCanvasRef {
  /** Returns true if the editor has any non-whitespace code. */
  hasContent: () => boolean;
  /** Current state, read synchronously from the live editor. Empty code is returned, never null. */
  getSnapshot: () => CodeSnapshot;
  /** Replaces the editor content. */
  loadSnapshot: (snapshot: CodeSnapshot) => void;
  /** Clears the code (language is kept). */
  resetScene: () => void;
}

interface CodeEditorCanvasProps {
  readOnly?: boolean;
  /** Initial state. Read once on mount. */
  initialSnapshot?: CodeSnapshot;
  /** Debounced change callback for draft autosave. Fires for cleared content too. */
  onAutoSave?: (snapshot: CodeSnapshot) => void;
  /** Autosave debounce in ms. Submit never waits for this. */
  autoSaveInterval?: number;
  /** Called immediately on any change. */
  onDirty?: () => void;
  fillParent?: boolean;
  dark?: boolean;
  /** Allow the candidate to change language. Off by default: the question fixes it. */
  allowLanguageChange?: boolean;
  /** Ms to wait for Monaco before showing the load error. */
  loadTimeoutMs?: number;
}

export const SUPPORTED_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "shell", label: "Shell" },
] as const;

type LoadState = "loading" | "ready" | "error" | "fallback";

// Minimal slice of the Monaco editor instance we use.
interface MonacoEditorLike {
  getValue: () => string;
  setValue: (value: string) => void;
}

export const CodeEditorCanvas = forwardRef<CodeEditorCanvasRef, CodeEditorCanvasProps>(
  function CodeEditorCanvas(
    {
      readOnly = false,
      initialSnapshot,
      onAutoSave,
      autoSaveInterval = 800,
      onDirty,
      fillParent = false,
      dark = false,
      allowLanguageChange = false,
      loadTimeoutMs = 15000,
    },
    ref,
  ) {
    const [Editor, setEditor] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [loadAttempt, setLoadAttempt] = useState(0);

    const codeRef = useRef(initialSnapshot?.code ?? "");
    const languageRef = useRef(initialSnapshot?.language ?? "javascript");
    const [language, setLanguage] = useState(languageRef.current);
    // Mirrors codeRef for the plain-text fallback textarea.
    const [fallbackCode, setFallbackCode] = useState(codeRef.current);
    const editorRef = useRef<MonacoEditorLike | null>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onAutoSaveRef = useRef(onAutoSave);
    onAutoSaveRef.current = onAutoSave;
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;

    // ── Lazy import (Monaco cannot be server-rendered) with a timeout ──
    // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt re-runs the import on Retry
    useEffect(() => {
      let cancelled = false;
      setLoadState("loading");
      const timer = setTimeout(() => {
        if (!cancelled) {
          setLoadState((s) => (s === "loading" ? "error" : s));
        }
      }, loadTimeoutMs);
      import("@monaco-editor/react")
        .then((mod) => {
          if (cancelled) {
            return;
          }
          setEditor(() => mod.default as unknown as React.ComponentType<Record<string, unknown>>);
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

    const current = useCallback((): CodeSnapshot => {
      // Read from the live editor when mounted, so Submit never depends on a debounced callback.
      const code = editorRef.current ? editorRef.current.getValue() : codeRef.current;
      codeRef.current = code;
      return { code, language: languageRef.current };
    }, []);

    const scheduleAutoSave = useCallback(() => {
      onDirtyRef.current?.();
      if (!onAutoSaveRef.current) {
        return;
      }
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      autoSaveTimer.current = setTimeout(() => {
        // Cleared content is saved too, so a cleared draft stays cleared after reload.
        onAutoSaveRef.current?.({ code: codeRef.current, language: languageRef.current });
      }, autoSaveInterval);
    }, [autoSaveInterval]);

    const handleChange = useCallback(
      (value: string | undefined) => {
        codeRef.current = value ?? "";
        scheduleAutoSave();
      },
      [scheduleAutoSave],
    );

    const handleLanguageChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        languageRef.current = e.target.value;
        setLanguage(e.target.value);
        scheduleAutoSave();
      },
      [scheduleAutoSave],
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
          return current().code.trim().length > 0;
        },
        getSnapshot() {
          return current();
        },
        loadSnapshot(snapshot: CodeSnapshot) {
          codeRef.current = snapshot.code;
          languageRef.current = snapshot.language;
          setLanguage(snapshot.language);
          setFallbackCode(snapshot.code);
          editorRef.current?.setValue(snapshot.code);
        },
        resetScene() {
          codeRef.current = "";
          setFallbackCode("");
          editorRef.current?.setValue("");
          scheduleAutoSave();
        },
      }),
      [current, scheduleAutoSave],
    );

    const frame = fillParent
      ? "flex h-full w-full flex-col overflow-hidden"
      : "flex h-[400px] w-full flex-col overflow-hidden rounded-lg border";

    if (loadState === "error" && readOnly) {
      // Review must still show the submission if Monaco is unavailable.
      return (
        <div className={frame}>
          <div className="flex items-center border-b bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
            <span className="font-medium uppercase tracking-wide">{language}</span>
            <button
              type="button"
              className="ml-auto text-indigo-700 underline"
              onClick={() => setLoadAttempt((n) => n + 1)}
            >
              Retry editor
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-sm">
            {codeRef.current}
          </pre>
        </div>
      );
    }

    if (loadState === "error") {
      return (
        <div
          className={`${frame} items-center justify-center gap-3 p-6 text-center text-sm`}
          role="alert"
        >
          <p className="font-medium text-red-700">The code editor did not load.</p>
          <p className="text-gray-600">Check the network connection and retry.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
              onClick={() => setLoadAttempt((n) => n + 1)}
            >
              Retry
            </button>
            {!readOnly && (
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 hover:bg-gray-50"
                onClick={() => setLoadState("fallback")}
              >
                Use plain text box
              </button>
            )}
          </div>
        </div>
      );
    }

    if (loadState === "fallback") {
      return (
        <div className={frame}>
          <div className="border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            Plain text fallback ({language}). Your code is still saved and submitted.
          </div>
          <textarea
            aria-label="Code"
            className="min-h-0 flex-1 resize-none p-3 font-mono text-sm outline-none"
            value={fallbackCode}
            readOnly={readOnly}
            spellCheck={false}
            onChange={(e) => {
              setFallbackCode(e.target.value);
              handleChange(e.target.value);
            }}
          />
        </div>
      );
    }

    if (!Editor) {
      return (
        <div className={`${frame} items-center justify-center text-sm text-gray-500`}>
          Loading code editor...
        </div>
      );
    }

    return (
      <div className={frame}>
        <div
          className={
            dark
              ? "flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300"
              : "flex items-center gap-2 border-b bg-gray-50 px-3 py-1.5 text-xs text-gray-600"
          }
        >
          {allowLanguageChange && !readOnly ? (
            <select
              aria-label="Language"
              value={language}
              onChange={handleLanguageChange}
              className="rounded-md border bg-white px-2 py-1 text-xs"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium uppercase tracking-wide">{language}</span>
          )}
          {readOnly && <span className="ml-auto">Read-only</span>}
        </div>
        <div className="min-h-0 flex-1">
          <Editor
            language={language}
            defaultValue={codeRef.current}
            onChange={handleChange}
            onMount={(editor: MonacoEditorLike) => {
              editorRef.current = editor;
              setLoadState("ready");
            }}
            theme={dark ? "vs-dark" : "light"}
            loading={<span className="text-sm text-gray-500">Loading code editor...</span>}
            options={{
              readOnly,
              domReadOnly: readOnly,
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
              padding: { top: 8 },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
                useShadows: false,
              },
              overviewRulerLanes: 0,
            }}
          />
        </div>
      </div>
    );
  },
);
