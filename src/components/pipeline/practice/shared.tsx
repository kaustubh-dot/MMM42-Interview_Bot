"use client";

// Small pieces shared by the three practice tracks.

import type { Difficulty } from "@/lib/practice/types";
import type { ReactNode } from "react";

export function CountPicker({
  value,
  onChange,
  max = 10,
  label = "How many questions?",
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  label?: string;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" aria-label={label}>
      <span className="mr-1 font-bold">{label}</span>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`h-9 w-9 rounded-lg border-2 border-[#111] font-bold ${
            value === n ? "nb-bg-lavender shadow-[3px_3px_0_#111]" : "bg-white hover:bg-[#eeeefe]"
          }`}
        >
          {n}
        </button>
      ))}
    </fieldset>
  );
}

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty | "Any";
  onChange: (d: Difficulty | "Any") => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" aria-label="Difficulty">
      <span className="mr-1 font-bold">Difficulty</span>
      {(["Any", "Easy", "Medium", "Hard"] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`rounded-lg border-2 border-[#111] px-3 py-1.5 text-sm font-bold ${
            value === d ? "nb-bg-lavender shadow-[3px_3px_0_#111]" : "bg-white hover:bg-[#eeeefe]"
          }`}
        >
          {d}
        </button>
      ))}
    </fieldset>
  );
}

/** Tab bar for the items in a practice set. */
export function SetTabs<T extends { id: string }>({
  items,
  active,
  onSelect,
  label,
  render,
}: {
  items: T[];
  active: number;
  onSelect: (i: number) => void;
  label: string;
  render: (item: T, i: number) => ReactNode;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          aria-current={i === active ? "true" : undefined}
          onClick={() => onSelect(i)}
          className={`flex items-center gap-2 rounded-lg border-2 border-[#111] px-3 py-1.5 text-sm font-bold ${
            i === active ? "nb-bg-lavender shadow-[3px_3px_0_#111]" : "bg-white hover:bg-[#eeeefe]"
          }`}
        >
          {render(item, i)}
        </button>
      ))}
    </nav>
  );
}

export function SourceNote({ name, url, license }: { name: string; url: string; license: string }) {
  return (
    <p className="text-xs text-gray-600">
      Questions from{" "}
      <a href={url} className="nb-link" target="_blank" rel="noreferrer">
        {name}
      </a>{" "}
      ({license}).
    </p>
  );
}
