import { ReportLoader } from "@/components/pipeline/report/report-loader";
import { ReportView } from "@/components/pipeline/report/report-view";
import { WorkspaceSamplesView } from "@/components/pipeline/report/workspace-samples-view";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";
import { workspaceExamples } from "@/fixtures/workspace-interview";

type Props = { params: Promise<{ interviewId: string }> };

// Recruiter report. "sample" (or the golden interview ID) renders the labeled safe fixture,
// "workspace-samples" renders A's standalone code/whiteboard submission examples, and any other
// ID loads the saved live report from A's report route.
export default async function ReportPage({ params }: Props) {
  const { interviewId } = await params;
  const id = decodeURIComponent(interviewId);
  if (id === "sample" || id === clientGoldenReport.record.plan.interviewId) {
    return <ReportView report={clientGoldenReport} fixture />;
  }
  if (id === "workspace-samples") {
    return <WorkspaceSamplesView examples={workspaceExamples} />;
  }
  return <ReportLoader interviewId={id} />;
}
