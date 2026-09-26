import { handleJson } from "@/lib/practice/route-helpers";
import { getHelp, helpRequestSchema } from "@/lib/practice/service";

// DSA practice (C, flagged for A's review): tutor help. Code is reasoned about, never run.
export async function POST(request: Request) {
  return handleJson(request, helpRequestSchema, getHelp);
}
