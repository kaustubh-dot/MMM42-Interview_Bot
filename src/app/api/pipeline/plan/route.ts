import { PipelineError } from "../../../../lib/pipeline/errors";
import { errorResponse, jsonResponse } from "../../../../lib/pipeline/http";
import { createPlannedAttempt } from "../../../../lib/pipeline/plan";

export const runtime = "nodejs";

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
    return jsonResponse(await createPlannedAttempt(form));
  } catch (error) {
    return errorResponse(error);
  }
}
