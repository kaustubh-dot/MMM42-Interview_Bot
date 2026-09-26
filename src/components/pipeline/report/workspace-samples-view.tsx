"use client";

import type { WorkspaceExample } from "@/fixtures/workspace-interview";
import { NbLinkButton, SectionHeading } from "../ui";
import { TranscriptPanel } from "./transcript-panel";

/**
 * A's standalone code/whiteboard submission examples, rendered read-only. They have no scored
 * report or decision history, so no score, audit or integrity band is shown.
 */
export function WorkspaceSamplesView({ examples }: { examples: WorkspaceExample[] }) {
  return (
    <div className="nb-orbs alt">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 md:px-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            Saved code &amp; drawings
          </h1>
          <p className="text-lg text-gray-700">
            This is how a reviewer sees what a candidate built during a technical question. Code and
            drawings are saved for a person to look at. They aren't scored and code is never run.
            Only the spoken explanation is scored.
          </p>
          <div className="flex flex-wrap gap-3">
            <NbLinkButton href="/practice" variant="primary" size="sm">
              Try the workspace yourself
            </NbLinkButton>
            <NbLinkButton href="/report/sample" size="sm">
              Full sample report
            </NbLinkButton>
          </div>
        </header>
        {examples.map((ex) => (
          <section key={ex.record.plan.interviewId} className="space-y-3">
            <SectionHeading
              title={ex.kind === "code" ? "Code answer" : "Whiteboard answer"}
              star={ex.kind === "code" ? "#b6b7fd" : "#ffc3be"}
            />
            <span className="nb-pill nb-bg-salmon">{ex.label}</span>
            <TranscriptPanel
              turns={ex.record.turns}
              selected={null}
              focusTurnId={null}
              artifactsOpen
            />
          </section>
        ))}
      </div>
    </div>
  );
}
