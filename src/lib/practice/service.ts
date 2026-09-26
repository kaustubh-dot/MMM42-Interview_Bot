import "server-only";

// Practice service. Problem sets come from the open-source datasets (no AI needed). The AI tutor
// goes through A's `generateJson` adapter (task "practice"), is grounded with the dataset's
// reference solution, and every reply is validated with zod. When the AI is unavailable the
// tutor falls back to notes built from the dataset, always labeled "built-in".

import { LlmError, generateJson } from "@/lib/llm";
import type { JsonValue } from "@/types/pipeline-api";
import { z } from "zod";
import { LANGUAGE_IDS, MAX_SET_SIZE, TOPIC_HINTS, languageLabel } from "./catalog";
import {
  CODING,
  type CodingRecord,
  type DesignRecord,
  SQL,
  type SqlRecord,
  findCoding,
  findDesign,
  findSql,
  toClientCoding,
  toClientSql,
  topicOfProblem,
} from "./data";
import type { CheckItem, HelpReply, HelpRequest, SetReply, SetRequest } from "./types";

// ── Request validation ─────────────────────────────────────────────────
const avoid = z.array(z.string().max(120)).max(60).optional();

export const setRequestSchema = z.discriminatedUnion("track", [
  z.object({
    track: z.literal("coding"),
    topic: z.string().min(1).max(60),
    difficulty: z.enum(["Any", "Easy", "Medium", "Hard"]),
    count: z.number().int().min(1).max(MAX_SET_SIZE),
    avoidIds: avoid,
  }),
  z.object({
    track: z.literal("sql"),
    category: z.string().min(1).max(60),
    count: z.number().int().min(1).max(MAX_SET_SIZE),
    avoidIds: avoid,
  }),
]);

export const helpRequestSchema = z.object({
  track: z.enum(["coding", "sql", "design"]),
  itemId: z.string().min(1).max(160),
  kind: z.enum(["understand", "hint", "solve", "review", "ask"]),
  answer: z.string().max(100 * 1024),
  language: z.enum(LANGUAGE_IDS).optional(),
  hintLevel: z.number().int().min(1).max(3).optional(),
  question: z.string().trim().max(2000).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
    .max(12)
    .optional(),
});

const modelHelpSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(200),
        body: z.string().min(1).max(8000),
        code: z.string().max(20_000).optional(),
      }),
    )
    .min(1)
    .max(14),
  checks: z
    .array(
      z.object({
        label: z.string().min(1).max(2000),
        verdict: z.enum(["likely passes", "likely fails", "unclear", "covered", "missing"]),
        reason: z.string().min(1).max(1500),
      }),
    )
    .max(20)
    .optional(),
  followUps: z.array(z.string().min(1).max(200)).max(4).optional(),
});

export class PracticeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isMockMode = () => process.env.LLM_MODE === "mock";

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

/** Prefer items the student hasn't seen recently, but never return fewer than available. */
function pickFresh<T extends { id: string }>(
  pool: T[],
  count: number,
  avoidIds: string[] = [],
): T[] {
  const seen = new Set(avoidIds);
  const fresh = shuffle(pool.filter((p) => !seen.has(p.id)));
  const stale = shuffle(pool.filter((p) => seen.has(p.id)));
  return [...fresh, ...stale].slice(0, count);
}

const codingPool = (ids: string[]) =>
  ids.map((id) => findCoding(id)).filter((p): p is CodingRecord => !!p);

