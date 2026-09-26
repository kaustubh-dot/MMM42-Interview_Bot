import "server-only";

// DSA practice service: problem sets, topic patterns and tutoring help. Every model call goes
// through A's `generateJson` adapter (task "practice"), and every reply is validated with zod
// before use. When the AI isn't available the bundled problem set is used and labeled as such;
// it is never presented as AI output. Practice is not part of the scored interview.

import { LlmError, generateJson } from "@/lib/llm";
import type { JsonValue } from "@/types/pipeline-api";
import { z } from "zod";
import { BANK, type BankEntry, bankToProblem, findBankEntry } from "./bank";
import {
  LANGUAGE_IDS,
  MAX_PROBLEMS_PER_SET,
  PRACTICE_TOPICS,
  type PracticeLanguage,
  type PracticePattern,
  languageLabel,
} from "./catalog";
import type {
  HelpReply,
  HelpRequest,
  PatternsReply,
  PracticeProblem,
  ProblemSetReply,
  ProblemSetRequest,
} from "./types";

// ── Request validation ─────────────────────────────────────────────────
const short = (max: number) => z.string().trim().min(1).max(max);

export const problemSetRequestSchema = z.object({
  language: z.enum(LANGUAGE_IDS),
  mode: z.enum(["random", "topic"]),
  topic: short(80).optional(),
  selections: z
    .array(
      z.object({ pattern: short(120), count: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
    )
    .max(8)
    .optional(),
  avoidTitles: z.array(z.string().max(120)).max(40).optional(),
});

export const patternsRequestSchema = z.object({ topic: short(80) });

const exampleSchema = z.object({
  input: z.string().min(1).max(2000),
  output: z.string().min(1).max(2000),
  explanation: z.string().max(2000).optional(),
});
const testCaseSchema = z.object({
  input: z.string().min(1).max(2000),
  expectedOutput: z.string().min(1).max(2000),
  note: z.string().max(300).optional(),
});
const problemSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  topic: z.string().min(1).max(80),
  pattern: z.string().min(1).max(120),
  knownAs: z.string().min(1).max(200),
  statement: z.string().min(1).max(5000),
  inputFormat: z.string().min(1).max(1000),
  outputFormat: z.string().min(1).max(1000),
  constraints: z.array(z.string().min(1).max(300)).min(1).max(12),
  examples: z.array(exampleSchema).min(1).max(5),
  testCases: z.array(testCaseSchema).min(1).max(10),
  expectations: z.array(z.string().min(1).max(300)).min(1).max(10),
  starterCode: z.string().max(20_000),
  starterLanguage: z.enum(LANGUAGE_IDS),
});

export const helpRequestSchema = z.object({
  kind: z.enum(["understand", "hint", "solve", "review", "ask"]),
  problem: problemSchema,
  language: z.enum(LANGUAGE_IDS),
  code: z.string().max(100 * 1024),
  hintLevel: z.number().int().min(1).max(3).optional(),
  question: z.string().trim().max(2000).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
    .max(12)
    .optional(),
});

// ── Model reply validation ─────────────────────────────────────────────
const modelProblemSchema = problemSchema.omit({ id: true, starterLanguage: true });
const modelProblemSetSchema = z.object({
  problems: z.array(modelProblemSchema).min(1).max(MAX_PROBLEMS_PER_SET),
});
const modelPatternsSchema = z.object({
  patterns: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(400),
        classicExample: z.string().min(1).max(160),
      }),
    )
    .min(2)
    .max(8),
});
const modelHelpSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(200),
        body: z.string().min(1).max(6000),
        code: z.string().max(20_000).optional(),
      }),
    )
    .min(1)
    .max(12),
  testReview: z
    .array(
      z.object({
        input: z.string().min(1).max(2000),
        verdict: z.enum(["likely passes", "likely fails", "unclear"]),
        reason: z.string().min(1).max(1000),
      }),
    )
    .max(12)
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
const BUILT_IN_NOTICE_MOCK = "Demo mode: showing the built-in problem set (LLM_MODE=mock).";
const BUILT_IN_NOTICE_UNCONFIGURED =
  "The AI isn't set up on this server, so you're seeing the built-in problem set. Add LLM_MODE=gemini and GEMINI_API_KEY to switch on AI-generated problems.";
