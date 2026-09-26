// Builds the golden sample interview used for parallel development and as the on-stage fallback.
//   node scripts/build-golden-fixture.mjs
// Writes fixtures/golden-interview.json and src/fixtures/golden-interview.ts (typed as InterviewReport).
//
// Nothing here is hand-typed that code can derive:
//   - decisions come from the stated selection rule applied to the scripted grades
//   - citation offsets come from locating each quote in its turn
//   - the hash chain is computed with sha256
// This file is a reference implementation of the rule and integrity fusion; the live
// modules (Pillar 2 / Pillar 4) must produce identical output for identical input.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- Selection rule (must match CLAUDE.md "Selection rule") ----------

const RUNG_ORDER = ["initial", "termFollowUp", "scenarioTwist", "whyDefense"];
const STRONG_GRADE_MIN = 2;
const AREA_QUESTION_BUDGET = 4;
const MAX_CONSECUTIVE_WEAK = 2;

function newArea(claimId) {
  return {
    claimId,
    asked: 0,
    grades: [],
    consecutiveWeak: 0,
    currentRung: "initial",
    ladderRung: "initial",
    usedFundamental: false,
  };
}

function nextClaim(plan, visited) {
  return [...plan.claims].sort((a, b) => a.rank - b.rank).find((c) => !visited.has(c.id)) ?? null;
}

// Returns { reason, claimId, toRung } for the next AI question given the grade of the last answer.
function selectNext(plan, area, grade, totalAsked, visited) {
  const moveOn = (reason) => {
    const c = nextClaim(plan, visited);
    if (!c) {
      return { reason: "TIME_UP", claimId: area.claimId, toRung: area.currentRung };
    }
    return { reason, claimId: c.id, toRung: "initial" };
  };

  if (totalAsked >= plan.maxQuestions) {
    return { reason: "TIME_UP", claimId: area.claimId, toRung: area.currentRung };
  }

  if (grade >= STRONG_GRADE_MIN) {
    area.consecutiveWeak = 0;
    if (area.asked >= AREA_QUESTION_BUDGET) {
      return moveOn("AREA_BUDGET_EXHAUSTED");
    }
    const idx = RUNG_ORDER.indexOf(area.ladderRung);
    const up = RUNG_ORDER[idx + 1];
    if (!up) {
      return moveOn("LADDER_COMPLETE_NEXT_CLAIM");
    }
    return { reason: "STRONG_DEEPEN", claimId: area.claimId, toRung: up };
  }

  area.consecutiveWeak += 1;
  if (area.consecutiveWeak >= MAX_CONSECUTIVE_WEAK) {
    return moveOn("REPEATED_WEAK_MOVE_ON");
  }
  if (area.asked >= AREA_QUESTION_BUDGET) {
    return moveOn("AREA_BUDGET_EXHAUSTED");
  }
  if (!area.usedFundamental) {
    return { reason: "WEAK_FUNDAMENTAL", claimId: area.claimId, toRung: "fundamental" };
  }
  return moveOn("NEXT_RANKED_CLAIM");
}

// ---------- Plan (Pillar 1 output) ----------

const rubric = [
  {
    grade: 0,
    label: "No evidence",
    anchor: "Off-topic, no answer, or factually wrong about the core concept.",
  },
  {
    grade: 1,
    label: "Surface",
    anchor:
      "Names tools or concepts but gives no mechanism, trade-off, or concrete detail from their own work.",
  },
  {
    grade: 2,
    label: "Working",
    anchor:
      "Explains the mechanism correctly with at least one concrete detail; may need prompting on edge cases.",
  },
  {
    grade: 3,
    label: "Deep",
    anchor:
      "Explains mechanism, trade-offs, and failure modes with specifics from their own work, unprompted.",
  },
];

