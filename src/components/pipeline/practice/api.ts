// Browser client for the practice routes.

import type {
  HelpReply,
  HelpRequest,
  PracticeErrorBody,
  SetReply,
  SetRequest,
  Track,
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

export const fetchSet = (req: SetRequest) => post<SetReply>("/api/practice/problems", req);
export const fetchHelp = (req: HelpRequest) => post<HelpReply>("/api/practice/help", req);

const seenKey = (track: Track) => `mmm42:practice:seen:${track}`;

/** Recently practiced IDs, so new sets prefer fresh questions. */
export function recentIds(track: Track): string[] {
  try {
    const raw = window.localStorage.getItem(seenKey(track));
    return raw ? (JSON.parse(raw) as string[]).slice(0, 60) : [];
  } catch {
    return [];
  }
}

export function rememberIds(track: Track, ids: string[]) {
  try {
    const merged = [...ids, ...recentIds(track).filter((id) => !ids.includes(id))].slice(0, 60);
    window.localStorage.setItem(seenKey(track), JSON.stringify(merged));
  } catch {
    // Not critical: repeats are just more likely.
  }
}

/** Small localStorage helpers for per-item drafts (code, SQL, design notes). */
export function loadText(key: string): string | null {
  try {
    return window.localStorage.getItem(`mmm42:practice:${key}`);
  } catch {
    return null;
  }
}

export function saveText(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(`mmm42:practice:${key}`, value);
    return true;
  } catch {
    return false;
  }
}
