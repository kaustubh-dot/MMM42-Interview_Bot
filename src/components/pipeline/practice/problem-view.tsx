"use client";

import type { Difficulty, PracticeProblem } from "@/lib/practice/types";

export const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  Easy: "bg-emerald-100",
  Medium: "bg-[#fff3c4]",
  Hard: "nb-bg-salmon",
};

function Block({ children }: { children: React.ReactNode }) {
  return <pre className="nb-code whitespace-pre-wrap break-words p-3 text-sm">{children}</pre>;
}

/** A problem framed like a real interview question. */
export function ProblemView({ problem, index }: { problem: PracticeProblem; index: number }) {
  return (
    <article className="nb-card space-y-5 p-5 md:p-6" aria-label="Problem">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="nb-pill">Problem {index + 1}</span>
          <span className={`nb-pill ${DIFFICULTY_STYLE[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
          <span className="nb-pill nb-bg-soft-lavender">{problem.pattern}</span>
          <span className="text-sm text-gray-600">{problem.topic}</span>
        </div>
        <h2 className="text-2xl font-black md:text-3xl">{problem.title}</h2>
        <p className="text-sm text-gray-600">{problem.knownAs}</p>
      </header>

      <section>
        <p className="whitespace-pre-wrap text-base leading-relaxed">{problem.statement}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[#f3f3f3] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Input</p>
          <p className="text-sm">{problem.inputFormat}</p>
        </div>
        <div className="rounded-xl bg-[#f3f3f3] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Output</p>
          <p className="text-sm">{problem.outputFormat}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-black">Examples</h3>
        {problem.examples.map((ex, i) => (
          <div key={`${ex.input}-${i}`} className="space-y-1">
            <p className="text-sm font-bold">Example {i + 1}</p>
            <Block>
              {`Input:  ${ex.input}\nOutput: ${ex.output}`}
              {ex.explanation ? `\nWhy:    ${ex.explanation}` : ""}
            </Block>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-black">Constraints</h3>
        <ul className="list-disc space-y-1 pl-5 font-mono text-sm">
          {problem.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-black">Test cases</h3>
        <p className="text-sm text-gray-600">
          Check your code against these. Code isn't run here; use "Check my approach" to have the AI
          reason about them.
        </p>
        <div className="overflow-x-auto rounded-xl border-2 border-[#111]">
          <table className="w-full text-left text-sm">
            <thead className="nb-bg-soft-lavender">
              <tr>
                <th className="px-3 py-2 font-bold">Input</th>
                <th className="px-3 py-2 font-bold">Expected output</th>
                <th className="px-3 py-2 font-bold">Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {problem.testCases.map((tc, i) => (
                <tr key={`${tc.input}-${i}`} className="border-t border-[#111]/20 align-top">
                  <td className="px-3 py-2 font-mono">{tc.input}</td>
                  <td className="px-3 py-2 font-mono">{tc.expectedOutput}</td>
                  <td className="px-3 py-2 text-gray-600">{tc.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-4">
        <h3 className="text-lg font-black">What the interviewer expects from you</h3>
        <ul className="space-y-1">
          {problem.expectations.map((e) => (
            <li key={e} className="flex gap-2">
              <span aria-hidden="true">✓</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