// ── Problem sets ───────────────────────────────────────────────────────
export function createSet(req: SetRequest): SetReply {
  if (req.track === "sql") {
    const cat = SQL.categories.find((c) => c.id === req.category);
    if (!cat) {
      throw new PracticeError(400, "unknown_category", "Pick one of the listed SQL categories.");
    }
    const pool = cat.exerciseIds.map((id) => findSql(id)).filter((e): e is SqlRecord => !!e);
    // Keep the dataset's teaching order within the set.
    const picked = pickFresh(pool, req.count, req.avoidIds).sort(
      (a, b) => pool.indexOf(a) - pool.indexOf(b),
    );
    return {
      track: "sql",
      exercises: picked.map(toClientSql),
      ...(picked.length < req.count
        ? { notice: `This category has ${picked.length} exercises, so you get all of them.` }
        : {}),
    };
  }

  if (req.topic === "surprise") {
    const topics = shuffle(CODING.topics).slice(0, 3);
    const difficulties = shuffle(["Easy", "Medium", "Hard"] as const);
    const problems = topics.map((t, i) => {
      const all = codingPool(t.problemIds);
      const want = req.difficulty === "Any" ? difficulties[i] : req.difficulty;
      const pool = all.filter((p) => p.difficulty === want);
      const pick = pickFresh(pool.length ? pool : all, 1, req.avoidIds)[0];
      return { ...toClientCoding(pick), topic: t.name };
    });
    return { track: "coding", problems };
  }

  const topic = CODING.topics.find((t) => t.id === req.topic);
  if (!topic) {
    throw new PracticeError(400, "unknown_topic", "Pick one of the listed topics.");
  }
  const pool = codingPool(topic.problemIds).filter(
    (p) => req.difficulty === "Any" || p.difficulty === req.difficulty,
  );
  const order = { Easy: 0, Medium: 1, Hard: 2 };
  const picked = pickFresh(pool, req.count, req.avoidIds).sort(
    (a, b) => order[a.difficulty] - order[b.difficulty],
  );
  const level = req.difficulty === "Any" ? "" : `${req.difficulty} `;
  return {
    track: "coding",
    problems: picked.map((p) => ({ ...toClientCoding(p), topic: topic.name })),
    ...(picked.length < req.count
      ? {
          notice: `There are ${picked.length} ${level}problems in ${topic.name}, so you get all of them.`,
        }
      : {}),
  };
}

// ── Tutor prompts ──────────────────────────────────────────────────────
const TUTOR_BASE = `You are a friendly, patient interview-prep tutor for a student. Explain in simple words and short paragraphs, with no markdown symbols. You are given the exercise and a REFERENCE SOLUTION for grounding: never reveal or paraphrase the reference solution unless the task is "solve". Return JSON: {"title", "sections": [{"heading", "body", "code" (optional)}], "followUps" (optional: up to 3 short questions the student might ask next)}.`;

const TRACK_CONTEXT: Record<HelpRequest["track"], string> = {
  coding:
    "The exercise is a coding (data structures and algorithms) problem. The student's work is code in the language given.",
  sql: "The exercise is a PostgreSQL query exercise on the given schema (schema cd: members, facilities, bookings). The student's work is a SQL query.",
  design:
    "The exercise is a system design interview question. The student's work is their written notes plus the text labels from their whiteboard diagram.",
};

const KIND_TASK: Record<HelpRequest["kind"], string> = {
  understand:
    'Task "understand": help the student understand the exercise only. Restate it in plain words, walk through the example or expected output, and list what to watch out for (edge cases, requirements, scope). Do NOT give the approach, query or design.',
  hint: 'Task "hint": give exactly one hint at the requested hintLevel: 1 = a gentle nudge about what to notice, 2 = the key idea (data structure, SQL clause, or architecture component), 3 = an outline in words. No code, no full query, no full design. Build on earlier hints in the history.',
  solve:
    'Task "solve": teach the full solution step by step, using the reference solution. Cover: why the naive approach falls short, the key insight (why), what to keep track of (what), how to proceed step by step (how), a dry run on the example, complexity or trade-offs, and common mistakes. For coding, put complete correct code in the student\'s language in one section\'s "code". For SQL, put the full query in "code".',
  review:
    'Task "review": review the student\'s work WITHOUT running anything. Add "checks": for coding, one item per test case ({"label": input, "verdict": "likely passes"|"likely fails"|"unclear", "reason"}); for SQL, check the result columns, filters, joins, grouping and ordering against the expected output ({"verdict": "likely passes"|"likely fails"|"unclear"}); for design, one item per important component or requirement ({"verdict": "covered"|"missing"}). Point out bugs and gaps with targeted fixes. Say clearly that this is reasoning, not execution.',
  ask: 'Task "ask": answer the student\'s question (why, what, how to proceed) using the history. If they have not asked for the full solution, guide with questions and hints instead of giving it away.',
};

