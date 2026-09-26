"use client";

import type { WorkspaceExample } from "@/fixtures/workspace-interview";
import Link from "next/link";
import { TranscriptPanel } from "./transcript-panel";

/**
 * A's standalone code/whiteboard submission examples, rendered read-only. They have no scored
 * report or decision history, so no score, audit or integrity band is shown.
 */
export function WorkspaceSamplesView({ examples }: { examples: WorkspaceExample[] }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Workspace submission samples</h1>
          <p className="text-sm text-gray-600">
            Saved code and drawings as a recruiter sees them. Supporting artifacts for human review:
            not scored, and no code is run.
          </p>
        </div>
        <Link href="/report/sample" className="ml-auto text-sm text-indigo-700 hover:underline">
          Full sample report (fixture)
        </Link>
      </header>
      {examples.map((ex) => (
        <section key={ex.record.plan.interviewId} className="space-y-2">
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
            {ex.label}
          </span>
          <TranscriptPanel
            turns={ex.record.turns}
            selected={null}
            focusTurnId={null}
            artifactsOpen
          />
        </section>
      ))}
    </div>
  );
}
