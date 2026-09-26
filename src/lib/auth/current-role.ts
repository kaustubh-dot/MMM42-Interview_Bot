import "server-only";

import { cookies } from "next/headers";
import { NAME_COOKIE, ROLE_COOKIE, type Role, SESSION_COOKIE, isRecruiterSession } from "./session";

/** Signed-in role for rendering (navbar). /admin access is enforced separately in src/proxy.ts. */
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  if (await isRecruiterSession(jar.get(SESSION_COOKIE)?.value)) {
    return "recruiter";
  }
  return jar.get(ROLE_COOKIE)?.value === "candidate" ? "candidate" : null;
}

/** Display name given at sign-in (candidates), if any. */
export async function currentName(): Promise<string | null> {
  const value = (await cookies()).get(NAME_COOKIE)?.value?.trim();
  return value ? value.slice(0, 80) : null;
}
