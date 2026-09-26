import { JobDetail } from "@/components/admin/job-detail";

type Props = { params: Promise<{ jobId: string }> };

export default async function AdminJobPage({ params }: Props) {
  const { jobId } = await params;
  return <JobDetail jobId={decodeURIComponent(jobId)} />;
}
