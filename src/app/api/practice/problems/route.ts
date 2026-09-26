import { handleJson } from "@/lib/practice/route-helpers";
import { createSet, setRequestSchema } from "@/lib/practice/service";

// Practice (C, flagged for A's review): a coding or SQL set from the open-source datasets.
export async function POST(request: Request) {
  return handleJson(request, setRequestSchema, async (body) => createSet(body));
}
