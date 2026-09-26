import type {
  AnswerArtifact,
  Claim,
  CodeSnippet,
  Decision,
  Grade,
  IntegrityEvent,
  InterviewPlan,
  InterviewRecord,
  InterviewReport,
  QuestionLadder,
  RubricLevel,
  Turn,
} from "./pipeline";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LlmRequest {
  task: "plan" | "grade" | "evaluate" | "audit" | "practice"; // practice: C's DSA practice (flagged for A)
  system: string;
  input: JsonValue;
  mockOutput: JsonValue;
}

export interface GradeResult {
  grade: Grade;
  term: string | null;
  quote: string | null;
}

export interface GradeInput {
  rubric: RubricLevel[];
  claimId: string;
  questionText: string;
  answerText: string;
}

export interface FaceSignalAvailability {
  available: boolean;
  reason?: string;
}

export type ClientCodeSnippet = Omit<CodeSnippet, "plantedIssue">;
export type ClientClaim = Omit<Claim, "ladder"> & {
  ladder: Omit<QuestionLadder, "codeSnippet"> & { codeSnippet?: ClientCodeSnippet };
};
export type ClientInterviewPlan = Omit<InterviewPlan, "claims"> & { claims: ClientClaim[] };
export type ClientInterviewRecord = Omit<InterviewRecord, "plan"> & { plan: ClientInterviewPlan };
export type ClientInterviewReport = Omit<InterviewReport, "record"> & {
  record: ClientInterviewRecord;
};

export interface StartRequest {
  interviewId: string;
  requestId: string;
  roleId?: string; // optional FoloUp interview (role) ID; links the stored response row
}

export interface SubmitTurnRequest {
  interviewId: string;
  requestId: string;
  expectedTurnId: string;
  text: string;
  startMs: number;
  endMs: number;
  artifacts?: AnswerArtifact[];
  integrityEvents: IntegrityEvent[];
  faceSignals: FaceSignalAvailability;
}

export interface TurnReply {
  record: ClientInterviewRecord;
  nextQuestion: Turn | null;
  decision: Decision;
  finished: boolean;
}

// Server-only session envelope. Never return this object directly to the browser.
export interface SavedSession {
  record: InterviewRecord;
  lastRequestId: string | null;
  lastReply: TurnReply | null;
  finished: boolean;
  faceSignals: FaceSignalAvailability;
}

export interface PipelineErrorResponse {
  error: { code: string; message: string };
}
