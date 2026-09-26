"use client";

import type { Citation } from "@/types/pipeline";
import { useEffect, useRef, useState } from "react";
import type { ClientTurn } from "../contract";
import { FRIENDLY_RUNGS } from "../labels";
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

/** Saved transcript as a chat. The selected citation is highlighted from its exact saved offsets. */
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
    <section aria-label="Transcript" className="nb-card">
      <header className="border-b-2 border-[#111] px-5 py-3">
        <h2 className="text-lg font-black">Transcript</h2>
        {!artifactsOpen && (
          <p className="text-sm text-gray-600">Click a quote in a score and it lights up here.</p>
        )}
      </header>
      <ol className="space-y-4 p-4 md:p-5">
        {turns.map((t) => {
          const isSel = selected?.turnId === t.id;
          const focused = focusTurnId === t.id;
          const ai = t.speaker === "ai";
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
              className={`flex flex-col ${ai ? "items-start" : "items-end"}`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-600">
                <span className="font-bold text-[#111]">
                  {ai ? "🤖 Interviewer" : "🧑 Candidate"}
                </span>
                <span>{FRIENDLY_RUNGS[t.rung]}</span>
                <span className="font-mono">
                  {t.id} · {fmt(t.startMs)}
                </span>
              </div>
              <div
                className={`max-w-[92%] rounded-2xl border-2 border-[#111] p-3 transition-shadow ${
                  ai ? "rounded-tl-none nb-bg-soft-lavender" : "rounded-tr-none bg-white"
                } ${focused || isSel ? "shadow-[4px_4px_0_#111]" : ""}`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {isSel && selected ? (
                    <>
                      {t.text.slice(0, selected.start)}
                      <mark ref={markRef} className="rounded bg-[#fff3a3] px-0.5 font-medium">
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
              </div>
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
    <div className="mt-3 rounded-xl border-2 border-[#111] bg-[#f3f3f3]">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-bold">
          {artifact.kind === "code"
            ? `💻 Submitted code (${artifact.language})`
            : "🖍️ Submitted drawing"}
        </span>
        <span className="nb-pill text-[11px]">Saved for a person to review · not scored</span>
        <span className="ml-auto font-medium text-[#494cf3]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="p-2" data-turn={turnId}>
          <ArtifactReview artifact={artifact} />
        </div>
      )}
    </div>
  );
}
