// B-owned focused checks. Run from the repository root:
// node --conditions=react-server --test src/lib/prompts/pipeline/evaluation-integrity.test.cjs
// The alias/TS hooks apply only in this test process; the normal server-only guard remains active.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "../../../..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveTestAlias(id, ...args) {
  return resolve.call(
    this,
    id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : id,
    ...args,
  );
};
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { goldenReport: golden } = require("@/fixtures/golden-interview");
const {
  evidenceStrengthOf,
  gradedAnswers,
  validateCitation,
  validateEvaluation,
} = require("@/lib/pipeline/citations");
const { fuseIntegrity, responseLatencies } = require("@/lib/pipeline/integrity");
const { buildBlindGradeInput, gradeAnswer, validateGradeResult } = require("@/lib/pipeline/grade");
const {
  buildBlindEvaluationInput,
  evaluateRecord,
  goldenEvaluationMock,
  validateBlindEvaluation,
} = require("@/lib/pipeline/evaluate");
const { auditEvaluation, buildBlindAuditInput, validateAudit } = require("@/lib/pipeline/audit");
const { redactIdentityText } = require("./blind");
const { AUDIT_SYSTEM_PROMPT } = require("./audit");

const clone = (value) => structuredClone(value);
const valid = golden.evaluation.perClaim[0].citations[0];
const draft = (citation = valid, claimId = "c2") => ({
  perClaim: [{ ...golden.evaluation.perClaim[0], claimId, citations: citation ? [citation] : [] }],
});

function mode(t, value) {
  const oldMode = process.env.LLM_MODE;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.LLM_MODE = value;
  if (value === "gemini") {
    process.env.GEMINI_API_KEY = "test-only-key";
  } else {
    Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
  }
  t.after(() => {
    for (const [key, previous] of [
      ["LLM_MODE", oldMode],
      ["GEMINI_API_KEY", oldKey],
    ]) {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = previous;
      }
    }
  });
}

function provider(t, reply, inspect = () => {}) {
  mode(t, "gemini");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    inspect(JSON.parse(body.contents[0].parts[0].text), body.systemInstruction.parts[0].text);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { role: "model", parts: [{ text: JSON.stringify(reply) }] },
            finishReason: "STOP",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  return () => calls;
}

function delaysRecord(delays) {
  const record = clone(golden.record);
  record.integrityEvents = [];
  record.turns = delays.flatMap((delay, index) => {
    const endMs = index * 10000 + 1000;
    return [
      {
        id: `q${index}`,
        speaker: "ai",
        text: "Question",
        claimId: "c2",
        rung: "initial",
        startMs: endMs - 1000,
        endMs,
      },
      {
        id: `a${index}`,
        speaker: "candidate",
        text: "Spoken answer",
        claimId: "c2",
        rung: "initial",
        startMs: endMs + delay,
        endMs: endMs + delay + 1000,
      },
    ];
  });
  return record;
}

test("exact candidate citations reject wrong speakers, quotes and offsets", async (t) => {
  assert.deepEqual(validateCitation(golden.record, valid, "c2"), valid);
  for (const [name, change] of [
    ["wrong quote", { quote: "load testing" }],
    ["AI turn", { turnId: "t01" }],
    ["unknown turn", { turnId: "missing" }],
    ["negative start", { start: -1 }],
    ["fractional offset", { start: 0.5 }],
    ["past end", { end: 999999 }],
    ["empty span", { end: valid.start }],
    ["non-finite end", { end: Number.POSITIVE_INFINITY }],
    ["string offset", { start: String(valid.start) }],
    ["empty quote", { quote: "" }],
  ]) {
    await t.test(name, () =>
      assert.equal(validateCitation(golden.record, { ...valid, ...change }, "c2"), null),
    );
  }
  assert.equal(validateCitation(golden.record, valid, "c1"), null);
});

