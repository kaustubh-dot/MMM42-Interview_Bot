// Recruiter console records. These live in the recruiter's browser (see admin-store.ts) and only
// reference pipeline attempts by interviewId; the shared pipeline contract is unchanged.

/** Where the candidate is in the AI interview, as last reported by the pipeline session API. */
export type InterviewStatus = "scheduled" | "in_progress" | "completed" | "unavailable";

/** The recruiter's own call. The console never makes it automatically. */
export type HiringDecision = "undecided" | "advance" | "hold" | "reject";

/**
 * live:   plan generated from an uploaded resume + the job description (Gemini mode).
 * demo:   the server's labeled mock attempt on the sample resume (LLM_MODE=mock).
 * sample: the recorded golden interview, bundled with the app.
 */
export type CandidateKind = "live" | "demo" | "sample";

export interface AdminJob {
  id: string;
  title: string;
  jdText: string;
  createdAt: string; // ISO
}

export interface AdminCandidate {
  id: string;
  jobId: string;
  name: string; // shown to the recruiter only; never sent to the scoring pipeline
  email: string;
  scheduledAt: string; // ISO
  durationMin: number;
  interviewId: string;
  kind: CandidateKind;
  status: InterviewStatus;
  statusNote?: string;
  decision: HiringDecision;
  notes: string;
  createdAt: string; // ISO
}

export interface AdminState {
  version: 1;
  jobs: AdminJob[];
  candidates: AdminCandidate[];
}
