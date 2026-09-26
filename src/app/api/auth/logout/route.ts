import { NAME_COOKIE, ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(ROLE_COOKIE);
  res.cookies.delete(NAME_COOKIE);
  return res;
}
