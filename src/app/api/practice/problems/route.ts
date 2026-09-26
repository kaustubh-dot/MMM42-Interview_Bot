import { handleJson } from "@/lib/practice/route-helpers";
import { createProblemSet, problemSetRequestSchema } from "@/lib/practice/service";

// DSA practice (C, flagged for A's review): builds a problem set. Nothing is scored or stored.
export async function POST(request: Request) {
  return handleJson(request, problemSetRequestSchema, createProblemSet);
}
