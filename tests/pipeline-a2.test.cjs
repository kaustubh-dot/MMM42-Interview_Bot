const assert = require("node:assert/strict");
const { test } = require("node:test");
const golden = require("../fixtures/golden-interview.json");
const { workspaceExamples } = require("../.foundation-build/fixtures/workspace-interview.js");

function area(overrides = {}) {
  return {
    claimId: "c2",
    asked: 1,
    grades: [],
    consecutiveWeak: 0,
    currentRung: "initial",
    ladderRung: "initial",
    usedFundamental: false,
    ...overrides,
  };
}

test("pure selector matches every golden transition without mutating area state", () => {
  const { selectNext } = require("../.foundation-build/lib/pipeline/select-next.js");
  const decisions = golden.record.decisions;
  const answers = golden.record.turns.filter((turn) => turn.speaker === "candidate");
  const grades = [3, 3, 1, 2, 1, 0, 3, 3];
  for (let i = 0; i < answers.length; i++) {
    const previous = structuredClone(decisions[i].areaState);
    const snapshot = structuredClone(previous);
    const visited = new Set(decisions.slice(0, i + 1).map((decision) => decision.claimId));
    const result = selectNext(golden.record.plan, previous, grades[i], i + 1, visited);
    assert.deepEqual(result, {
      reason: decisions[i + 1].reason,
      claimId: decisions[i + 1].claimId,
      toRung: decisions[i + 1].toRung,
    });
    assert.deepEqual(previous, snapshot);
  }
});

test("strong and weak precedence, recovery, and exhausted claims retain the reference rule", () => {
  const { selectNext } = require("../.foundation-build/lib/pipeline/select-next.js");
  const plan = golden.record.plan;
  const visited = new Set(["c2"]);
  assert.equal(
    selectNext(plan, area({ asked: 4, consecutiveWeak: 1 }), 1, 4, visited).reason,
    "REPEATED_WEAK_MOVE_ON",
  );
  assert.equal(selectNext(plan, area({ asked: 4 }), 2, 4, visited).reason, "AREA_BUDGET_EXHAUSTED");
  assert.equal(selectNext(plan, area({ asked: 4 }), 1, 4, visited).reason, "AREA_BUDGET_EXHAUSTED");
  assert.deepEqual(
    selectNext(
      plan,
      area({
        asked: 2,
        ladderRung: "scenarioTwist",
        currentRung: "fundamental",
        usedFundamental: true,
      }),
      2,
      2,
      visited,
    ),
    {
      reason: "STRONG_DEEPEN",
      claimId: "c2",
      toRung: "whyDefense",
    },
  );
  assert.equal(
    selectNext(plan, area({ asked: 2, ladderRung: "whyDefense" }), 3, 2, visited).reason,
    "LADDER_COMPLETE_NEXT_CLAIM",
  );
  assert.equal(
    selectNext(plan, area({ asked: 2, usedFundamental: true }), 1, 2, visited).reason,
    "NEXT_RANKED_CLAIM",
  );
  assert.equal(selectNext(plan, area({ asked: 1 }), 1, 1, visited).reason, "WEAK_FUNDAMENTAL");
  assert.equal(
    selectNext(plan, area({ asked: 1 }), 3, plan.maxQuestions, visited).reason,
    "TIME_UP",
  );
  assert.equal(
    selectNext(
      plan,
      area({ asked: 1, usedFundamental: true }),
      1,
      1,
      new Set(plan.claims.map((claim) => claim.id)),
    ).reason,
    "TIME_UP",
  );
});

