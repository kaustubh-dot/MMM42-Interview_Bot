import type { IntegrityReport, IntegritySignal, InterviewRecord } from "@/types/pipeline";

// HARD CONSTRAINT: never output a binary "cheating: yes/no". The output is a
// concern level that prompts human review, and it never changes any score.
export const INTEGRITY_DISCLAIMER =
  "This is a concern level to prompt human review, not a cheating determination. Every signal has innocent explanations, and none of them affect the candidate's scores.";

function countPoints(value: number, threshold: number): number {
  return value >= threshold ? 2 : value > 0 ? 1 : 0;
}

/** Turn.startMs must be first-word speech time, never the Submit button timestamp. */
export function responseLatencies(record: InterviewRecord): number[] {
  const delays: number[] = [];
  for (let i = 1; i < record.turns.length; i += 1) {
    const turn = record.turns[i];
    const question = record.turns[i - 1];
    if (
      turn.speaker === "candidate" &&
      turn.text.trim().length > 0 &&
      question.speaker === "ai" &&
      question.claimId === turn.claimId &&
      question.rung === turn.rung &&
      Number.isFinite(turn.startMs) &&
      Number.isFinite(question.endMs) &&
      turn.startMs >= 0 &&
      question.endMs >= 0 &&
      turn.startMs >= question.endMs &&
      Number.isFinite(turn.endMs) &&
      turn.endMs >= turn.startMs
    ) {
      delays.push(turn.startMs - question.endMs);
    }
  }
  return delays;
}

/** Pure fusion: no access to evaluation and no score mutation, regardless of event changes. */
export function fuseIntegrity(
  record: InterviewRecord,
  faceSignals: { available: boolean; reason?: string },
): IntegrityReport {
  const count = (kind: string, minimumDuration?: number) =>
    record.integrityEvents.filter(
      (event) =>
        event.kind === kind &&
        Number.isFinite(event.atMs) &&
        event.atMs >= 0 &&
        // Capture emits only sustained face events. If a duration is supplied,
        // independently enforce the strict > threshold before counting it.
        (minimumDuration === undefined ||
          event.durationMs === undefined ||
          (Number.isFinite(event.durationMs) && event.durationMs > minimumDuration)),
    ).length;
  const faceAvailable =
    faceSignals.available &&
    !record.integrityEvents.some((event) => event.kind === "faceSignalsUnavailable");
  const definitions = [
    {
      name: "Tab or window switches",
      value: count("tabBlur"),
      threshold: 2,
      face: false,
      benignExplanations: [
        "A notification or another app took focus.",
        "Candidate checked the time or muted another tab.",
      ],
    },
    {
      name: "Paste events",
      value: count("paste"),
      threshold: 1,
      face: false,
      benignExplanations: [
        "Pasting a code fix drafted in the same session.",
        "Accidental keyboard shortcut.",
      ],
    },
    {
      name: "Looking away > 12s",
      value: count("lookAway", 12000),
      threshold: 2,
      face: true,
      benignExplanations: [
        "Thinking while looking away is normal.",
        "Second monitor, or notes the candidate was allowed.",
      ],
    },
    {
      name: "Face not visible > 3s",
      value: count("faceMissing", 3000),
      threshold: 2,
      face: true,
      benignExplanations: [
        "Poor lighting or the camera shifted.",
        "Candidate leaned out of frame.",
      ],
    },
    {
      name: "More than one face > 1.5s",
      value: count("multipleFaces", 1500),
      threshold: 1,
      face: true,
      benignExplanations: [
        "Someone walked past in a shared space.",
        "A photo or poster behind the candidate.",
      ],
    },
  ];
  const signals: IntegritySignal[] = definitions.map(({ face, ...signal }) => {
    const available = face ? faceAvailable : true;
    return {
      ...signal,
      unit: "count",
      available,
      points: available ? countPoints(signal.value, signal.threshold) : 0,
    };
  });

  const delays = responseLatencies(record);
  const mean = delays.length ? delays.reduce((sum, value) => sum + value, 0) / delays.length : 0;
  const variance = delays.length
    ? delays.reduce((sum, value) => sum + (value - mean) ** 2, 0) / delays.length
    : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const available = delays.length >= 4 && mean > 0 && Number.isFinite(cv);
  signals.push({
    name: "Response-latency uniformity (coefficient of variation)",
    value: Math.round(cv * 100) / 100,
    unit: "cv",
    threshold: 0.15,
    available,
    // Compare the full precision CV, so rounding does not move the 0.15 boundary.
    points: available && cv < 0.15 ? 2 : 0,
    benignExplanations: [
      "Some people answer at a steady pace.",
      "Short, similar questions invite similar pauses.",
    ],
  });
  const totalPoints = signals.reduce((sum, signal) => sum + signal.points, 0);
  return {
    level: totalPoints >= 6 ? "High" : totalPoints >= 3 ? "Medium" : "Low",
    totalPoints,
    signals,
    disclaimer: INTEGRITY_DISCLAIMER,
  };
}
