import { generateSpeech } from "../../../../lib/llm";
import { PipelineError } from "../../../../lib/pipeline/errors";
import { errorResponse, readJson } from "../../../../lib/pipeline/http";

export const runtime = "nodejs";

// Best-effort natural-voice narration for the interviewer's spoken questions. A 503 here is
// expected and routine (feature off, terms not yet accepted, rate limited) -- the client always
// falls back to the browser's built-in voice, so this never blocks the interview.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const text =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>).text : null;
    if (typeof text !== "string" || !text.trim() || text.length > 2000) {
      throw new PipelineError(
        "INVALID_INPUT",
        "text must be a nonempty string up to 2000 characters.",
        400,
      );
    }
    const speech = await generateSpeech(text.trim());
    if (!speech) {
      throw new PipelineError(
        "TTS_UNAVAILABLE",
        "Natural voice is not available right now. Use the browser voice.",
        503,
      );
    }
    return new Response(speech.audio, {
      status: 200,
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
