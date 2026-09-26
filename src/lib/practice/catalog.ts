// Practice constants shared by the page and the API routes. Plain data, safe for any bundle.

export const PRACTICE_LANGUAGES = [
  { id: "python", label: "Python", comment: "#" },
  { id: "javascript", label: "JavaScript", comment: "//" },
  { id: "java", label: "Java", comment: "//" },
  { id: "cpp", label: "C++", comment: "//" },
  { id: "typescript", label: "TypeScript", comment: "//" },
  { id: "c", label: "C", comment: "//" },
  { id: "csharp", label: "C#", comment: "//" },
  { id: "go", label: "Go", comment: "//" },
  { id: "rust", label: "Rust", comment: "//" },
  { id: "kotlin", label: "Kotlin", comment: "//" },
] as const;

export type PracticeLanguage = (typeof PRACTICE_LANGUAGES)[number]["id"];

export const LANGUAGE_IDS = PRACTICE_LANGUAGES.map((l) => l.id) as [
  PracticeLanguage,
  ...PracticeLanguage[],
];

export function languageLabel(id: string): string {
  return PRACTICE_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

/**
 * Starter code for a problem in the chosen language. The dataset ships Python stubs; other
 * languages get a short template that shows the Python signature for reference.
 */
export function starterFor(
  language: PracticeLanguage,
  title: string,
  pythonStarter: string,
): string {
  if (language === "python") {
    return `${pythonStarter.trimEnd()}\n        \n`;
  }
  const c = PRACTICE_LANGUAGES.find((l) => l.id === language)?.comment ?? "//";
  const signature = pythonStarter
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => `${c}   ${l}`)
    .join("\n");
  return `${c} ${title}: write your ${languageLabel(language)} solution below.\n${c} Reference signature (Python):\n${signature}\n\n`;
}

export const MAX_SET_SIZE = 10;

/** Generic, topic-level hints used when the AI tutor is unavailable. */
export const TOPIC_HINTS: Record<string, [string, string]> = {
  "arrays-hashing": [
    "Can a hash map or set turn a repeated search into an O(1) lookup?",
    "Store what you have already seen (values, counts or indices) while scanning once.",
  ],
  "two-pointers": [
    "Would sorting the input, or walking from both ends, let you skip work?",
    "Move one pointer based on a comparison so each element is visited at most once.",
  ],
  "sliding-window": [
    "Think of a window [left, right] that you grow and shrink over the input.",
    "Grow the right edge; shrink the left edge while the window breaks the rule, updating the answer.",
  ],
  "binary-search": [
    "Is there something sorted, or a yes/no question that flips from false to true exactly once?",
    "Keep a range [lo, hi] that must contain the answer and halve it each step.",
  ],
  "linked-list": [
    "Draw the nodes and pointers. Which next pointers must change?",
    "A dummy head, or fast and slow pointers, usually simplifies edge cases.",
  ],
  stack: [
    "Does the most recent unfinished item need to be handled first (last in, first out)?",
    "Keep a stack of unresolved items; pop when the current element resolves them.",
  ],
  trees: [
    "Can you solve it for the left and right subtrees, then combine the answers at the node?",
    "Choose DFS (recursion) or BFS (level by level with a queue) and decide what each call returns.",
  ],
  graphs: [
    "Model the input as nodes and edges. What does it mean to be connected or reachable here?",
    "Use BFS/DFS with a visited set (or topological sort / union-find when order or components matter).",
  ],
  heap: [
    "Do you repeatedly need the smallest or largest item among a changing set?",
    "A heap gives you that item in O(log n); keep its size bounded when you only need the top k.",
  ],
  backtracking: [
    "Can you build the answer one choice at a time and undo choices that fail?",
    "Write choose → explore (recurse) → un-choose, and prune branches that can't succeed early.",
  ],
  "dynamic-programming": [
    "Does the answer for a big input depend on answers for smaller inputs that repeat?",
    "Define dp[state] in words, write the recurrence, then fill the table in a safe order.",
  ],
  greedy: [
    "Is there a locally best choice that is always safe to make?",
    "Sort by the property that makes the greedy choice safe, then make one pass.",
  ],
  "prefix-sum": [
    "Can a running total let you get the sum of any range in O(1)?",
    "prefix[j] - prefix[i] is the sum of a range; a hash map of prefix values finds matching ranges.",
  ],
  trie: [
    "Are you looking up many words or prefixes character by character?",
    "Store words in a tree of characters with an end-of-word marker, and walk it for lookups.",
  ],
  "bit-manipulation": [
    "What happens with XOR, AND, OR or shifts on the binary form of the numbers?",
    "Tricks like x ^ x = 0 and n & (n - 1) (drops the lowest set bit) often give O(1) space.",
  ],
};
