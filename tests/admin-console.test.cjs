// Recruiter console logic. Run: npx tsc -p tsconfig.admin.json && node --test tests/admin-console.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const golden = require("../fixtures/golden-interview.json");
const {
  fitSummary,
  rankByEvidence,
  interviewGuide,
  guideToText,
} = require("../.foundation-build/lib/admin/insights.js");
const { icsEvent, inviteUrl, toCsv } = require("../.foundation-build/lib/admin/invite.js");

const clone = () => structuredClone(golden);

test("fit weights cited scores by JD weight and counts unreached topics as zero", () => {
  const s = fitSummary(golden);
  const claims = golden.record.plan.claims;
  const total = claims.reduce((sum, c) => sum + c.jdWeight, 0);
  const earned = golden.evaluation.perClaim.reduce(
    (sum, e) => sum + claims.find((c) => c.id === e.claimId).jdWeight * (e.score / 3),
    0,
  );
  assert.equal(s.fit, earned / total);
  assert.equal(s.assessed, 3);
  assert.equal(s.topics.find((t) => t.claimId === "c4").status, "not_assessed");
  assert.equal(s.topics.find((t) => t.claimId === "c4").score, null);
  assert.ok(s.coverage < 1);
});

test("integrity never changes fit or ranking order", () => {
  const low = clone();
  const high = clone();
  high.integrity.level = "High";
  high.integrity.totalPoints = 9;
  low.integrity.level = "Low";
  assert.equal(fitSummary(high).fit, fitSummary(low).fit);
  const { ranked } = rankByEvidence(
    [
      { name: "high", r: high },
      { name: "low", r: low },
    ],
    (x) => x.r,
  );
  assert.equal(
    ranked[0].position,
    ranked[1].position,
    "equal evidence ties regardless of integrity",
  );
});

test("ranking orders by fit, ties share a position, and missing reports are not ranked", () => {
  const weaker = clone();
  weaker.evaluation.perClaim = weaker.evaluation.perClaim.map((e) => ({ ...e, score: 1 }));
  const { ranked, unranked } = rankByEvidence(
    ["strong", "weak", "none", "strong2"],
    (id) => ({ strong: golden, strong2: golden, weak: weaker })[id] ?? null,
  );
  assert.deepEqual(
    ranked.map((r) => [r.item, r.position]),
    [
      ["strong", 1],
      ["strong2", 1],
      ["weak", 3],
    ],
  );
  assert.deepEqual(unranked, ["none"]);
});

test("guide asks unreached topics first and never emits unfilled templates", () => {
  const guide = interviewGuide(golden);
  assert.equal(guide.items[0].claimId, "c4");
  assert.equal(guide.items[0].priority, "must");
  for (const item of guide.items) {
    assert.ok(item.questions.length > 0, `${item.topic} has questions`);
    for (const q of item.questions) {
      assert.doesNotMatch(q, /\{\{/);
    }
  }
  // c2 has mixed evidence, so it must be verified.
  assert.equal(guide.items.find((i) => i.claimId === "c2").priority, "verify");
  // Audit concern and non-Low integrity surface as neutral checks, never as a verdict.
  assert.ok(guide.checks.some((c) => c.title.startsWith("Fairness check")));
  const integrity = guide.checks.find((c) => c.title.startsWith("Integrity"));
  assert.match(integrity.detail, /not a cheating determination/);
  assert.doesNotMatch(guideToText(guide, "Guide"), /cheat(ed|er|ing):/i);
});

test("guide skips integrity check when the level is Low", () => {
  const low = clone();
  low.integrity.level = "Low";
  assert.ok(!interviewGuide(low).checks.some((c) => c.title.startsWith("Integrity")));
});

test("invite helpers escape calendar text and neutralize CSV formulas", () => {
  const ics = icsEvent({
    uid: "mock-1",
    start: new Date("2026-09-26T10:00:00Z"),
    durationMin: 15,
    title: "Interview; Backend, Node",
    description: "line1\nline2",
    url: "https://x/invite/mock-1",
    now: new Date("2026-09-26T09:00:00Z"),
  });
  assert.match(ics, /DTSTART:20260926T100000Z\r\nDTEND:20260926T101500Z/);
  assert.match(ics, /SUMMARY:Interview\\; Backend\\, Node/);
  assert.match(ics, /DESCRIPTION:line1\\nline2/);
  assert.equal(toCsv([["=SUM(A1)", 'a "q"']]), `"'=SUM(A1)","a ""q"""`);
  assert.equal(
    inviteUrl("https://h/", { interviewId: "mock-a b", scheduledAt: "2026-09-26T10:00:00.000Z" }),
    "https://h/invite/mock-a%20b?at=2026-09-26T10%3A00%3A00.000Z",
  );
});