test("engine replays the golden decisions with server IDs and exact spoken text", async () => {
  const {
    createOpeningSession,
    advanceInterview,
  } = require("../.foundation-build/lib/pipeline/engine.js");
  let session = createOpeningSession(golden.record.plan, "start-1", "2026-09-26T10:00:00.000Z");
  assert.equal(session.record.turns[0].id, "t01");
  assert.equal(session.lastReply.nextQuestion.id, "t01");
  const answers = golden.record.turns.filter((turn) => turn.speaker === "candidate");
  const grades = [3, 3, 1, 2, 1, 0, 3, 3];
  for (let i = 0; i < answers.length; i++) {
    const source = answers[i];
    const expectedTurnId = session.lastReply.nextQuestion.id;
    const result = await advanceInterview(
      session,
      {
        interviewId: golden.record.plan.interviewId,
        requestId: `answer-${i}`,
        expectedTurnId,
        text: source.text,
        startMs: source.startMs,
        endMs: source.endMs,
        integrityEvents: [],
        faceSignals: { available: false },
      },
      async () => ({ grade: grades[i], term: null, quote: null }),
    );
    session = result.session;
    assert.equal(session.record.turns.at(-2).text, source.text);
    assert.equal(session.record.turns.at(-2).id, source.id);
  }
  assert.deepEqual(
    session.record.decisions.map((decision) => decision.reason),
    golden.record.decisions.map((decision) => decision.reason),
  );
  assert.equal(session.record.turns.at(-1).id, "t17");
  assert.equal(session.lastReply.nextQuestion, null);
  assert.equal(session.finished, true);
  assert.ok(!JSON.stringify(session.lastReply).includes("plantedIssue"));
});

test("a retry returns its accepted reply; stale submissions and grader failures leave state unchanged", async () => {
  const {
    createOpeningSession,
    advanceInterview,
  } = require("../.foundation-build/lib/pipeline/engine.js");
  const opened = createOpeningSession(
    golden.record.plan,
    "start-retry",
    "2026-09-26T10:00:00.000Z",
  );
  const request = {
    interviewId: golden.record.plan.interviewId,
    requestId: "answer-1",
    expectedTurnId: "t01",
    text: "  Exact spoken words.  ",
    startMs: 1200,
    endMs: 3400,
    integrityEvents: [],
    faceSignals: { available: false },
  };
  await assert.rejects(
    advanceInterview(opened, request, async () => {
      throw new Error("model failed");
    }),
    /model failed/,
  );
  assert.equal(opened.record.turns.length, 1);
  const accepted = await advanceInterview(opened, request, async () => ({
    grade: 1,
    term: null,
    quote: null,
  }));
  assert.equal(accepted.session.record.turns[1].text, request.text);
  const retried = await advanceInterview(accepted.session, request, async () => {
    throw new Error("should not grade");
  });
  assert.deepEqual(retried.reply, accepted.reply);
  assert.equal(retried.session.record.turns.length, 3);
  await assert.rejects(
    advanceInterview(accepted.session, { ...request, text: "Changed body" }, async () => ({
      grade: 1,
    })),
    { code: "REQUEST_ID_REUSED" },
  );
  await assert.rejects(
    advanceInterview(accepted.session, { ...request, requestId: "stale" }, async () => ({
      grade: 1,
    })),
    { code: "STALE_TURN" },
  );
});

test("validated candidate terms and quotes fill templates; invalid values use safe fallback", async () => {
  const {
    createOpeningSession,
    advanceInterview,
  } = require("../.foundation-build/lib/pipeline/engine.js");
  const first = createOpeningSession(
    golden.record.plan,
    "start-template",
    "2026-09-26T10:00:00.000Z",
  );
  const request = {
    interviewId: golden.record.plan.interviewId,
    requestId: "term-1",
    expectedTurnId: "t01",
    text: "I used a composite index on customer_id.",
    startMs: 1,
    endMs: 2,
    integrityEvents: [],
    faceSignals: { available: false },
  };
  const valid = await advanceInterview(first, request, async () => ({
    grade: 3,
    term: "composite index",
    quote: null,
  }));
  assert.match(valid.reply.nextQuestion.text, /composite index/);
  const invalid = await advanceInterview(first, request, async () => ({
    grade: 3,
    term: "secret answer key",
    quote: null,
  }));
  assert.ok(!invalid.reply.nextQuestion.text.includes("secret answer key"));
  assert.ok(!invalid.reply.nextQuestion.text.includes("{{"));
  const { questionText } = require("../.foundation-build/lib/pipeline/engine.js");
  const claim = golden.record.plan.claims[0];
  assert.match(
    questionText(
      claim,
      "whyDefense",
      { grade: 3, term: null, quote: "composite index" },
      request.text,
    ),
    /composite index/,
  );
  assert.ok(
    !questionText(
      claim,
      "whyDefense",
      { grade: 3, term: null, quote: "hidden solution" },
      request.text,
    ).includes("hidden solution"),
  );
});

