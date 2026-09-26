#!/usr/bin/env node
// Builds the practice datasets in src/lib/practice/data/ from pinned open-source sources:
//   coding.json  <- newfacade/LeetCodeDataset (MIT)          problems, constraints, test cases
//   sql.json     <- AlisdairO/pgexercises (CC BY-SA 3.0)     exercises; expected results computed here
//   design.json  <- donnemartin/system-design-primer (CC BY 4.0) design questions and walkthroughs
//
// Usage (network needed; PGlite is a build-time tool only, not an app dependency):
//   npm i --no-save @electric-sql/pglite@0.2
//   node scripts/practice/build-practice-data.mjs [cacheDir]
// Set PGLITE_MODULE to an absolute path of @electric-sql/pglite/dist/index.js to use a copy
// installed elsewhere. Output files are generated: do not edit them by hand.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "src/lib/practice/data");
const CACHE = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), "mmm42-practice-cache"));

const SOURCES = {
  coding: {
    name: "LeetCodeDataset v0.3.1",
    url: "https://github.com/newfacade/LeetCodeDataset",
    commit: "182cd19fd53161efd70a1ef074fe1056b659bfa3",
    license: "MIT",
    file: "https://github.com/newfacade/LeetCodeDataset/raw/182cd19fd53161efd70a1ef074fe1056b659bfa3/data/LeetCodeDataset-v0.3.1-train.jsonl.gz",
  },
  sql: {
    name: "PostgreSQL Exercises (pgexercises)",
    url: "https://github.com/AlisdairO/pgexercises",
    commit: "c226557fd393c6c977d4ec398caa5a4cec2089c4",
    license: "CC BY-SA 3.0 (exercise text); BSD-2-Clause (code)",
    tarball:
      "https://codeload.github.com/AlisdairO/pgexercises/tar.gz/c226557fd393c6c977d4ec398caa5a4cec2089c4",
  },
  design: {
    name: "The System Design Primer",
    url: "https://github.com/donnemartin/system-design-primer",
    commit: "ae9bbd7b02d90b9866215de185217d33f39ab733",
    license: "CC BY 4.0",
    raw: "https://raw.githubusercontent.com/donnemartin/system-design-primer/ae9bbd7b02d90b9866215de185217d33f39ab733",
  },
};

// Broad coding topics and the dataset tags that belong to each.
const CODING_TOPICS = [
  ["arrays-hashing", "Arrays & Hashing", ["Hash Table"]],
  ["two-pointers", "Two Pointers", ["Two Pointers"]],
  ["sliding-window", "Sliding Window", ["Sliding Window"]],
  ["binary-search", "Binary Search", ["Binary Search"]],
  ["linked-list", "Linked List", ["Linked List"]],
  ["stack", "Stack", ["Stack", "Monotonic Stack"]],
  ["trees", "Trees", ["Tree", "Binary Tree", "Binary Search Tree"]],
  ["graphs", "Graphs", ["Graph", "Union Find", "Topological Sort", "Shortest Path"]],
  ["heap", "Heap / Priority Queue", ["Heap (Priority Queue)"]],
  ["backtracking", "Backtracking", ["Backtracking"]],
  ["dynamic-programming", "Dynamic Programming", ["Dynamic Programming"]],
  ["greedy", "Greedy", ["Greedy"]],
  ["prefix-sum", "Prefix Sum", ["Prefix Sum"]],
  ["trie", "Trie", ["Trie"]],
  ["bit-manipulation", "Bit Manipulation", ["Bit Manipulation"]],
];
const PER_TOPIC = { Easy: 8, Medium: 14, Hard: 6 };
const CODING_CHUNKS = 3; // keep in sync with src/lib/practice/data.ts

const SQL_CATEGORIES = ["basic", "joins", "aggregates", "updates", "date", "string", "recursive"];
const DESIGN_GUIDED = [
  "pastebin",
  "twitter",
  "web_crawler",
  "mint",
  "social_graph",
  "query_cache",
  "sales_rank",
  "scaling_aws",
];

