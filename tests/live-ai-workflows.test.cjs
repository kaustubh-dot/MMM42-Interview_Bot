const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(id, ...args) {
  return resolve.call(
    this,
    id.startsWith("@/") ? path.join(__dirname, "../src", id.slice(2)) : id,
    ...args,
  );
};
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
    }).outputText,
    filename,
  );

test("sample-resume interviews start in live mode and grade answers with AI", async () => {
  const previous = {
    mode: process.env.LLM_MODE,
    key: process.env.GROQ_API_KEY,
    fetch: global.fetch,
  };
  process.env.LLM_MODE = "groq";
  process.env.GROQ_API_KEY = "test-key";
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ grade: 3, term: "index", quote: "I used an index" }),
          },
        },
      ],
    });
  };
  try {
    const { startAttempt, submitCandidateTurn } = require("../src/lib/pipeline/turn-service.ts");
    const start = await startAttempt({
      interviewId: "mock-live-regression",
      requestId: "start-live",
    });
    const next = await submitCandidateTurn({
      interviewId: "mock-live-regression",
      requestId: "answer-live",
      expectedTurnId: start.nextQuestion.id,
      text: "I used an index",
      startMs: 0,
      endMs: 1000,
      integrityEvents: [],
      faceSignals: { available: false },
    });
    assert.equal(calls, 1, "Must call the provider instead of the demo grader");
    assert.equal(next.decision.lastGrade, 3);
    assert.equal(next.decision.reason, "STRONG_DEEPEN");
    await assert.rejects(startAttempt({ interviewId: "unknown-live", requestId: "unknown" }), {
      code: "UNKNOWN_ATTEMPT",
    });
  } finally {
    global.fetch = previous.fetch;
    if (previous.mode === undefined) {
      // biome-ignore lint/performance/noDelete: process.env assignments stringify undefined.
      delete process.env.LLM_MODE;
    } else {
      process.env.LLM_MODE = previous.mode;
    }
    if (previous.key === undefined) {
      // biome-ignore lint/performance/noDelete: process.env assignments stringify undefined.
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = previous.key;
    }
  }
});