function itemForModel(req: HelpRequest) {
  if (req.track === "coding") {
    const p = findCoding(req.itemId);
    if (!p) {
      return null;
    }
    const { referenceSolution, referenceExplanation, pythonStarter: _s, ...exercise } = p;
    return {
      exercise,
      referenceSolution: `${referenceSolution}\n\n${referenceExplanation}`.slice(0, 6000),
    };
  }
  if (req.track === "sql") {
    const e = findSql(req.itemId);
    if (!e) {
      return null;
    }
    const { referenceSql, referenceExplanation, hint, ...exercise } = e;
    return {
      exercise: {
        ...exercise,
        schema: SQL.schema.tables.map((t) => ({ table: t.name, columns: t.columns })),
        foreignKeys: SQL.schema.foreignKeys,
      },
      referenceSolution: `${referenceSql}\n\n${referenceExplanation}\n\nHint: ${hint}`.slice(
        0,
        6000,
      ),
    };
  }
  const q = findDesign(req.itemId);
  if (!q) {
    return null;
  }
  const { walkthrough, keyTerms, ...exercise } = q;
  return {
    exercise,
    referenceSolution: walkthrough
      ? walkthrough
          .map((s) => `${s.heading}: ${s.body}`)
          .join("\n\n")
          .slice(0, 7000)
      : "No reference walkthrough: use standard system design practice (requirements, estimates, API, data model, high-level design, scaling, bottlenecks).",
    keyComponents: keyTerms ?? [],
  };
}

// ── Built-in notes (AI unavailable) ────────────────────────────────────
const firstSentences = (s: string, n: number) =>
  (s.match(/[^.!?]+[.!?]+/g) ?? [s]).slice(0, n).join(" ").trim();