// ── helpers ────────────────────────────────────────────────────────────
async function download(url, dest) {
  if (fs.existsSync(dest)) {
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  process.stdout.write(`download ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

const clean = (s) => s.replace(/ /g, " ").replace(/\r/g, "");
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const writeJson = (name, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(data)}\n`);
  process.stdout.write(
    `wrote ${name} (${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0)} KB)\n`,
  );
};

// Scraped statements lost superscripts: "10^4" became "104", "2^31" became "231".
const fixPowers = (s) =>
  s.replace(/\b10([3-9])\b/g, "10^$1").replace(/\b2(31|32|63|64)\b/g, "2^$1");
const neutralLiterals = (s) =>
  s
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");

// ── coding ─────────────────────────────────────────────────────────────
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "in",
  "on",
  "to",
  "for",
  "with",
  "by",
  "or",
  "at",
  "from",
  "into",
  "vs",
]);
const titleCase = (slug) =>
  slug
    .split("-")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

function parseDescription(desc) {
  const text = clean(desc);
  const exIdx = text.search(/\n\s*Example 1:/);
  const conIdx = text.search(/\n\s*Constraints:/);
  if (exIdx < 0 || conIdx < 0) {
    return null;
  }
  const statement = text.slice(0, exIdx).trim();
  const exampleText = text.slice(exIdx, conIdx);
  const examples = [];
  for (const block of exampleText.split(/\n\s*Example \d+:\s*\n/).slice(1)) {
    const input = block.match(/Input:\s*([\s\S]*?)\n\s*Output:/)?.[1]?.trim();
    const output = block.match(/Output:\s*([\s\S]*?)(\n\s*Explanation:|\n\s*\n|$)/)?.[1]?.trim();
    const explanation = block.match(/Explanation:\s*([\s\S]*)$/)?.[1]?.trim();
    if (input && output) {
      examples.push({
        input,
        output: neutralLiterals(output),
        ...(explanation ? { explanation: truncate(explanation, 600) } : {}),
      });
    }
  }
  let rest = text.slice(conIdx).replace(/^\s*Constraints:\s*/, "");
  let followUp = null;
  const fu = rest.search(/\n\s*Follow[- ]?up/i);
  if (fu >= 0) {
    followUp = rest
      .slice(fu)
      .replace(/^\s*Follow[- ]?up:?\s*/i, "")
      .trim();
    rest = rest.slice(0, fu);
  }
  const constraints = rest
    .split("\n")
    .map((l) => fixPowers(l.trim()))
    .filter(Boolean);
  if (!examples.length || !constraints.length) {
    return null;
  }
  return { statement, examples, constraints, followUp };
}