test("empty, unknown, unassessed, duplicate and artifact-only scores are removed", () => {
  assert.deepEqual(validateEvaluation(golden.record, { ...draft(null), removedUncited: 999 }), {
    perClaim: [],
    notes: [],
    removedUncited: 1,
  });
  for (const claimId of ["missing", "c4"]) {
    assert.equal(validateEvaluation(golden.record, draft(valid, claimId)).removedUncited, 1);
  }
  assert.equal(
    validateEvaluation(golden.record, { perClaim: [...draft().perClaim, ...draft().perClaim] })
      .removedUncited,
    1,
  );
  const record = clone(golden.record);
  const turn = record.turns.find((item) => item.id === "t02");
  turn.typedAnswer = "load testing";
  turn.artifacts = [{ kind: "code", language: "sql", code: "load testing" }];
  assert.equal(
    validateEvaluation(record, draft({ turnId: "t02", start: 0, end: 12, quote: "load testing" }))
      .removedUncited,
    1,
  );
  turn.artifacts = [{ kind: "whiteboard", sceneJson: '{"text":"load testing"}' }];
  assert.equal(
    validateEvaluation(record, draft({ turnId: "t02", start: 0, end: 12, quote: "load testing" }))
      .removedUncited,
    1,
  );
});

test("a supported score keeps only exact citations and ignores model-derived flags", () => {
  const result = validateEvaluation(golden.record, {
    perClaim: [
      {
        ...draft().perClaim[0],
        evidenceStrength: "strong",
        needsHumanReview: false,
        ladderPath: ["whyDefense"],
        citations: [{ ...valid, quote: "wrong" }, valid, valid],
      },
    ],
  });
  assert.deepEqual(result.perClaim[0].citations, [valid]);
  assert.equal(result.perClaim[0].evidenceStrength, "mixed");
  assert.equal(result.perClaim[0].needsHumanReview, true);
  assert.deepEqual(result.perClaim[0].ladderPath, [
    "initial",
    "termFollowUp",
    "scenarioTwist",
    "fundamental",
  ]);
  const record = clone(golden.record);
  record.turns.push(clone(record.turns.find((item) => item.id === valid.turnId)));
  assert.equal(validateCitation(record, valid), null);
});

test("evidence strength uses unique recorded grades and follows weak/thin boundaries", () => {
  assert.equal(evidenceStrengthOf([3, 1]), "mixed");
  assert.equal(evidenceStrengthOf([1, 1]), "strong");
  assert.equal(evidenceStrengthOf([3]), "thin");
  assert.equal(evidenceStrengthOf([]), "thin");
  const record = clone(golden.record);
  record.decisions = record.decisions.filter(
    (item) => !["t04", "t06", "t08"].includes(item.gradedTurnId),
  );
  const thin = validateEvaluation(record, draft()).perClaim[0];
  assert.equal(thin.evidenceStrength, "thin");
  assert.equal(thin.needsHumanReview, true);
  record.decisions.push({
    ...record.decisions.find((item) => item.gradedTurnId === "t02"),
    lastGrade: 0,
  });
  assert(!gradedAnswers(record).has("t02"));
});

test("blind input removes identities and artifacts while preserving transcript offsets", () => {
  const record = clone(golden.record);
  const turn = record.turns.find((item) => item.id === "t02");
  turn.text =
    "My name is Ayush Patel. I studied at Stanford University. I worked at Acme Corp. At Acme Corp I implemented Redis caching with invalidation on write.";
  turn.typedAnswer = "PRIVATE_CODE";
  turn.artifacts = [{ kind: "whiteboard", sceneJson: "PRIVATE_DRAWING" }];
  record.privateIdentity = "PRIVATE_NAME";
  const before = JSON.stringify(record);
  const input = buildBlindEvaluationInput(record);
  const text = input.turns.find((item) => item.id === "t02").text;
  for (const identity of ["Ayush Patel", "Stanford University", "Acme Corp"]) {
    assert(!text.includes(identity));
  }
  assert.equal(text.length, turn.text.length);
  const serialized = JSON.stringify(input);
  for (const excluded of [
    "PRIVATE_CODE",
    "PRIVATE_DRAWING",
    "PRIVATE_NAME",
    "plantedIssue",
    "integrityEvents",
    "startMs",
    "candidateLabel",
    "resumeEvidence",
  ]) {
    assert(!serialized.includes(excluded));
  }
  assert.deepEqual(input.rubric, record.plan.rubric);
  const quote = "Redis caching with invalidation on write.";
  const start = turn.text.indexOf(quote);
  assert.equal(text.slice(start, start + quote.length), quote);
  const result = validateBlindEvaluation(
    record,
    draft({ turnId: "t02", start, end: start + quote.length, quote }),
  );
  assert.equal(result.perClaim[0].citations[0].start, start);
  const identityStart = turn.text.indexOf("Ayush Patel");
  for (const hidden of ["Ayush Patel", "█".repeat("Ayush Patel".length)]) {
    assert.equal(
      validateBlindEvaluation(
        record,
        draft({
          turnId: "t02",
          start: identityStart,
          end: identityStart + hidden.length,
          quote: hidden,
        }),
      ).removedUncited,
      1,
    );
  }
  assert.equal(JSON.stringify(record), before);
});

