// Pure recruiter-console insights built from a finished, browser-safe interview report:
// an evidence-weighted fit rule for ranking, and a follow-up guide for the human interviewer.
// Both are deterministic so the rule can be said out loud, like the selection rule.
//
// HARD REQUIREMENT: integrity output is a concern level that prompts human review. It is never
// a binary cheating verdict, and it never changes any score. It is shown beside the fit here and
// is never an input to it or to the ranking order.

import {
  type Citation,
  type ClaimEvaluation,
  type ConcernLevel,
  type Grade,
  RUNG_ORDER,
  type Rung,
} from "../../types/pipeline";
import type { ClientClaim, ClientInterviewReport } from "../../types/pipeline-api";
import { claimAssessmentStatuses } from "../pipeline/report-status";

export type TopicStatus = "assessed" | "no_supported_score" | "not_assessed";

export interface TopicFit {
  claimId: string;
  skillArea: string;
  rank: number;
  jdWeight: number;
  status: TopicStatus;
  score: Grade | null;
  evidenceStrength: ClaimEvaluation["evidenceStrength"] | null;
  needsHumanReview: boolean;
  quote: Citation | null;
}

export interface FitSummary {
  /** 0–1: Σ jdWeight × score/3 over every planned topic ÷ Σ jdWeight. Unscored topics add 0. */
  fit: number;
  /** 0–1: the JD-weighted share of topics that have a cited score. */
  coverage: number;
  topics: TopicFit[];
  assessed: number;
  needsReview: number;
  strongest: TopicFit | null;
  biggestGap: TopicFit | null;
  /** Shown beside the fit for human review only; never an input to fit or rank. */
  integrityLevel: ConcernLevel;
  auditConcerns: number;
}

/** "Fit" in one sentence, for the UI and exports. */
export const FIT_RULE =
  "Fit = each topic's cited score out of 3, weighted by how much the job needs that topic. Topics the interview did not reach count as zero, so coverage is shown next to it. Integrity notes never change the fit or the order.";

function topicWeights(claims: ClientClaim[]): Map<string, number> {
  const total = claims.reduce((sum, c) => sum + c.jdWeight, 0);
  // All-zero weights would make every fit 0/0: fall back to treating topics equally.
  return new Map(claims.map((c) => [c.id, total > 0 ? c.jdWeight : 1]));
}

export function fitSummary(report: ClientInterviewReport): FitSummary {
  const { plan } = report.record;
  const statuses = new Map(claimAssessmentStatuses(report).map((s) => [s.claimId, s.status]));
  const weights = topicWeights(plan.claims);
  const topics: TopicFit[] = [...plan.claims]
    .sort((a, b) => a.rank - b.rank)
    .map((claim) => {
      const evaluation = report.evaluation.perClaim.find((e) => e.claimId === claim.id);
      return {
        claimId: claim.id,
        skillArea: claim.skillArea,
        rank: claim.rank,
        jdWeight: claim.jdWeight,
        status: statuses.get(claim.id) ?? "not_assessed",
        score: evaluation?.score ?? null,
        evidenceStrength: evaluation?.evidenceStrength ?? null,
        needsHumanReview: evaluation?.needsHumanReview ?? false,
        quote: evaluation?.citations[0] ?? null,
      };
    });

  const weightOf = (t: TopicFit) => weights.get(t.claimId) ?? 0;
  const totalWeight = topics.reduce((sum, t) => sum + weightOf(t), 0);
  const scored = topics.filter((t) => t.score !== null);
  const earned = scored.reduce((sum, t) => sum + weightOf(t) * ((t.score ?? 0) / 3), 0);
  const covered = scored.reduce((sum, t) => sum + weightOf(t), 0);

  const byValue = (value: (t: TopicFit) => number) => (a: TopicFit, b: TopicFit) =>
    value(b) - value(a) || a.rank - b.rank;
  const strongest =
    [...scored]
      .filter((t) => (t.score ?? 0) >= 2)
      .sort(byValue((t) => weightOf(t) * (t.score ?? 0)))[0] ?? null;
  const biggestGap =
    [...topics]
      .filter((t) => (t.score ?? 0) < 3)
      .sort(byValue((t) => weightOf(t) * (1 - (t.score ?? 0) / 3)))[0] ?? null;

  return {
    fit: totalWeight > 0 ? earned / totalWeight : 0,
    coverage: totalWeight > 0 ? covered / totalWeight : 0,
    topics,
    assessed: scored.length,
    needsReview: scored.filter((t) => t.needsHumanReview).length,
    strongest,
    biggestGap,
    integrityLevel: report.integrity.level,
    auditConcerns: report.audit.checks.filter((c) => c.status === "concern").length,
  };
}

