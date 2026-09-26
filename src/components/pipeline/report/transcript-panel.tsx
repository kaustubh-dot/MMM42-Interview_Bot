"use client";

import type { Citation } from "@/types/pipeline";
import { useEffect, useRef, useState } from "react";
import type { ClientTurn } from "../contract";
import { RUNG_LABELS } from "../labels";
import { ArtifactReview } from "../technical-workspace";

interface Props {
  turns: ClientTurn[];
  selected: Citation | null;
  focusTurnId: string | null;
  /** Expand submitted artifacts by default (standalone samples). */
  artifactsOpen?: boolean;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Saved transcript. The selected citation is highlighted from its exact saved offsets. */
export function TranscriptPanel({ turns, selected, focusTurnId, artifactsOpen = false }: Props) {
  const markRef = useRef<HTMLElement>(null);
  const turnRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (selected) {
      markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selected]);

  useEffect(() => {
    if (focusTurnId) {
      turnRefs.current.get(focusTurnId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusTurnId]);

  return (
    <section aria-label="Transcript" className="rounded-lg border bg-white">
      <header className="border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Transcript</h2>
        {!artifactsOpen && (
          <p className="text-xs text-gray-500">Click a quote in a score to highlight it here.</p>
        )}
      </header>
      <ol className="space-y-3 p-4">
        {turns.map((t) => {
          const isSel = selected?.turnId === t.id;
          const focused = focusTurnId === t.id;
          return (
            <li
              key={t.id}
              ref={(el) => {
                if (el) {
                  turnRefs.current.set(t.id, el);
                } else {
                  turnRefs.current.delete(t.id);
                }
              }}
              className={`rounded-md p-2 text-sm transition-colors ${
                t.speaker === "ai" ? "bg-gray-50" : "bg-white"
              } ${focused || isSel ? "ring-2 ring-indigo-300" : ""}`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="font-mono">{t.id}</span>
                <span className="font-medium text-gray-700">
                  {t.speaker === "ai" ? "Interviewer" : "Candidate"}
                </span>
                <span>{RUNG_LABELS[t.rung]}</span>
                <span className="ml-auto font-mono">{fmt(t.startMs)}</span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">
                {isSel && selected ? (
                  <>
                    {t.text.slice(0, selected.start)}
                    <mark ref={markRef} className="rounded bg-yellow-200 px-0.5">
                      {t.text.slice(selected.start, selected.end)}
                    </mark>
                    {t.text.slice(selected.end)}
                  </>
                ) : (
                  t.text
                )}
              </p>
              {t.artifacts?.map((a) => (
                <SubmittedArtifact
                  key={`${t.id}-${a.kind}`}
                  turnId={t.id}
                  artifact={a}
                  defaultOpen={artifactsOpen}
                />
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SubmittedArtifact({
  turnId,
  artifact,
  defaultOpen,
}: {
  turnId: string;
  defaultOpen: boolean;
  artifact: NonNullable<ClientTurn["artifacts"]>[number];
}) {
  // Mounted on demand so the report does not load Monaco/Excalidraw for every turn up front.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium text-sky-900">
          {artifact.kind === "code" ? `Submitted code (${artifact.language})` : "Submitted drawing"}
        </span>
        <span className="rounded bg-white px-1.5 py-0.5 text-sky-800">
          Supporting artifact: human review. Not scored.
        </span>
        <span className="ml-auto text-sky-700">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="p-2" data-turn={turnId}>
          <ArtifactReview artifact={artifact} />
        </div>
      )}
    </div>
  );
}