const BUILT_IN_NOTICE_FAILED =
  "The AI didn't respond properly, so you're seeing the built-in problem set. Try again for AI problems.";

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Calls the model; on configuration/upstream/shape failures returns null with a reason. */
async function callModel<T>(
  system: string,
  input: JsonValue,
  mockOutput: JsonValue,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: "unconfigured" | "failed" }> {
  let raw: unknown;
  try {
    raw = await generateJson({ task: "practice", system, input, mockOutput });
  } catch (err) {
    if (err instanceof LlmError && err.code === "LLM_CONFIGURATION") {
      return { ok: false, reason: "unconfigured" };
    }
    return { ok: false, reason: "failed" };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "failed" };
}

// ── Problem sets ───────────────────────────────────────────────────────
const PROBLEM_SHAPE = `Return JSON: {"problems": [ { "title", "difficulty" ("Easy"|"Medium"|"Hard"), "topic", "pattern", "knownAs" (where it is commonly known from, e.g. "Classic interview problem (LeetCode 11)" or "Asked at Amazon and Google"), "statement" (clear, self-contained, 2-5 sentences), "inputFormat", "outputFormat", "constraints" (array of strings with realistic bounds), "examples" (2 items: {"input","output","explanation"}), "testCases" (3-5 items: {"input","expectedOutput","note"}; include edge cases such as empty input, single element, duplicates, negatives, large values), "expectations" (3-5 bullet strings: what the interviewer expects, e.g. target time/space complexity, explain approach, handle edge cases), "starterCode" (a function or class stub only, NO solution, in the requested language) } ]}.
Every expectedOutput must be correct for its input. Use plain text (no markdown). Never include the solution.`;

function pickBankForRandom(avoid: string[]): BankEntry[] {
  const avoidSet = new Set(avoid.map((t) => t.toLowerCase()));
  const fresh = BANK.filter((e) => !avoidSet.has(e.title.toLowerCase()));
  const pool = shuffle(fresh.length >= 3 ? fresh : BANK);
  // Prefer three different topics.
  const out: BankEntry[] = [];
  for (const e of pool) {
    if (out.length < 3 && !out.some((o) => o.topic === e.topic)) {
      out.push(e);
    }
  }
  return out.length === 3 ? out : pool.slice(0, 3);
}

function pickBankForTopic(
  topic: string,
  selections: { pattern: string; count: number }[],
): BankEntry[] {
  const inTopic = BANK.filter((e) => e.topic.toLowerCase() === topic.toLowerCase());
  const out: BankEntry[] = [];
  for (const sel of selections) {
    const matches = shuffle(
      inTopic.filter((e) => e.pattern.toLowerCase() === sel.pattern.toLowerCase()),
    );
    out.push(...matches.slice(0, sel.count).filter((m) => !out.includes(m)));
  }
  if (out.length === 0) {
    out.push(...shuffle(inTopic).slice(0, 3));
  }
  return out.slice(0, MAX_PROBLEMS_PER_SET);
}

function withIds(
  problems: z.infer<typeof modelProblemSchema>[],
  language: PracticeLanguage,
): PracticeProblem[] {
  const stamp = Date.now().toString(36);
  return problems.map((p, i) => ({
    ...p,
    id: `ai-${slug(p.title)}-${stamp}-${i}`,
    starterLanguage: language,
  }));
}