test("explicit identity masking preserves UTF-16 units, punctuation and unrelated words", () => {
  const text = "Ann\r\nMüller & Sons (R&D) 🐻. Annual work used Redis.";
  const redacted = redactIdentityText(text, ["Ann", "Müller & Sons (R&D)", "🐻"]);
  assert.equal(text.length, redacted.length);
  assert(redacted.endsWith("Annual work used Redis."));
  assert(redacted.includes("\r\n"));
  assert(!redacted.includes("🐻"));
});

test("all model services in mock mode reproduce the golden report without network", async (t) => {
  mode(t, "mock");
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network request");
  });
  const grades = gradedAnswers(golden.record);
  for (let i = 1; i < golden.record.turns.length; i += 1) {
    const turn = golden.record.turns[i];
    if (turn.speaker !== "candidate") {
      continue;
    }
    const result = await gradeAnswer({
      rubric: golden.record.plan.rubric,
      claimId: turn.claimId,
      questionText: golden.record.turns[i - 1].text,
      answerText: turn.text,
    });
    assert.equal(result.grade, grades.get(turn.id));
    assert(result.term === null || turn.text.includes(result.term));
    assert(result.quote === null || turn.text.includes(result.quote));
  }
  const evaluation = await evaluateRecord(golden.record);
  assert.deepEqual(evaluation, golden.evaluation);
  assert.equal(evaluation.removedUncited, 1);
  assert.deepEqual(await auditEvaluation(golden.record, evaluation), golden.audit);
  assert.deepEqual(fuseIntegrity(golden.record, { available: true }), golden.integrity);
  const newAttempt = clone(golden.record);
  newAttempt.plan.interviewId = "fresh-sample-attempt";
  assert.deepEqual(await evaluateRecord(newAttempt), golden.evaluation);
  assert.deepEqual(await auditEvaluation(newAttempt, evaluation), golden.audit);
  evaluation.perClaim[0].score = 0;
  assert.equal((await evaluateRecord(golden.record)).perClaim[0].score, 2);
  const changed = clone(golden.record);
  changed.turns[1].text += " Different spoken evidence.";
  // Changed demo attempts get a labelled demo evaluation (validated citations) and an audit that
  // says it was not run: never the golden output, never a faked pass.
  const demo = await evaluateRecord(changed);
  assert.notDeepEqual(demo, golden.evaluation);
  assert(demo.perClaim.length > 0);
  for (const claim of demo.perClaim) {
    assert.match(claim.rationale, /^Demo grader, not an AI assessment:/);
    assert(claim.citations.length > 0);
    for (const c of claim.citations) {
      assert.equal(
        changed.turns.find((t) => t.id === c.turnId).text.slice(c.start, c.end),
        c.quote,
      );
    }
  }
  const demoAudit = await auditEvaluation(golden.record, evaluation);
  assert.equal(demoAudit.precomputed, false);
  assert.equal(demoAudit.checks.length, 3);
  assert(demoAudit.checks.every((check) => check.status === "concern"));
  assert(demoAudit.checks.every((check) => /^Not checked: demo mode/.test(check.findings[0].text)));
});

test("grader validates unknown grades and optional candidate words; input is allowlisted", async (t) => {
  for (const grade of [-1, 4, 1.5, "2", Number.NaN]) {
    assert.throws(() => validateGradeResult("I used Redis", { grade }), /invalid grade/);
  }
  assert.deepEqual(
    validateGradeResult("I used Redis", { grade: 2, term: "invented", quote: "other" }),
    { grade: 2, term: null, quote: null },
  );
  const input = {
    rubric: golden.record.plan.rubric,
    claimId: "c2",
    questionText: "How did it work?",
    answerText: "My name is Ayush Patel. I used Redis.",
    artifacts: "PRIVATE_CODE",
    integrityEvents: "PRIVATE_EVENTS",
  };
  const blind = buildBlindGradeInput(input);
  assert(!blind.answerText.includes("Ayush Patel"));
  assert(!JSON.stringify(blind).includes("PRIVATE_"));
  assert.throws(
    () => buildBlindGradeInput({ ...input, rubric: input.rubric.slice(1) }),
    /four shared/,
  );
  const calls = provider(t, { grade: 4 }, (value) => assert.deepEqual(value.rubric, input.rubric));
  await assert.rejects(gradeAnswer(input), { code: "LLM_INVALID_RESPONSE" });
  assert.equal(calls(), 1);
});

