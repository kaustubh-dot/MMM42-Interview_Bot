// Browser client for the DSA practice routes.

import type {
  HelpReply,
  HelpRequest,
  PatternsReply,
  PracticeErrorBody,
  ProblemSetReply,
  ProblemSetRequest,
} from "@/lib/practice/types";

export class PracticeApiError extends Error {}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PracticeApiError("Couldn't reach the server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as T | PracticeErrorBody | null;
  if (!res.ok) {
    throw new PracticeApiError(
      (data as PracticeErrorBody | null)?.error?.message ?? `Request failed (${res.status}).`,
    );
  }
  return data as T;
}

export const fetchProblemSet = (req: ProblemSetRequest) =>
  post<ProblemSetReply>("/api/practice/problems", req);
export const fetchPatterns = (topic: string) =>
  post<PatternsReply>("/api/practice/patterns", { topic });
export const fetchHelp = (req: HelpRequest) => post<HelpReply>("/api/practice/help", req);

const SEEN_KEY = "mmm42:practice:seen-titles";

/** Titles shown recently, so "surprise me" avoids repeats. */
export function recentTitles(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 30) : [];
  } catch {
    return [];
  }
}

export function rememberTitles(titles: string[]) {
  try {
    const merged = [...titles, ...recentTitles().filter((t) => !titles.includes(t))].slice(0, 30);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
  } catch {
    // Not critical: repeats are just more likely.
  }
}
