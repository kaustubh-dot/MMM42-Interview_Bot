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
      <section className="nb-card overflow-hidden" aria-label="Technical workspace">
        <header className="flex flex-wrap items-center gap-2 border-b-2 border-[#111] nb-bg-soft-lavender px-4 py-3">
          <span className="text-lg font-black">
            {mode.kind === "code" ? "💻 Code editor" : "🖍️ Whiteboard"}
          </span>
          <span className="nb-pill text-xs">
            Saved for a person to review · only what you say is scored
          </span>
          {mode.kind === "code" && (
            <span className="ml-auto text-sm text-gray-700">Edit the code. Nothing is run.</span>
          )}
        </header>
        {mode.kind === "whiteboard" && (
          <p className="border-b-2 border-[#111] bg-white px-4 py-3 font-medium">{mode.prompt}</p>
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
      <p className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm">
        The saved drawing could not be read.
      </p>
    );
  }
  if (scene.elements.length === 0) {
    return (
      <p className="rounded-xl border-2 border-[#111] bg-[#f3f3f3] p-3 text-sm">
        The candidate submitted an empty whiteboard.
      </p>
    );
  }
  return <WhiteboardCanvas readOnly initialScene={scene} />;
}
