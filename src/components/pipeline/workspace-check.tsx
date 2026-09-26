"use client";

// Standalone check page for the technical workspace (plan task C1 acceptance). It uses a mock
// save with a failure toggle, local demo content only, and never calls a backend.

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import type { AnswerArtifact } from "./contract";
import { clearDraft, loadDraft, saveDraft } from "./draft-store";
import {
  ArtifactReview,
  TechnicalWorkspace,
  type TechnicalWorkspaceRef,
  type WorkspaceMode,
} from "./technical-workspace";

const ATTEMPT = "workspace-check";

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
};

export function WorkspaceCheck() {
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
      setStatus("Mock save failed. The draft is kept; press Submit again to retry.");
      return;
    }
    setSubmitted((s) => ({ ...s, [questionId]: artifact }));
    clearDraft(ATTEMPT, questionId);
    setStatus(
      `Saved ${artifact.kind === "code" ? `${artifact.code.length} characters of code` : `${JSON.parse(artifact.sceneJson).elements.length} drawing element(s)`}.`,
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-semibold">Workspace check</h1>
        <p className="text-sm text-gray-600">
          Local test page for the code editor and whiteboard: drafts per question, immediate capture
          on Submit, cleared content, failure and read-only review. Uses a mock save; nothing leaves
          the browser.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {Object.keys(QUESTIONS).map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={id === questionId ? "default" : "outline"}
            onClick={() => {
              setQuestionId(id);
              setStatus(null);
            }}
          >
            {id}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={failNext}
            onChange={(e) => setFailNext(e.target.checked)}
          />
          Simulate save failure
        </label>
      </div>

      <TechnicalWorkspace
        key={`${ATTEMPT}:${questionId}`}
        ref={ref}
        mode={QUESTIONS[questionId]}
        initialArtifact={draft?.artifact ?? null}
        onArtifactChange={(artifact) =>
          saveDraft(ATTEMPT, questionId, { transcript: "", artifact })
        }
      />

      <div className="flex items-center gap-3">
        <Button type="button" onClick={submit}>
          Submit
        </Button>
        {status && <output className="text-sm text-gray-700">{status}</output>}
      </div>

      {submitted[questionId] && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Last submitted for {questionId} (read-only)</h2>
          <ArtifactReview artifact={submitted[questionId]} />
        </section>
      )}
    </div>
  );
}