test("technical scenario twist selects explicit whiteboard or code and retains the legacy code fallback", () => {
  const { questionWorkspace } = require("../.foundation-build/lib/pipeline/engine.js");
  const code = workspaceExamples[0].record.plan.claims[0];
  const whiteboard = workspaceExamples[1].record.plan.claims[0];
  const legacy = golden.record.plan.claims.find((claim) => claim.ladder.codeSnippet);
  assert.equal(questionWorkspace(code, "scenarioTwist"), "code");
  assert.equal(questionWorkspace(whiteboard, "scenarioTwist"), "whiteboard");
  assert.equal(questionWorkspace(legacy, "scenarioTwist"), "code");
  assert.equal(questionWorkspace(whiteboard, "initial"), null);
  assert.equal(questionWorkspace({ ...whiteboard, isTechnical: false }, "scenarioTwist"), null);
  const { questionText } = require("../.foundation-build/lib/pipeline/engine.js");
  const distinctPrompt = {
    ...whiteboard,
    ladder: {
      ...whiteboard.ladder,
      workspace: { kind: "whiteboard", prompt: "Draw the actual requested system." },
      scenarioTwist: "Legacy question",
    },
  };
  assert.equal(
    questionText(distinctPrompt, "scenarioTwist", null, ""),
    "Draw the actual requested system.",
  );
});

test("artifact validation enforces workspace, kind, byte limit, and scene shape", () => {
  const { validateArtifacts } = require("../.foundation-build/lib/pipeline/answer-artifact.js");
  const codeClaim = workspaceExamples[0].record.plan.claims[0];
  const whiteboardClaim = workspaceExamples[1].record.plan.claims[0];
  const code = { kind: "code", language: "sql", code: "" };
  const blankScene = { kind: "whiteboard", sceneJson: "" };
  const sampleScene = workspaceExamples[1].record.turns.find((turn) => turn.speaker === "candidate")
    .artifacts[0];
  assert.deepEqual(validateArtifacts([code], codeClaim, "scenarioTwist"), [code]);
  assert.deepEqual(validateArtifacts([blankScene], whiteboardClaim, "scenarioTwist"), [
    { kind: "whiteboard", sceneJson: '{"elements":[],"appState":{}}' },
  ]);
  assert.deepEqual(validateArtifacts([sampleScene], whiteboardClaim, "scenarioTwist"), [
    sampleScene,
  ]);
  assert.deepEqual(validateArtifacts([], codeClaim, "scenarioTwist"), []);
  assert.throws(() => validateArtifacts([code], codeClaim, "initial"), {
    code: "INVALID_ARTIFACT",
  });
  assert.throws(() => validateArtifacts([code], whiteboardClaim, "scenarioTwist"), {
    code: "INVALID_ARTIFACT",
  });
  assert.throws(() => validateArtifacts([code, code], codeClaim, "scenarioTwist"), {
    code: "INVALID_ARTIFACT",
  });
  assert.throws(
    () => validateArtifacts([{ ...code, code: "😀".repeat(25_601) }], codeClaim, "scenarioTwist"),
    { code: "ARTIFACT_TOO_LARGE" },
  );
  assert.throws(
    () =>
      validateArtifacts([{ kind: "whiteboard", sceneJson: "{" }], whiteboardClaim, "scenarioTwist"),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        [{ kind: "whiteboard", sceneJson: JSON.stringify({ elements: [], files: {} }) }],
        whiteboardClaim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        [
          {
            kind: "whiteboard",
            sceneJson: JSON.stringify({
              elements: [{ id: "x", type: "image", x: 0, y: 0, width: 1, height: 1 }],
            }),
          },
        ],
        whiteboardClaim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        [
          {
            kind: "whiteboard",
            sceneJson: JSON.stringify({
              elements: [
                {
                  id: "x",
                  type: "rectangle",
                  x: 0,
                  y: 0,
                  width: 1,
                  height: 1,
                  collaborators: ["person"],
                },
              ],
            }),
          },
        ],
        whiteboardClaim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        [
          {
            kind: "whiteboard",
            sceneJson: JSON.stringify({
              elements: [
                {
                  id: "x",
                  type: "rectangle",
                  x: 0,
                  y: 0,
                  width: 1,
                  height: 1,
                  boundElements: [{ files: "binary" }],
                },
              ],
            }),
          },
        ],
        whiteboardClaim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        [
          {
            kind: "whiteboard",
            sceneJson: JSON.stringify({
              elements: [],
              appState: { viewBackgroundColor: "#fff" },
              padding: "x".repeat(512_000),
            }),
          },
        ],
        whiteboardClaim,
        "scenarioTwist",
      ),
    { code: "ARTIFACT_TOO_LARGE" },
  );
});

