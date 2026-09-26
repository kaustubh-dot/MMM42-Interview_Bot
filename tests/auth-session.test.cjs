// Auth session helpers. Run: npx tsc -p tsconfig.auth.json && node --test tests/auth-session.test.cjs
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { safeNext } = require("../.foundation-build/lib/auth/session.js");

test("safeNext rejects backslash-based open-redirect bypasses, not just //", () => {
  // Browsers and several URL parsers normalize a leading "\" to "/", so "/\evil.com" and
  // "/\/evil.com" become the protocol-relative "//evil.com" once actually navigated.
  for (const attempt of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\\\\evil.com"]) {
    assert.equal(safeNext(attempt, "FALLBACK"), "FALLBACK", attempt);
  }
});

test("safeNext rejects absolute URLs and non-strings", () => {
  for (const attempt of ["https://evil.com", "not-a-path", "", null, undefined, 42, {}]) {
    assert.equal(safeNext(attempt, "FALLBACK"), "FALLBACK", String(attempt));
  }
});

test("safeNext allows same-site paths, including the bare root", () => {
  for (const path of ["/", "/admin", "/interview?x=1", "/candidates/abc-123"]) {
    assert.equal(safeNext(path, "FALLBACK"), path);
  }
});
