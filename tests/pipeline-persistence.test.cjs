// D1: durable session/report store on the `response` table, exercised through the real pipeline
// services against an in-process fake of the Supabase query builder (JSON round-trips included).
// Run: npm run test:persistence
const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const path = require("node:path");
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveCompiledAlias(id, ...args) {
  return resolve.call(
    this,
    id.startsWith("@/") ? path.join(__dirname, "../.foundation-build", id.slice(2)) : id,
    ...args,
  );
};
const build = (p) => require(path.join(__dirname, "../.foundation-build/lib/pipeline", p));
const { SupabaseSessionStore } = build("supabase-session-store.js");
const { startAttempt, submitCandidateTurn, readSession } = build("turn-service.js");
const { generateReport, readReport } = build("report.js");
const { planIdentities } = build("scoring-context.js");

/** Minimal PostgREST-style fake: select/insert/update/delete with eq/is/order/limit. */
function fakeSupabase({ roles = [], failWrites = false } = {}) {
  const tables = { response: [], interview: roles.map((id) => ({ id })) };
  let nextId = 1;
  const json = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const valueAt = (row, column) => {
    const [head, ...rest] = column.split(/->>?/);
    let value = row[head];
    for (const key of rest) {
      value = value == null ? undefined : value[key];
    }
    return value === undefined ? null : value;
  };
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = null;
    }
    select() {
      this.op = this.op ?? "select";
      return this;
    }
    insert(row) {
      this.op = "insert";
      this.payload = row;
      return this;
    }
    update(patch) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(column, value) {
      this.filters.push((r) => valueAt(r, column) === value);
      return this;
    }
    is(column, value) {
      return this.eq(column, value);
    }
    order(column, { ascending }) {
      this.sort = { column, dir: ascending ? 1 : -1 };
      return this;
    }
    limit(n) {
      this.max = n;
      return this;
    }
    // biome-ignore lint/suspicious/noThenProperty: supabase-js query builders are awaited thenables
    then(onOk, onErr) {
      // Resolve on a later tick so concurrent callers interleave like real network requests.
      return new Promise((r) => setImmediate(r)).then(() => this.run()).then(onOk, onErr);
    }
    run() {
      const rows = tables[this.table];
      if (failWrites && this.op !== "select") {
        return { data: null, error: { message: "write failed" } };
      }
      if (this.op === "insert") {
        const row = { id: nextId++, ...json(this.payload) };
        rows.push(row);
        return { data: [{ id: row.id }], error: null };
      }
      let hits = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const r of hits) {
          Object.assign(r, json(this.payload));
        }
        return { data: hits.map((r) => ({ id: r.id })), error: null };
      }
      if (this.op === "delete") {
        tables[this.table] = rows.filter((r) => !hits.includes(r));
        return { data: null, error: null };
      }
      if (this.sort) {
        const { column, dir } = this.sort;
        hits = [...hits].sort((a, b) => (a[column] - b[column]) * dir);
      }
      return { data: json(hits.slice(0, this.max ?? hits.length)), error: null };
    }
  }
  return { from: (table) => new Query(table), tables };
}

async function withMockLlm(fn) {
  const previous = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    return await fn();
  } finally {
    process.env.LLM_MODE = previous;
  }
}

const faceSignals = { available: false, reason: "off" };

// Mock evaluation exists only for the unchanged golden spoken record, so answer with it.
const golden = require("../fixtures/golden-interview.json");
function goldenAnswerAfter(questionId) {
  const i = golden.record.turns.findIndex((t) => t.id === questionId);
  return golden.record.turns[i + 1].text;
}

async function runToEnd(store, interviewId, first) {
  let reply = first;
  let n = 0;
  while (!reply.finished) {
    n += 1;
    reply = await submitCandidateTurn(
      {
        interviewId,
        requestId: `answer-${n}`,
        expectedTurnId: reply.nextQuestion.id,
        text: goldenAnswerAfter(reply.nextQuestion.id),
        startMs: n * 10_000,
        endMs: n * 10_000 + 5_000,
        integrityEvents:
          n === 1
            ? [
                { kind: "tabBlur", atMs: 1_000 },
                { kind: "tabFocus", atMs: 2_000 },
              ]
            : [],
        faceSignals,
      },
      store,
    );
  }
  return reply;
}

