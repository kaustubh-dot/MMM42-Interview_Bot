import { ScheduleForm } from "@/components/admin/schedule-form";

type Props = { searchParams: Promise<{ job?: string | string[] }> };

export default async function AdminSchedulePage({ searchParams }: Props) {
  const { job } = await searchParams;
  return <ScheduleForm initialJobId={typeof job === "string" ? job : undefined} />;
}
