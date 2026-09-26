"use client";

// Practice page for the technical workspace. Doubles as the C1 acceptance check: drafts per
// question, immediate capture on save, cleared content, a simulated failure and read-only review.
// It uses a local mock save and never calls a backend.

import { workspaceExamples } from "@/fixtures/workspace-interview";
import { useRef, useState } from "react";
import { type AnswerArtifact, workspaceForQuestion } from "./contract";
import { clearDraft, loadDraft, saveDraft } from "./draft-store";
import {
  ArtifactReview,
  TechnicalWorkspace,
  type TechnicalWorkspaceRef,
  type WorkspaceMode,
} from "./technical-workspace";
import { NbButton } from "./ui";

const ATTEMPT = "workspace-check";

// Friendly names for the practice questions; ids stay stable because drafts are keyed by them.
const LABELS: Record<string, string> = {
  "code-q1": "Find the bug (JavaScript)",
  "code-q2": "Remove duplicates (Python)",
  "board-q1": "Design: payment events",
  "board-q2": "Design: product cache",
  "sample-code": "Fix a SQL query",
  "sample-whiteboard": "Design: interview API",
};

const QUESTIONS: Record<string, WorkspaceMode> = {
  "code-q1": {
    kind: "code",
    snippet: {
      language: "javascript",
      code: "function total(items) {\n  let sum = 0;\n  for (let i = 0; i <= items.length; i++) {\n    sum += items[i].price;\n  }\n  return sum;\n}\n",
    },
  },
  "code-q2": {
    kind: "code",
    snippet: { language: "python", code: "def dedupe(xs):\n    return list(set(xs))\n" },
  },
  "board-q1": {
    kind: "whiteboard",
    prompt: "Sketch how an order service would publish payment events so each is processed once.",
  },
  "board-q2": {
    kind: "whiteboard",
    prompt: "Sketch a read-through cache in front of a product catalog.",
  },
  // A's safe workspace fixture questions, selected with the same rule as the interview screen.
  ...Object.fromEntries(
    workspaceExamples.flatMap((ex) => {
      const question = ex.record.turns.find((t) => t.speaker === "ai");
      const mode = question ? workspaceForQuestion(ex.record.plan, question) : null;
      return mode ? [[`sample-${ex.kind}`, mode]] : [];
    }),
  ),
};

export function PracticeWorkspace() {
  const [questionId, setQuestionId] = useState("code-q1");
  const [failNext, setFailNext] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, AnswerArtifact>>({});
  const ref = useRef<TechnicalWorkspaceRef>(null);
  const draft = loadDraft(ATTEMPT, questionId);

  const submit = async () => {
    const artifact = ref.current?.capture();
    if (!artifact) {
      return;
    }
    saveDraft(ATTEMPT, questionId, { transcript: "", artifact });
    setStatus("Saving...");
    await new Promise((r) => setTimeout(r, 400));
    if (failNext) {
      setStatus(
        "Couldn't save (pretend network error). Your work is still here, so press Save again.",
      );
      return;
    }
    setSubmitted((s) => ({ ...s, [questionId]: artifact }));
    clearDraft(ATTEMPT, questionId);
    setStatus(
      `✓ Saved ${artifact.kind === "code" ? `${artifact.code.length} characters of code` : `${JSON.parse(artifact.sceneJson).elements.length} drawing element(s)`}.`,
    );
  };

  const mode = QUESTIONS[questionId];
  return (
    <div className="nb-orbs alt">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Practice workspace</h1>
          <p className="max-w-3xl text-lg text-gray-700">
            Some interview questions open a code editor or a whiteboard. Try them here first. Your
            work is saved on this device as you go, so you can reload or switch questions without
            losing it.
          </p>
        </header>

        <section className="space-y-2">
          <p className="font-bold">1. Pick a practice question</p>
          <div className="flex flex-wrap gap-3">
            {Object.keys(QUESTIONS).map((id) => (
              <NbButton
                key={id}
                size="sm"
                data-question={id}
                variant={id === questionId ? "primary" : "default"}
                aria-pressed={id === questionId}
                onClick={() => {
                  setQuestionId(id);
                  setStatus(null);
                }}
              >
                {QUESTIONS[id].kind === "code" ? "💻" : "🖍️"} {LABELS[id] ?? id}
              </NbButton>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="font-bold">
            2. {mode.kind === "code" ? "Edit the code" : "Draw your design"}, then save it
          </p>
          <TechnicalWorkspace
            key={`${ATTEMPT}:${questionId}`}
            ref={ref}
            mode={mode}
            initialArtifact={draft?.artifact ?? null}
            onArtifactChange={(artifact) =>
              saveDraft(ATTEMPT, questionId, { transcript: "", artifact })
            }
          />
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <NbButton variant="primary" onClick={submit}>
            Save my answer
          </NbButton>
          {status && <output className="font-medium">{status}</output>}
          <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#494cf3]"
              checked={failNext}
              onChange={(e) => setFailNext(e.target.checked)}
            />
            Pretend the internet is down (to see that nothing is lost)
          </label>
        </div>

        {submitted[questionId] && (
          <section className="space-y-2">
            <p className="font-bold">3. What a reviewer will see (read-only)</p>
            <ArtifactReview artifact={submitted[questionId]} />
          </section>
        )}
      </div>
    </div>
  );
}
