"use client";

import {
  CodeEditorCanvas,
  type CodeEditorCanvasRef,
} from "@/components/code-editor/code-editor-canvas";
import type { PracticeCatalog, SqlExercise, SqlSchema } from "@/lib/practice/types";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { NbButton } from "../ui";
import { fetchSet, loadText, recentIds, rememberIds, saveText } from "./api";
import { CountPicker, SetTabs, SourceNote } from "./shared";
import { EMPTY_THREAD, type Thread, TutorPanel } from "./tutor-panel";

const SQL_STARTER = "-- Write your PostgreSQL query here\n";

function ResultTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-[#111]">
      <table className="w-full text-left font-mono text-xs">
        <thead className="nb-bg-soft-lavender">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static rows
            <tr key={i} className="border-t border-[#111]/15">
              {r.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static cells
                <td key={j} className="whitespace-nowrap px-3 py-1.5">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaPanel({ schema }: { schema: SqlSchema }) {
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-black">Database schema</h3>
      <p className="text-sm text-gray-600">
        A country club: members, the facilities they book, and bookings.
      </p>
      {schema.tables.map((t) => (
        <details key={t.name} className="rounded-xl border-2 border-[#111] bg-white p-3">
          <summary className="cursor-pointer font-mono text-sm font-bold">
            {t.name}{" "}
            <span className="font-sans font-normal text-gray-600">
              ({t.columns.length} columns)
            </span>
          </summary>
          <ul className="mt-2 grid gap-1 font-mono text-xs sm:grid-cols-2">
            {t.columns.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong> <span className="text-gray-600">{c.type}</span>
                {c.nullable && <span className="text-gray-500"> (nullable)</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs font-bold">Sample rows</p>
          <div className="mt-1">
            <ResultTable columns={t.columns.map((c) => c.name)} rows={t.sampleRows} />
          </div>
        </details>
      ))}
      <p className="font-mono text-xs text-gray-700">{schema.foreignKeys.join(" · ")}</p>
    </section>
  );
}

function ExerciseView({
  exercise,
  index,
  schema,
}: { exercise: SqlExercise; index: number; schema: SqlSchema }) {
  const { expected } = exercise;
  return (
    <article className="nb-card space-y-5 p-5 md:p-6" aria-label="Exercise">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="nb-pill">Exercise {index + 1}</span>
          {exercise.writeable && <span className="nb-pill nb-bg-salmon">Changes data</span>}
          {exercise.orderMatters && (
            <span className="nb-pill nb-bg-soft-lavender">Row order matters</span>
          )}
        </div>
        <h2 className="text-2xl font-black md:text-3xl">{exercise.title}</h2>
      </header>
      <p className="whitespace-pre-wrap text-base leading-relaxed">{exercise.question}</p>
      <section className="space-y-2">
        <h3 className="text-lg font-black">Expected result</h3>
        <p className="text-sm text-gray-600">
          {exercise.writeable
            ? `After your statement runs, ${exercise.checksTable} should look like this. `
            : "Your query should return exactly this. "}
          {expected.totalRows > expected.rows.length
            ? `Showing the first ${expected.rows.length} of ${expected.totalRows} rows.`
            : `${expected.totalRows} row${expected.totalRows === 1 ? "" : "s"}.`}{" "}
          Queries aren't run here; "Check my query" reasons about it.
        </p>
        <ResultTable columns={expected.columns} rows={expected.rows} />
      </section>
      <SchemaPanel schema={schema} />
    </article>
  );
}

export function SqlPractice({ catalog }: { catalog: PracticeCatalog["sql"] }) {
  const [category, setCategory] = useState(catalog.categories[0]?.id ?? "basic");
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<SqlExercise[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<CodeEditorCanvasRef>(null);

  const start = async () => {
    setError(null);
    setLoading(true);
    try {
      const reply = await fetchSet({ track: "sql", category, count, avoidIds: recentIds("sql") });
      if (reply.track !== "sql") {
        return;
      }
      rememberIds(
        "sql",
        reply.exercises.map((e) => e.id),
      );
      setExercises(reply.exercises);
      setNotice(reply.notice ?? null);
      setActive(0);
      setThreads({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get exercises.");
    } finally {
      setLoading(false);
    }
  };

  const exercise = exercises?.[active];
  if (exercises && exercise) {
    const draftKey = `sql:${exercise.id}`;
    return (
      <div className="space-y-5">
        <div className="nb-card flat flex flex-wrap items-center gap-3 p-3">
          <NbButton size="sm" onClick={() => setExercises(null)}>
            <ArrowLeft className="h-4 w-4" /> New set
          </NbButton>
          <SetTabs
            items={exercises}
            active={active}
            onSelect={setActive}
            label="Exercises"
            render={(e, i) => (
              <>
                {i + 1}. <span className="max-w-[220px] truncate">{e.title}</span>
              </>
            )}
          />
        </div>
        {notice && <p className="nb-card flat bg-[#fff3c4] p-3 text-sm">{notice}</p>}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
            <ExerciseView exercise={exercise} index={active} schema={catalog.schema} />
          </div>
          <div className="min-w-0 space-y-5">
            <section className="nb-card overflow-hidden" aria-label="Your query">
              <header className="flex flex-wrap items-center gap-3 border-b-2 border-[#111] nb-bg-soft-lavender px-4 py-2">
                <span className="font-black">Your query · PostgreSQL</span>
                <span className="text-xs text-gray-600">Saved on this device · not run</span>
                <NbButton
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    saveText(draftKey, SQL_STARTER);
                    setEditorVersion((v) => v + 1);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </NbButton>
              </header>
              <CodeEditorCanvas
                key={`${draftKey}:${editorVersion}`}
                ref={editorRef}
                initialSnapshot={{ code: loadText(draftKey) ?? SQL_STARTER, language: "sql" }}
                onAutoSave={(s) => saveText(draftKey, s.code)}
              />
            </section>
            <TutorPanel
              key={exercise.id}
              track="sql"
              itemId={exercise.id}
              getAnswer={() => editorRef.current?.getSnapshot().code ?? ""}
              thread={threads[exercise.id] ?? EMPTY_THREAD}
              onThread={(t) => setThreads((all) => ({ ...all, [exercise.id]: t }))}
            />
          </div>
        </div>
      </div>
    );
  }

  const selected = catalog.categories.find((c) => c.id === category);
  return (
    <div className="space-y-6">
      <section className="nb-card space-y-4 p-6">
        <h2 className="text-xl font-black">1. Pick a category</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {catalog.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`nb-card hoverable space-y-1 p-4 text-left ${category === c.id ? "nb-bg-lavender" : ""}`}
            >
              <span className="block font-black">
                {c.name}{" "}
                <span className="text-xs font-medium text-gray-700">· {c.count} exercises</span>
              </span>
              <span className="block text-sm text-gray-700">{c.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="nb-card space-y-4 p-6">
        <h2 className="text-xl font-black">2. Choose how many</h2>
        <CountPicker
          value={Math.min(count, selected?.count ?? 10)}
          onChange={setCount}
          max={Math.min(10, selected?.count ?? 10)}
        />
      </section>
      {error && (
        <p role="alert" className="nb-card flat nb-bg-soft-salmon p-4 font-medium">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <NbButton variant="primary" size="lg" disabled={loading} onClick={start}>
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          Start {Math.min(count, selected?.count ?? count)} exercise{count === 1 ? "" : "s"}
        </NbButton>
        <SourceNote {...catalog.source} />
      </div>
    </div>
  );
}