test("whiteboard arrows accept standard fields and malformed freehand geometry is rejected", () => {
  const { validateArtifacts } = require("../.foundation-build/lib/pipeline/answer-artifact.js");
  const claim = workspaceExamples[1].record.plan.claims[0];
  const scene = (element) => [
    { kind: "whiteboard", sceneJson: JSON.stringify({ elements: [element], appState: {} }) },
  ];
  const shape = {
    id: "arrow-1",
    type: "arrow",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    points: [
      [0, 0],
      [100, 50],
    ],
    startArrowhead: null,
    endArrowhead: "arrow",
  };
  assert.deepEqual(validateArtifacts(scene(shape), claim, "scenarioTwist"), scene(shape));
  assert.throws(
    () =>
      validateArtifacts(
        scene({ ...shape, type: "freedraw", points: { wrong: "shape" }, pressures: "invalid" }),
        claim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () => validateArtifacts(scene({ ...shape, points: [[0, "bad"]] }), claim, "scenarioTwist"),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () => validateArtifacts(scene({ ...shape, groupIds: "bad" }), claim, "scenarioTwist"),
    { code: "INVALID_ARTIFACT" },
  );
  assert.throws(
    () =>
      validateArtifacts(
        scene({
          id: "stroke",
          type: "freedraw",
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          points: [
            [0, 0],
            [100, 20],
          ],
          simulatePressure: false,
        }),
        claim,
        "scenarioTwist",
      ),
    { code: "INVALID_ARTIFACT" },
  );
});

test("code snapshots derive typedAnswer and stay out of spoken grading input", async () => {
  const {
    createOpeningSession,
    advanceInterview,
  } = require("../.foundation-build/lib/pipeline/engine.js");
  const plan = structuredClone(workspaceExamples[0].record.plan);
  const opened = createOpeningSession(plan, "start-code");
  opened.record.turns[0].rung = "scenarioTwist";
  opened.record.decisions[0].toRung = "scenarioTwist";
  opened.record.decisions[0].areaState.currentRung = "scenarioTwist";
  const artifact = { kind: "code", language: "sql", code: "SELECT 1;" };
  const result = await advanceInterview(
    opened,
    {
      interviewId: plan.interviewId,
      requestId: "answer-code",
      expectedTurnId: "t01",
      text: "I would check the query plan.",
      startMs: 1,
      endMs: 2,
      artifacts: [artifact],
      integrityEvents: [],
      faceSignals: { available: false },
    },
    async (input) => {
      assert.equal(input.answerText, "I would check the query plan.");
      assert.ok(!JSON.stringify(input).includes("SELECT 1"));
      return { grade: 2, term: null, quote: null };
    },
  );
  assert.equal(result.session.record.turns[1].typedAnswer, artifact.code);
  assert.deepEqual(result.session.record.turns[1].artifacts, [artifact]);
});

test("mock start and session expose only client data, and start retries are idempotent", async () => {
  const { MockSessionStore } = require("../.foundation-build/lib/pipeline/mock-session-store.js");
  const {
    startAttempt,
    readSession,
  } = require("../.foundation-build/lib/pipeline/turn-service.js");
  const store = new MockSessionStore();
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    const request = { interviewId: "golden-sample-001", requestId: "start-a" };
    const first = await startAttempt(request, store);
    const retry = await startAttempt(request, store);
    assert.deepEqual(retry, first);
    assert.equal(first.nextQuestion.id, "t01");
    assert.ok(!JSON.stringify(first).includes("plantedIssue"));
    const snapshot = await readSession(request.interviewId, store);
    assert.equal(snapshot.finished, false);
    assert.equal(snapshot.record.turns.length, 1);
    assert.ok(!JSON.stringify(snapshot).includes("plantedIssue"));
    await assert.rejects(startAttempt({ ...request, requestId: "new-start" }, store), {
      code: "ALREADY_STARTED",
    });
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});

test("concurrent submits accept one result and reject the stale rival without overwriting", async () => {
  const { MockSessionStore } = require("../.foundation-build/lib/pipeline/mock-session-store.js");
  const {
    startAttempt,
    submitCandidateTurn,
  } = require("../.foundation-build/lib/pipeline/turn-service.js");
  const store = new MockSessionStore();
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    await startAttempt({ interviewId: "golden-sample-001", requestId: "start-b" }, store);
    let release;
    const waitForGrade = new Promise((resolve) => {
      release = resolve;
    });
    const grader = async () => {
      await waitForGrade;
      return { grade: 2, term: null, quote: null };
    };
    const base = {
      interviewId: "golden-sample-001",
      expectedTurnId: "t01",
      startMs: 1,
      endMs: 2,
      integrityEvents: [],
      faceSignals: { available: false },
    };
    const winner = submitCandidateTurn(
      { ...base, requestId: "first", text: "First accepted answer" },
      store,
      grader,
    );
    const rival = submitCandidateTurn(
      { ...base, requestId: "second", text: "Rival answer" },
      store,
      grader,
    );
    release();
    const [one, two] = await Promise.allSettled([winner, rival]);
    assert.equal(one.status, "fulfilled");
    assert.equal(two.status, "rejected");
    assert.equal(two.reason.code, "STALE_TURN");
    const stored = await store.loadSession("golden-sample-001");
    assert.equal(stored.record.turns.length, 3);
    assert.equal(stored.record.turns[1].text, "First accepted answer");
    const retried = await submitCandidateTurn(
      { ...base, requestId: "first", text: "First accepted answer" },
      store,
      grader,
    );
    assert.deepEqual(retried, one.value);
    assert.equal((await store.loadSession("golden-sample-001")).record.turns.length, 3);
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});

test("failed grader leaves the stored opening available for a retry", async () => {
  const { MockSessionStore } = require("../.foundation-build/lib/pipeline/mock-session-store.js");
  const {
    startAttempt,
    submitCandidateTurn,
  } = require("../.foundation-build/lib/pipeline/turn-service.js");
  const store = new MockSessionStore();
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    await startAttempt({ interviewId: "golden-sample-001", requestId: "start-c" }, store);
    const request = {
      interviewId: "golden-sample-001",
      requestId: "submit-c",
      expectedTurnId: "t01",
      text: "A spoken explanation",
      startMs: 1,
      endMs: 2,
      integrityEvents: [],
      faceSignals: { available: false },
    };
    await assert.rejects(
      submitCandidateTurn(request, store, async () => {
        throw new Error("provider down");
      }),
      /provider down/,
    );
    assert.equal((await store.loadSession(request.interviewId)).record.turns.length, 1);
    const accepted = await submitCandidateTurn(request, store, async () => ({
      grade: 1,
      term: null,
      quote: null,
    }));
    assert.equal(accepted.record.turns.length, 3);
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});

test("start, turn, and session endpoints return safe shapes and documented error statuses", async () => {
  const start = require("../.foundation-build/app/api/pipeline/start/route.js");
  const turn = require("../.foundation-build/app/api/pipeline/turn/route.js");
  const session = require("../.foundation-build/app/api/pipeline/session/route.js");
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    const interviewId = "mock-route-a2";
    const jsonPost = (url, body) =>
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const started = await start.POST(
      jsonPost("http://localhost/api/pipeline/start", { interviewId, requestId: "route-start" }),
    );
    assert.equal(started.status, 200);
    assert.equal(started.headers.get("x-pipeline-mode"), "mock");
    const opening = await started.json();
    assert.equal(opening.nextQuestion.id, "t01");
    assert.ok(!JSON.stringify(opening).includes("plantedIssue"));
    const bad = await turn.POST(jsonPost("http://localhost/api/pipeline/turn", { interviewId }));
    assert.equal(bad.status, 400);
    assert.equal(typeof (await bad.json()).error.code, "string");
    const payload = {
      interviewId,
      requestId: "route-answer",
      expectedTurnId: "t01",
      text: "Spoken answer",
      startMs: 100,
      endMs: 200,
      integrityEvents: [],
      faceSignals: { available: false },
    };
    const answered = await turn.POST(jsonPost("http://localhost/api/pipeline/turn", payload));
    assert.equal(answered.status, 200);
    const next = await answered.json();
    assert.equal(next.record.turns[1].text, payload.text);
    assert.ok(!JSON.stringify(next).includes("plantedIssue"));
    const retry = await turn.POST(jsonPost("http://localhost/api/pipeline/turn", payload));
    assert.deepEqual(await retry.json(), next);
    const stale = await turn.POST(
      jsonPost("http://localhost/api/pipeline/turn", { ...payload, requestId: "route-stale" }),
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, "STALE_TURN");
    const recovered = await session.GET(
      new Request(`http://localhost/api/pipeline/session?interviewId=${interviewId}`),
    );
    assert.equal(recovered.status, 200);
    const snapshot = await recovered.json();
    assert.equal(snapshot.record.turns.length, 3);
    assert.ok(!JSON.stringify(snapshot).includes("plantedIssue"));
    const missing = await session.GET(
      new Request("http://localhost/api/pipeline/session?interviewId=missing"),
    );
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, "UNKNOWN_ATTEMPT");
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});

