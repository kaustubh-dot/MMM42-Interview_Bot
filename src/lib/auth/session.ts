// Minimal role sign-in for the demo: candidates continue without a password; recruiters enter
// ADMIN_PASSCODE. Not a user-account system (CLAUDE.md §12 cuts real auth). Uses Web Crypto so it
// runs in both the proxy and route handlers.

export type Role = "candidate" | "recruiter";

export const ROLE_COOKIE = "mmm42_role";
export const SESSION_COOKIE = "mmm42_session";
export const NAME_COOKIE = "mmm42_name";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

/** Dev-only fallback so the demo works before ADMIN_PASSCODE is set. Never used in production. */
const DEV_PASSCODE = "recruiter";

export function recruiterPasscode(): string | null {
  const configured = process.env.ADMIN_PASSCODE?.trim();
  if (configured) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? null : DEV_PASSCODE;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Cookie value proving the passcode was entered. Changing ADMIN_PASSCODE signs everyone out. */
export async function recruiterToken(): Promise<string | null> {
  const passcode = recruiterPasscode();
  return passcode ? sha256Hex(`mmm42-recruiter-session|v1|${passcode}`) : null;
}

export async function passcodeMatches(input: string): Promise<boolean> {
  const passcode = recruiterPasscode();
  if (!passcode) {
    return false;
  }
  return equalHex(await sha256Hex(input), await sha256Hex(passcode));
}

export async function isRecruiterSession(token: string | undefined): Promise<boolean> {
  const expected = await recruiterToken();
  return !!token && !!expected && equalHex(token, expected);
}

/**
 * Only same-site paths are allowed after sign-in, never an external URL. A leading "//" is a
 * protocol-relative URL; a leading "/\" (or any backslash right after the first slash) is the
 * same attack, because browsers and some URL parsers normalize "\" to "/" before navigating, so
 * "/\evil.com" becomes "//evil.com" -- both must be rejected, not just the plain "//" form.
 */
export function safeNext(next: unknown, fallback: string): string {
  return typeof next === "string" && (next === "/" || /^\/[^/\\]/.test(next)) ? next : fallback;
}
