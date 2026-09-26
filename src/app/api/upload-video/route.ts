import { logger } from "@/lib/logger";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Use service role key if available, otherwise anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const callId = formData.get("callId") as string | null;

    if (!file || !callId) {
      return NextResponse.json({ error: "Missing file or callId" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `recordings/${callId}.webm`;

    const { error: uploadError } = await supabase.storage
      .from("interview-recordings")
      .upload(fileName, buffer, { contentType: "video/webm", upsert: true });

    if (uploadError) {
      logger.error(`Storage upload error: ${JSON.stringify(uploadError)}`);
      return NextResponse.json({ error: "Upload failed", details: uploadError }, { status: 500 });
    }

    const { data } = supabase.storage.from("interview-recordings").getPublicUrl(fileName);
    const publicUrl = data.publicUrl;

    // Save url to response row
    const { error: updateError } = await supabase
      .from("response")
      .update({ video_url: publicUrl })
      .eq("call_id", callId);

    if (updateError) {
      logger.error(`DB update error: ${JSON.stringify(updateError)}`);
    }

    return NextResponse.json({ url: publicUrl }, { status: 200 });
  } catch (error) {
    logger.error(`Upload video error: ${String(error)}`);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
