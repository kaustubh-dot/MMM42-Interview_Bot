"use client";

import type { PracticeCatalog, Track } from "@/lib/practice/types";
import { useEffect, useState } from "react";
import { Explainer, NbLinkButton } from "../ui";
import { CodingPractice } from "./coding-practice";
import { DesignPractice } from "./design-practice";
import { SqlPractice } from "./sql-practice";

const TABS: { id: Track; label: string; emoji: string; blurb: string }[] = [
  { id: "coding", label: "Coding", emoji: "💻", blurb: "Data structures & algorithms, by topic." },
  {
    id: "design",
    label: "System design",
    emoji: "🏗️",
    blurb: "Design real systems on a whiteboard.",
  },
  { id: "sql", label: "SQL", emoji: "🗄️", blurb: "Write queries against a real schema." },
];

/** One Practice tab with three tracks. The chosen track is kept in the URL (?track=). */
export function PracticeHub({ catalog }: { catalog: PracticeCatalog }) {
  const [track, setTrack] = useState<Track>("coding");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("track");
    if (t === "coding" || t === "design" || t === "sql") {
      setTrack(t);
    }
  }, []);

  const choose = (t: Track) => {
    setTrack(t);
    const url = new URL(window.location.href);
    url.searchParams.set("track", t);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="nb-orbs min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 md:px-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">Practice</h1>
          <p className="max-w-3xl text-lg text-gray-700">
            Real interview questions from open-source collections, with an AI tutor beside you. It
            can explain the question, give hints, walk you through a solution, or review your work.
          </p>
        </header>

        <div role="tablist" aria-label="Practice track" className="grid gap-3 sm:grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={track === t.id}
              onClick={() => choose(t.id)}
              className={`nb-card hoverable flex items-center gap-3 p-4 text-left ${
                track === t.id ? "nb-bg-lavender" : ""
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {t.emoji}
              </span>
              <span>
                <span className="block text-lg font-black">{t.label}</span>
                <span className="block text-sm text-gray-700">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={TABS.find((t) => t.id === track)?.label}>
          {track === "coding" && <CodingPractice catalog={catalog.coding} />}
          {track === "sql" && <SqlPractice catalog={catalog.sql} />}
          {track === "design" && <DesignPractice catalog={catalog.design} />}
        </div>

        <Explainer title="How does practice work?">
          <p>
            Questions come from open-source collections: LeetCodeDataset for coding, PostgreSQL
            Exercises for SQL and the System Design Primer for design. Each has examples,
            constraints and test cases or an expected result.
          </p>
          <p>
            Your work is saved on this device as you go. Nothing is run: "Check" and "Review" ask
            the AI to reason about your work. Practice is separate from the interview and never
            scored.
          </p>
        </Explainer>
        <NbLinkButton href="/practice/playground" size="sm">
          Just want to try the code editor &amp; whiteboard? Open the playground
        </NbLinkButton>
      </div>
    </div>
  );
}
