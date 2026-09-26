"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PipelineApiError, generateReport, loadReport } from "../api-client";
import type { ClientInterviewReport } from "../contract";
import { NbButton, NbLinkButton } from "../ui";
import { ReportView } from "./report-view";

type State =
  | { kind: "loading"; generating: boolean }
  | { kind: "ready"; report: ClientInterviewReport }
  | { kind: "error"; message: string };

/** Loads a saved live report; generates it once if none is stored yet. */
export function ReportLoader({ interviewId }: { interviewId: string }) {
  const [state, setState] = useState<State>({ kind: "loading", generating: false });

  const load = useCallback(async () => {
    setState({ kind: "loading", generating: false });
    try {
      setState({ kind: "ready", report: await loadReport(interviewId) });
    } catch (err) {
      const apiErr = err instanceof PipelineApiError ? err : null;
      // A stored report is missing (JSON 404 from A's route): generate it. The server reuses a
      // completed report on retry, so this does not repeat the auditor call.
      if (apiErr?.status === 404 && apiErr.code !== "not_found_route") {
        setState({ kind: "loading", generating: true });
        try {
          setState({ kind: "ready", report: await generateReport(interviewId) });
          return;
        } catch (genErr) {
          setState({
            kind: "error",
            message: genErr instanceof Error ? genErr.message : "Report generation failed.",
          });
          return;
        }
      }
      setState({ kind: "error", message: apiErr?.message ?? "Could not load the report." });
    }
  }, [interviewId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "ready") {
    return <ReportView report={state.report} fixture={false} />;
  }
  if (state.kind === "loading") {
    return (
      <div className="nb-card mx-auto my-16 flex max-w-xl items-center justify-center gap-3 p-8 font-medium">
        <Loader2 className="h-4 w-4 animate-spin" />
        {state.generating ? "Generating the evaluation and audit..." : "Loading report..."}
      </div>
    );
  }
  return (
    <div role="alert" className="nb-card mx-auto my-16 max-w-xl space-y-3 p-6">
      <p className="text-xl font-black">This report isn't available yet.</p>
      <p className="text-gray-700">{state.message}</p>
      <div className="mt-3 flex gap-3">
        <NbButton variant="primary" onClick={load}>
          Try again
        </NbButton>
        <NbLinkButton href="/interview">Back to interviews</NbLinkButton>
      </div>
    </div>
  );
}
