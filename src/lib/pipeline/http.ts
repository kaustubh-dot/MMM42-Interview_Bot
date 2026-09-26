import "server-only";

import { PipelineError } from "./errors";
import { storageMode } from "./session-store";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new PipelineError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Pipeline-Mode": process.env.LLM_MODE === "mock" ? "mock" : "gemini",
      "X-Pipeline-Storage": storageMode,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PipelineError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
  }
  // Model/provider failures are retryable. Do not return provider payloads or candidate data.
  return jsonResponse(
    {
      error: {
        code: "UPSTREAM_FAILURE",
        message: "The operation could not be processed. Retry it.",
      },
    },
    502,
  );
}
