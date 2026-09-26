import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { PracticeError } from "./service";

const MAX_BODY_BYTES = 256 * 1024;

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Parses and validates a JSON body, runs the handler, and maps errors to the team format. */
export async function handleJson<T, R>(
  request: Request,
  schema: z.ZodType<T>,
  handler: (body: T) => Promise<R>,
) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return errorResponse(413, "too_large", "The request is too large.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return errorResponse(400, "invalid_json", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, "invalid_input", "Some fields are missing or invalid.");
  }
  try {
    return NextResponse.json(await handler(parsed.data));
  } catch (err) {
    if (err instanceof PracticeError) {
      return errorResponse(err.status, err.code, err.message);
    }
    return errorResponse(500, "internal", "Something went wrong. Please try again.");
  }
}
