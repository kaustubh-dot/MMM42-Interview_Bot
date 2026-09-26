import { PipelineError } from "../../../../lib/pipeline/errors";
import { errorResponse, jsonResponse } from "../../../../lib/pipeline/http";
import { createPlannedAttempt } from "../../../../lib/pipeline/plan";

import { NAME_COOKIE } from "../../../../lib/auth/session";

export const runtime = "nodejs";

function cookieValue(request: Request, name: string): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new PipelineError(
        "INVALID_INPUT",
        "Use multipart form data with resume and jdText or jd.",
        400,
      );
    }
    // A signed-in candidate's name is stored on the response row only, never in the scored record.
    const signedInName = cookieValue(request, NAME_COOKIE);
    if (signedInName && !form.get("candidateName")) {
      form.set("candidateName", signedInName.slice(0, 200));
    }
    return jsonResponse(await createPlannedAttempt(form));
  } catch (error) {
    return errorResponse(error);
  }
}
