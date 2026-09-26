import { InterviewApp } from "@/components/pipeline/interview-app";
import { getSampleReport } from "../sample-data";

// Server component: the sample is sanitized here, so hidden answers never reach the browser.
export default function InterviewPage() {
  return <InterviewApp sample={getSampleReport()} />;
}
