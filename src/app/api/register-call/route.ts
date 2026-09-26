import { logger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Retell from "retell-sdk";

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY || "",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function POST(req: Request) {
  logger.info("register-call request received");

  const body = await req.json();

  const interviewerId = body.interviewer_id;
  const { data: interviewer } = await supabase
    .from("interviewer")
    .select("*")
    .eq("id", interviewerId)
    .single();

  const registerCallResponse = await retellClient.call.createWebCall({
    agent_id: interviewer?.agent_id,
    retell_llm_dynamic_variables: body.dynamic_data,
  });

  logger.info("Call registered successfully");

  return NextResponse.json(
    {
      registerCallResponse,
    },
    { status: 200 },
  );
}