test("whiteboard mock entry reaches a scenario and preserves an explicitly cleared submission", async () => {
  const { MockSessionStore } = require("../.foundation-build/lib/pipeline/mock-session-store.js");
  const {
    startAttempt,
    submitCandidateTurn,
  } = require("../.foundation-build/lib/pipeline/turn-service.js");
  const store = new MockSessionStore();
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    const interviewId = "mock-whiteboard-cleared";
    let reply = await startAttempt({ interviewId, requestId: "whiteboard-start" }, store);
    const answers = golden.record.turns.filter((turn) => turn.speaker === "candidate");
    for (let i = 0; i < 2; i++) {
      reply = await submitCandidateTurn(
        {
          interviewId,
          requestId: `wb-${i}`,
          expectedTurnId: reply.nextQuestion.id,
          text: answers[i].text,
          startMs: answers[i].startMs,
          endMs: answers[i].endMs,
          integrityEvents: [],
          faceSignals: { available: false },
        },
        store,
      );
    }
    const claim = reply.record.plan.claims.find((item) => item.id === reply.nextQuestion.claimId);
    assert.equal(reply.nextQuestion.rung, "scenarioTwist");
    assert.equal(claim.ladder.workspace.kind, "whiteboard");
    const text = "  Exact\r\nspoken résumé text 😀  ";
    const cleared = await submitCandidateTurn(
      {
        interviewId,
        requestId: "wb-clear",
        expectedTurnId: reply.nextQuestion.id,
        text,
        startMs: 70000,
        endMs: 71000,
        artifacts: [{ kind: "whiteboard", sceneJson: "" }],
        integrityEvents: [],
        faceSignals: { available: false },
      },
      store,
    );
    const saved = cleared.record.turns.at(-2);
    assert.equal(saved.text, text);
    assert.equal(saved.typedAnswer, undefined);
    assert.deepEqual(JSON.parse(saved.artifacts[0].sceneJson), { elements: [], appState: {} });
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});

