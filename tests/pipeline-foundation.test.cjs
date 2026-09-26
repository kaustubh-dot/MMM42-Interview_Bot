const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const golden = require("../fixtures/golden-interview.json");

test("private fixture and LLM adapter reject imports without the server condition", () => {
  for (const module of ["lib/llm.js", "fixtures/golden-interview.js"]) {
    const child = spawnSync(process.execPath, ["-e", `require('./.foundation-build/${module}')`], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /cannot be imported from a Client Component/);
  }
});

// Returning raw records would expose the answer key and future server metadata.
test("client projections remove hidden answers and unexpected metadata without changing citations", () => {
  const {
    toClientPlan,
    toClientRecord,
    toClientReport,
  } = require("../.foundation-build/lib/pipeline/client-projection.js");
  const input = structuredClone(golden);
  input.internalToken = "private metadata";
  input.record.privateNote = "private metadata";
  input.record.plan.claims[0].privateNote = "private metadata";
  input.record.turns[0].privateNote = "private metadata";
  input.evaluation.perClaim[0].citations[0].privateNote = "private metadata";
  input.audit.checks[0].privateNote = "private metadata";
  const report = toClientReport(input);
  for (const output of [toClientPlan(input.record.plan), toClientRecord(input.record), report]) {
    const json = JSON.stringify(output);
    assert.ok(!json.includes("plantedIssue"));
    assert.ok(!json.includes("private metadata"));
    for (const claim of input.record.plan.claims) {
      if (claim.ladder.codeSnippet) {
        assert.ok(!json.includes(claim.ladder.codeSnippet.plantedIssue));
      }
    }
  }
  for (const claim of report.evaluation.perClaim) {
    for (const citation of claim.citations) {
      const turn = report.record.turns.find((item) => item.id === citation.turnId);
      assert.equal(turn.speaker, "candidate");
      assert.equal(turn.text.slice(citation.start, citation.end), citation.quote);
    }
  }
  assert.deepEqual(report.record.decisions, golden.record.decisions);
  assert.deepEqual(report.integrity, golden.integrity);
  report.record.plan.claims[0].claimText = "changed client copy";
  assert.notEqual(input.record.plan.claims[0].claimText, "changed client copy");
});

test("workspace fixture retains code and a drawable scene through the safe projection", () => {
  const { workspaceExamples } = require("../.foundation-build/fixtures/workspace-interview.js");
  const { toClientRecord } = require("../.foundation-build/lib/pipeline/client-projection.js");
  assert.equal(workspaceExamples.length, 2);
  for (const example of workspaceExamples) {
    const output = toClientRecord(example.record);
    const answer = output.turns.find((turn) => turn.speaker === "candidate");
    assert.equal(answer.artifacts.length, 1);
    const artifact = answer.artifacts[0];
    assert.equal(artifact.kind, example.kind);
    if (artifact.kind === "code") {
      assert.equal(artifact.language, "sql");
      assert.equal(answer.typedAnswer, artifact.code);
    } else {
      const scene = JSON.parse(artifact.sceneJson);
      assert.ok(scene.elements.some((element) => element.type === "rectangle"));
      assert.ok(scene.elements.some((element) => element.type === "text"));
      assert.equal(scene.files, undefined);
    }
  }
});

test("generated browser fixture preserves the golden report without importing server data", () => {
  const {
    clientGoldenReport,
  } = require("../.foundation-build/fixtures/client-golden-interview.js");
  const { toClientReport } = require("../.foundation-build/lib/pipeline/client-projection.js");
  assert.deepEqual(clientGoldenReport, toClientReport(golden));
  const source = readFileSync("src/fixtures/client-golden-interview.ts", "utf8");
  assert.ok(!source.includes("plantedIssue"));
  assert.ok(!source.includes('from "./golden-interview"'));
});

const request = {
  task: "grade",
  system: "Return a grade as JSON.",
  input: { answerText: "A candidate explanation" },
  mockOutput: { grade: 2, term: null, quote: null },
};

test("mock mode returns isolated fixture values without credentials or network", async (t) => {
  const { generateJson } = require("../.foundation-build/lib/llm.js");
  const oldMode = process.env.LLM_MODE;
  const oldKey = process.env.GEMINI_API_KEY;
  t.after(() => restoreEnv(oldMode, oldKey));
  process.env.LLM_MODE = "mock";
  Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected network request");
  });
  const result = await generateJson(request);
  assert.deepEqual(result, request.mockOutput);
  result.grade = 0;
  assert.equal((await generateJson(request)).grade, 2);
});

test("missing/invalid modes and missing live credentials fail instead of returning a mock", async (t) => {
  const { generateJson } = require("../.foundation-build/lib/llm.js");
  const oldMode = process.env.LLM_MODE;
  const oldKey = process.env.GEMINI_API_KEY;
  t.after(() => restoreEnv(oldMode, oldKey));
  Reflect.deleteProperty(process.env, "LLM_MODE");
  await assert.rejects(generateJson(request), { code: "LLM_CONFIGURATION" });
  process.env.LLM_MODE = "typo";
  await assert.rejects(generateJson(request), { code: "LLM_CONFIGURATION" });
  process.env.LLM_MODE = "gemini";
  Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
  await assert.rejects(generateJson(request), { code: "LLM_CONFIGURATION" });
  const oldGroqKey = process.env.GROQ_API_KEY;
  t.after(() => {
    if (oldGroqKey === undefined) {
      Reflect.deleteProperty(process.env, "GROQ_API_KEY");
    } else {
      process.env.GROQ_API_KEY = oldGroqKey;
    }
  });
  process.env.LLM_MODE = "groq";
  Reflect.deleteProperty(process.env, "GROQ_API_KEY");
  await assert.rejects(generateJson(request), { code: "LLM_CONFIGURATION" });
});

test("Gemini adapter uses JSON mode and handles malformed, empty, and failed provider replies", async (t) => {
  const { generateJson } = require("../.foundation-build/lib/llm.js");
  const oldMode = process.env.LLM_MODE;
  const oldKey = process.env.GEMINI_API_KEY;
  t.after(() => restoreEnv(oldMode, oldKey));
  process.env.LLM_MODE = "gemini";
  process.env.GEMINI_API_KEY = "test-only-key";
  let replyText = '{"grade":3,"term":null,"quote":null}';
  let fail = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.match(String(url), /gemini-2\.5-flash/);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.systemInstruction.parts[0].text, request.system);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), request.input);
    if (fail) {
      throw new Error("provider error with test-only-key");
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: replyText }],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  assert.deepEqual(await generateJson(request), { grade: 3, term: null, quote: null });
  replyText = "not JSON";
  await assert.rejects(generateJson(request), { code: "LLM_INVALID_RESPONSE" });
  replyText = "";
  await assert.rejects(generateJson(request), { code: "LLM_INVALID_RESPONSE" });
  fail = true;
  await assert.rejects(generateJson(request), (error) => {
    assert.equal(error.code, "LLM_UPSTREAM");
    assert.ok(!error.message.includes("test-only-key"));
    return true;
  });
  assert.equal(calls, 4);
});

function restoreEnv(mode, key) {
  if (mode === undefined) {
    Reflect.deleteProperty(process.env, "LLM_MODE");
  } else {
    process.env.LLM_MODE = mode;
  }
  if (key === undefined) {
    Reflect.deleteProperty(process.env, "GEMINI_API_KEY");
  } else {
    process.env.GEMINI_API_KEY = key;
  }
}