export async function createProblemSet(req: ProblemSetRequest): Promise<ProblemSetReply> {
  const language = req.language;
  let bankPick: BankEntry[];
  let requested = 3;
  let system: string;
  let input: JsonValue;

  if (req.mode === "random") {
    bankPick = pickBankForRandom(req.avoidTitles ?? []);
    const topics = shuffle(PRACTICE_TOPICS)
      .slice(0, 3)
      .map((t) => t.name);
    const difficulties = shuffle(["Easy", "Medium", "Medium", "Hard"]).slice(0, 3);
    system = `You are an interview coach. Pick 3 different, well-known coding interview problems that are popular worldwide (the kind asked at top tech companies and found on LeetCode, HackerRank or GeeksforGeeks). Use one problem per requested topic, at the requested difficulty. Frame each one like a real interview question. ${PROBLEM_SHAPE}`;
    input = toJson({
      language: languageLabel(language),
      topics,
      difficulties,
      avoidTitles: req.avoidTitles ?? [],
    });
  } else {
    const topic = req.topic ?? "Arrays & Hashing";
    const selections = req.selections?.length
      ? req.selections
      : [{ pattern: "any", count: 1 as const }];
    const total = selections.reduce((n, s) => n + s.count, 0);
    if (total > MAX_PROBLEMS_PER_SET) {
      throw new PracticeError(
        400,
        "too_many",
        `Pick at most ${MAX_PROBLEMS_PER_SET} problems in one set.`,
      );
    }
    bankPick = pickBankForTopic(topic, selections);
    requested = total;
    system = `You are an interview coach. For the topic and each selected pattern, create exactly the requested number of distinct interview problems that genuinely require that pattern, based on popular, well-known interview problems. Order them easier to harder within each pattern. ${PROBLEM_SHAPE}`;
    input = toJson({
      language: languageLabel(language),
      topic,
      patterns: selections,
      avoidTitles: req.avoidTitles ?? [],
    });
  }

  const mockProblems = bankPick.map((e) => bankToProblem(e, language));
  const result = await callModel(
    system,
    input,
    toJson({ problems: mockProblems }),
    modelProblemSetSchema,
  );
  if (result.ok && !isMockMode()) {
    return { problems: withIds(result.value.problems, language), source: "ai" };
  }
  if (mockProblems.length === 0) {
    throw new PracticeError(
      503,
      "ai_unavailable",
      "The built-in set has no problems for this topic, and the AI isn't available right now. Try a listed topic.",
    );
  }
  const notice = isMockMode()
    ? BUILT_IN_NOTICE_MOCK
    : !result.ok && result.reason === "unconfigured"
      ? BUILT_IN_NOTICE_UNCONFIGURED
      : BUILT_IN_NOTICE_FAILED;
  const shortfall =
    mockProblems.length < requested
      ? ` The built-in set has ${mockProblems.length} of the ${requested} problems you asked for.`
      : "";
  return { problems: mockProblems, source: "built-in", notice: notice + shortfall };
}

// ── Patterns ───────────────────────────────────────────────────────────
export async function getPatterns(topicName: string): Promise<PatternsReply> {
  const known = PRACTICE_TOPICS.find(
    (t) => t.name.toLowerCase() === topicName.toLowerCase() || t.id === topicName.toLowerCase(),
  );
  if (known) {
    return { topic: known.name, patterns: known.patterns, source: "catalog" };
  }
  const result = await callModel(
    'You are a DSA tutor. List the main problem-solving patterns for the given topic that students should practice for coding interviews. Return JSON: {"patterns": [{"name", "description" (one simple sentence), "classicExample" (a well-known problem name)}]} with 3-6 patterns. Plain text only.',
    toJson({ topic: topicName }),
    toJson({
      patterns: [
        {
          name: `${topicName} fundamentals`,
          description: `Core ${topicName} problems.`,
          classicExample: "A classic problem",
        },
        {
          name: `Advanced ${topicName}`,
          description: `Harder ${topicName} variations.`,
          classicExample: "A harder variation",
        },
      ],
    }),
    modelPatternsSchema,
  );
  if (!result.ok) {
    throw new PracticeError(
      503,
      "ai_unavailable",
      result.reason === "unconfigured"
        ? "Custom topics need the AI, which isn't set up on this server. Pick one of the listed topics."
        : "The AI couldn't list patterns right now. Try again, or pick one of the listed topics.",
    );
  }
  const patterns: PracticePattern[] = result.value.patterns.map((pt) => ({
    ...pt,
    id: slug(pt.name),
  }));
  return {
    topic: topicName,
    patterns,
    source: isMockMode() ? "built-in" : "ai",
    ...(isMockMode() ? { notice: "Demo mode: placeholder patterns (LLM_MODE=mock)." } : {}),
  };
}

// ── Tutoring help ──────────────────────────────────────────────────────
const TUTOR_BASE = `You are a friendly, patient DSA tutor for a student practicing for coding interviews. Explain in simple words, short paragraphs, no markdown symbols. Return JSON: {"title", "sections": [{"heading", "body", "code" (optional)}], "followUps" (optional: up to 3 short questions the student might ask next)}.`;

const HELP_SYSTEM: Record<HelpRequest["kind"], string> = {
  understand: `${TUTOR_BASE} Help the student understand the problem only: restate it in plain words, walk through the first example by hand, list the edge cases to watch for, and say which pattern family might help. Do NOT give the algorithm or code.`,
  hint: `${TUTOR_BASE} Give exactly one hint at the requested hintLevel: 1 = a gentle nudge about what to notice, 2 = the key idea or data structure, 3 = the algorithm outline in words. Never give code or the full solution. Build on hints already given in history.`,
  solve: `${TUTOR_BASE} Teach the full solution step by step. Include sections for: why the naive approach is slow, the key insight (why), what data structure/state to keep (what), how to proceed step by step (how), a dry run on the first example, complexity, and common mistakes. Put the complete, correct solution code in the student's language in one section's "code" field.`,
  review: `${TUTOR_BASE} Review the student's code WITHOUT running it. Reason carefully about correctness against each provided test case and add "testReview": [{"input", "verdict" ("likely passes"|"likely fails"|"unclear"), "reason"}]. Point out bugs, edge cases and complexity. Be clear that this is reasoning, not execution. Don't rewrite their whole solution; suggest targeted fixes.`,
  ask: `${TUTOR_BASE} Answer the student's question about this problem (why, what, how to proceed). Use the conversation history. If they haven't asked for the full solution, prefer guiding questions and hints over giving it away.`,
};