test("live evaluator validates output, removes unsupported scores and derives review flags", async (t) => {
  const record = clone(golden.record);
  record.plan.interviewId = "live-attempt";
  const calls = provider(t, goldenEvaluationMock, (input) => {
    assert.deepEqual(input.rubric, record.plan.rubric);
    assert(!JSON.stringify(input).includes("integrityEvents"));
    assert(!JSON.stringify(input).includes("plantedIssue"));
  });
  assert.deepEqual(await evaluateRecord(record), golden.evaluation);
  assert.equal(calls(), 1);
});

test("invalid evaluator shape is rejected as an upstream model response", async (t) => {
  const calls = provider(t, { perClaim: "invalid" });
  await assert.rejects(evaluateRecord(golden.record), { code: "LLM_INVALID_RESPONSE" });
  assert.equal(calls(), 1);
});

test("one live audit pass has three checks, strips invented counterfactuals and never changes scores", async (t) => {
  const before = JSON.stringify(golden.evaluation);
  const liveReply = clone(golden.audit);
  liveReply.checks[2].findings[0].text =
    "t10 names tools but its grade remains Surface, so keywords were not rewarded.";
  const calls = provider(
    t,
    { ...liveReply, precomputed: true, counterfactual: [{ invented: true }] },
    (_input, system) => assert.equal(system, AUDIT_SYSTEM_PROMPT),
  );
  const audit = await auditEvaluation(golden.record, golden.evaluation);
  assert.equal(calls(), 1);
  assert.equal(audit.precomputed, false);
  assert(!("counterfactual" in audit));
  assert.deepEqual(
    audit.checks.map((item) => item.id),
    [1, 2, 3],
  );
  assert.equal(JSON.stringify(golden.evaluation), before);
  const input = buildBlindAuditInput(golden.record, golden.evaluation);
  assert(!JSON.stringify(input).includes("integrityEvents"));
  assert(!JSON.stringify(input).includes("artifacts"));
});

test("live audit prose cannot invent a counterfactual experiment", async (t) => {
  const calls = provider(t, golden.audit);
  await assert.rejects(auditEvaluation(golden.record, golden.evaluation), {
    code: "LLM_INVALID_RESPONSE",
  });
  assert.equal(calls(), 1);
});

test("silence grades No evidence without a model call or artifact inference", async (t) => {
  mode(t, "mock");
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network request");
  });
  const input = {
    rubric: golden.record.plan.rubric,
    claimId: "c2",
    questionText: "Explain your code.",
    answerText: "   ",
    artifacts: [{ kind: "code", code: "correct-looking code" }],
  };
  assert.deepEqual(await gradeAnswer(input), { grade: 0, term: null, quote: null });
  assert.deepEqual(validateGradeResult("", { grade: 3 }), { grade: 0, term: null, quote: null });
});

test("live grader keeps only spoken candidate terms and quotations", async (t) => {
  const input = {
    rubric: golden.record.plan.rubric,
    claimId: "c2",
    questionText: "Explain the mechanism.",
    answerText: "I invalidate Redis on writes.",
    integrityEvents: "PRIVATE_EVENTS",
    artifacts: "PRIVATE_CODE",
  };
  const calls = provider(t, { grade: 2, term: "Redis", quote: input.answerText }, (value) => {
    assert.deepEqual(value.rubric, input.rubric);
    assert(!JSON.stringify(value).includes("PRIVATE_"));
  });
  assert.deepEqual(await gradeAnswer(input), { grade: 2, term: "Redis", quote: input.answerText });
  assert.equal(calls(), 1);
});

test("audit rejects missing/duplicate checks and nonexistent transcript references", () => {
  assert.throws(() => validateAudit(golden.record, { checks: [] }), /three fixed/);
  const duplicate = clone(golden.audit);
  duplicate.checks[2].id = 1;
  assert.throws(() => validateAudit(golden.record, duplicate), /duplicate/);
  const unknown = clone(golden.audit);
  unknown.checks[0].findings[0].turnIds = ["unknown"];
  assert.throws(() => validateAudit(golden.record, unknown), /existing transcript/);
});

