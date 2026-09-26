import { errorResponse, jsonResponse, readJson } from "../../../../lib/pipeline/http";
import { submitCandidateTurn } from "../../../../lib/pipeline/turn-service";

export async function POST(request: Request): Promise<Response> {
  try {
    return jsonResponse(await submitCandidateTurn(await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
