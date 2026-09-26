import { CandidateReport } from "@/components/admin/candidate-report";

type Props = { params: Promise<{ candidateId: string }> };

export default async function AdminCandidateReportPage({ params }: Props) {
  const { candidateId } = await params;
  return <CandidateReport candidateId={decodeURIComponent(candidateId)} />;
}