export interface RankedEntry<T> {
  item: T;
  summary: FitSummary;
  /** Competition ranking: equal fit and coverage share a position (1, 1, 3). */
  position: number;
}

/**
 * Orders candidates by fit, then coverage, then fewer scores needing review. Items without a
 * report are returned separately and never ranked. Integrity is deliberately not a key.
 */
export function rankByEvidence<T>(
  items: T[],
  reportOf: (item: T) => ClientInterviewReport | null,
): { ranked: RankedEntry<T>[]; unranked: T[] } {
  const withReports: { item: T; summary: FitSummary }[] = [];
  const unranked: T[] = [];
  for (const item of items) {
    const report = reportOf(item);
    if (report) {
      withReports.push({ item, summary: fitSummary(report) });
    } else {
      unranked.push(item);
    }
  }
  const key = (s: FitSummary) => [Math.round(s.fit * 1000), Math.round(s.coverage * 1000)];
  withReports.sort((a, b) => {
    const [fa, ca] = key(a.summary);
    const [fb, cb] = key(b.summary);
    return fb - fa || cb - ca || a.summary.needsReview - b.summary.needsReview;
  });
  const ranked: RankedEntry<T>[] = [];
  withReports.forEach((entry, i) => {
    const prev = ranked[i - 1];
    const tied =
      prev &&
      key(prev.summary).every((value, k) => value === key(entry.summary)[k]) &&
      prev.summary.needsReview === entry.summary.needsReview;
    ranked.push({ ...entry, position: tied ? prev.position : i + 1 });
  });
  return { ranked, unranked };
}

// ---------- Follow-up interview guide ----------

export type GuidePriority = "must" | "verify" | "stretch";

export interface GuideItem {
  priority: GuidePriority;
  claimId: string;
  topic: string;
  why: string;
  questions: string[];
  evidence: string | null;
}

export interface GuideCheck {
  title: string;
  detail: string;
  turnIds: string[];
}

export interface InterviewGuide {
  items: GuideItem[];
  /** Things for the interviewer to know before the conversation (not questions to read out). */
  checks: GuideCheck[];
}

const GRADE_WORD: Record<Grade, string> = {
  0: "no evidence",
  1: "surface",
  2: "working",
  3: "deep",
};
const PRIORITY_ORDER: GuidePriority[] = ["must", "verify", "stretch"];
const MAX_QUOTE = 140;

function shortQuote(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_QUOTE ? `${clean.slice(0, MAX_QUOTE - 1).trimEnd()}…` : clean;
}

/** Ladder text for a rung; templates are filled only when a real quote exists. */
function questionFor(claim: ClientClaim, rung: Rung, quote: string | null): string | null {
  const ladder = claim.ladder;
  const text =
    rung === "fundamental"
      ? ladder.fundamental
      : rung === "initial"
        ? ladder.initial
        : rung === "scenarioTwist"
          ? ladder.workspace?.kind === "whiteboard"
            ? ladder.workspace.prompt
            : ladder.scenarioTwist
          : rung === "termFollowUp"
            ? ladder.termFollowUpTemplate
            : ladder.whyDefenseTemplate;
  // {{term}} is a word the candidate used live; without it the template can't be asked fairly.
  if (text.includes("{{term}}")) {
    return null;
  }
  if (text.includes("{{quote}}")) {
    return quote ? text.split("{{quote}}").join(shortQuote(quote)) : null;
  }
  return text;
}

function questionsFrom(
  claim: ClientClaim,
  rungs: Rung[],
  quote: string | null,
  limit: number,
): string[] {
  const out: string[] = [];
  for (const rung of rungs) {
    const q = questionFor(claim, rung, quote);
    if (q && !out.includes(q)) {
      out.push(q);
    }
    if (out.length === limit) {
      break;
    }
  }
  return out;
}

