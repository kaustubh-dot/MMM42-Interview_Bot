import { ReportLoader } from "@/components/pipeline/report/report-loader";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ interviewId: string }> };

// Reports are available only for actual interview attempts.
export default async function ReportPage({ params }: Props) {
  const { interviewId } = await params;
  const id = interviewId;
  if (["sample", "golden-sample-001", "workspace-samples"].includes(id)) {
    notFound();
  }
  return <ReportLoader interviewId={id} />;
}
