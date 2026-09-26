import "server-only";

import { cookies } from "next/headers";
import { ROLE_COOKIE, type Role, SESSION_COOKIE, isRecruiterSession } from "./session";

/** Signed-in role for rendering (navbar). /admin access is enforced separately in src/proxy.ts. */
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  if (await isRecruiterSession(jar.get(SESSION_COOKIE)?.value)) {
    return "recruiter";
  }
  return jar.get(ROLE_COOKIE)?.value === "candidate" ? "candidate" : null;
}