export function interviewGuide(report: ClientInterviewReport): InterviewGuide {
  const { record, evaluation, audit, integrity } = report;
  const summary = fitSummary(report);
  const items: GuideItem[] = [];

  for (const topic of summary.topics) {
    const claim = record.plan.claims.find((c) => c.id === topic.claimId);
    if (!claim) {
      continue;
    }
    const asked = new Set(
      record.turns.filter((t) => t.speaker === "ai" && t.claimId === claim.id).map((t) => t.rung),
    );
    const unasked = RUNG_ORDER.filter((rung) => !asked.has(rung));
    const quote = topic.quote?.quote ?? null;
    const base = { claimId: claim.id, topic: claim.skillArea, evidence: quote };

    if (topic.status === "not_assessed") {
      items.push({
        ...base,
        priority: "must",
        why: "The AI interview never reached this topic, so there is no evidence either way.",
        questions: questionsFrom(claim, ["initial", "scenarioTwist"], null, 2),
      });
    } else if (topic.status === "no_supported_score") {
      items.push({
        ...base,
        priority: "must",
        why: "The candidate answered, but no score could be tied to their exact words.",
        questions: questionsFrom(claim, [...unasked, "initial", "fundamental"], null, 2),
      });
    } else if ((topic.score ?? 0) <= 1) {
      items.push({
        ...base,
        priority: "verify",
        why: `Scored ${topic.score}/3 (${GRADE_WORD[topic.score ?? 0]}). Check whether this is a real gap or a nervous answer.`,
        questions: questionsFrom(
          claim,
          [...(asked.has("fundamental") ? [] : ["fundamental" as const]), ...unasked, "whyDefense"],
          quote,
          2,
        ),
      });
    } else if (topic.needsHumanReview) {
      items.push({
        ...base,
        priority: "verify",
        why: `Scored ${topic.score}/3, but the evidence is ${topic.evidenceStrength === "thin" ? "thin (fewer than two graded answers)" : "mixed (answers varied a lot)"}.`,
        questions: questionsFrom(claim, [...unasked, "whyDefense"], quote, 2),
      });
    } else {
      items.push({
        ...base,
        priority: "stretch",
        why: `Scored ${topic.score}/3 (${GRADE_WORD[topic.score ?? 0]}) with consistent evidence. Optional depth check.`,
        questions: questionsFrom(claim, [...unasked, "whyDefense"], quote, 1),
      });
    }
  }
  items.sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      (summary.topics.find((t) => t.claimId === a.claimId)?.rank ?? 0) -
        (summary.topics.find((t) => t.claimId === b.claimId)?.rank ?? 0),
  );

  const checks: GuideCheck[] = [];
  for (const check of audit.checks.filter((c) => c.status === "concern")) {
    checks.push({
      title: `Fairness check: ${check.title}`,
      detail: check.findings.map((f) => f.text).join(" "),
      turnIds: check.findings.flatMap((f) => f.turnIds),
    });
  }
  for (const note of evaluation.notes) {
    checks.push({
      title: `Answer quality dropped on ${record.plan.claims.find((c) => c.id === note.claimId)?.skillArea ?? note.claimId}`,
      detail: note.text,
      turnIds: note.turnIds,
    });
  }
  const withArtifacts = record.turns.filter(
    (t) => t.speaker === "candidate" && t.artifacts?.length,
  );
  if (withArtifacts.length > 0) {
    checks.push({
      title: "Saved code or drawing to walk through",
      detail:
        "The candidate submitted work in the editor or whiteboard. It was saved for human review and was not scored; ask them to explain it.",
      turnIds: withArtifacts.map((t) => t.id),
    });
  }
  if (integrity.level !== "Low") {
    const raised = integrity.signals.filter((s) => s.available && s.points > 0);
    checks.push({
      title: `Integrity notes: ${integrity.level} concern level`,
      detail: `${raised.map((s) => `${s.name}: ${s.value}${s.unit ? ` ${s.unit}` : ""}`).join("; ")}. Each has innocent explanations${raised[0]?.benignExplanations[0] ? ` (for example, ${raised[0].benignExplanations[0].toLowerCase()})` : ""}. If useful, ask neutrally whether there were interruptions or technical problems. This is a concern level to prompt human review, not a cheating determination, and it did not change any score.`,
      turnIds: [],
    });
  }
  return { items, checks };
}

export const GUIDE_PRIORITY_LABEL: Record<GuidePriority, string> = {
  must: "Must ask",
  verify: "Verify",
  stretch: "Optional depth",
};

/** Plain-text version of the guide for copying into notes or an email. */
export function guideToText(guide: InterviewGuide, heading: string): string {
  const lines = [heading, ""];
  if (guide.checks.length > 0) {
    lines.push("Before you start:");
    for (const c of guide.checks) {
      lines.push(`- ${c.title}. ${c.detail}`);
    }
    lines.push("");
  }
  for (const item of guide.items) {
    lines.push(`[${GUIDE_PRIORITY_LABEL[item.priority]}] ${item.topic}: ${item.why}`);
    for (const q of item.questions) {
      lines.push(`  • ${q}`);
    }
    if (item.evidence) {
      lines.push(`  (They said: "${shortQuote(item.evidence)}")`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
