import "server-only";

import { PipelineError } from "./errors";

const headers = { "Cache-Control": "no-store", "X-Pipeline-Mode": "mock" };

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new PipelineError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PipelineError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
  }
  // Model/provider failures are retryable. Do not return provider payloads or candidate data.
  return jsonResponse(
    { error: { code: "UPSTREAM_FAILURE", message: "The turn could not be processed. Retry it." } },
    502,
  );
}
