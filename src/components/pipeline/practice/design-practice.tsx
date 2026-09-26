"use client";

import { type SafeScene, parseScene, serializeScene } from "@/components/whiteboard/scene";
import {
  WhiteboardCanvas,
  type WhiteboardCanvasRef,
} from "@/components/whiteboard/whiteboard-canvas";
import type { DesignQuestion, PracticeCatalog } from "@/lib/practice/types";
import { ArrowLeft, Compass, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { NbButton } from "../ui";
import { loadText, saveText } from "./api";
import { SourceNote } from "./shared";
import { EMPTY_THREAD, type Thread, TutorPanel } from "./tutor-panel";

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) {
    return null;
  }
  return (
    <section className="space-y-1">
      <h3 className="font-black">{title}</h3>
      <ul className="space-y-0.5 text-sm">
        {items.map((it, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list; items can repeat
          <li key={i} className="whitespace-pre-wrap">
            {it.startsWith("  ") ? it : `• ${it}`}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DesignBrief({ q }: { q: DesignQuestion }) {
  return (
    <article className="nb-card space-y-4 p-5 md:p-6" aria-label="Design question">
      <div className="flex flex-wrap gap-2">
        <span className={`nb-pill ${q.guided ? "nb-bg-soft-lavender" : "bg-white"}`}>
          {q.guided ? "Guided: requirements + reference walkthrough" : "Open question"}
        </span>
      </div>
      <h2 className="text-2xl font-black md:text-3xl">{q.title}</h2>
      {q.guided ? (
        <>
          <p className="text-sm text-gray-600">
            In a real interview you'd ask for these. Here they're given so you can focus on the
            design.
          </p>
          <List title="Use cases to support" items={q.useCases} />
          <List title="Out of scope" items={q.outOfScope} />
          <List title="Assumptions" items={q.assumptions} />
          <details className="rounded-xl border-2 border-[#111] bg-[#f3f3f3] p-3">
            <summary className="cursor-pointer font-bold">Back-of-the-envelope numbers</summary>
            <div className="mt-2">
              <List title="" items={q.calculations} />
            </div>
          </details>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <p>Start by clarifying requirements. Good questions to ask:</p>
          <ul className="space-y-0.5">
            <li>• Who are the users and what are the 3 most important things they do?</li>
            <li>• How many users, and how many reads vs writes per second?</li>
            <li>• What latency and availability do we need?</li>
            <li>• What's out of scope?</li>
          </ul>
          <p className="text-gray-600">Not sure? Press "Explain the question" in the tutor.</p>
        </div>
      )}
      <section className="space-y-1 rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-4">
        <h3 className="font-black">What the interviewer expects from you</h3>
        <ul className="space-y-0.5 text-sm">
          <li>✓ Clarify requirements and estimate scale before drawing.</li>
          <li>✓ A high-level diagram: clients, services, data stores and how they talk.</li>
          <li>✓ Deep-dive one or two components (data model, API, caching).</li>
          <li>✓ Discuss bottlenecks, scaling and trade-offs.</li>
        </ul>
      </section>
    </article>
  );
}

/** Text labels from the whiteboard, so the tutor can "see" the diagram. */
function sceneLabels(scene: SafeScene | null): string[] {
  return (scene?.elements ?? [])
    .map((el) => (typeof el.text === "string" ? el.text.trim() : ""))
    .filter(Boolean);
}

export function DesignPractice({ catalog }: { catalog: PracticeCatalog["design"] }) {
  const [question, setQuestion] = useState<DesignQuestion | null>(null);
  const [notes, setNotes] = useState("");
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const boardRef = useRef<WhiteboardCanvasRef>(null);

  const open = (q: DesignQuestion) => {
    setQuestion(q);
    setNotes(loadText(`design-notes:${q.id}`) ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (question) {
    const sceneKey = `design-scene:${question.id}`;
    const saved = loadText(sceneKey);
    return (
      <div className="space-y-5">
        <div className="nb-card flat flex flex-wrap items-center gap-3 p-3">
          <NbButton size="sm" onClick={() => setQuestion(null)}>
            <ArrowLeft className="h-4 w-4" /> All design questions
          </NbButton>
          <span className="font-bold">{question.title}</span>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
            <DesignBrief q={question} />
          </div>
          <div className="min-w-0 space-y-5">
            <section className="nb-card overflow-hidden" aria-label="Whiteboard">
              <header className="flex flex-wrap items-center gap-2 border-b-2 border-[#111] nb-bg-soft-lavender px-4 py-2">
                <span className="font-black">🖍️ Your design</span>
                <span className="text-xs text-gray-600">
                  Draw boxes and arrows; label them. Saved on this device.
                </span>
              </header>
              <WhiteboardCanvas
                key={question.id}
                ref={boardRef}
                initialScene={saved ? (parseScene(saved) ?? undefined) : undefined}
                onAutoSave={(scene) => saveText(sceneKey, serializeScene(scene))}
              />
            </section>
            <section className="nb-card space-y-2 p-4" aria-label="Notes">
              <label htmlFor="design-notes" className="font-black">
                📝 Notes
              </label>
              <textarea
                id="design-notes"
                className="nb-input min-h-[140px]"
                placeholder="Requirements, estimates, API, data model, trade-offs…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  saveText(`design-notes:${question.id}`, e.target.value);
                }}
              />
            </section>
            <TutorPanel
              key={question.id}
              track="design"
              itemId={question.id}
              getAnswer={() => {
                const labels = sceneLabels(boardRef.current?.getSnapshot() ?? null);
                return `${notes}\n\nWhiteboard labels: ${labels.join(", ") || "(none)"}`.slice(
                  0,
                  20_000,
                );
              }}
              thread={threads[question.id] ?? EMPTY_THREAD}
              onThread={(t) => setThreads((all) => ({ ...all, [question.id]: t }))}
            />
          </div>
        </div>
      </div>
    );
  }

  const guided = catalog.questions.filter((q) => q.guided);
  const open_ = catalog.questions.filter((q) => !q.guided);
  return (
    <div className="space-y-6">
      <section className="nb-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 text-xl font-black">
          <Compass className="h-5 w-5" /> Guided questions
        </h2>
        <p className="text-sm text-gray-600">
          Come with use cases, assumptions and a reference walkthrough the tutor can teach from.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {guided.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => open(q)}
              className="nb-card hoverable space-y-1 p-4 text-left"
            >
              <span className="block font-black">{q.title}</span>
              <span className="block text-xs text-gray-700">
                {q.useCases?.length ?? 0} use cases to design for
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="nb-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 text-xl font-black">
          <Sparkles className="h-5 w-5" /> More popular questions
        </h2>
        <p className="text-sm text-gray-600">
          Open questions: scope them yourself. The AI tutor helps most here.
        </p>
        <div className="flex flex-wrap gap-2">
          {open_.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => open(q)}
              className="rounded-full border-2 border-[#111] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#fff0ee]"
            >
              {q.title}
            </button>
          ))}
        </div>
      </section>
      <SourceNote {...catalog.source} />
    </div>
  );
}
