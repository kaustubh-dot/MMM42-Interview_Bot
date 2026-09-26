import { InterviewApp } from "@/components/pipeline/interview-app";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";

type Props = { searchParams: Promise<{ role?: string | string[] }> };

// The sample is A's generated browser-safe fixture (no hidden answers). `?role=<interview.id>`
// comes from the dashboard's "AI interview link" and files the saved response under that role.
export default async function InterviewPage({ searchParams }: Props) {
  const { role } = await searchParams;
  return (
    <InterviewApp
      liveAi={process.env.LLM_MODE === "groq" || process.env.LLM_MODE === "gemini"}
      sample={clientGoldenReport}
      roleId={typeof role === "string" && role ? role : undefined}
    />
  );
}