test("failed audit validation makes only one model call", async (t) => {
  const calls = provider(t, { checks: [] });
  await assert.rejects(auditEvaluation(golden.record, golden.evaluation), {
    code: "LLM_INVALID_RESPONSE",
  });
  assert.equal(calls(), 1);
});

test("integrity bands match 0–2/3–5/6+ boundaries", async (t) => {
  for (const [points, events, level] of [
    [0, [], "Low"],
    [1, ["tabBlur"], "Low"],
    [2, ["tabBlur", "tabBlur"], "Low"],
    [3, ["tabBlur", "tabBlur", "lookAway"], "Medium"],
    [5, ["tabBlur", "tabBlur", "paste", "lookAway"], "Medium"],
    [6, ["tabBlur", "tabBlur", "paste", "lookAway", "lookAway"], "High"],
  ]) {
    await t.test(`${points} points`, () => {
      const record = clone(golden.record);
      record.integrityEvents = events.map((kind, atMs) => ({ kind, atMs }));
      const report = fuseIntegrity(record, { available: true });
      assert.equal(report.totalPoints, points);
      assert.equal(report.level, level);
    });
  }
});

test("unavailable face signals score zero and duration boundaries are strict", () => {
  const report = fuseIntegrity(golden.record, { available: false });
  assert.equal(report.totalPoints, 2);
  assert(report.signals.slice(2, 5).every((item) => !item.available && item.points === 0));
  const record = clone(golden.record);
  record.integrityEvents.push({ kind: "faceSignalsUnavailable", atMs: 1 });
  assert.equal(fuseIntegrity(record, { available: true }).totalPoints, 2);
  record.integrityEvents = [
    { kind: "lookAway", atMs: 0, durationMs: 12000 },
    { kind: "faceMissing", atMs: 0, durationMs: 3000 },
    { kind: "multipleFaces", atMs: 0, durationMs: 1500 },
  ];
  assert.equal(fuseIntegrity(record, { available: true }).totalPoints, 0);
  for (const event of record.integrityEvents) {
    event.durationMs += 1;
  }
  assert.equal(fuseIntegrity(record, { available: true }).totalPoints, 4);
});

test("latency needs four usable first-word times and compares full-precision CV", () => {
  for (const delays of [
    [],
    [1000, 1000, 1000],
    [0, 0, 0, 0],
    [Number.NaN, -1, Number.POSITIVE_INFINITY, 1000],
  ]) {
    const signal = fuseIntegrity(delaysRecord(delays), { available: false }).signals.at(-1);
    assert.equal(signal.available, false);
    assert.equal(signal.points, 0);
    assert(Number.isFinite(signal.value));
  }
  const uniform = delaysRecord([1000, 1000, 1000, 1000]);
  assert.deepEqual(responseLatencies(uniform), [1000, 1000, 1000, 1000]);
  assert.equal(fuseIntegrity(uniform, { available: false }).signals.at(-1).points, 2);
  assert.equal(
    fuseIntegrity(delaysRecord([850, 1150, 850, 1150]), { available: false }).signals.at(-1).points,
    0,
  );
  const near = fuseIntegrity(delaysRecord([851, 1149, 851, 1149]), { available: false }).signals.at(
    -1,
  );
  assert.equal(near.value, 0.15);
  assert.equal(near.points, 2);
  uniform.turns[1].text = "";
  assert.equal(fuseIntegrity(uniform, { available: false }).signals.at(-1).available, false);
});

test("changing integrity events or artifacts leaves scores unchanged and has no verdict keys", async (t) => {
  mode(t, "mock");
  const before = JSON.stringify(golden);
  const record = clone(golden.record);
  record.integrityEvents = [{ kind: "paste", atMs: 0 }];
  record.turns[1].artifacts = [
    { kind: "code", language: "sql", code: "a brilliant fix that was not spoken" },
  ];
  assert.deepEqual(await evaluateRecord(record), golden.evaluation);
  assert.deepEqual(await auditEvaluation(record, golden.evaluation), golden.audit);
  JSON.stringify(fuseIntegrity(record, { available: true }), (key, value) => {
    assert(!/cheat|verdict|guilty/i.test(key));
    assert(typeof value !== "boolean" || key === "available");
    return value;
  });
  assert.equal(JSON.stringify(golden), before);
});
