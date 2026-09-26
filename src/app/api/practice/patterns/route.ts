import { handleJson } from "@/lib/practice/route-helpers";
import { getPatterns, patternsRequestSchema } from "@/lib/practice/service";

// DSA practice (C, flagged for A's review): patterns for a topic.
export async function POST(request: Request) {
  return handleJson(request, patternsRequestSchema, (body) => getPatterns(body.topic));
}