const rawClaims = [
  {
    id: "c1",
    skillArea: "Caching",
    isTechnical: true,
    claimText: "Reduced API p95 latency by 40% by introducing Redis caching.",
    resumeEvidence: "Cut catalog API p95 latency by 40% by introducing a Redis caching layer.",
    jdRequirement: "Experience designing caching strategies for high-traffic APIs.",
    jdWeight: 0.9,
    specificity: 0.5,
    ladder: {
      fundamental:
        "What are the common ways to keep a cache consistent with the database when the underlying data changes?",
      initial:
        "You cut API p95 latency by 40% with Redis caching. What exactly did you cache, and how did you decide when cached data was stale?",
      termFollowUpTemplate:
        "You mentioned {{term}}. What happens to a request that arrives while that entry is being refreshed?",
      scenarioTwist:
        "Traffic triples during a sale and the cache hit rate drops to 30%. What do you look at first?",
      whyDefenseTemplate:
        'Earlier you said "{{quote}}". Why was that the right call over the alternatives?',
    },
  },
  {
    id: "c2",
    skillArea: "PostgreSQL",
    isTechnical: true,
    claimText: "Designed PostgreSQL schemas and optimized queries.",
    resumeEvidence:
      "Designed PostgreSQL schemas and optimized slow queries for the orders service.",
    jdRequirement: "Strong SQL and PostgreSQL performance tuning.",
    jdWeight: 0.8,
    specificity: 0.3,
    ladder: {
      fundamental:
        "Let's step back. In general, what can stop PostgreSQL from using an index on a column that has one?",
      initial:
        "Your resume says you optimized slow queries for the orders service. Walk me through one slow query you fixed: how did you find it, and what changed in the plan?",
      termFollowUpTemplate:
        "You mentioned {{term}}. Why that column order, and when would the opposite order be better?",
      scenarioTwist:
        "Here's a query from the same service. It got slow again after a change. What's wrong, and how would you fix it?",
      whyDefenseTemplate: 'Earlier you said "{{quote}}". What did you give up by doing that?',
      codeSnippet: {
        language: "sql",
        code: "SELECT *\nFROM orders\nWHERE customer_id = $1\n  AND DATE(created_at) = $2\nORDER BY created_at DESC;",
        plantedIssue:
          "DATE(created_at) wraps the indexed column in a function, so the (customer_id, created_at) index can't be used for the date range; rewrite as created_at >= $2 AND created_at < $2 + interval '1 day'.",
      },
    },
  },
  {
    id: "c3",
    skillArea: "Distributed systems",
    isTechnical: true,
    claimText: "Led migration from a monolith to microservices.",
    resumeEvidence: "Led the migration of checkout from a monolith to four services.",
    jdRequirement: "Comfortable designing and operating distributed systems.",
    jdWeight: 0.6,
    specificity: 0.4,
    ladder: {
      fundamental:
        "What changes about data consistency when one database transaction becomes two services?",
      initial:
        "You led a migration from a monolith to microservices. What was the first service you split out, and what broke when you did?",
      termFollowUpTemplate:
        "You mentioned an {{term}}. How did you make it idempotent in practice?",
      scenarioTwist:
        "The message broker goes down for ten minutes during peak checkout. Walk me through what happens.",
      whyDefenseTemplate:
        'Earlier you said "{{quote}}". Why not a distributed transaction instead?',
    },
  },
  {
    id: "c4",
    skillArea: "Collaboration",
    isTechnical: false,
    claimText: "Mentored two junior engineers.",
    resumeEvidence: "Mentored two junior engineers through their first production launches.",
    jdRequirement: "Collaborates well across the team.",
    jdWeight: 0.3,
    specificity: 0.5,
    ladder: {
      fundamental: "What does good code review feedback look like to you?",
      initial:
        "You mentored two junior engineers through their first launches. Tell me about a moment one of them got stuck and what you did.",
      termFollowUpTemplate: "You mentioned {{term}}. How did you know it worked?",
      scenarioTwist:
        "Your mentee ships a bug that causes an outage. What do you do the next morning?",
      whyDefenseTemplate:
        'Earlier you said "{{quote}}". Why that approach rather than just fixing it yourself?',
    },
  },
];

