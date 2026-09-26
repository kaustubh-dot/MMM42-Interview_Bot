import { INTERVIEWERS, RETELL_AGENT_GENERAL_PROMPT } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import Retell from "retell-sdk";

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY || "",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

const createInterviewerServer = async (payload: any) => {
  const { data: existingInterviewer, error: checkError } = await supabase
    .from("interviewer")
    .select("*")
    .eq("name", payload.name)
    .filter("agent_id", "eq", payload.agent_id)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    logger.error(`Error checking existing interviewer: ${JSON.stringify(checkError)}`);
    return null;
  }
  if (existingInterviewer) {
    logger.error("An interviewer with this name already exists");
    return null;
  }
  const { error, data } = await supabase
    .from("interviewer")
    .insert({ ...payload })
    .select()
    .single();
  if (error) {
    logger.error(`Error creating interviewer: ${JSON.stringify(error)}`);
    return null;
  }
  return data;
};

export async function GET(res: NextRequest) {
  logger.info("create-interviewer request received");

  try {
    const newModel = await retellClient.llm.create({
      model: "gpt-4o",
      general_prompt: RETELL_AGENT_GENERAL_PROMPT,
      general_tools: [
        {
          type: "end_call",
          name: "end_call_1",
          description:
            "End the call if the user uses goodbye phrases such as 'bye,' 'goodbye,' or 'have a nice day.' ",
        },
      ],
    });

    // Create Lisa
    const newFirstAgent = await retellClient.agent.create({
      response_engine: { llm_id: newModel.llm_id, type: "retell-llm" },
      voice_id: "11labs-Chloe",
      agent_name: "Lisa",
    });

    const newInterviewer = await createInterviewerServer({
      agent_id: newFirstAgent.agent_id,
      ...INTERVIEWERS.LISA,
    });

    // Create Bob
    const newSecondAgent = await retellClient.agent.create({
      response_engine: { llm_id: newModel.llm_id, type: "retell-llm" },
      voice_id: "11labs-Brian",
      agent_name: "Bob",
    });

    const newSecondInterviewer = await createInterviewerServer({
      agent_id: newSecondAgent.agent_id,
      ...INTERVIEWERS.BOB,
    });

    logger.info("");

    return NextResponse.json(
      {
        newInterviewer,
        newSecondInterviewer,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("Error creating interviewers:");

    return NextResponse.json({ error: "Failed to create interviewers" }, { status: 500 });
  }
}
