import { handleJson } from "@/lib/practice/route-helpers";
import { getHelp, helpRequestSchema } from "@/lib/practice/service";

// Practice (C, flagged for A's review): tutor help for coding, SQL and design. Nothing is run.
export async function POST(request: Request) {
  return handleJson(request, helpRequestSchema, getHelp);
}