async function buildCoding() {
  const file = path.join(CACHE, "leetcode-v0.3.1-train.jsonl.gz");
  await download(SOURCES.coding.file, file);
  const rows = zlib
    .gunzipSync(fs.readFileSync(file))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.starter_code?.includes("class Solution:") && r.input_output?.length)
    .sort((a, b) => a.question_id - b.question_id);

  const parsed = new Map();
  const picked = new Map(); // task_id -> problem
  const topicIds = Object.fromEntries(CODING_TOPICS.map(([id]) => [id, []]));

  for (const [topicId, , tags] of CODING_TOPICS) {
    const quota = { ...PER_TOPIC };
    const inTopic = rows.filter((r) => r.tags.some((t) => tags.includes(t)));
    const chosen = [];
    for (const r of inTopic) {
      if (!quota[r.difficulty]) {
        continue;
      }
      if (!parsed.has(r.task_id)) {
        parsed.set(r.task_id, parseDescription(r.problem_description));
      }
      const p = parsed.get(r.task_id);
      if (!p || p.statement.length > 2500) {
        continue;
      }
      quota[r.difficulty]--;
      chosen.push(r);
    }
    for (const r of chosen) {
      topicIds[topicId].push(r.task_id);
      if (picked.has(r.task_id)) {
        continue;
      }
      const p = parsed.get(r.task_id);
      const exampleInputs = new Set(p.examples.map((e) => e.input.replace(/\s/g, "")));
      const tests = r.input_output
        .filter((io) => !exampleInputs.has(io.input.replace(/\s/g, "")))
        .slice(0, 5)
        .map((io) => ({
          input: truncate(io.input, 400),
          expectedOutput: truncate(neutralLiterals(io.output), 300),
        }));
      picked.set(r.task_id, {
        id: r.task_id,
        questionId: r.question_id,
        title: titleCase(r.task_id),
        difficulty: r.difficulty,
        tags: r.tags,
        statement: p.statement,
        examples: p.examples.slice(0, 3),
        constraints: p.constraints.slice(0, 10),
        followUp: p.followUp,
        testCases: tests.length
          ? tests
          : r.input_output
              .slice(0, 3)
              .map((io) => ({ input: io.input, expectedOutput: neutralLiterals(io.output) })),
        pythonStarter: r.starter_code.trimEnd(),
        referenceSolution: r.completion.trim(),
        // The explanation repeats the solution code; keep the prose only (code is stored above).
        referenceExplanation: truncate(
          clean(r.response ?? "")
            .replace(/```[\s\S]*?```/g, "")
            .replace(/^#{1,6}\s*/gm, "")
            .replace(/\*\*|`/g, "")
            .replace(/^Here's the (implementation|code):?\s*$/gim, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
          1800,
        ),
      });
    }
  }
  const { file: _f, ...source } = SOURCES.coding;
  // Split into fixed chunks so each formatted file stays under Biome's 1 MB limit.
  const problems = [...picked.values()];
  const size = Math.ceil(problems.length / CODING_CHUNKS);
  writeJson("coding.json", {
    source,
    topics: CODING_TOPICS.map(([id, name]) => ({ id, name, problemIds: topicIds[id] })),
  });
  for (let i = 0; i < CODING_CHUNKS; i++) {
    writeJson(`coding-problems-${i + 1}.json`, problems.slice(i * size, (i + 1) * size));
  }
}

// ── SQL ────────────────────────────────────────────────────────────────
function htmlToText(html) {
  return clean(html)
    .replace(/<sql>([\s\S]*?)<\/sql>/g, (_, code) => `\n\n${code.trim()}\n\n`)
    .replace(/<c>([\s\S]*?)<\/c>/g, "$1")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<li>/g, "\n• ")
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseEx(text) {
  const fields = {};
  const parts = text.split(/^\|([A-Z]+)\|\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    fields[parts[i]] = parts[i + 1].trim();
  }
  return fields;
}

function dumpToSql(dump) {
  const out = [];
  const lines = dump.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(CREATE DATABASE|CREATE USER|ALTER USER|ALTER DATABASE|GRANT|REVOKE|\\c)/i.test(line)) {
      continue;
    }
    const m = line.match(/^COPY (\S+) \(([^)]*)\) FROM stdin;/);
    if (!m) {
      out.push(line);
      continue;
    }
    const values = [];
    for (i++; lines[i] !== "\\."; i++) {
      values.push(
        `(${lines[i]
          .split("\t")
          .map((v) => (v === "\\N" ? "NULL" : `'${v.replace(/'/g, "''")}'`))
          .join(", ")})`,
      );
    }
    out.push(`INSERT INTO ${m[1]} (${m[2]}) VALUES\n${values.join(",\n")};`);
  }
  return out.join("\n");
}

const pad = (n) => String(n).padStart(2, "0");
function cell(v) {
  if (v === null || v === undefined) {
    return "NULL";
  }
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return String(v);
}

async function buildSql() {
  const tar = path.join(CACHE, "pgexercises.tar.gz");
  await download(SOURCES.sql.tarball, tar);
  const dir = path.join(CACHE, "pgexercises");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const { execFileSync } = await import("node:child_process");
    execFileSync("tar", ["xzf", tar, "-C", dir, "--strip-components=1"]);
  }
  const { PGlite } = await import(
    process.env.PGLITE_MODULE
      ? pathToFileURL(process.env.PGLITE_MODULE).href
      : "@electric-sql/pglite"
  );
  const dump = fs.readFileSync(path.join(dir, "database/clubdata.sql"), "utf8");
  const db = new PGlite();
  await db.exec(dumpToSql(dump));
  // Keep date answers stable: the exercises assume the data's own timeline, not today.
  await db.exec("SET TIME ZONE 'UTC'");

  // Schema: columns from CREATE TABLE, foreign keys from ALTER TABLE.
  const tables = [];
  for (const m of dump.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = m[2]
      .split("\n")
      .map((l) => l.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((l) => {
        const [name, ...type] = l.split(/\s+/);
        return {
          name,
          type: type
            .join(" ")
            .replace(/ NOT NULL/, "")
            .replace("character varying", "varchar")
            .replace("timestamp without time zone", "timestamp"),
          nullable: !/NOT NULL/.test(l),
        };
      });
    const sample = await db.query(`select * from cd.${m[1]} order by 1 limit 5`);
    tables.push({
      name: `cd.${m[1]}`,
      columns,
      sampleRows: sample.rows.map((r) => Object.values(r).map(cell)),
    });
  }
  const foreignKeys = [
    ...dump.matchAll(
      /ALTER TABLE ONLY (\w+)\s+ADD CONSTRAINT \w+ FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)/g,
    ),
  ].map((m) => `cd.${m[1]}.${m[2]} → cd.${m[3]}.${m[4]}`);

  const categories = [];
  const exercises = [];
  for (const cat of SQL_CATEGORIES) {
    const idx = parseEx(fs.readFileSync(path.join(dir, "questions", cat, "index"), "utf8"));
    categories.push({
      id: cat,
      name: idx.CATNAME,
      description: truncate(htmlToText(idx.CATDESC).split("\n\n")[0], 400),
      exerciseIds: [],
    });
    const files = fs
      .readdirSync(path.join(dir, "questions", cat))
      .filter((f) => f.endsWith(".ex"))
      .sort();
    for (const f of files) {
      const ex = parseEx(fs.readFileSync(path.join(dir, "questions", cat, f), "utf8"));
      const id = `${cat}-${f.replace(/^\d+-/, "").replace(/\.ex$/, "")}`;
      const writeable = ex.WRITEABLE === "1";
      let result;
      try {
        await db.exec("BEGIN");
        if (writeable) {
          await db.exec(ex.QUERY);
          result = await db.query(`select * from ${ex.RETURNTABLE} order by 1`);
        } else {
          result = await db.query(ex.QUERY);
        }
      } catch (err) {
        process.stdout.write(`skip ${id}: ${err.message}\n`);
        continue;
      } finally {
        await db.exec("ROLLBACK");
      }
      const columns = result.fields.map((fld) => fld.name);
      exercises.push({
        id,
        category: cat,
        title: ex.QUESTIONNAME,
        question: htmlToText(ex.QUESTION),
        hint: htmlToText(ex.HINT),
        orderMatters: ex.SORTED === "1",
        writeable,
        ...(writeable ? { checksTable: ex.RETURNTABLE } : {}),
        expected: {
          columns,
          rows: result.rows.slice(0, 15).map((r) => columns.map((c) => cell(r[c]))),
          totalRows: result.rows.length,
        },
        referenceSql: ex.QUERY.trim(),
        referenceExplanation: truncate(htmlToText(ex.ANSWER), 3500),
      });
      categories.at(-1).exerciseIds.push(id);
    }
  }
  await db.close();
  const { tarball: _t, ...source } = SOURCES.sql;
  writeJson("sql.json", { source, schema: { tables, foreignKeys }, categories, exercises });
}

// ── design ─────────────────────────────────────────────────────────────
function mdToText(md) {
  return clean(md)
    .replace(/<p[\s\S]*?<\/p>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^(\s*)\* /gm, "$1• ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionBetween(md, startRe, endRe) {
  const start = md.search(startRe);
  if (start < 0) {
    return "";
  }
  const after = md.slice(start).replace(startRe, "");
  const end = after.search(endRe);
  return end < 0 ? after : after.slice(0, end);
}

const bullets = (block) =>
  block
    .split("\n")
    .filter((l) => /^\s*\* /.test(l))
    .map((l) => {
      const depth = Math.floor((l.match(/^\s*/)[0].length || 0) / 4);
      return `${"  ".repeat(depth)}${mdToText(l.replace(/^\s*\* /, ""))}`;
    });

async function buildDesign() {
  const guided = [];
  for (const slug of DESIGN_GUIDED) {
    const file = path.join(CACHE, "design", `${slug}.md`);
    await download(`${SOURCES.design.raw}/solutions/system_design/${slug}/README.md`, file);
    const md = clean(fs.readFileSync(file, "utf8"));
    const title = md.match(/^# (.+)$/m)[1].trim();
    const step1 = sectionBetween(md, /^## Step 1.*$/m, /^## Step 2/m);
    const walk = [];
    for (const [re, next, heading] of [
      [/^## Step 2.*$/m, /^## Step 3/m, "High-level design"],
      [/^## Step 3.*$/m, /^## Step 4/m, "Core components"],
      [/^## Step 4.*$/m, /^## Additional talking points|^## \w/m, "Scaling the design"],
    ]) {
      const body = sectionBetween(md, re, next);
      if (heading === "Core components") {
        for (const part of body.split(/^### /m).slice(1)) {
          const [h, ...rest] = part.split("\n");
          walk.push({ heading: mdToText(h), body: truncate(mdToText(rest.join("\n")), 3500) });
        }
      } else if (body.trim()) {
        walk.push({ heading, body: truncate(mdToText(body), 3500) });
      }
    }
    const allSteps = sectionBetween(
      md,
      /^## Step 2.*$/m,
      /^## Additional talking points|$(?![\s\S])/m,
    );
    const keyTerms = [
      ...new Set([...allSteps.matchAll(/\*\*([A-Z][A-Za-z ]{2,40})\*\*/g)].map((m) => m[1].trim())),
    ].slice(0, 20);
    guided.push({
      id: slug.replace(/_/g, "-"),
      title,
      guided: true,
      useCases: bullets(sectionBetween(step1, /^#### We'll scope.*$/m, /^#### Out of scope/m)),
      outOfScope: bullets(sectionBetween(step1, /^#### Out of scope.*$/m, /^### /m)),
      assumptions: bullets(sectionBetween(step1, /^#### State assumptions.*$/m, /^#### /m)),
      calculations: bullets(
        sectionBetween(step1, /^#### Calculate usage.*$/m, /^## |$(?![\s\S])/m),
      ),
      walkthrough: walk,
      keyTerms,
    });
  }
  const readme = path.join(CACHE, "design", "README.md");
  await download(`${SOURCES.design.raw}/README.md`, readme);
  const table = sectionBetween(
    clean(fs.readFileSync(readme, "utf8")),
    /^### Additional system design interview questions.*$/m,
    /^### Real world architectures/m,
  );
  const guidedTitles = guided.map((g) => g.title.toLowerCase());
  const more = [];
  for (const line of table.split("\n")) {
    const m = line.match(/^\| (Design [^|]+|Return [^|]+) \|/);
    if (!m || guidedTitles.some((t) => t.includes(m[1].toLowerCase().replace("design ", "")))) {
      continue;
    }
    const title = m[1].trim();
    more.push({
      id: title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      title,
      guided: false,
    });
  }
  const { raw: _r, ...source } = SOURCES.design;
  writeJson("design.json", { source, questions: [...guided, ...more] });
}

await buildCoding();
await buildSql();
await buildDesign();

// Match the repo's Biome formatting (as `npm run fixture:golden` does for its output).
const { execFileSync } = await import("node:child_process");
execFileSync("npx", ["biome", "format", "--write", OUT], { cwd: ROOT, stdio: "inherit" });
