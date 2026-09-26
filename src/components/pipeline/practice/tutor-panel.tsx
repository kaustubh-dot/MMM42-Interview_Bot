"use client";

import type { PracticeLanguage } from "@/lib/practice/catalog";
import type { HelpKind, HelpMessage, HelpReply, Track } from "@/lib/practice/types";
import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NbButton } from "../ui";
import { fetchHelp } from "./api";

export type ThreadItem =
  | { role: "user"; text: string }
  | { role: "assistant"; reply: HelpReply; kind: HelpKind };

export interface Thread {
  items: ThreadItem[];
  hintsGiven: number;
}

export const EMPTY_THREAD: Thread = { items: [], hintsGiven: 0 };

const DEFAULT_FOLLOW_UPS: Record<Track, string[]> = {
  coding: [
    "Why does this approach work?",
    "What should I keep track of?",
    "How do I start coding it?",
  ],
  sql: ["Which tables do I need?", "Why do I need a join here?", "How do I order the result?"],
  design: ["What should I clarify first?", "Where is the bottleneck?", "How would this scale 10x?"],
};

const LABELS: Record<Track, { review: string; reviewAsk: string; checks: string; start: string }> =
  {
    coding: {
      review: "Check my approach",
      reviewAsk: "Check my approach against the test cases",
      checks: "Test case check (reasoned, not run)",
      start: "Try solving it first.",
    },
    sql: {
      review: "Check my query",
      reviewAsk: "Check my query against the expected result",
      checks: "Query check (reasoned, not run)",
      start: "Try writing the query first.",
    },
    design: {
      review: "Review my design",
      reviewAsk: "Review my design",
      checks: "Design checklist",
      start: "Sketch your design and jot notes first.",
    },
  };

const VERDICT_STYLE = {
  "likely passes": "bg-emerald-100",
  covered: "bg-emerald-100",
  "likely fails": "nb-bg-salmon",
  missing: "nb-bg-salmon",
  unclear: "bg-[#f3f3f3]",
} as const;

function asHistory(items: ThreadItem[]): HelpMessage[] {
  return items.slice(-10).map((it) =>
    it.role === "user"
      ? { role: "user", text: it.text.slice(0, 2000) }
      : {
          role: "assistant",
          text: [it.reply.title, ...it.reply.sections.map((s) => `${s.heading}: ${s.body}`)]
            .join("\n")
            .slice(0, 6000),
        },
  );
}

interface Props {
  track: Track;
  itemId: string;
  language?: PracticeLanguage;
  /** The student's current work, read at the moment help is requested. */
  getAnswer: () => string;
  thread: Thread;
  onThread: (t: Thread) => void;
}

