import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isRecruiterSession } from "./lib/auth/session";

// Recruiter pages require a recruiter sign-in. Candidate pages (/interview, /invite) stay open.
export async function proxy(request: NextRequest) {
  if (await isRecruiterSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
