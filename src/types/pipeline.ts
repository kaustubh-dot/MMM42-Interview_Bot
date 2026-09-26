// Shared data contract between the four pillars. See CLAUDE.md "Data contract".
// Changing any type here affects more than one workstream: agree with the team first.

// ---------- Pillar 1 -> Pillar 2 ----------

export type Rung = "fundamental" | "initial" | "termFollowUp" | "scenarioTwist" | "whyDefense";

// Order used by the selection rule when a strong answer climbs a rung.
export const RUNG_ORDER: Rung[] = ["initial", "termFollowUp", "scenarioTwist", "whyDefense"];

export interface CodeSnippet {
  language: string;
  code: string;
  plantedIssue: string; // server-side reference only; excluded from client projections
}

export type QuestionWorkspace = { kind: "code" } | { kind: "whiteboard"; prompt: string };

// Supporting artifacts for human review; citations remain offsets into Turn.text.
export type AnswerArtifact =
  | { kind: "code"; language: string; code: string }
  | { kind: "whiteboard"; sceneJson: string };

export interface QuestionLadder {
  fundamental: string;
  initial: string;
  // Templates may contain {{term}} (a term the candidate used) or {{quote}} (their earlier words).
  termFollowUpTemplate: string;
  scenarioTwist: string;
  whyDefenseTemplate: string;
  codeSnippet?: CodeSnippet; // only for technical claims; shown on the scenarioTwist rung
  workspace?: QuestionWorkspace; // absent + codeSnippet retains the legacy code workspace
}

export interface Claim {
  id: string; // "c1"
  skillArea: string;
  isTechnical: boolean;
  claimText: string;
  resumeEvidence: string; // verbatim excerpt from resume
  jdRequirement: string; // verbatim excerpt from JD
  jdWeight: number; // 0-1, how much the JD needs this
  specificity: number; // 0-1, how concrete the resume claim is
  rank: number; // 1 = probe first; sorted by jdWeight * (1 - specificity)
  ladder: QuestionLadder;
}

export type Grade = 0 | 1 | 2 | 3;

export interface RubricLevel {
  grade: Grade;
  label: string;
  anchor: string; // what an answer at this level looks like
}

export interface InterviewPlan {
  interviewId: string;
  roleTitle: string;
  claims: Claim[];
  rubric: RubricLevel[];
  maxQuestions: number;
}

// ---------- Pillar 2 (engine) ----------

export type ReasonCode =
  | "OPENING_TOP_RANKED_CLAIM"
  | "STRONG_DEEPEN"
  | "WEAK_FUNDAMENTAL"
  | "AREA_BUDGET_EXHAUSTED"
  | "REPEATED_WEAK_MOVE_ON"
  | "LADDER_COMPLETE_NEXT_CLAIM"
  | "NEXT_RANKED_CLAIM"
  | "TIME_UP";

export interface Turn {
  id: string; // "t01"; stable, used by citations
  speaker: "ai" | "candidate";
  text: string;
  startMs: number; // ms since interview start
  endMs: number;
  claimId: string;
  rung: Rung;
  typedAnswer?: string; // code-reasoning rung only
  artifacts?: AnswerArtifact[]; // at most one per candidate turn; validated by the turn API
}

export interface AreaState {
  claimId: string;
  asked: number;
  grades: Grade[];
  consecutiveWeak: number;
  currentRung: Rung;
  ladderRung: Rung; // highest RUNG_ORDER rung reached; a strong answer on "fundamental" resumes above it
  usedFundamental: boolean;
}

// Selection rule constants (CLAUDE.md "Selection rule"). Changing these changes the demo narrative.
export const STRONG_GRADE_MIN = 2;
export const AREA_QUESTION_BUDGET = 4;
export const MAX_CONSECUTIVE_WEAK = 2;

export interface Decision {
  turnId: string; // the AI turn this decision produced
  claimId: string;
  lastGrade: Grade | null; // grade of the preceding candidate answer
  gradedTurnId: string | null;
  reason: ReasonCode;
  fromRung: Rung | null;
  toRung: Rung;
  areaState: AreaState;
}

// ---------- Pillar 4 capture ----------

export type IntegrityEventKind =
  | "tabBlur"
  | "tabFocus"
  | "paste"
  | "faceMissing"
  | "multipleFaces"
  | "lookAway"
  | "faceSignalsUnavailable";

export interface IntegrityEvent {
  kind: IntegrityEventKind;
  atMs: number;
  durationMs?: number;
  turnId?: string;
  detail?: string;
}

// ---------- Pillar 2/4 -> Pillar 3 ----------

export interface ChainEntry {
  seq: number;
  kind: "turn" | "decision" | "evaluation";
  refId: string;
  prevHash: string;
  entryHash: string; // sha256("v1|prevHash|seq|kind|refId|canonical_json(payload)")
}

export interface InterviewRecord {
  plan: InterviewPlan;
  candidateLabel: string; // redacted label, never the real name, e.g. "Candidate A"
  startedAt: string; // ISO
  turns: Turn[];
  decisions: Decision[];
  integrityEvents: IntegrityEvent[];
  chain?: ChainEntry[];
}

// ---------- Pillar 3 output ----------

export interface Citation {
  turnId: string;
  start: number; // char offset into turn.text
  end: number; // exclusive
  quote: string; // must equal turn.text.slice(start, end), enforced in code
}

export interface ClaimEvaluation {
  claimId: string;
  score: Grade;
  evidenceStrength: "strong" | "mixed" | "thin";
  needsHumanReview: boolean;
  citations: Citation[]; // never empty; uncited scores are removed by the validator
  rationale: string;
  ladderPath: Rung[];
}

export interface EvaluationNote {
  kind: "dropOff";
  claimId: string;
  turnIds: string[];
  text: string;
}

export interface CandidateFeedbackItem {
  claimId: string;
  strength: string;
  nextStep: string;
  citation: Citation;
}

export interface Evaluation {
  perClaim: ClaimEvaluation[];
  notes: EvaluationNote[];
  removedUncited: number;
  candidateFeedback?: CandidateFeedbackItem[];
}

export interface AuditFinding {
  text: string;
  turnIds: string[];
}

export interface AuditCheck {
  id: 1 | 2 | 3; // 1 leading/unfair questions, 2 inconsistent scoring, 3 keyword/phrasing bias
  title: string;
  status: "pass" | "concern";
  findings: AuditFinding[];
}

export interface CounterfactualResult {
  turnId: string;
  originalScore: Grade;
  rephrasedScore: Grade; // jargon replaced with plain wording, same substance
  placeboScore: Grade; // meaningless edit; sets the noise floor
}

export interface Audit {
  checks: AuditCheck[];
  counterfactual?: CounterfactualResult[]; // precomputed sample only
  precomputed: boolean;
}

// ---------- Pillar 4 output ----------
// HARD CONSTRAINT: this is a concern level that prompts human review.
// It is never a binary cheating verdict, and it never changes any score.

export type ConcernLevel = "Low" | "Medium" | "High";

export interface IntegritySignal {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  points: number;
  available: boolean; // missing signals contribute 0 points, never raise concern
  benignExplanations: string[];
}

export interface IntegrityReport {
  level: ConcernLevel;
  totalPoints: number;
  signals: IntegritySignal[];
  disclaimer: string;
}

// ---------- Full report (what the recruiter UI renders) ----------

export interface InterviewReport {
  record: InterviewRecord;
  evaluation: Evaluation;
  audit: Audit;
  integrity: IntegrityReport;
}
