"use client";

import {
  CodeEditorCanvas,
  type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import { PRACTICE_LANGUAGES, type PracticeLanguage, starterFor } from "@/lib/practice/catalog";
import type { CodingProblem, Difficulty, PracticeCatalog } from "@/lib/practice/types";
import { ArrowLeft, Dices, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NbButton } from "../ui";
import { fetchSet, loadText, recentIds, rememberIds, saveText } from "./api";
import { DIFFICULTY_STYLE, ProblemView } from "./problem-view";
import { CountPicker, DifficultyPicker, SetTabs, SourceNote } from "./shared";
import { EMPTY_THREAD, type Thread, TutorPanel } from "./tutor-panel";

const LANG_KEY = "language";
type Problem = CodingProblem & { topic: string };

export function CodingPractice({ catalog }: { catalog: PracticeCatalog["coding"] }) {
  const [topic, setTopic] = useState<string>("binary-search");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState<Difficulty | "Any">("Any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [language, setLanguage] = useState<PracticeLanguage>("python");
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<CodeEditorCanvasRef>(null);

  useEffect(() => {
    const saved = loadText(LANG_KEY) as PracticeLanguage | null;
    if (saved && PRACTICE_LANGUAGES.some((l) => l.id === saved)) {
      setLanguage(saved);
    }
  }, []);

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      const reply = await fetchSet({
        track: "coding",
        topic,
        difficulty,
        count: topic === "surprise" ? 3 : count,
        avoidIds: recentIds("coding"),
      });
      if (reply.track !== "coding") {
        return;
      }
      rememberIds(
        "coding",
        reply.problems.map((p) => p.id),
      );
      setProblems(reply.problems);
      setNotice(reply.notice ?? null);
      setActive(0);
      setThreads({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get problems.");
    } finally {
      setLoading(false);
    }
  };

  const problem = problems?.[active];
  if (problems && problem) {
    const draftKey = `code:${language}:${problem.id}`;
    const starter = starterFor(language, problem.title, problem.pythonStarter);
    return (
      <div className="space-y-5">
        <div className="nb-card flat flex flex-wrap items-center gap-3 p-3">
          <NbButton size="sm" onClick={() => setProblems(null)}>
            <ArrowLeft className="h-4 w-4" /> New set
          </NbButton>
          <SetTabs
            items={problems}
            active={active}
            onSelect={setActive}
            label="Problems"
            render={(p, i) => (
              <>
                {i + 1}. <span className="max-w-[200px] truncate">{p.title}</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full border border-[#111] ${DIFFICULTY_STYLE[p.difficulty]}`}
                />
              </>
            )}
          />
        </div>
        {notice && <p className="nb-card flat bg-[#fff3c4] p-3 text-sm">{notice}</p>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
            <ProblemView problem={problem} index={active} topic={problem.topic} />
          </div>
          <div className="min-w-0 space-y-5">
            <section className="nb-card overflow-hidden" aria-label="Your code">
              <header className="flex flex-wrap items-center gap-3 border-b-2 border-[#111] nb-bg-soft-lavender px-4 py-2">
                <span className="font-black">Your solution</span>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <span className="sr-only">Language</span>
                  <select
                    aria-label="Language"
                    className="rounded-lg border-2 border-[#111] bg-white px-2 py-1 font-medium"
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value as PracticeLanguage);
                      saveText(LANG_KEY, e.target.value);
                    }}
                  >
                    {PRACTICE_LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-gray-600">Saved on this device · not run</span>
                <NbButton
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    saveText(draftKey, starter);
                    setEditorVersion((v) => v + 1);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </NbButton>
              </header>
              <CodeEditorCanvas
                key={`${draftKey}:${editorVersion}`}
                ref={editorRef}
                initialSnapshot={{ code: loadText(draftKey) ?? starter, language }}
                onAutoSave={(s) => saveText(draftKey, s.code)}
              />
            </section>
            <TutorPanel
              key={problem.id}
              track="coding"
              itemId={problem.id}
              language={language}
              getAnswer={() => editorRef.current?.getSnapshot().code ?? ""}
              thread={threads[problem.id] ?? EMPTY_THREAD}
              onThread={(t) => setThreads((all) => ({ ...all, [problem.id]: t }))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="nb-card space-y-4 p-6">
        <h2 className="text-xl font-black">1. Pick a topic</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            aria-pressed={topic === "surprise"}
            onClick={() => setTopic("surprise")}
            className={`nb-card hoverable flex items-center gap-3 p-4 text-left ${topic === "surprise" ? "nb-bg-salmon" : ""}`}
          >
            <Dices className="h-6 w-6 shrink-0" />
            <span>
              <span className="block font-black">Surprise me</span>
              <span className="block text-xs text-gray-700">
                3 random problems, different topics
              </span>
            </span>
          </button>
          {catalog.topics.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={topic === t.id}
              onClick={() => setTopic(t.id)}
              className={`nb-card hoverable p-4 text-left ${topic === t.id ? "nb-bg-lavender" : ""}`}
            >
              <span className="block font-black">{t.name}</span>
              <span className="block text-xs text-gray-700">{t.count} problems</span>
            </button>
          ))}
        </div>
      </section>

      <section className="nb-card space-y-4 p-6">
        <h2 className="text-xl font-black">2. Choose how many</h2>
        {topic === "surprise" ? (
          <p className="text-gray-700">
            Surprise me gives 3 problems
            {difficulty === "Any" ? ": one easy, one medium and one hard." : `, all ${difficulty}.`}
          </p>
        ) : (
          <CountPicker value={count} onChange={setCount} />
        )}
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <p className="text-sm text-gray-600">You pick the language in the code editor.</p>
      </section>

      {error && (
        <p role="alert" className="nb-card flat nb-bg-soft-salmon p-4 font-medium">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <NbButton variant="primary" size="lg" disabled={loading} onClick={start}>
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {topic === "surprise"
            ? "Give me 3 problems"
            : `Start ${count} problem${count === 1 ? "" : "s"}`}
        </NbButton>
        <SourceNote {...catalog.source} />
      </div>
    </div>
  );
}
