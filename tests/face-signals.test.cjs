const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText,
    filename,
  );
};
const { FaceOccurrenceTracker, lookingAway } = require(
  path.resolve(__dirname, "../src/lib/face-signals.ts"),
);

test("normal face observations produce no events", () => {
  const tracker = new FaceOccurrenceTracker();
  tracker.observe(1, false, 0, "t01");
  tracker.observe(1, false, 20000, "t01");
  assert.deepEqual(tracker.checkpoint(20000), []);
});

test("one completed absence carries its full duration; fusion can filter short events", () => {
  const tracker = new FaceOccurrenceTracker();
  tracker.observe(0, false, 100, "t01");
  assert.deepEqual(tracker.observe(1, false, 5100, "t03"), [
    { kind: "faceMissing", atMs: 100, durationMs: 5000, turnId: "t01" },
  ]);
  tracker.observe(0, false, 6000, "t03");
  assert.equal(tracker.observe(1, false, 6500, "t03")[0].durationMs, 500);
});

test("submission captures sustained occurrences once across turns and strict boundaries", () => {
  for (const [count, away, kind, boundary] of [
    [0, false, "faceMissing", 3000],
    [2, false, "multipleFaces", 1500],
    [1, true, "lookAway", 12000],
  ]) {
    const tracker = new FaceOccurrenceTracker();
    tracker.observe(count, away, 0, "t01");
    assert.deepEqual(tracker.checkpoint(boundary), []);
    assert.deepEqual(tracker.checkpoint(boundary + 1), [
      { kind, atMs: 0, durationMs: boundary + 1, turnId: "t01" },
    ]);
    assert.deepEqual(tracker.checkpoint(boundary + 5000), []);
    assert.deepEqual(tracker.observe(1, false, boundary + 6000, "t03"), []);
    tracker.observe(count, away, boundary + 7000, "t03");
    assert.equal(tracker.checkpoint(boundary * 2 + 7001).length, 1);
  }
});

test("unknown or paused frames reset continuity without inventing face absence", () => {
  const tracker = new FaceOccurrenceTracker();
  tracker.observe(0, false, 0, "t01");
  tracker.reset();
  tracker.observe(0, false, 10000, "t01");
  assert.deepEqual(tracker.checkpoint(11000), []);
});

test("gaze proxy requires a single face and strong head rotation or paired eye direction", () => {
  const matrix = (yaw) => ({
    data: [
      Math.cos(yaw),
      0,
      -Math.sin(yaw),
      0,
      0,
      1,
      0,
      0,
      Math.sin(yaw),
      0,
      Math.cos(yaw),
      0,
      0,
      0,
      0,
      1,
    ],
  });
  const result = (yaw, categories = []) => ({
    faceLandmarks: [[]],
    facialTransformationMatrixes: [matrix(yaw)],
    faceBlendshapes: [{ categories }],
  });
  assert.equal(lookingAway(result(0)), false);
  assert.equal(lookingAway(result(Math.PI / 4)), true);
  assert.equal(lookingAway({ ...result(Math.PI / 4), faceLandmarks: [[], []] }), false);
  assert.equal(
    lookingAway(
      result(0, [
        { categoryName: "eyeLookOutLeft", score: 0.8 },
        { categoryName: "eyeLookInRight", score: 0.8 },
      ]),
    ),
    true,
  );
  assert.equal(lookingAway(result(0, [{ categoryName: "eyeLookOutLeft", score: 0.8 }])), false);
});