/**
 * The session A3's createPlannedAttempt stores in mock mode (plan.ts mockDraft). A2's mock-*
 * demo attempts word follow-ups differently, and mock evaluation only accepts the golden record.
 */
function plannedGoldenSession(interviewId) {
  const plan = structuredClone(golden.record.plan);
  plan.interviewId = interviewId;
  const c3FollowUp = golden.record.turns.find(
    (t) => t.speaker === "ai" && t.claimId === "c3" && t.rung === "termFollowUp",
  ).text;
  for (const c of plan.claims) {
    if (c.id === "c2") {
      c.ladder.termFollowUpTemplate = c.ladder.termFollowUpTemplate.replace(
        "{{term}}",
        "the {{term}}",
      );
    }
    if (c.id === "c3") {
      c.ladder.termFollowUpTemplate = c3FollowUp;
    }
    if (c.isTechnical) {
      c.ladder.workspace = c.ladder.codeSnippet
        ? { kind: "code" }
        : { kind: "whiteboard", prompt: c.ladder.scenarioTwist };
    }
  }
  return {
    record: {
      plan,
      candidateLabel: "Candidate A",
      startedAt: new Date().toISOString(),
      turns: [],
      decisions: [],
      integrityEvents: [],
    },
    lastRequestId: null,
    lastReply: null,
    finished: false,
    faceSignals,
  };
}

test("a full planned attempt persists record, ended flag, tab count and report on one row", () =>
  withMockLlm(async () => {
    const db = fakeSupabase({ roles: ["role-1"] });
    const store = new SupabaseSessionStore(db);
    const id = "planned-persist-1";
    await store.createSession(plannedGoldenSession(id), {
      roleId: "role-1",
      candidateName: "Jane Doe",
      candidateEmail: "jane@example.com",
      identityValues: [],
    });
    assert.equal(db.tables.response.length, 1);
    const [row] = db.tables.response;
    assert.equal(row.call_id, id);
    assert.equal(row.interview_id, "role-1");
    assert.equal(row.name, "Jane Doe");
    assert.equal(row.email, "jane@example.com");
    assert.equal(row.is_ended, false);
    assert.equal(
      JSON.stringify(row.details).includes("Jane Doe"),
      false,
      "names stay off the record",
    );

    const first = await startAttempt({ interviewId: id, requestId: "start-1" }, store);
    assert.equal(row.details.pipeline.lastRequestId, "start-1");
    await runToEnd(store, id, first);
    assert.equal(row.is_ended, true);
    assert.equal(row.tab_switch_count, 1);
    assert.ok(row.duration > 0);
    assert.equal(row.analytics, undefined, "analytics are written with the report, not before");

    const { report } = await generateReport({ interviewId: id }, store);
    assert.deepEqual(Object.keys(row.analytics).sort(), ["audit", "evaluation", "integrity"]);
    assert.ok(row.analytics.evaluation.perClaim.every((c) => c.citations.length > 0));
    assert.equal(row.is_analysed, true);

    // A fresh instance (restart / another server) reopens the same session and report.
    const other = new SupabaseSessionStore(db);
    assert.equal((await readSession(id, other)).finished, true);
    assert.deepEqual((await readReport(id, other)).report, report);
    assert.equal(JSON.stringify(report).includes("plantedIssue"), false);
    assert.equal(JSON.stringify(report).includes('"lastRequestId"'), false);
  }));

test("a demo attempt started from a role link is stored under that role", () =>
  withMockLlm(async () => {
    const db = fakeSupabase({ roles: ["role-1"] });
    await startAttempt(
      { interviewId: "mock-role-1", requestId: "s", roleId: "role-1" },
      new SupabaseSessionStore(db),
    );
    assert.equal(db.tables.response[0].interview_id, "role-1");
    assert.equal(db.tables.response[0].details.pipeline.identityValues, null);
  }));

test("a stale expected request ID is rejected across instances and never overwrites", () =>
  withMockLlm(async () => {
    const db = fakeSupabase();
    const a = new SupabaseSessionStore(db);
    const b = new SupabaseSessionStore(db);
    await startAttempt({ interviewId: "mock-cas", requestId: "start" }, a);
    const sa = await a.loadSession("mock-cas");
    const sb = await b.loadSession("mock-cas");
    await a.saveSession({ ...sa, lastRequestId: "from-a" }, "start");
    await assert.rejects(b.saveSession({ ...sb, lastRequestId: "from-b" }, "start"), {
      code: "STALE_TURN",
    });
    assert.equal((await b.loadSession("mock-cas")).lastRequestId, "from-a");
    // Null-expected writes only succeed on a never-started session.
    await assert.rejects(a.saveSession({ ...sa, lastRequestId: "again" }, null), {
      code: "STALE_TURN",
    });
  }));

