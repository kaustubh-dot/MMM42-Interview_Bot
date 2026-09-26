// Browser APIs and React effects are replaced only at the environment boundary;
// failure, delivery and cleanup behavior run through the real capture hook.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function harness(getUserMedia, pendingEventCount) {
  let now = 1000;
  const effects = [];
  const emitted = [];
  const workers = [];
  const intervals = [];
  const timeouts = [];
  const module = { exports: {} };
  const root = path.resolve(__dirname, "..");
  const loadTs = (file, dependencies) => {
    const source = fs
      .readFileSync(file, "utf8")
      .replaceAll("import.meta.url", JSON.stringify("file:///face-hook.js"));
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, dependencies, { filename: file });
  };
  const helpers = { exports: {} };
  loadTs(path.join(root, "src/lib/face-signals.ts"), { exports: helpers.exports, require });
  const context = {
    exports: module.exports,
    require: (id) =>
      id === "@/lib/face-signals"
        ? helpers.exports
        : {
            useRef: (current) => ({ current }),
            useState: (initial) => [initial, () => {}],
            useCallback: (fn) => fn,
            useEffect: (fn) => effects.push(fn),
          },
    navigator: { mediaDevices: { getUserMedia } },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    performance: { now: () => now },
    URL,
    createImageBitmap: async () => ({ close() {} }),
    Worker: class {
      constructor() {
        workers.push(this);
      }
      postMessage() {}
      terminate() {
        this.terminated = true;
      }
    },
    setTimeout: (fn) => {
      timeouts.push(fn);
      return timeouts.length;
    },
    clearTimeout() {},
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval() {},
  };
  loadTs(path.join(root, "src/hooks/use-face-signals.ts"), context);
  const hook = module.exports.useFaceSignals({
    enabled: true,
    active: true,
    startedAtPerf: 0,
    currentTurnId: "t01",
    onEvent: (event) => emitted.push(event),
    pendingEventCount: pendingEventCount ?? (() => emitted.length),
  });
  const video = {
    srcObject: null,
    play: async () => {},
    currentTime: 1,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
  };
  hook.videoRef.current = video;
  return {
    hook,
    emitted,
    workers,
    intervals,
    timeouts,
    video,
    start: () => effects[0](),
    advance: (ms) => {
      now += ms;
    },
  };
}
const settle = async () => {
  await new Promise(setImmediate);
};

test("excessive raw face chatter disables optional capture before API event overflow", async () => {
  const track = { stop() {} };
  const h = harness(
    async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }),
    () => 90,
  );
  h.start();
  await settle();
  h.workers[0].onmessage({ data: { kind: "sample", count: 0, away: false, atPerf: 1000 } });
  h.advance(250);
  h.workers[0].onmessage({ data: { kind: "sample", count: 1, away: false, atPerf: 1250 } });
  assert.equal(h.hook.currentAvailability().available, false);
  assert.equal(h.emitted.length, 1);
  assert.equal(h.emitted[0].kind, "faceSignalsUnavailable");
});

test("capture waits for its video element instead of failing before permission is requested", async () => {
  let requests = 0;
  const track = { stop() {} };
  const h = harness(async () => {
    requests++;
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  });
  const video = h.hook.videoRef.current;
  h.hook.videoRef.current = null;
  const cleanup = h.start();
  await settle();
  assert.equal(h.emitted.length, 0);
  assert.equal(requests, 0);
  cleanup?.();
  h.hook.attachVideo(video);
  h.start();
  await settle();
  assert.equal(requests, 1);
  assert.equal(h.workers.length, 1);
});

test("repeated stale worker results eventually mark capture unavailable", async () => {
  const track = { stop() {} };
  const h = harness(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  h.start();
  await settle();
  h.workers[0].onmessage({ data: { kind: "ready" } });
  h.workers[0].onmessage({ data: { kind: "sample", count: 1, away: false, atPerf: 1000 } });
  for (let i = 0; i < 4; i++) {
    h.advance(1500);
    h.workers[0].onmessage({
      data: { kind: "sample", count: 1, away: false, atPerf: 1000 + i * 1500 },
    });
    h.video.currentTime++;
    await h.intervals[0]();
  }
  assert.equal(h.hook.currentAvailability().available, false);
  assert.equal(h.emitted[0].kind, "faceSignalsUnavailable");
});

test("denied permission emits one unavailable event and leaves capture non-blocking", async () => {
  const h = harness(async () => {
    throw new Error("permission denied");
  });
  const cleanup = h.start();
  await settle();
  assert.equal(h.hook.currentAvailability().available, false);
  assert.equal(h.emitted.length, 1);
  assert.equal(h.emitted[0].kind, "faceSignalsUnavailable");
  assert.equal(h.workers.length, 0);
  cleanup();
  assert.equal(h.emitted.length, 1);
});

test("model failure stops the camera, emits unavailable once, and does not throw", async () => {
  let stops = 0;
  const track = {
    stop: () => {
      stops++;
    },
  };
  const h = harness(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  h.start();
  await settle();
  assert.equal(h.hook.currentAvailability().available, false);
  h.workers[0].onmessage({ data: { kind: "error" } });
  assert.equal(h.hook.currentAvailability().available, false);
  assert.equal(h.emitted[0].kind, "faceSignalsUnavailable");
  assert.equal(stops, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.workers[0].terminated, true);
  h.workers[0].onmessage({ data: { kind: "error" } });
  assert.equal(h.emitted.length, 1);
});

test("camera granted after teardown is stopped without emitting a false absence", async () => {
  let resolveCamera;
  let stops = 0;
  const h = harness(
    () =>
      new Promise((resolve) => {
        resolveCamera = resolve;
      }),
  );
  const cleanup = h.start();
  cleanup();
  resolveCamera({
    getTracks: () => [
      {
        stop: () => {
          stops++;
        },
      },
    ],
  });
  await settle();
  assert.equal(stops, 1);
  assert.equal(h.emitted.length, 0);
  assert.equal(h.workers.length, 0);
});

test("capture becomes available only after inference succeeds, and watchdog failures clear it", async () => {
  const track = { stop() {} };
  const h = harness(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }));
  h.start();
  await settle();
  assert.equal(h.hook.currentAvailability().available, false);
  h.workers[0].onmessage({ data: { kind: "ready" } });
  assert.equal(h.hook.currentAvailability().available, false);
  h.workers[0].onmessage({ data: { kind: "sample", count: 1, away: false, atPerf: 1000 } });
  assert.equal(h.hook.currentAvailability().available, true);
  assert.equal(h.emitted.length, 0);
  h.workers[0].onerror({ message: "Detector worker stopped" });
  assert.equal(h.hook.currentAvailability().available, false);
  assert.equal(h.emitted[0].kind, "faceSignalsUnavailable");
});