test("malformed requests, contradictory typedAnswer, and model failures keep endpoint state recoverable", async () => {
  const start = require("../.foundation-build/app/api/pipeline/start/route.js");
  const turn = require("../.foundation-build/app/api/pipeline/turn/route.js");
  const session = require("../.foundation-build/app/api/pipeline/session/route.js");
  const previousMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "mock";
  try {
    const interviewId = "mock-route-errors";
    const post = (body) =>
      new Request("http://localhost/api/pipeline/turn", {
        method: "POST",
        body: JSON.stringify(body),
      });
    await start.POST(post({ interviewId, requestId: "start-errors" }));
    const payload = {
      interviewId,
      requestId: "errors-answer",
      expectedTurnId: "t01",
      text: "Keep my words",
      startMs: 1,
      endMs: 2,
      integrityEvents: [],
      faceSignals: { available: false },
    };
    const mismatch = await turn.POST(
      post({
        ...payload,
        typedAnswer: "old code",
        artifacts: [{ kind: "code", language: "sql", code: "new code" }],
      }),
    );
    assert.equal(mismatch.status, 400);
    const malformed = await turn.POST(
      new Request("http://localhost/api/pipeline/turn", { method: "POST", body: "{" }),
    );
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");
    process.env.LLM_MODE = "gemini";
    const failed = await turn.POST(post(payload));
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).error.code, "GRADER_UNAVAILABLE");
    const snapshot = await session.GET(
      new Request(`http://localhost/api/pipeline/session?interviewId=${interviewId}`),
    );
    assert.equal((await snapshot.json()).record.turns.length, 1);
    process.env.LLM_MODE = "mock";
    const recovered = await turn.POST(post(payload));
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).record.turns[1].text, payload.text);
  } finally {
    process.env.LLM_MODE = previousMode;
  }
});