const claims = rawClaims
  .map((c) => ({ ...c, _priority: c.jdWeight * (1 - c.specificity) }))
  .sort((a, b) => b._priority - a._priority)
  .map(({ _priority, ...c }, i) => ({ ...c, rank: i + 1 }));

const plan = {
  interviewId: "golden-sample-001",
  roleTitle: "Backend Engineer (Node.js / PostgreSQL)",
  claims,
  rubric,
  maxQuestions: 8,
};

// ---------- Scripted conversation ----------
// Each exchange: the AI question (its claim + rung must equal what the rule selects),
// then the candidate answer with its scripted grade. Times are ms since start.

const script = [
  {
    claimId: "c2",
    rung: "initial",
    ai: plan.claims.find((c) => c.id === "c2").ladder.initial,
    answer:
      "We had an orders-by-customer lookup taking about two seconds. I ran EXPLAIN ANALYZE and saw a sequential scan on the orders table, around 30 million rows. I added a composite index on customer_id and created_at, which turned it into an index scan and brought it under 20 milliseconds. I also checked that the index didn't hurt our insert throughput much.",
    grade: 3,
    delayMs: 2400,
    answerMs: 21000,
  },
  {
    ai: "You mentioned the composite index on customer_id and created_at. Why that column order, and when would the opposite order be better?",
    answer:
      "Customer_id first because we always filter by customer and then sort by date, so the index can satisfy both the filter and the order. If we mostly queried by date range across all customers, created_at first would be better.",
    grade: 3,
    delayMs: 3100,
    answerMs: 15000,
  },
  {
    ai: plan.claims.find((c) => c.id === "c2").ladder.scenarioTwist,
    answer:
      "Um, I think maybe the SELECT star is the problem, it's fetching too many columns. I'd select only the columns we need.",
    grade: 1,
    delayMs: 6800,
    answerMs: 9000,
  },
  {
    ai: plan.claims.find((c) => c.id === "c2").ladder.fundamental,
    answer:
      "If you wrap the column in a function or a cast, the planner can't use a normal b-tree index on it. Oh, so the DATE() on created_at is actually the issue. I'd rewrite it as a range: created_at greater than or equal to the day and less than the next day.",
    grade: 2,
    delayMs: 4200,
    answerMs: 17000,
  },
  {
    ai: plan.claims.find((c) => c.id === "c1").ladder.initial,
    answer:
      "We cached the product catalog responses. We used caching to make it faster and Redis is really fast, it's an in-memory store, so latency went down a lot.",
    grade: 1,
    delayMs: 2900,
    answerMs: 10000,
  },
  {
    ai: plan.claims.find((c) => c.id === "c1").ladder.fundamental,
    answer:
      "There's TTL-based expiry, and you can invalidate on write. I'm honestly not sure which one we used, a teammate set up that part.",
    grade: 1,
    delayMs: 5600,
    answerMs: 9500,
  },
  {
    ai: plan.claims.find((c) => c.id === "c3").ladder.initial,
    answer:
      "We split out payments first because it had the clearest boundary. What broke was that we lost transactional guarantees between orders and payments, so we had orders marked paid without a payment record. We fixed it with an outbox table and an idempotent consumer.",
    grade: 3,
    delayMs: 3500,
    answerMs: 19000,
  },
  {
    ai: "You mentioned an idempotent consumer. How did you make it idempotent in practice?",
    answer:
      "Each payment event carries a unique event ID, and the consumer writes it into a processed-events table in the same transaction as the side effect, with a unique constraint, so a duplicate delivery just fails the insert and gets skipped.",
    grade: 3,
    delayMs: 2700,
    answerMs: 16000,
  },
];
const closingText =
  "That's all the time we have. Thank you for walking me through your work today.";
const aiSpeakMs = 7000;

