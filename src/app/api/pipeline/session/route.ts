import { errorResponse, jsonResponse } from "../../../../lib/pipeline/http";
import { readSession } from "../../../../lib/pipeline/turn-service";

export async function GET(request: Request): Promise<Response> {
  try {
    const interviewId = new URL(request.url).searchParams.get("interviewId");
    return jsonResponse(await readSession(interviewId ?? ""));
  } catch (error) {
    return errorResponse(error);
  }
}
