import { ReportLoader } from "@/components/pipeline/report/report-loader";
import { ReportView } from "@/components/pipeline/report/report-view";
import { SAMPLE_INTERVIEW_ID, getSampleReport } from "../../sample-data";

type Props = { params: Promise<{ interviewId: string }> };

// Recruiter report. "sample" (or the golden interview ID) renders the labeled, sanitized fixture;
// any other ID loads the saved live report from A's report route.
export default async function ReportPage({ params }: Props) {
  const { interviewId } = await params;
  const id = decodeURIComponent(interviewId);
  if (id === "sample" || id === SAMPLE_INTERVIEW_ID) {
    return <ReportView report={getSampleReport()} fixture />;
  }
  return <ReportLoader interviewId={id} />;
}