const turns = [];
const decisions = [];
const gradesByTurn = {};
const areas = {};
const visited = new Set();
let clock = 0;
let totalAsked = 0;
let current = { reason: "OPENING_TOP_RANKED_CLAIM", claimId: plan.claims[0].id, toRung: "initial" };
let lastGrade = null;
let gradedTurnId = null;
let fromRung = null;

const tid = (n) => `t${String(n).padStart(2, "0")}`;

for (let i = 0; i <= script.length; i++) {
  const step = script[i];
  const isClosing = current.reason === "TIME_UP";
  if (
    !isClosing &&
    step &&
    step.claimId &&
    (step.claimId !== current.claimId || step.rung !== current.toRung)
  ) {
    throw new Error(`script step ${i} disagrees with rule: ${JSON.stringify(current)}`);
  }
  if (!isClosing && !step) {
    throw new Error("script ended before the rule reached TIME_UP");
  }

  visited.add(current.claimId);
  if (!areas[current.claimId]) {
    areas[current.claimId] = newArea(current.claimId);
  }
  const area = areas[current.claimId];
  if (!isClosing) {
    area.currentRung = current.toRung;
    if (
      RUNG_ORDER.includes(current.toRung) &&
      RUNG_ORDER.indexOf(current.toRung) > RUNG_ORDER.indexOf(area.ladderRung)
    ) {
      area.ladderRung = current.toRung;
    }
    if (current.toRung === "fundamental") {
      area.usedFundamental = true;
    }
    area.asked += 1;
    totalAsked += 1;
  }

  const aiId = tid(turns.length + 1);
  const aiText = isClosing ? closingText : step.ai;
  turns.push({
    id: aiId,
    speaker: "ai",
    text: aiText,
    startMs: clock,
    endMs: clock + aiSpeakMs,
    claimId: current.claimId,
    rung: current.toRung,
  });
  clock += aiSpeakMs;
  decisions.push({
    turnId: aiId,
    claimId: current.claimId,
    lastGrade,
    gradedTurnId,
    reason: current.reason,
    fromRung,
    toRung: current.toRung,
    areaState: structuredClone(area),
  });
  if (isClosing) {
    break;
  }

  const cId = tid(turns.length + 1);
  clock += step.delayMs;
  turns.push({
    id: cId,
    speaker: "candidate",
    text: step.answer,
    startMs: clock,
    endMs: clock + step.answerMs,
    claimId: current.claimId,
    rung: current.toRung,
  });
  clock += step.answerMs;

  area.grades.push(step.grade);
  gradesByTurn[cId] = step.grade;
  lastGrade = step.grade;
  gradedTurnId = cId;
  fromRung = current.toRung;
  current = selectNext(plan, area, step.grade, totalAsked, visited);
}

const expectedReasons = [
  "OPENING_TOP_RANKED_CLAIM",
  "STRONG_DEEPEN",
  "STRONG_DEEPEN",
  "WEAK_FUNDAMENTAL",
  "AREA_BUDGET_EXHAUSTED",
  "WEAK_FUNDAMENTAL",
  "REPEATED_WEAK_MOVE_ON",
  "STRONG_DEEPEN",
  "TIME_UP",
];
const gotReasons = decisions.map((d) => d.reason);
if (JSON.stringify(gotReasons) !== JSON.stringify(expectedReasons)) {
  throw new Error(`rule produced ${gotReasons.join(",")}`);
}

// Code-reasoning rung: the candidate typed nothing in the demo sample, so no typedAnswer.

// ---------- Integrity events (Pillar 4 capture) ----------

const turnById = Object.fromEntries(turns.map((t) => [t.id, t]));
const integrityEvents = [
  { kind: "tabBlur", atMs: turnById.t10.startMs + 3000, durationMs: 4000, turnId: "t10" },
  { kind: "tabFocus", atMs: turnById.t10.startMs + 7000, turnId: "t10" },
  { kind: "tabBlur", atMs: turnById.t12.startMs + 1500, durationMs: 9000, turnId: "t12" },
  { kind: "tabFocus", atMs: turnById.t12.startMs + 10500, turnId: "t12" },
  {
    kind: "lookAway",
    atMs: turnById.t13.startMs + 2000,
    durationMs: 13000,
    turnId: "t13",
    detail: "Gaze off-screen for 13s while the question was being read.",
  },
];

