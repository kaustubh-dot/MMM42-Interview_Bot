import {
  NAME_COOKIE,
  ROLE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  passcodeMatches,
  recruiterToken,
  safeNext,
} from "@/lib/auth/session";
import { NextResponse } from "next/server";

const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    role?: unknown;
    passcode?: unknown;
    name?: unknown;
    next?: unknown;
  } | null;
  if (body?.role === "candidate") {
    const res = NextResponse.json({ next: safeNext(body.next, "/") });
    res.cookies.set(ROLE_COOKIE, "candidate", cookie);
    res.cookies.delete(SESSION_COOKIE);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (name) {
      res.cookies.set(NAME_COOKIE, name, cookie);
    } else {
      res.cookies.delete(NAME_COOKIE);
    }
    return res;
  }
  if (body?.role !== "recruiter") {
    return NextResponse.json({ error: "Choose candidate or recruiter." }, { status: 400 });
  }
  const token = await recruiterToken();
  if (!token) {
    return NextResponse.json(
      { error: "Recruiter sign-in is off. Set ADMIN_PASSCODE on the server." },
      { status: 503 },
    );
  }
  if (typeof body.passcode !== "string" || !(await passcodeMatches(body.passcode))) {
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ next: safeNext(body.next, "/admin") });
  res.cookies.set(SESSION_COOKIE, token, cookie);
  res.cookies.set(ROLE_COOKIE, "recruiter", cookie);
  res.cookies.delete(NAME_COOKIE);
  return res;
}
