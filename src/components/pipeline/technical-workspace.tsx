"use client";

import {
  CodeEditorCanvas,
  type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import { parseScene, serializeScene } from "@/components/whiteboard/scene";
import {
  WhiteboardCanvas,
  type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { AnswerArtifact, ClientCodeSnippet } from "./contract";

export type WorkspaceMode =
  | { kind: "code"; snippet: ClientCodeSnippet }
  | { kind: "whiteboard"; prompt: string };

export interface TechnicalWorkspaceRef {
  /** Captures the current editor/canvas state synchronously. Cleared content is returned as-is. */
  capture: () => AnswerArtifact;
}

interface TechnicalWorkspaceProps {
  mode: WorkspaceMode;
  /** Restored draft for this attempt + question, if any. Takes precedence over the seed. */
  initialArtifact?: AnswerArtifact | null;
  /** Debounced autosave for drafts. */
  onArtifactChange?: (artifact: AnswerArtifact) => void;
  disabled?: boolean;
}

/**
 * One technical workspace for one question. The parent must key this component by
 * attempt + question turn ID so questions never share editor state.
 */
export const TechnicalWorkspace = forwardRef<TechnicalWorkspaceRef, TechnicalWorkspaceProps>(
  function TechnicalWorkspace({ mode, initialArtifact, onArtifactChange, disabled }, ref) {
    const codeRef = useRef<CodeEditorCanvasRef>(null);
    const boardRef = useRef<WhiteboardCanvasRef>(null);

    const codeSeed =
      initialArtifact?.kind === "code"
        ? { code: initialArtifact.code, language: initialArtifact.language }
        : mode.kind === "code"
          ? { code: mode.snippet.code, language: mode.snippet.language }
          : undefined;
    const sceneSeed =
      initialArtifact?.kind === "whiteboard"
        ? (parseScene(initialArtifact.sceneJson) ?? undefined)
        : undefined;

    useImperativeHandle(
      ref,
      () => ({
        capture(): AnswerArtifact {
          if (mode.kind === "code") {
            const snap = codeRef.current?.getSnapshot() ?? codeSeed ?? { code: "", language: "" };
            return { kind: "code", language: snap.language, code: snap.code };
          }
          const scene = boardRef.current?.getSnapshot() ??
            sceneSeed ?? { elements: [], appState: {} };
          return { kind: "whiteboard", sceneJson: serializeScene(scene) };
        },
      }),
      [mode, codeSeed, sceneSeed],
    );

    return (
      <section className="rounded-lg border bg-white" aria-label="Technical workspace">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
          <span className="font-semibold">
            {mode.kind === "code" ? "Code editor" : "Whiteboard"}
          </span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Supporting artifact for human review. Only your spoken explanation is scored.
          </span>
          {mode.kind === "code" && (
            <span className="ml-auto text-xs text-gray-500">No code is run.</span>
          )}
        </header>
        {mode.kind === "whiteboard" && (
          <p className="border-b bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{mode.prompt}</p>
        )}
        <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
          {mode.kind === "code" ? (
            <CodeEditorCanvas
              ref={codeRef}
              initialSnapshot={codeSeed}
              onAutoSave={(s) =>
                onArtifactChange?.({ kind: "code", language: s.language, code: s.code })
              }
            />
          ) : (
            <WhiteboardCanvas
              ref={boardRef}
              initialScene={sceneSeed}
              onAutoSave={(scene) =>
                onArtifactChange?.({ kind: "whiteboard", sceneJson: serializeScene(scene) })
              }
            />
          )}
        </div>
      </section>
    );
  },
);

/** Read-only review of a submitted artifact (recruiter report, replay). */
export function ArtifactReview({ artifact }: { artifact: AnswerArtifact }) {
  if (artifact.kind === "code") {
    return (
      <CodeEditorCanvas
        readOnly
        initialSnapshot={{ code: artifact.code, language: artifact.language }}
      />
    );
  }
  const scene = parseScene(artifact.sceneJson);
  if (!scene) {
    return (
      <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        The saved drawing could not be read.
      </p>
    );
  }
  if (scene.elements.length === 0) {
    return (
      <p className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
        The candidate submitted an empty whiteboard.
      </p>
    );
  }
  return <WhiteboardCanvas readOnly initialScene={scene} />;
}
