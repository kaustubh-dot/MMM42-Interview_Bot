"use client";

import {
  CodeEditorCanvas,
  type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import {
  MAX_PROBLEMS_PER_SET,
  PRACTICE_LANGUAGES,
  PRACTICE_TOPICS,
  type PracticeLanguage,
  blankStarter,
  languageLabel,
} from "@/lib/practice/catalog";
import type { PatternsReply, PracticeProblem, ProblemSetReply } from "@/lib/practice/types";
import { ArrowLeft, Dices, Loader2, RotateCcw, Target } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDraft, saveDraft } from "../draft-store";
import { Explainer, NbButton, NbLinkButton } from "../ui";
import { fetchPatterns, fetchProblemSet, recentTitles, rememberTitles } from "./api";
import { DIFFICULTY_STYLE, ProblemView } from "./problem-view";
import { EMPTY_THREAD, type Thread, TutorPanel } from "./tutor-panel";

const LANG_KEY = "mmm42:practice:language";
const draftAttempt = (lang: PracticeLanguage) => `practice-${lang}`;

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-xl font-black">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#111] nb-bg-lavender text-sm">
        {n}
      </span>
      {children}
    </h2>
  );
}

export function PracticeApp() {
  const [language, setLanguage] = useState<PracticeLanguage>("python");
  const [mode, setMode] = useState<"random" | "topic">("random");
  const [topic, setTopic] = useState<string>("Binary Search");
  const [customTopic, setCustomTopic] = useState("");
  const [patterns, setPatterns] = useState<PatternsReply | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [set, setSet] = useState<ProblemSetReply | null>(null);
  const [active, setActive] = useState(0);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<CodeEditorCanvasRef>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY) as PracticeLanguage | null;
      if (saved && PRACTICE_LANGUAGES.some((l) => l.id === saved)) {
        setLanguage(saved);
      }
    } catch {
      // default language
    }
  }, []);

  const chooseLanguage = (lang: PracticeLanguage) => {
    setLanguage(lang);
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // not critical
    }
  };

  const totalSelected = Object.values(counts).reduce((a, b) => a + b, 0);

  const loadPatterns = async (name: string) => {
    setError(null);
    setPatterns(null);
    setCounts({});
    setLoading("patterns");
    try {
      const reply = await fetchPatterns(name);
      setPatterns(reply);
      // Pre-select the first two patterns with one problem each, so "Create" works right away.
      setCounts(Object.fromEntries(reply.patterns.slice(0, 2).map((p) => [p.name, 1])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load patterns.");
    } finally {
      setLoading(null);
    }
  };

  const createSet = async () => {
    setError(null);
    setLoading("problems");
    try {
      const reply = await fetchProblemSet(
        mode === "random"
          ? { language, mode: "random", avoidTitles: recentTitles() }
          : {
              language,
              mode: "topic",
              topic: patterns?.topic ?? topic,
              selections: Object.entries(counts)
                .filter(([, c]) => c > 0)
                .map(([pattern, count]) => ({ pattern, count: count as 1 | 2 | 3 })),
              avoidTitles: recentTitles(),
            },
      );
      rememberTitles(reply.problems.map((p) => p.title));
      setSet(reply);
      setActive(0);
      setThreads({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create problems.");
    } finally {
      setLoading(null);
    }
  };

  // ── Session ────────────────────────────────────────────────────────
  const problem: PracticeProblem | null = set?.problems[active] ?? null;
  const starterFor = useCallback(
    (p: PracticeProblem, lang: PracticeLanguage) =>
      p.starterLanguage === lang ? p.starterCode : blankStarter(lang, p.title),
    [],
  );
  const initialCode = (p: PracticeProblem, lang: PracticeLanguage) => {
    const draft = loadDraft(draftAttempt(lang), p.id);
    return draft?.artifact?.kind === "code" ? draft.artifact.code : starterFor(p, lang);
  };
  const saveCode = (p: PracticeProblem, lang: PracticeLanguage, code: string) =>
    saveDraft(draftAttempt(lang), p.id, {
      transcript: "",
      artifact: { kind: "code", language: lang, code },
    });

  if (set && problem) {
    return (
      <div className="nb-orbs min-h-[calc(100vh-5rem)]">
        <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-6">
          <div className="nb-card flat flex flex-wrap items-center gap-3 p-3">
            <NbButton size="sm" onClick={() => setSet(null)}>
              <ArrowLeft className="h-4 w-4" /> New set
            </NbButton>
            <nav aria-label="Problems" className="flex flex-wrap gap-2">
              {set.problems.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => setActive(i)}
                  className={`flex items-center gap-2 rounded-lg border-2 border-[#111] px-3 py-1.5 text-sm font-bold ${
                    i === active
                      ? "nb-bg-lavender shadow-[3px_3px_0_#111]"
                      : "bg-white hover:bg-[#eeeefe]"
                  }`}
                >
                  {i + 1}. <span className="max-w-[180px] truncate">{p.title}</span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full border border-[#111] ${DIFFICULTY_STYLE[p.difficulty]}`}
                  />
                </button>
              ))}
            </nav>
            <label className="ml-auto flex items-center gap-2 text-sm font-bold">
              Language
              <select
                className="rounded-lg border-2 border-[#111] bg-white px-2 py-1.5 font-medium"
                value={language}
                onChange={(e) => chooseLanguage(e.target.value as PracticeLanguage)}
              >
                {PRACTICE_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {set.notice && (
            <p className="nb-card flat bg-[#fff3c4] p-3 text-sm">
              <strong>{set.source === "ai" ? "AI" : "Built-in problems"}:</strong> {set.notice}
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
              <ProblemView problem={problem} index={active} />
            </div>
            <div className="min-w-0 space-y-5">
              <section className="nb-card overflow-hidden" aria-label="Your code">
                <header className="flex flex-wrap items-center gap-2 border-b-2 border-[#111] nb-bg-soft-lavender px-4 py-2">
                  <span className="font-black">Your solution · {languageLabel(language)}</span>
                  <span className="text-xs text-gray-600">
                    Saved on this device as you type · not run
                  </span>
                  <NbButton
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      const starter = starterFor(problem, language);
                      saveCode(problem, language, starter);
                      editorRef.current?.loadSnapshot({ code: starter, language });
                      setEditorVersion((v) => v + 1);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </NbButton>
                </header>
                <CodeEditorCanvas
                  key={`${problem.id}:${language}:${editorVersion}`}
                  ref={editorRef}
                  initialSnapshot={{ code: initialCode(problem, language), language }}
                  onAutoSave={(s) => saveCode(problem, language, s.code)}
                />
              </section>
              <TutorPanel
                key={problem.id}
                problem={problem}
                language={language}
                getCode={() => editorRef.current?.getSnapshot().code ?? ""}
                thread={threads[problem.id] ?? EMPTY_THREAD}
                onThread={(t) => setThreads((all) => ({ ...all, [problem.id]: t }))}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup ──────────────────────────────────────────────────────────
  const canCreate =
    mode === "random" ||
    (patterns !== null && totalSelected > 0 && totalSelected <= MAX_PROBLEMS_PER_SET);

  return (
    <div className="nb-orbs min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">Coding practice</h1>
          <p className="max-w-3xl text-lg text-gray-700">
            Solve real interview problems with an AI tutor beside you. It can explain the question,
            give hints, walk you through the solution, or check your approach.
          </p>
          <NbLinkButton href="/practice/playground" size="sm">
            Try the code editor &amp; whiteboard playground
          </NbLinkButton>
        </header>

        <section className="nb-card space-y-4 p-6">
          <StepLabel n={1}>Pick your language</StepLabel>
          <fieldset className="flex flex-wrap gap-3" aria-label="Language">
            {PRACTICE_LANGUAGES.map((l) => (
              <NbButton
                key={l.id}
                size="sm"
                aria-pressed={language === l.id}
                variant={language === l.id ? "primary" : "default"}
                onClick={() => chooseLanguage(l.id)}
              >
                {l.label}
              </NbButton>
            ))}
          </fieldset>
        </section>

        <section className="nb-card space-y-4 p-6">
          <StepLabel n={2}>What do you want to practice?</StepLabel>
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              aria-pressed={mode === "random"}
              onClick={() => setMode("random")}
              className={`nb-card hoverable space-y-1 p-5 text-left ${mode === "random" ? "nb-bg-soft-lavender" : ""}`}
            >
              <Dices className="h-7 w-7" />
              <p className="text-lg font-black">Surprise me</p>
              <p className="text-sm text-gray-700">
                3 random popular interview problems from different topics.
              </p>
            </button>
            <button
              type="button"
              aria-pressed={mode === "topic"}
              onClick={() => {
                setMode("topic");
                if (!patterns) {
                  loadPatterns(topic);
                }
              }}
              className={`nb-card hoverable space-y-1 p-5 text-left ${mode === "topic" ? "nb-bg-soft-salmon" : ""}`}
            >
              <Target className="h-7 w-7" />
              <p className="text-lg font-black">Practice a topic</p>
              <p className="text-sm text-gray-700">
                Pick a topic like Binary Search, choose its patterns and how many problems for each.
              </p>
            </button>
          </div>
        </section>

        {mode === "topic" && (
          <section className="nb-card space-y-5 p-6">
            <StepLabel n={3}>Choose a topic and patterns</StepLabel>
            <div className="flex flex-wrap gap-2">
              {PRACTICE_TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={patterns?.topic === t.name}
                  onClick={() => {
                    setTopic(t.name);
                    loadPatterns(t.name);
                  }}
                  className={`rounded-full border-2 border-[#111] px-3 py-1.5 text-sm font-bold ${
                    patterns?.topic === t.name
                      ? "nb-bg-salmon shadow-[3px_3px_0_#111]"
                      : "bg-white hover:bg-[#fff0ee]"
                  }`}
                >
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (customTopic.trim()) {
                  setTopic(customTopic.trim());
                  loadPatterns(customTopic.trim());
                }
              }}
            >
              <label htmlFor="custom-topic" className="sr-only">
                Another topic
              </label>
              <input
                id="custom-topic"
                className="nb-input max-w-sm py-2"
                placeholder="…or type any topic (e.g. Segment Trees)"
                value={customTopic}
                maxLength={80}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
              <NbButton type="submit" size="sm" disabled={!customTopic.trim() || loading !== null}>
                Show patterns
              </NbButton>
            </form>

            {loading === "patterns" && (
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Finding patterns…
              </p>
            )}

            {patterns && (
              <div className="space-y-3">
                <p className="font-bold">
                  Patterns in {patterns.topic}: tick the ones you want and choose how many problems
                  each.
                  {patterns.source === "ai" && (
                    <span className="nb-pill ml-2 text-[11px]">AI suggested</span>
                  )}
                </p>
                {patterns.notice && <p className="text-sm text-gray-600">{patterns.notice}</p>}
                <ul className="grid gap-3 md:grid-cols-2">
                  {patterns.patterns.map((pt) => {
                    const count = counts[pt.name] ?? 0;
                    return (
                      <li
                        key={pt.id}
                        className={`rounded-xl border-2 border-[#111] p-3 ${count > 0 ? "nb-bg-soft-lavender shadow-[3px_3px_0_#111]" : "bg-white"}`}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 accent-[#494cf3]"
                            checked={count > 0}
                            onChange={(e) =>
                              setCounts((c) => ({ ...c, [pt.name]: e.target.checked ? 1 : 0 }))
                            }
                          />
                          <span>
                            <span className="block font-bold">{pt.name}</span>
                            <span className="block text-sm text-gray-700">{pt.description}</span>
                            <span className="block text-xs text-gray-500">
                              e.g. {pt.classicExample}
                            </span>
                          </span>
                        </label>
                        {count > 0 && (
                          <fieldset
                            className="mt-2 flex items-center gap-2 pl-8 text-sm"
                            aria-label={`How many ${pt.name} problems`}
                          >
                            <span>How many?</span>
                            {[1, 2, 3].map((n) => (
                              <button
                                key={n}
                                type="button"
                                aria-pressed={count === n}
                                onClick={() => setCounts((c) => ({ ...c, [pt.name]: n }))}
                                className={`h-8 w-8 rounded-lg border-2 border-[#111] font-bold ${count === n ? "nb-bg-lavender" : "bg-white"}`}
                              >
                                {n}
                              </button>
                            ))}
                          </fieldset>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p
                  className={`text-sm font-bold ${totalSelected > MAX_PROBLEMS_PER_SET ? "text-[#b4232f]" : ""}`}
                >
                  {totalSelected} problem{totalSelected === 1 ? "" : "s"} selected
                  {totalSelected > MAX_PROBLEMS_PER_SET && ` (max ${MAX_PROBLEMS_PER_SET} per set)`}
                </p>
              </div>
            )}
          </section>
        )}

        {error && (
          <div role="alert" className="nb-card flat nb-bg-soft-salmon p-4">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <NbButton
            variant="primary"
            size="lg"
            disabled={!canCreate || loading !== null}
            onClick={createSet}
          >
            {loading === "problems" && <Loader2 className="h-5 w-5 animate-spin" />}
            {loading === "problems"
              ? "Picking problems…"
              : mode === "random"
                ? "Give me 3 problems"
                : `Create my ${totalSelected || ""} problem${totalSelected === 1 ? "" : "s"}`}
          </NbButton>
          <span className="text-sm text-gray-600">in {languageLabel(language)}</span>
        </div>

        <Explainer title="How does practice work?">
          <p>
            Each problem is framed like a real interview question: a statement, input and output,
            examples, constraints, test cases and what the interviewer expects from you.
          </p>
          <p>
            Your code is saved on this device as you type. Code isn't run here; "Check my approach"
            asks the AI to reason about your code against the test cases. Practice is separate from
            the interview and is never scored.
          </p>
        </Explainer>
      </div>
    </div>
  );
}
