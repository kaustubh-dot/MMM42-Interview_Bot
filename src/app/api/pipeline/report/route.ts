import { errorResponse, jsonResponse, readJson } from "../../../../lib/pipeline/http";
import { generateReport, readReport } from "../../../../lib/pipeline/report";

export async function POST(request: Request): Promise<Response> {
  try {
    return jsonResponse(await generateReport(await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    return jsonResponse(
      await readReport(new URL(request.url).searchParams.get("interviewId") ?? ""),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
