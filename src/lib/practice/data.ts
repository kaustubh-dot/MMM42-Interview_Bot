import "server-only";

// Typed access to the generated practice datasets (scripts/practice/build-practice-data.mjs).
// Reference solutions stay on the server: client projections below omit them.

import codingProblems1 from "./data/coding-problems-1.json";
import codingProblems2 from "./data/coding-problems-2.json";
import codingProblems3 from "./data/coding-problems-3.json";
import codingJson from "./data/coding.json";
import designJson from "./data/design.json";
import sqlJson from "./data/sql.json";
import type {
  CodingProblem,
  DesignQuestion,
  PracticeCatalog,
  SourceInfo,
  SqlExercise,
  SqlSchema,
} from "./types";

export interface CodingRecord extends CodingProblem {
  referenceSolution: string;
  referenceExplanation: string;
}

export interface SqlRecord extends SqlExercise {
  hint: string;
  referenceSql: string;
  referenceExplanation: string;
}

export interface DesignRecord extends DesignQuestion {
  walkthrough?: { heading: string; body: string }[];
  keyTerms?: string[];
}

interface CodingData {
  source: SourceInfo;
  topics: { id: string; name: string; problemIds: string[] }[];
  problems: CodingRecord[];
}
interface SqlData {
  source: SourceInfo;
  schema: SqlSchema;
  categories: { id: string; name: string; description: string; exerciseIds: string[] }[];
  exercises: SqlRecord[];
}
interface DesignData {
  source: SourceInfo;
  questions: DesignRecord[];
}

// The generator splits problems into 3 files to keep each under Biome's size limit.
export const CODING: CodingData = {
  ...(codingJson as unknown as Omit<CodingData, "problems">),
  problems: [
    ...codingProblems1,
    ...codingProblems2,
    ...codingProblems3,
  ] as unknown as CodingRecord[],
};
export const SQL = sqlJson as unknown as SqlData;
export const DESIGN = designJson as unknown as DesignData;

const codingById = new Map(CODING.problems.map((p) => [p.id, p]));
const sqlById = new Map(SQL.exercises.map((e) => [e.id, e]));
const designById = new Map(DESIGN.questions.map((q) => [q.id, q]));

export const findCoding = (id: string) => codingById.get(id);
export const findSql = (id: string) => sqlById.get(id);
export const findDesign = (id: string) => designById.get(id);

export function topicOfProblem(id: string): { id: string; name: string } | undefined {
  const t = CODING.topics.find((topic) => topic.problemIds.includes(id));
  return t ? { id: t.id, name: t.name } : undefined;
}

export function toClientCoding(p: CodingRecord): CodingProblem {
  return {
    id: p.id,
    questionId: p.questionId,
    title: p.title,
    difficulty: p.difficulty,
    tags: p.tags,
    statement: p.statement,
    examples: p.examples,
    constraints: p.constraints,
    followUp: p.followUp,
    testCases: p.testCases,
    pythonStarter: p.pythonStarter,
  };
}

export function toClientSql(e: SqlRecord): SqlExercise {
  return {
    id: e.id,
    category: e.category,
    title: e.title,
    question: e.question,
    orderMatters: e.orderMatters,
    writeable: e.writeable,
    ...(e.checksTable ? { checksTable: e.checksTable } : {}),
    expected: e.expected,
  };
}

export function toClientDesign(q: DesignRecord): DesignQuestion {
  return {
    id: q.id,
    title: q.title,
    guided: q.guided,
    ...(q.guided
      ? {
          useCases: q.useCases,
          outOfScope: q.outOfScope,
          assumptions: q.assumptions,
          calculations: q.calculations,
        }
      : {}),
  };
}

export function practiceCatalog(): PracticeCatalog {
  return {
    coding: {
      topics: CODING.topics.map((t) => ({ id: t.id, name: t.name, count: t.problemIds.length })),
      source: CODING.source,
    },
    sql: {
      categories: SQL.categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        count: c.exerciseIds.length,
      })),
      schema: SQL.schema,
      source: SQL.source,
    },
    design: { questions: DESIGN.questions.map(toClientDesign), source: DESIGN.source },
  };
}