// ---------- Integrity fusion (Pillar 4) ----------
// HARD CONSTRAINT: the output is a concern level for human review. It is NEVER a
// binary cheating verdict and it never changes any evaluation score.

function countPoints(value, threshold) {
  if (value >= threshold) {
    return 2;
  }
  return value > 0 ? 1 : 0;
}

function fuseIntegrity(record, faceSignalsAvailable) {
  const ev = record.integrityEvents;
  const count = (k) => ev.filter((e) => e.kind === k).length;
  const delays = [];
  for (let i = 1; i < record.turns.length; i++) {
    const t = record.turns[i];
    if (t.speaker === "candidate") {
      delays.push(t.startMs - record.turns[i - 1].endMs);
    }
  }
  const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
  const sd = Math.sqrt(delays.reduce((a, b) => a + (b - mean) ** 2, 0) / delays.length);
  const cv = Math.round((sd / mean) * 100) / 100;

  const signals = [
    {
      name: "Tab or window switches",
      value: count("tabBlur"),
      unit: "count",
      threshold: 2,
      benignExplanations: [
        "A notification or another app took focus.",
        "Candidate checked the time or muted another tab.",
      ],
    },
    {
      name: "Paste events",
      value: count("paste"),
      unit: "count",
      threshold: 1,
      benignExplanations: [
        "Pasting a code fix drafted in the same session.",
        "Accidental keyboard shortcut.",
      ],
    },
    {
      name: "Looking away > 12s",
      value: count("lookAway"),
      unit: "count",
      threshold: 2,
      face: true,
      benignExplanations: [
        "Thinking while looking away is normal.",
        "Second monitor, or notes the candidate was allowed.",
      ],
    },
    {
      name: "Face not visible > 3s",
      value: count("faceMissing"),
      unit: "count",
      threshold: 2,
      face: true,
      benignExplanations: [
        "Poor lighting or the camera shifted.",
        "Candidate leaned out of frame.",
      ],
    },
    {
      name: "More than one face > 1.5s",
      value: count("multipleFaces"),
      unit: "count",
      threshold: 1,
      face: true,
      benignExplanations: [
        "Someone walked past in a shared space.",
        "A photo or poster behind the candidate.",
      ],
    },
  ].map(({ face, ...s }) => {
    const available = face ? faceSignalsAvailable : true;
    return { ...s, available, points: available ? countPoints(s.value, s.threshold) : 0 };
  });

  // Uniform response latency: a low coefficient of variation is unusual for spontaneous answers.
  signals.push({
    name: "Response-latency uniformity (coefficient of variation)",
    value: cv,
    unit: "cv",
    threshold: 0.15,
    available: delays.length >= 4,
    points: delays.length >= 4 && cv < 0.15 ? 2 : 0,
    benignExplanations: [
      "Some people answer at a steady pace.",
      "Short, similar questions invite similar pauses.",
    ],
  });

  const totalPoints = signals.reduce((a, s) => a + s.points, 0);
  const level = totalPoints >= 6 ? "High" : totalPoints >= 3 ? "Medium" : "Low";
  return {
    level,
    totalPoints,
    signals,
    disclaimer:
      "This is a concern level to prompt human review, not a cheating determination. Every signal has innocent explanations, and none of them affect the candidate's scores.",
  };
}

// ---------- Evaluation (Pillar 3) ----------

function cite(turnId, quote) {
  const text = turnById[turnId].text;
  const start = text.indexOf(quote);
  if (start < 0) {
    throw new Error(`quote not found in ${turnId}: ${quote}`);
  }
  return { turnId, start, end: start + quote.length, quote };
}

function strengthOf(grades) {
  if (grades.length < 2) {
    return "thin";
  }
  return Math.max(...grades) - Math.min(...grades) >= 2 ? "mixed" : "strong";
}

