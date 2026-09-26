import type { AnswerArtifact } from "../types/pipeline";
import type { ClientInterviewRecord } from "../types/pipeline-api";

// Browser-safe examples, independent of the golden report. No automatic artifact scores.
const code = "SELECT customer_id, COUNT(*) AS order_count\nFROM orders\nGROUP BY customer_id;";
const shape = {
  id: "service",
  type: "rectangle",
  x: 100,
  y: 100,
  width: 240,
  height: 100,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: { type: 3 },
  seed: 101,
  version: 1,
  versionNonce: 201,
  isDeleted: false,
  boundElements: [],
  updated: 0,
  link: null,
  locked: false,
};
const sceneJson = JSON.stringify({
  elements: [
    shape,
    {
      ...shape,
      id: "label",
      type: "text",
      x: 140,
      y: 137,
      width: 160,
      height: 25,
      roundness: null,
      seed: 102,
      versionNonce: 202,
      fontSize: 20,
      fontFamily: 1,
      text: "Interview API",
      originalText: "Interview API",
      textAlign: "center",
      verticalAlign: "top",
      containerId: null,
      autoResize: true,
      lineHeight: 1.25,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
});

export interface WorkspaceExample {
  label: string;
  kind: "code" | "whiteboard";
  record: ClientInterviewRecord;
}

function example(kind: "code" | "whiteboard"): WorkspaceExample {
  const prompt =
    kind === "code"
      ? "Fix the query so each customer has one order count, and explain the grouping."
      : "Draw the interview API and describe how you would add durable session storage.";
  const artifact: AnswerArtifact =
    kind === "code" ? { kind: "code", language: "sql", code } : { kind: "whiteboard", sceneJson };
  return {
    label: `Sample ${kind} submission — supporting artifact for human review`,
    kind,
    record: {
      plan: {
        interviewId: `workspace-${kind}-sample`,
        roleTitle: "Backend Engineer",
        maxQuestions: 4,
        rubric: [
          { grade: 0, label: "No evidence", anchor: "No relevant spoken evidence." },
          { grade: 1, label: "Surface", anchor: "Names tools without explaining a mechanism." },
          { grade: 2, label: "Working", anchor: "Correct mechanism and a concrete detail." },
          {
            grade: 3,
            label: "Deep",
            anchor: "First-hand mechanism, trade-offs and failure modes, unprompted.",
          },
        ],
        claims: [
          {
            id: "workspace-claim",
            skillArea: kind === "code" ? "SQL" : "System design",
            isTechnical: true,
            claimText: "Built an interview reporting API.",
            resumeEvidence: "Built an interview reporting API.",
            jdRequirement: "Design APIs and query relational data.",
            jdWeight: 1,
            specificity: 0.5,
            rank: 1,
            ladder: {
              fundamental: "What responsibility does an API endpoint have?",
              initial: "How did your interview reporting API store each candidate's answers?",
              termFollowUpTemplate: "How did {{term}} work in your reporting API?",
              scenarioTwist: prompt,
              whyDefenseTemplate: "You said {{quote}}. What trade-off did that introduce?",
              workspace: kind === "code" ? { kind: "code" } : { kind: "whiteboard", prompt },
              ...(kind === "code" && {
                codeSnippet: {
                  language: "sql",
                  code: "SELECT customer_id, COUNT(*) AS order_count FROM orders;",
                },
              }),
            },
          },
        ],
      },
      candidateLabel: "Sample Candidate",
      startedAt: "2026-09-26T00:00:00.000Z",
      // Isolated workspace examples, not a full scored adaptive interview.
      turns: [
        {
          id: "t01",
          speaker: "ai",
          text: prompt,
          startMs: 0,
          endMs: 3000,
          claimId: "workspace-claim",
          rung: "scenarioTwist",
        },
        {
          id: "t02",
          speaker: "candidate",
          text:
            kind === "code"
              ? "Grouping by customer gives one count per customer rather than one total."
              : "The API saves accepted answers in durable storage before returning success.",
          startMs: 4500,
          endMs: 12000,
          claimId: "workspace-claim",
          rung: "scenarioTwist",
          ...(kind === "code" && { typedAnswer: code }),
          artifacts: [artifact],
        },
      ],
      decisions: [],
      integrityEvents: [
        { kind: "faceSignalsUnavailable", atMs: 0, detail: "Static workspace example." },
      ],
    },
  };
}

export const workspaceExamples: WorkspaceExample[] = [example("code"), example("whiteboard")];
