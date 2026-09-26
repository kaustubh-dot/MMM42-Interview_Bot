"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface Props {
  faceSignalsEnabled: boolean;
  speechSupported: boolean;
  onStart: () => void;
  onBack: () => void;
}

/** Shown before the interview starts: the candidate is told what is monitored and why. */
export function MonitoringDisclosure({
  faceSignalsEnabled,
  speechSupported,
  onStart,
  onBack,
}: Props) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">Before you start</h1>

      {!speechSupported && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Voice answers need Google Chrome. You can still type your answers in this browser.
        </p>
      )}

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">How it works</h2>
        <ul className="list-disc space-y-1 pl-5 text-gray-700">
          <li>
            Questions are read aloud. Answer out loud; your words appear as text you can correct.
          </li>
          <li>Each question follows a fixed rule you can see in the decision log.</li>
          <li>
            Some technical questions open a code editor or whiteboard. They are saved for a person
            to review. Only your spoken explanation is scored, and no code is run.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-medium">What is monitored</h2>
        <ul className="list-disc space-y-1 pl-5 text-gray-700">
          <li>When this tab is hidden or you switch to another window, and for how long.</li>
          <li>When you paste text, and how many characters. The pasted content is not stored.</li>
          <li>How long you take to start speaking after each question.</li>
          <li>
            {faceSignalsEnabled
              ? "Whether a face is visible, more than one face, and sustained looking away. Video is processed in your browser and never uploaded."
              : "Camera-based signals are not active in this interview."}
          </li>
        </ul>
        <p className="rounded-md bg-gray-50 p-3 text-gray-700">
          These signals produce a Low, Medium or High concern level for a person to review. Each one
          has innocent explanations. They are never a cheating decision, never end the interview,
          and never change your scores. Nothing is blocked.
        </p>
      </section>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        I understand what is monitored and want to start.
      </label>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" disabled={!agreed} onClick={onStart}>
          Start interview
        </Button>
      </div>
    </div>
  );
}