function ladderPath(claimId) {
  return turns
    .filter((t) => t.speaker === "ai" && t.claimId === claimId && t.text !== closingText)
    .map((t) => t.rung);
}

const perClaimDraft = [
  {
    claimId: "c2",
    score: 2,
    rationale:
      "Diagnosed a real slow query with EXPLAIN ANALYZE and justified the index column order unprompted (Deep). Missed the function-on-indexed-column issue in the code snippet and only found it after the fundamental question (Working).",
    citations: [
      cite("t02", "I ran EXPLAIN ANALYZE and saw a sequential scan on the orders table"),
      cite("t04", "Customer_id first because we always filter by customer and then sort by date"),
      cite("t06", "I think maybe the SELECT star is the problem"),
      cite("t08", "the DATE() on created_at is actually the issue"),
    ],
  },
  {
    claimId: "c1",
    score: 1,
    rationale:
      "Named Redis and in-memory storage but gave no mechanism for what was cached or how staleness was handled, and said a teammate owned invalidation. Evidence does not yet support the 40% latency claim as their own work.",
    citations: [
      cite("t10", "Redis is really fast, it's an in-memory store"),
      cite("t12", "I'm honestly not sure which one we used, a teammate set up that part"),
    ],
  },
  {
    claimId: "c3",
    score: 3,
    rationale:
      "Explained why payments was split first, the consistency failure it caused, and a correct outbox plus idempotent-consumer fix with a concrete unique-constraint mechanism.",
    citations: [
      cite("t14", "We fixed it with an outbox table and an idempotent consumer"),
      cite(
        "t16",
        "with a unique constraint, so a duplicate delivery just fails the insert and gets skipped",
      ),
    ],
  },
  // The evaluator also returned a score citing "load testing", which appears nowhere in the
  // transcript. The citation validator removed it; it is counted in removedUncited below.
];

const perClaim = perClaimDraft.map((p) => {
  const grades = areas[p.claimId].grades;
  const evidenceStrength = strengthOf(grades);
  return {
    ...p,
    evidenceStrength,
    needsHumanReview: evidenceStrength !== "strong",
    ladderPath: ladderPath(p.claimId),
  };
});

const evaluation = {
  perClaim,
  notes: [
    {
      kind: "dropOff",
      claimId: "c2",
      turnIds: ["t02", "t04", "t06"],
      text: "Two deep answers followed by a weak one on the code snippet. Worth a follow-up; not an integrity signal.",
    },
  ],
  removedUncited: 1,
  candidateFeedback: [
    {
      claimId: "c3",
      strength: "Clear, first-hand explanation of the outbox pattern and idempotency.",
      nextStep: "Prepare a story about how you monitored the new services after the split.",
      citation: cite(
        "t16",
        "with a unique constraint, so a duplicate delivery just fails the insert and gets skipped",
      ),
    },
    {
      claimId: "c1",
      strength: "You know the standard invalidation options.",
      nextStep:
        "Be ready to explain the caching decisions on your resume in your own words: what was cached, the TTL, and how writes invalidate it.",
      citation: cite("t12", "There's TTL-based expiry, and you can invalidate on write."),
    },
  ],
};

// ---------- Audit (Pillar 3, separate pass) ----------

