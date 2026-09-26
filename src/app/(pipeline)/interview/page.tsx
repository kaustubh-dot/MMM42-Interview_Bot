import { InterviewApp } from "@/components/pipeline/interview-app";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";

// The sample is A's generated browser-safe fixture (no hidden answers).
export default function InterviewPage() {
  return <InterviewApp sample={clientGoldenReport} />;
}