test("concurrent submits accept one result, reject the rival, and retry returns the stored reply", () =>
  withMockLlm(async () => {
    const db = fakeSupabase();
    const store = new SupabaseSessionStore(db);
    await startAttempt({ interviewId: "golden-sample-001", requestId: "start-b" }, store);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const grader = async () => {
      await gate;
      return { grade: 2, term: null, quote: null };
    };
    const base = {
      interviewId: "golden-sample-001",
      expectedTurnId: "t01",
      startMs: 1,
      endMs: 2,
      integrityEvents: [],
      faceSignals,
    };
    const winner = submitCandidateTurn(
      { ...base, requestId: "first", text: "First" },
      store,
      grader,
    );
    const rival = submitCandidateTurn(
      { ...base, requestId: "second", text: "Rival" },
      store,
      grader,
    );
    release();
    const [one, two] = await Promise.allSettled([winner, rival]);
    assert.equal(one.status, "fulfilled");
    assert.equal(two.reason.code, "STALE_TURN");
    const stored = await store.loadSession("golden-sample-001");
    assert.equal(stored.record.turns.length, 3);
    assert.equal(stored.record.turns[1].text, "First");
    const retried = await submitCandidateTurn(
      { ...base, requestId: "first", text: "First" },
      new SupabaseSessionStore(db),
      grader,
    );
    assert.deepEqual(retried, one.value);
  }));

test("a create race leaves exactly one row", () =>
  withMockLlm(async () => {
    const db = fakeSupabase();
    const [x, y] = await Promise.allSettled([
      startAttempt({ interviewId: "mock-race", requestId: "r1" }, new SupabaseSessionStore(db)),
      startAttempt({ interviewId: "mock-race", requestId: "r2" }, new SupabaseSessionStore(db)),
    ]);
    assert.deepEqual([x.status, y.status].sort(), ["fulfilled", "rejected"]);
    assert.equal([x, y].find((r) => r.status === "rejected").reason.code, "ALREADY_STARTED");
    assert.equal(db.tables.response.length, 1);
  }));

test("unknown role links are rejected without creating a row", () =>
  withMockLlm(async () => {
    const db = fakeSupabase({ roles: ["role-1"] });
    await assert.rejects(
      startAttempt(
        { interviewId: "mock-role", requestId: "s", roleId: "missing" },
        new SupabaseSessionStore(db),
      ),
      { code: "UNKNOWN_ROLE", status: 400 },
    );
    assert.equal(db.tables.response.length, 0);
  }));

test("private identity values survive a restart for blind scoring", async () => {
  const db = fakeSupabase();
  const session = {
    record: {
      plan: { interviewId: "planned-1", roleTitle: "R", claims: [], rubric: [], maxQuestions: 8 },
      candidateLabel: "Candidate A",
      startedAt: new Date().toISOString(),
      turns: [],
      decisions: [],
      integrityEvents: [],
    },
    lastRequestId: null,
    lastReply: null,
    finished: false,
    faceSignals,
  };
  await new SupabaseSessionStore(db).createSession(session, { identityValues: ["Jane Doe"] });
  globalThis.mmm42PlanIdentities.delete("planned-1"); // simulate a restart
  assert.equal(planIdentities("planned-1"), null);
  await new SupabaseSessionStore(db).loadSession("planned-1");
  assert.deepEqual(planIdentities("planned-1"), ["Jane Doe"]);
  // Demo attempts keep null, so the labeled mock grader path is unchanged.
  assert.equal(db.tables.response[0].details.pipeline.identityValues[0], "Jane Doe");
});

test("storage failures surface as a retryable 503", () =>
  withMockLlm(async () => {
    const store = new SupabaseSessionStore(fakeSupabase({ failWrites: true }));
    await assert.rejects(startAttempt({ interviewId: "mock-fail", requestId: "s" }, store), {
      code: "STORAGE_UNAVAILABLE",
      status: 503,
    });
  }));
