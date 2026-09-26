import { CandidateDetail } from "@/components/admin/candidate-detail";

type Props = { params: Promise<{ candidateId: string }> };

export default async function AdminCandidatePage({ params }: Props) {
  const { candidateId } = await params;
  return <CandidateDetail candidateId={decodeURIComponent(candidateId)} />;
}
