// Types shared by the Practice page and the practice API routes.
// Practice is separate from the scored interview: nothing here is graded or stored on a server.
// Client-facing shapes never include reference solutions; the server looks those up by ID.

import type { PracticeLanguage } from "./catalog";

export type Track = "coding" | "sql" | "design";
export type Difficulty = "Easy" | "Medium" | "Hard";

export interface SourceInfo {
  name: string;
  url: string;
  commit: string;
  license: string;
}

// ── Coding ─────────────────────────────────────────────────────────────
export interface CodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface CodingTestCase {
  input: string;
  expectedOutput: string;
}

export interface CodingProblem {
  id: string;
  questionId: number;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  statement: string;
  examples: CodingExample[];
  constraints: string[];
  followUp: string | null;
  testCases: CodingTestCase[];
  pythonStarter: string;
}

// ── SQL ────────────────────────────────────────────────────────────────
export interface SqlTable {
  name: string;
  columns: { name: string; type: string; nullable: boolean }[];
  sampleRows: string[][];
}

export interface SqlSchema {
  tables: SqlTable[];
  foreignKeys: string[];
}

export interface SqlExercise {
  id: string;
  category: string;
  title: string;
  question: string;
  orderMatters: boolean;
  writeable: boolean;
  checksTable?: string;
  expected: { columns: string[]; rows: string[][]; totalRows: number };
}

// ── Design ─────────────────────────────────────────────────────────────
export interface DesignQuestion {
  id: string;
  title: string;
  /** Guided questions come with use cases, constraints and a reference walkthrough. */
  guided: boolean;
  useCases?: string[];
  outOfScope?: string[];
  assumptions?: string[];
  calculations?: string[];
}

// ── Catalog passed to the Practice page ────────────────────────────────
export interface PracticeCatalog {
  coding: { topics: { id: string; name: string; count: number }[]; source: SourceInfo };
  sql: {
    categories: { id: string; name: string; description: string; count: number }[];
    schema: SqlSchema;
    source: SourceInfo;
  };
  design: { questions: DesignQuestion[]; source: SourceInfo };
}

// ── Requests / replies ─────────────────────────────────────────────────
export type SetRequest =
  | {
      track: "coding";
      /** A topic ID, or "surprise" for 3 random problems from different topics. */
      topic: string;
      difficulty: Difficulty | "Any";
      count: number;
      avoidIds?: string[];
    }
  | { track: "sql"; category: string; count: number; avoidIds?: string[] };

export type SetReply =
  | { track: "coding"; problems: (CodingProblem & { topic: string })[]; notice?: string }
  | { track: "sql"; exercises: SqlExercise[]; notice?: string };

export type HelpKind = "understand" | "hint" | "solve" | "review" | "ask";

export interface HelpMessage {
  role: "user" | "assistant";
  text: string;
}

export interface HelpRequest {
  track: Track;
  itemId: string;
  kind: HelpKind;
  /** The student's current work: code, SQL, or design notes plus whiteboard labels. */
  answer: string;
  language?: PracticeLanguage;
  /** For kind "hint": 1, 2 or 3 (each reveals a bit more). */
  hintLevel?: number;
  /** For kind "ask". */
  question?: string;
  history?: HelpMessage[];
}

export interface HelpSection {
  heading: string;
  body: string;
  code?: string;
}

export interface CheckItem {
  label: string;
  verdict: "likely passes" | "likely fails" | "unclear" | "covered" | "missing";
  reason: string;
}

/** "ai": the model answered. "built-in": notes from the open-source dataset (AI unavailable). */
export type HelpSource = "ai" | "built-in";

export interface HelpReply {
  title: string;
  sections: HelpSection[];
  /** For kind "review": per test case / expected column / design component. Nothing is executed. */
  checks?: CheckItem[];
  followUps?: string[];
  source: HelpSource;
  notice?: string;
}

export interface PracticeErrorBody {
  error: { code: string; message: string };
}
