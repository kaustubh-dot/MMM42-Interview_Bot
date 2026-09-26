import { InviteInterview } from "@/components/invite/invite-interview";
import { clientGoldenReport } from "@/fixtures/client-golden-interview";

type Props = {
  params: Promise<{ interviewId: string }>;
  searchParams: Promise<{ at?: string | string[] }>;
};

// Candidate link from the recruiter console. `at` is the scheduled time (ISO); the page opens a
// few minutes before it. The sample is the browser-safe fixture used for demo attempts.
export default async function InvitePage({ params, searchParams }: Props) {
  const { interviewId } = await params;
  const { at } = await searchParams;
  return (
    <InviteInterview
      interviewId={decodeURIComponent(interviewId)}
      at={typeof at === "string" ? at : null}
      sample={clientGoldenReport}
    />
  );
}
