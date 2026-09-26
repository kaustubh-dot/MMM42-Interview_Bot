// Opt-in provider smoke test: node --conditions=react-server scripts/live-smoke.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const { parseEnv } = require("node:util");
Object.assign(process.env, parseEnv(fs.readFileSync(".env.local", "utf8")));
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
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
async function main() {
  const { getHelp } = require("../src/lib/practice/service.ts");
  const { CODING, SQL, DESIGN } = require("../src/lib/practice/data.ts");
  for (const [track, itemId] of [
    ["coding", CODING.problems[0].id],
    ["sql", SQL.exercises[0].id],
    ["design", DESIGN.questions[0].id],
  ]) {
    const reply = await getHelp({
      track,
      itemId,
      kind: "hint",
      hintLevel: 1,
      answer: "",
      language: "python",
    });
    assert.equal(reply.source, "ai", `${track} must return an actual AI response`);
    assert.ok(reply.sections.length);
    console.log(`${track}: live AI response validated`);
  }
  const { startAttempt, submitCandidateTurn } = require("../src/lib/pipeline/turn-service.ts");
  const { generateReport } = require("../src/lib/pipeline/report.ts");
  const { MockSessionStore } = require("../src/lib/pipeline/mock-session-store.ts");
  const store = new MockSessionStore();
  const interviewId = `mock-smoke-${Date.now()}`;
  let reply = await startAttempt({ interviewId, requestId: "start" }, store);
  let i = 0;
  while (!reply.finished && i < 8) {
    i++;
    reply = await submitCandidateTurn(
      {
        interviewId,
        requestId: `answer-${i}`,
        expectedTurnId: reply.nextQuestion.id,
        text: "I do not know how this works yet.",
        startMs: i * 1000,
        endMs: i * 1000 + 500,
        integrityEvents: [],
        faceSignals: { available: false },
      },
      store,
    );
  }
  assert.ok(reply.finished);
  console.log(`interview: ${i} live AI graded answers, completion validated`);
  const { report } = await generateReport({ interviewId }, store);
  assert.ok(report.evaluation && report.audit && report.integrity);
  console.log("report: live evaluation, audit and integrity validated");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
