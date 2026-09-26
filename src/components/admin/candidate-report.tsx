"use client";

import { ReportLoader } from "@/components/pipeline/report/report-loader";
import { ReportView } from "@/components/pipeline/report/report-view";
import { NbLinkButton } from "@/components/pipeline/ui";
import Link from "next/link";
import { useAdmin } from "./admin-store";

/** The full cited report for a scheduled candidate, from the cache when the server lost it. */
export function CandidateReport({ candidateId }: { candidateId: string }) {
  const { state, reports } = useAdmin();
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    return (
      <section className="nb-card mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-black">Candidate not found</h1>
        <NbLinkButton href="/admin">Back to overview</NbLinkButton>
      </section>
    );
  }
  const cached = reports[candidate.interviewId];
  return (
    <div className="-mx-4 space-y-2 md:-mx-6">
      <p className="px-4 md:px-6">
        <Link href={`/admin/candidates/${candidate.id}`} className="nb-link text-sm font-bold">
          ← {candidate.name}: summary, follow-up questions and decision
        </Link>
      </p>
      {cached ? (
        <ReportView report={cached} fixture={candidate.kind === "sample"} />
      ) : (
        <ReportLoader interviewId={candidate.interviewId} />
      )}
    </div>
  );
}