const SQL_FEATURES: [RegExp, string][] = [
  [/\bjoin\b/i, "JOIN"],
  [/\bleft (outer )?join\b/i, "LEFT OUTER JOIN"],
  [/\bgroup by\b/i, "GROUP BY"],
  [/\bhaving\b/i, "HAVING"],
  [/\bover\s*\(/i, "a window function (OVER)"],
  [/\bwith recursive\b/i, "WITH RECURSIVE"],
  [/\bcase\b/i, "CASE"],
  [/\(\s*select\b/i, "a subquery"],
  [/\bunion\b/i, "UNION"],
  [/\bdistinct\b/i, "DISTINCT"],
  [/\border by\b/i, "ORDER BY"],
  [/\bgenerate_series\b/i, "generate_series"],
  [/\b(extract|date_trunc|date_part)\b/i, "a date function (EXTRACT / DATE_TRUNC)"],
  [/\binsert\b/i, "INSERT"],
  [/\bupdate\b/i, "UPDATE"],
  [/\bdelete\b/i, "DELETE"],
];
const sqlFeatures = (sql: string) =>
  SQL_FEATURES.filter(([re]) => re.test(sql)).map(([, name]) => name);

const GENERIC_DESIGN_STEPS = [
  {
    heading: "1. Clarify requirements",
    body: "List the core use cases, what is out of scope, and targets for scale, latency and availability.",
  },
  {
    heading: "2. Estimate",
    body: "Rough numbers: users, requests per second (reads vs writes), storage per year, bandwidth.",
  },
  {
    heading: "3. API and data model",
    body: "Define the main endpoints and the tables or documents they read and write.",
  },
  {
    heading: "4. High-level design",
    body: "Client → load balancer → stateless web/API servers → database, plus cache, object store, queue or CDN where they help.",
  },
  {
    heading: "5. Scale and bottlenecks",
    body: "Find the hot path. Add caching, replication, sharding and async workers; discuss trade-offs and failure modes.",
  },
];

function builtInCoding(req: HelpRequest, base: Pick<HelpReply, "source" | "notice">): HelpReply {
  const p = findCoding(req.itemId);
  if (!p) {
    throw new PracticeError(404, "unknown_item", "That problem no longer exists. Start a new set.");
  }
  const level = Math.min(3, Math.max(1, req.hintLevel ?? 1));
  const hints = TOPIC_HINTS[topicOfProblem(p.id)?.id ?? ""] ?? [
    "Start from the brute force and find the repeated work.",
    "Pick a data structure that removes the repeated work.",
  ];
  const ex = p.examples[0];
  switch (req.kind) {
    case "understand":
      return {
        ...base,
        title: `Understanding "${p.title}"`,
        sections: [
          { heading: "The task", body: p.statement },
          {
            heading: "Walk through example 1",
            body: `Input: ${ex.input}\nOutput: ${ex.output}${ex.explanation ? `\nWhy: ${ex.explanation}` : ""}`,
          },
          { heading: "Watch the constraints", body: p.constraints.join("\n") },
          {
            heading: "Edge cases from the tests",
            body: p.testCases.map((t) => t.input).join("\n"),
          },
        ],
        followUps: ["Give me a hint", "What's the brute force?"],
      };
    case "hint":
      return {
        ...base,
        title: `Hint ${level} of 3`,
        sections: [
          {
            heading: `Hint ${level}`,
            body:
              level < 3 ? hints[level - 1] : firstSentences(p.referenceExplanation, 2) || hints[1],
          },
        ],
      };
    case "solve": {
      const other = req.language && req.language !== "python";
      return {
        ...base,
        title: `Step by step: ${p.title}`,
        sections: [
          {
            heading: "Reference explanation",
            body: p.referenceExplanation || "Read the code below line by line.",
          },
          {
            heading: "Reference solution (Python, from the dataset)",
            body: other
              ? `The built-in solution is in Python. The AI tutor writes it in ${languageLabel(req.language ?? "python")} when it's switched on.`
              : "Compare it with your approach, line by line.",
            code: p.referenceSolution,
          },
        ],
      };
    }
    case "review":
      return {
        ...base,
        title: "Check it yourself",
        sections: [
          {
            heading: "Trace by hand",
            body: "The AI reviewer isn't available. Trace your code on each test case below, tracking every variable after each step, and compare with the expected output.",
          },
        ],
        checks: p.testCases.map((t) => ({
          label: t.input,
          verdict: "unclear" as const,
          reason: `Expected ${t.expectedOutput}. Trace your code to confirm.`,
        })),
      };
    default:
      return {
        ...base,
        title: "Built-in notes",
        sections: [
          {
            heading: "Free-form questions need the AI",
            body: `Meanwhile: ${hints[0]} ${hints[1]}`,
          },
        ],
      };
  }
}

function builtInSql(req: HelpRequest, base: Pick<HelpReply, "source" | "notice">): HelpReply {
  const e = findSql(req.itemId);
  if (!e) {
    throw new PracticeError(
      404,
      "unknown_item",
      "That exercise no longer exists. Start a new set.",
    );
  }
  const level = Math.min(3, Math.max(1, req.hintLevel ?? 1));
  const tables = SQL.schema.tables.filter((t) => e.referenceSql.toLowerCase().includes(t.name));
  const features = sqlFeatures(e.referenceSql);
  switch (req.kind) {
    case "understand":
      return {
        ...base,
        title: `Understanding "${e.title}"`,
        sections: [
          { heading: "The task", body: e.question },
          {
            heading: "Tables you'll need",
            body:
              tables
                .map((t) => `${t.name}: ${t.columns.map((c) => c.name).join(", ")}`)
                .join("\n") || "See the schema panel.",
          },
          {
            heading: "What the result looks like",
            body: `${e.writeable ? `This changes data; it's checked by looking at ${e.checksTable} afterwards.\n` : ""}Columns: ${e.expected.columns.join(", ")}\nRows: ${e.expected.totalRows}${e.orderMatters ? "\nThe row order matters." : ""}`,
          },
        ],
      };
    case "hint": {
      const order = features.filter((f) =>
        ["JOIN", "LEFT OUTER JOIN", "GROUP BY", "HAVING", "ORDER BY"].includes(f),
      );
      const body =
        level === 1
          ? e.hint
          : level === 2
            ? `You'll likely need: ${features.join(", ") || "a SELECT with a WHERE clause"}.`
            : `Tables involved: ${tables.map((t) => t.name).join(", ")}. Build it in this order: FROM → ${order.join(" → ") || "WHERE → SELECT"}.`;
      return {
        ...base,
        title: `Hint ${level} of 3`,
        sections: [{ heading: `Hint ${level}`, body }],
      };
    }
    case "solve":
      return {
        ...base,
        title: `Step by step: ${e.title}`,
        sections: [
          { heading: "Explanation", body: e.referenceExplanation },
          { heading: "Reference query", body: "From PostgreSQL Exercises.", code: e.referenceSql },
        ],
      };
    case "review": {
      const answer = req.answer.toLowerCase();
      const checks: CheckItem[] = [
        ...e.expected.columns.map((col) => {
          const has = answer.includes(col.toLowerCase());
          return {
            label: `Result column "${col}"`,
            verdict: has ? ("likely passes" as const) : ("unclear" as const),
            reason: has
              ? "Your query mentions this column or alias."
              : "Couldn't find this column or alias in your query. Check the SELECT list and aliases.",
          };
        }),
        ...features.map((f) => {
          const re = SQL_FEATURES.find(([, name]) => name === f)?.[0];
          const has = re ? re.test(req.answer) : false;
          return {
            label: f,
            verdict: has ? ("likely passes" as const) : ("unclear" as const),
            reason: has
              ? "Your query uses this."
              : "The reference answer uses this. Check whether your approach needs it.",
          };
        }),
      ];
      return {
        ...base,
        title: "Quick check (built-in, not run)",
        sections: [
          {
            heading: "How this check works",
            body: "Without the AI, this only compares your query's text with the expected columns and the clauses the reference answer uses. It does not run your SQL.",
          },
        ],
        checks,
      };
    }
    default:
      return {
        ...base,
        title: "Built-in notes",
        sections: [
          {
            heading: "Free-form questions need the AI",
            body: `Meanwhile, the exercise hint: ${e.hint}`,
          },
        ],
      };
  }
}

function builtInDesign(req: HelpRequest, base: Pick<HelpReply, "source" | "notice">): HelpReply {
  const q = findDesign(req.itemId) as DesignRecord | undefined;
  if (!q) {
    throw new PracticeError(404, "unknown_item", "That design question no longer exists.");
  }
  const level = Math.min(3, Math.max(1, req.hintLevel ?? 1));
  switch (req.kind) {
    case "understand":
      return {
        ...base,
        title: `Scoping "${q.title}"`,
        sections: q.guided
          ? [
              { heading: "Use cases to support", body: (q.useCases ?? []).join("\n") },
              {
                heading: "Out of scope",
                body: (q.outOfScope ?? []).join("\n") || "Ask the interviewer.",
              },
              {
                heading: "Assumptions",
                body: (q.assumptions ?? []).join("\n") || "Ask the interviewer.",
              },
            ]
          : [
              {
                heading: "Questions to ask first",
                body: "Who are the users and what are the 3 most important actions? How many users and requests per second? Read-heavy or write-heavy? What latency and availability are expected? What's out of scope?",
              },
            ],
      };
    case "hint": {
      const body =
        level === 1
          ? "Start with the simplest design that serves the main use cases: client → web server → API → database. Draw it before optimizing."
          : level === 2
            ? q.calculations?.length
              ? `Size the problem:\n${q.calculations.slice(0, 8).join("\n")}`
              : "Estimate reads vs writes per second and storage per year. The bigger side drives caching, replication and sharding choices."
            : q.walkthrough?.[0]
              ? firstSentences(q.walkthrough[0].body, 3)
              : "Add a cache in front of the hot reads, move slow work to a queue with workers, and put static content on a CDN.";
      return {
        ...base,
        title: `Hint ${level} of 3`,
        sections: [{ heading: `Hint ${level}`, body }],
      };
    }
    case "solve":
      return {
        ...base,
        title: q.walkthrough?.length ? `Walkthrough: ${q.title}` : "A framework to follow",
        sections: q.walkthrough?.length ? q.walkthrough : GENERIC_DESIGN_STEPS,
      };
    case "review": {
      const text = req.answer.toLowerCase();
      const terms = q.keyTerms?.length
        ? q.keyTerms
        : ["Load balancer", "Cache", "Database", "Queue", "CDN", "Replication", "Sharding"];
      return {
        ...base,
        title: "Design checklist (built-in)",
        sections: [
          {
            heading: "How this check works",
            body: "Without the AI, this only looks for key components from the reference design in your notes and whiteboard labels.",
          },
        ],
        checks: terms.map((t) => {
          const words = t
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 2);
          const covered = words.some((w) => text.includes(w));
          return {
            label: t,
            verdict: covered ? ("covered" as const) : ("missing" as const),
            reason: covered
              ? "Mentioned in your notes or diagram."
              : "Not found. Would it help your design?",
          };
        }),
      };
    }
    default:
      return { ...base, title: "Built-in notes", sections: GENERIC_DESIGN_STEPS.slice(0, 3) };
  }
}

function builtInHelp(req: HelpRequest): HelpReply {
  const base = {
    source: "built-in" as const,
    notice: isMockMode()
      ? "Demo mode: built-in notes from the open-source dataset (LLM_MODE=mock)."
      : "The AI tutor isn't available, so these are built-in notes from the open-source dataset.",
  };
  if (req.track === "coding") {
    return builtInCoding(req, base);
  }
  if (req.track === "sql") {
    return builtInSql(req, base);
  }
  return builtInDesign(req, base);
}

// ── Tutor entry point ──────────────────────────────────────────────────
export async function getHelp(req: HelpRequest): Promise<HelpReply> {
  if (req.kind === "ask" && !req.question) {
    throw new PracticeError(400, "missing_question", "Type a question first.");
  }
  const item = itemForModel(req);
  if (!item) {
    throw new PracticeError(
      404,
      "unknown_item",
      "That exercise no longer exists. Start a new set.",
    );
  }
  const fallback = builtInHelp(req);
  const { source: _s, notice: _n, ...mockOutput } = fallback;
  let raw: unknown;
  try {
    raw = await generateJson({
      task: "practice",
      system: `${TUTOR_BASE}\n${TRACK_CONTEXT[req.track]}\n${KIND_TASK[req.kind]}`,
      input: toJson({
        ...item,
        studentWork: req.answer,
        studentLanguage:
          req.track === "coding"
            ? languageLabel(req.language ?? "python")
            : req.track === "sql"
              ? "PostgreSQL"
              : "notes",
        hintLevel: req.hintLevel ?? null,
        question: req.question ?? null,
        history: req.history ?? [],
      }),
      mockOutput: toJson(mockOutput),
    });
  } catch (err) {
    if (err instanceof LlmError) {
      return fallback;
    }
    throw err;
  }
  if (isMockMode()) {
    return fallback;
  }
  const parsed = modelHelpSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, source: "ai" } : fallback;
}