function builtInHelp(req: HelpRequest, entry: BankEntry | undefined): HelpReply {
  const source = "built-in" as const;
  const notice = isMockMode()
    ? "Demo mode: built-in tutor notes (LLM_MODE=mock)."
    : "The AI tutor isn't available, so these are the built-in notes for this problem.";
  if (!entry) {
    throw new PracticeError(
      503,
      "ai_unavailable",
      "The AI tutor isn't available right now. Try again in a moment.",
    );
  }
  const ex1 = entry.examples[0];
  switch (req.kind) {
    case "understand":
      return {
        source,
        notice,
        title: `Understanding "${entry.title}"`,
        sections: [
          { heading: "In plain words", body: entry.statement },
          {
            heading: "Walk through an example",
            body: `Input: ${ex1.input}\nOutput: ${ex1.output}${ex1.explanation ? `\nWhy: ${ex1.explanation}` : ""}`,
          },
          {
            heading: "Edge cases to watch",
            body: entry.testCases
              .map((tc) => `${tc.input}${tc.note ? ` (${tc.note})` : ""}`)
              .join("\n"),
          },
          {
            heading: "Which pattern helps?",
            body: `This is a "${entry.pattern}" problem (${entry.topic}).`,
          },
        ],
        followUps: ["Give me a hint", "What's the brute force?"],
      };
    case "hint": {
      const level = Math.min(3, Math.max(1, req.hintLevel ?? 1));
      return {
        source,
        notice,
        title: `Hint ${level} of 3`,
        sections: [{ heading: `Hint ${level}`, body: entry.hints[level - 1] }],
      };
    }
    case "solve":
      return {
        source,
        notice,
        title: `Step-by-step: ${entry.title}`,
        sections: [
          ...entry.steps,
          {
            heading:
              req.language === "python" ? "Solution" : "Solution (built-in notes are in Python)",
            body: `Complexity: ${entry.complexity}.`,
            code: entry.solutionPython,
          },
        ],
      };
    case "review":
      return {
        source,
        notice,
        title: "Check it yourself",
        sections: [
          {
            heading: "The AI reviewer isn't available",
            body: "Trace your code by hand on each test case below. For each one, write down what every variable holds after each loop step and compare the final value with the expected output.",
          },
        ],
        testReview: entry.testCases.map((tc) => ({
          input: tc.input,
          verdict: "unclear" as const,
          reason: `Expected: ${tc.expectedOutput}. Trace your code to confirm.`,
        })),
      };
    default:
      return {
        source,
        notice,
        title: "Built-in notes",
        sections: [
          {
            heading: "Free-form questions need the AI",
            body: "Meanwhile, here is how to think about it:",
          },
          ...entry.steps.slice(0, 2),
        ],
      };
  }
}

export async function getHelp(req: HelpRequest): Promise<HelpReply> {
  if (req.kind === "ask" && !req.question) {
    throw new PracticeError(400, "missing_question", "Type a question first.");
  }
  const entry = findBankEntry(req.problem.id);
  const { starterCode: _s, ...problemForModel } = req.problem;
  const input = toJson({
    problem: problemForModel,
    language: languageLabel(req.language),
    studentCode: req.code,
    hintLevel: req.hintLevel ?? null,
    question: req.question ?? null,
    history: req.history ?? [],
  });
  // Mock output: the built-in notes (only available for built-in problems).
  let mock: JsonValue = toJson({
    title: "Tutor",
    sections: [{ heading: "Demo", body: "Demo mode tutor reply." }],
  });
  if (entry) {
    const { source: _src, notice: _n, ...rest } = builtInHelp(req, entry);
    mock = toJson(rest);
  }
  const result = await callModel(HELP_SYSTEM[req.kind], input, mock, modelHelpSchema);
  if (result.ok && !isMockMode()) {
    return { ...result.value, source: "ai" };
  }
  return builtInHelp(req, entry);
}