/** AI tutor: understand the question, hints, a step-by-step solution, and a review. */
export function TutorPanel({ track, itemId, language, getAnswer, thread, onThread }: Props) {
  const labels = LABELS[track];
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [question, setQuestion] = useState("");
  const [confirmSolve, setConfirmSolve] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef(thread);
  threadRef.current = thread;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when a message arrives
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [thread.items.length, loading]);

  const ask = async (
    kind: HelpKind,
    label: string,
    opts: { hintLevel?: number; question?: string } = {},
  ) => {
    setError(null);
    setConfirmSolve(false);
    const before = threadRef.current;
    const withUser: Thread = { ...before, items: [...before.items, { role: "user", text: label }] };
    onThread(withUser);
    setLoading(label);
    try {
      const reply = await fetchHelp({
        track,
        itemId,
        kind,
        ...(language ? { language } : {}),
        answer: getAnswer(),
        ...(opts.hintLevel ? { hintLevel: opts.hintLevel } : {}),
        ...(opts.question ? { question: opts.question } : {}),
        history: asHistory(before.items),
      });
      onThread({
        items: [...withUser.items, { role: "assistant", reply, kind }],
        hintsGiven:
          kind === "hint" ? Math.max(before.hintsGiven, opts.hintLevel ?? 1) : before.hintsGiven,
      });
    } catch (err) {
      // Drop the unanswered question so a retry doesn't duplicate it.
      onThread(before);
      setError({
        message: err instanceof Error ? err.message : "The tutor didn't answer.",
        retry: () => ask(kind, label, opts),
      });
    } finally {
      setLoading(null);
    }
  };

  const nextHint = Math.min(3, thread.hintsGiven + 1);
  const busy = loading !== null;
  const lastAssistant = [...thread.items].reverse().find((i) => i.role === "assistant");
  const followUps =
    lastAssistant?.role === "assistant" && lastAssistant.reply.followUps?.length
      ? lastAssistant.reply.followUps
      : DEFAULT_FOLLOW_UPS[track];

  return (
    <section className="nb-card flex flex-col" aria-label="AI tutor">
      <header className="space-y-3 border-b-2 border-[#111] p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#111] nb-bg-lavender text-lg">
            🤖
          </span>
          <div>
            <h2 className="font-black">AI tutor</h2>
            <p className="text-xs text-gray-600">Ask for as much or as little help as you want.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border-2 border-[#111] nb-bg-soft-lavender p-3">
            <p className="text-sm font-bold">💡 Stuck on the question?</p>
            <div className="flex flex-wrap gap-2">
              <NbButton
                size="sm"
                disabled={busy}
                onClick={() => ask("understand", "Help me understand the question")}
              >
                Explain the question
              </NbButton>
              <NbButton
                size="sm"
                disabled={busy || thread.hintsGiven >= 3}
                onClick={() => ask("hint", `Give me hint ${nextHint}`, { hintLevel: nextHint })}
              >
                {thread.hintsGiven >= 3 ? "All 3 hints used" : `Give me a hint (${nextHint}/3)`}
              </NbButton>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3">
            <p className="text-sm font-bold">🧑‍🏫 Want to learn the solution?</p>
            <div className="flex flex-wrap gap-2">
              {confirmSolve ? (
                <>
                  <NbButton
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => ask("solve", "Walk me through the solution step by step")}
                  >
                    Yes, show me
                  </NbButton>
                  <NbButton size="sm" disabled={busy} onClick={() => setConfirmSolve(false)}>
                    Not yet
                  </NbButton>
                </>
              ) : (
                <NbButton size="sm" disabled={busy} onClick={() => setConfirmSolve(true)}>
                  Walk me through it
                </NbButton>
              )}
              <NbButton size="sm" disabled={busy} onClick={() => ask("review", labels.reviewAsk)}>
                {labels.review}
              </NbButton>
            </div>
            {confirmSolve && (
              <p className="text-xs text-gray-700">
                This reveals the full solution. Tried a hint first?
              </p>
            )}
          </div>
        </div>
      </header>

      <div
        className="max-h-[560px] min-h-[160px] flex-1 space-y-4 overflow-y-auto p-4"
        aria-live="polite"
      >
        {thread.items.length === 0 && !busy && (
          <p className="text-sm text-gray-600">
            {labels.start} When you want help, pick a button above or ask a question below (why,
            what, how to proceed…).
          </p>
        )}
        {thread.items.map((item, i) =>
          item.role === "user" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: thread items are append-only
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-none border-2 border-[#111] nb-bg-salmon px-3 py-2 text-sm">
                {item.text}
              </p>
            </div>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: thread items are append-only
            <AssistantReply key={i} reply={item.reply} checksTitle={labels.checks} />
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
          >
            <p>{error.message}</p>
            <NbButton size="sm" className="mt-2" onClick={error.retry}>
              Try again
            </NbButton>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer className="space-y-2 border-t-2 border-[#111] p-4">
        <div className="flex flex-wrap gap-2">
          {followUps.map((f) => (
            <button
              key={f}
              type="button"
              disabled={busy}
              className="rounded-full border-2 border-[#111] bg-white px-3 py-1 text-xs font-medium hover:bg-[#eeeefe] disabled:opacity-50"
              onClick={() => ask("ask", f, { question: f })}
            >
              {f}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = question.trim();
            if (q && !busy) {
              setQuestion("");
              ask("ask", q, { question: q });
            }
          }}
        >
          <label htmlFor="tutor-question" className="sr-only">
            Ask the tutor
          </label>
          <input
            id="tutor-question"
            className="nb-input py-2"
            placeholder="Ask anything: why, what, how to proceed…"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <NbButton
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || !question.trim()}
            aria-label="Send question"
          >
            <Send className="h-4 w-4" />
          </NbButton>
        </form>
      </footer>
    </section>
  );
}

function AssistantReply({ reply, checksTitle }: { reply: HelpReply; checksTitle: string }) {
  return (
    <div className="space-y-3 rounded-2xl rounded-tl-none border-2 border-[#111] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-black">{reply.title}</p>
        <span
          className={`nb-pill ml-auto text-[11px] ${reply.source === "ai" ? "nb-bg-soft-lavender" : "bg-[#f3f3f3]"}`}
        >
          {reply.source === "ai" ? "AI tutor" : "Built-in notes"}
        </span>
      </div>
      {reply.notice && <p className="text-xs text-gray-600">{reply.notice}</p>}
      {reply.sections.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are static per reply
        <div key={i} className="space-y-1">
          <p className="text-sm font-bold">
            {reply.sections.length > 1 ? `${i + 1}. ` : ""}
            {s.heading}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{s.body}</p>
          {s.code && <pre className="nb-code overflow-x-auto p-3 text-xs">{s.code}</pre>}
        </div>
      ))}
      {reply.checks && reply.checks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">{checksTitle}</p>
          <ul className="space-y-2">
            {reply.checks.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static per reply
              <li key={i} className="rounded-xl border-2 border-[#111]/20 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs">{r.label}</code>
                  <span className={`nb-pill ml-auto text-[11px] ${VERDICT_STYLE[r.verdict]}`}>
                    {r.verdict}
                  </span>
                </div>
                <p className="mt-1 text-gray-700">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