const audit = {
  precomputed: true,
  checks: [
    {
      id: 1,
      title: "Leading or unfair questions",
      status: "pass",
      findings: [
        {
          text: "No question implied its answer. The fundamental question at t07 is general and did not name DATE() or the snippet.",
          turnIds: ["t07"],
        },
      ],
    },
    {
      id: 2,
      title: "Inconsistent scoring across similar-quality answers",
      status: "concern",
      findings: [
        {
          text: "t08 was graded Working (2) although the candidate found the issue only after the fundamental question. t12 also answered a fundamental question correctly but was graded Surface (1), because it added no first-hand detail. The difference is defensible but a reviewer should confirm it.",
          turnIds: ["t08", "t12"],
        },
      ],
    },
    {
      id: 3,
      title: "Unjustified bias toward phrasing or keywords",
      status: "pass",
      findings: [
        {
          text: "t10 has the highest keyword density (Redis, in-memory, caching) and was scored Surface (1), so keywords were not rewarded. The counterfactual rescoring below shows scores unchanged when jargon is replaced with plain wording.",
          turnIds: ["t10"],
        },
      ],
    },
  ],
  counterfactual: [
    { turnId: "t04", originalScore: 3, rephrasedScore: 3, placeboScore: 3 },
    { turnId: "t14", originalScore: 3, rephrasedScore: 3, placeboScore: 3 },
    { turnId: "t10", originalScore: 1, rephrasedScore: 1, placeboScore: 1 },
  ],
};

// ---------- Hash chain (stretch) ----------

function canonical(v) {
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(",")}]`;
  }
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function buildChain(entries) {
  let prevHash = "0".repeat(64);
  return entries.map(({ kind, refId, payload }, seq) => {
    const entryHash = createHash("sha256")
      .update(`v1|${prevHash}|${seq}|${kind}|${refId}|${canonical(payload)}`)
      .digest("hex");
    const e = { seq, kind, refId, prevHash, entryHash };
    prevHash = entryHash;
    return e;
  });
}

const record = {
  plan,
  candidateLabel: "Candidate A",
  startedAt: "2026-09-26T10:00:00.000Z",
  turns,
  decisions,
  integrityEvents,
};

record.chain = buildChain([
  ...turns.map((t) => ({ kind: "turn", refId: t.id, payload: t })),
  ...decisions.map((d) => ({ kind: "decision", refId: d.turnId, payload: d })),
  { kind: "evaluation", refId: plan.interviewId, payload: evaluation },
]);

const integrity = fuseIntegrity(record, true);
const report = { record, evaluation, audit, integrity };

// ---------- Self-checks ----------

for (const c of [
  ...perClaim.flatMap((p) => p.citations),
  ...evaluation.candidateFeedback.map((f) => f.citation),
]) {
  if (turnById[c.turnId].text.slice(c.start, c.end) !== c.quote) {
    throw new Error(`bad offsets ${c.turnId}`);
  }
  if (turnById[c.turnId].speaker !== "candidate") {
    throw new Error(`citation must point at a candidate turn: ${c.turnId}`);
  }
}
if (perClaim.some((p) => p.citations.length === 0)) {
  throw new Error("uncited score");
}
// No verdict-shaped output: no cheat*/verdict keys, and no yes/no field besides per-signal availability.
JSON.stringify(integrity, (k, v) => {
  if (/cheat|verdict|guilty/i.test(k)) {
    throw new Error(`integrity output has verdict-like key: ${k}`);
  }
  if (typeof v === "boolean" && k !== "available") {
    throw new Error(`integrity output has boolean field: ${k}`);
  }
  return v;
});
if (!["Low", "Medium", "High"].includes(integrity.level)) {
  throw new Error("integrity level must be a band");
}

// ---------- Write ----------

const json = JSON.stringify(report, null, 2);
mkdirSync(join(root, "fixtures"), { recursive: true });
mkdirSync(join(root, "src", "fixtures"), { recursive: true });
writeFileSync(join(root, "fixtures", "golden-interview.json"), `${json}\n`);
writeFileSync(
  join(root, "src", "fixtures", "golden-interview.ts"),
  `// GENERATED by scripts/build-golden-fixture.mjs. Do not edit by hand.\n// Server-only sample. Browser consumers use client-golden-interview.ts.\nimport "server-only";\nimport type { InterviewReport } from "@/types/pipeline";\n\nexport const goldenReport: InterviewReport = ${json};\n`,
);

console.log(`turns=${turns.length} decisions=${decisions.length} chain=${record.chain.length}`);
console.log(`reasons: ${gotReasons.join(" > ")}`);
console.log(`integrity: ${integrity.level} (${integrity.totalPoints} pts)`);
