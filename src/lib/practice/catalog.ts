// DSA practice catalog, shared by the practice page and the practice API routes.
// Plain data, safe for both client and server bundles.

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

/** Placeholder editor content when a problem has no starter code for the chosen language. */
export function blankStarter(language: PracticeLanguage, title: string): string {
  const c = PRACTICE_LANGUAGES.find((l) => l.id === language)?.comment ?? "//";
  return `${c} ${title}\n${c} Write your ${languageLabel(language)} solution here.\n`;
}

export interface PracticePattern {
  id: string;
  name: string;
  description: string;
  classicExample: string;
}

export interface PracticeTopic {
  id: string;
  name: string;
  emoji: string;
  patterns: PracticePattern[];
}

const p = (
  id: string,
  name: string,
  description: string,
  classicExample: string,
): PracticePattern => ({
  id,
  name,
  description,
  classicExample,
});

export const PRACTICE_TOPICS: PracticeTopic[] = [
  {
    id: "arrays-hashing",
    name: "Arrays & Hashing",
    emoji: "🧮",
    patterns: [
      p(
        "hash-lookup",
        "Hash map lookup",
        "Store what you've seen so each check is O(1).",
        "Two Sum",
      ),
      p(
        "frequency-count",
        "Frequency counting",
        "Count occurrences to compare or group items.",
        "Valid Anagram",
      ),
      p(
        "prefix-sum",
        "Prefix sums",
        "Precompute running totals to answer range questions fast.",
        "Subarray Sum Equals K",
      ),
      p(
        "sort-group",
        "Sort then group",
        "Sort or canonicalize keys to put related items together.",
        "Group Anagrams",
      ),
    ],
  },
  {
    id: "two-pointers",
    name: "Two Pointers",
    emoji: "👉",
    patterns: [
      p(
        "opposite-ends",
        "Opposite ends",
        "Start at both ends and move inward based on a comparison.",
        "Container With Most Water",
      ),
      p(
        "fast-slow",
        "Fast & slow",
        "One pointer moves faster to find cycles or midpoints.",
        "Linked List Cycle",
      ),
      p(
        "merge-sorted",
        "Merge two sorted",
        "Walk two sorted sequences together.",
        "Merge Sorted Array",
      ),
      p(
        "partition",
        "In-place partition",
        "Swap elements into regions without extra space.",
        "Move Zeroes",
      ),
    ],
  },
  {
    id: "sliding-window",
    name: "Sliding Window",
    emoji: "🪟",
    patterns: [
      p(
        "fixed-window",
        "Fixed-size window",
        "Slide a window of size k and update in O(1).",
        "Maximum Average Subarray",
      ),
      p(
        "variable-window",
        "Variable window",
        "Grow right, shrink left while a rule is broken.",
        "Longest Substring Without Repeating Characters",
      ),
      p(
        "window-counts",
        "Window with counts",
        "Track character counts inside the window.",
        "Find All Anagrams in a String",
      ),
    ],
  },
  {
    id: "binary-search",
    name: "Binary Search",
    emoji: "🔎",
    patterns: [
      p(
        "classic",
        "Classic search in a sorted array",
        "Halve the search range each step.",
        "Binary Search",
      ),
      p(
        "bounds",
        "First / last occurrence (bounds)",
        "Keep searching after a match to find a boundary.",
        "Find First and Last Position",
      ),
      p(
        "rotated",
        "Rotated sorted array",
        "Decide which half is still sorted, then search it.",
        "Search in Rotated Sorted Array",
      ),
      p(
        "answer-space",
        "Search on the answer",
        "Binary search over possible answers with a yes/no check.",
        "Koko Eating Bananas",
      ),
      p(
        "matrix",
        "2D matrix search",
        "Treat a sorted matrix as one sorted list.",
        "Search a 2D Matrix",
      ),
      p(
        "peak",
        "Peak finding",
        "Move toward the rising side to find a local maximum.",
        "Find Peak Element",
      ),
    ],
  },
  {
    id: "linked-list",
    name: "Linked List",
    emoji: "🔗",
    patterns: [
      p(
        "reversal",
        "Reversal",
        "Re-point next pointers one node at a time.",
        "Reverse Linked List",
      ),
      p(
        "ll-fast-slow",
        "Fast & slow pointers",
        "Detect cycles or find the middle.",
        "Middle of the Linked List",
      ),
      p(
        "merge-lists",
        "Merge lists",
        "Stitch sorted lists together with a dummy head.",
        "Merge Two Sorted Lists",
      ),
      p(
        "dummy-removal",
        "Dummy head removal",
        "Use a dummy node to simplify deletions.",
        "Remove Nth Node From End",
      ),
    ],
  },
  {
    id: "stack-queue",
    name: "Stack & Queue",
    emoji: "📚",
    patterns: [
      p("matching", "Matching pairs", "Push openers, pop on closers.", "Valid Parentheses"),
      p(
        "monotonic",
        "Monotonic stack",
        "Keep the stack sorted to find next greater/smaller.",
        "Daily Temperatures",
      ),
      p(
        "design-stack",
        "Design with stacks",
        "Keep extra info alongside each element.",
        "Min Stack",
      ),
      p(
        "evaluate",
        "Expression evaluation",
        "Evaluate tokens using a stack.",
        "Evaluate Reverse Polish Notation",
      ),
    ],
  },
  {
    id: "trees",
    name: "Trees",
    emoji: "🌳",
    patterns: [
      p(
        "dfs",
        "Depth-first recursion",
        "Solve for children, then combine at the parent.",
        "Maximum Depth of Binary Tree",
      ),
      p(
        "bfs-level",
        "Level-order (BFS)",
        "Process the tree one level at a time with a queue.",
        "Binary Tree Level Order Traversal",
      ),
      p(
        "bst",
        "BST properties",
        "Use left < node < right to prune the search.",
        "Validate Binary Search Tree",
      ),
      p("lca", "Lowest common ancestor", "Find where two paths split.", "Lowest Common Ancestor"),
    ],
  },
  {
    id: "graphs",
    name: "Graphs",
    emoji: "🕸️",
    patterns: [
      p(
        "grid-dfs",
        "Grid DFS / connected components",
        "Flood-fill each unvisited region.",
        "Number of Islands",
      ),
      p(
        "bfs-shortest",
        "BFS shortest path",
        "BFS gives shortest paths in unweighted graphs.",
        "Rotting Oranges",
      ),
      p(
        "topo-sort",
        "Topological sort",
        "Order tasks so prerequisites come first.",
        "Course Schedule",
      ),
      p(
        "union-find",
        "Union-Find",
        "Merge sets and check connectivity quickly.",
        "Number of Provinces",
      ),
      p("dijkstra", "Dijkstra", "Shortest paths with non-negative weights.", "Network Delay Time"),
    ],
  },
  {
    id: "heaps",
    name: "Heaps / Priority Queue",
    emoji: "⛰️",
    patterns: [
      p("top-k", "Top K elements", "Keep a heap of size k.", "Kth Largest Element in an Array"),
      p(
        "k-way-merge",
        "K-way merge",
        "Merge many sorted lists with a heap.",
        "Merge k Sorted Lists",
      ),
      p(
        "two-heaps",
        "Two heaps",
        "Balance a max-heap and a min-heap.",
        "Find Median from Data Stream",
      ),
    ],
  },
  {
    id: "backtracking",
    name: "Backtracking",
    emoji: "🧭",
    patterns: [
      p("subsets", "Subsets", "Include or skip each element.", "Subsets"),
      p(
        "permutations",
        "Permutations",
        "Choose an unused element for each position.",
        "Permutations",
      ),
      p(
        "combination-sum",
        "Combination sum",
        "Build combinations that hit a target, pruning early.",
        "Combination Sum",
      ),
      p("grid-search", "Grid search", "Explore paths in a grid, undoing choices.", "Word Search"),
    ],
  },
  {
    id: "dynamic-programming",
    name: "Dynamic Programming",
    emoji: "🧩",
    patterns: [
      p("dp-1d", "1D DP", "Each answer builds on a few previous answers.", "Climbing Stairs"),
      p("knapsack", "Knapsack", "Choose items under a capacity or target.", "Coin Change"),
      p("dp-grid", "Grid paths", "Fill a table from the top-left.", "Unique Paths"),
      p(
        "lis",
        "Longest increasing subsequence",
        "Best sequence ending at each index.",
        "Longest Increasing Subsequence",
      ),
      p("string-dp", "String DP", "Compare prefixes of two strings.", "Longest Common Subsequence"),
    ],
  },
  {
    id: "greedy",
    name: "Greedy",
    emoji: "🏃",
    patterns: [
      p("reachability", "Reachability", "Track the farthest point you can reach.", "Jump Game"),
      p(
        "interval-scheduling",
        "Interval scheduling",
        "Pick the interval that ends first.",
        "Non-overlapping Intervals",
      ),
      p(
        "sort-greedy",
        "Sort, then choose",
        "Sort to make the locally best choice safe.",
        "Assign Cookies",
      ),
    ],
  },
  {
    id: "intervals",
    name: "Intervals",
    emoji: "📏",
    patterns: [
      p(
        "merge-intervals",
        "Merge intervals",
        "Sort by start and merge overlaps.",
        "Merge Intervals",
      ),
      p(
        "insert-interval",
        "Insert interval",
        "Place a new interval and merge around it.",
        "Insert Interval",
      ),
      p(
        "overlap-count",
        "Count overlaps",
        "Sweep start/end events to count overlaps.",
        "Meeting Rooms II",
      ),
    ],
  },
  {
    id: "tries",
    name: "Tries",
    emoji: "🔤",
    patterns: [
      p(
        "prefix-tree",
        "Prefix tree basics",
        "Store words character by character.",
        "Implement Trie",
      ),
      p(
        "wildcard",
        "Wildcard search",
        "Branch on '.' while walking the trie.",
        "Design Add and Search Words",
      ),
    ],
  },
  {
    id: "bit-manipulation",
    name: "Bit Manipulation",
    emoji: "💡",
    patterns: [
      p("xor", "XOR tricks", "x ^ x = 0 cancels pairs.", "Single Number"),
      p("count-bits", "Counting bits", "Use n & (n - 1) or DP on bits.", "Counting Bits"),
      p("bitmask", "Bitmasks", "Represent subsets as integers.", "Subsets (bitmask)"),
    ],
  },
];

export const MAX_PROBLEMS_PER_SET = 9;
