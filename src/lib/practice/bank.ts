import "server-only";

// Built-in set of widely known interview problems (statements written for this app). Used as
// the mock-mode output and as a clearly labeled fallback when the AI is not configured.
// Solutions are revealed only when the student asks for the step-by-step walkthrough.

import { type PracticeLanguage, blankStarter } from "./catalog";
import type { Difficulty, PracticeExample, PracticeProblem, PracticeTestCase } from "./types";

export interface BankEntry {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  pattern: string;
  knownAs: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: PracticeExample[];
  testCases: PracticeTestCase[];
  expectations: string[];
  starters: { python: string; javascript: string };
  hints: [string, string, string];
  steps: { heading: string; body: string }[];
  solutionPython: string;
  complexity: string;
}

const t = (input: string, expectedOutput: string, note?: string): PracticeTestCase => ({
  input,
  expectedOutput,
  ...(note ? { note } : {}),
});
const ex = (input: string, output: string, explanation?: string): PracticeExample => ({
  input,
  output,
  ...(explanation ? { explanation } : {}),
});

const COMMON = [
  "Explain your approach out loud before coding.",
  "State the time and space complexity.",
];

export const BANK: BankEntry[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    topic: "Arrays & Hashing",
    pattern: "Hash map lookup",
    knownAs: "Classic interview problem (LeetCode 1)",
    statement:
      "Given an array of integers nums and an integer target, return the indices of the two different elements that add up to target. Exactly one valid pair exists. Return the indices in any order.",
    inputFormat: "nums: list of integers, target: integer",
    outputFormat: "A list of two indices [i, j] with i != j",
    constraints: [
      "2 ≤ nums.length ≤ 10^4",
      "-10^9 ≤ nums[i], target ≤ 10^9",
      "Exactly one answer exists",
    ],
    examples: [
      ex("nums = [2, 7, 11, 15], target = 9", "[0, 1]", "nums[0] + nums[1] = 2 + 7 = 9"),
      ex("nums = [3, 2, 4], target = 6", "[1, 2]"),
    ],
    testCases: [
      t("nums = [3, 3], target = 6", "[0, 1]", "duplicate values"),
      t("nums = [-1, -2, -3, -4, -5], target = -8", "[2, 4]", "negative numbers"),
      t("nums = [0, 4, 3, 0], target = 0", "[0, 3]", "zeros"),
    ],
    expectations: [...COMMON, "Beat the O(n²) brute force: aim for O(n) time."],
    starters: {
      python: "def two_sum(nums: list[int], target: int) -> list[int]:\n    pass\n",
      javascript: "function twoSum(nums, target) {\n  \n}\n",
    },
    hints: [
      "For each number x, the partner you need is target - x.",
      "Checking every earlier number is slow. Is there a structure that answers 'have I seen this value?' in O(1)?",
      "Walk the array once. Before storing x, look up target - x in a hash map of value → index.",
    ],
    steps: [
      {
        heading: "Why a hash map?",
        body: "Brute force compares every pair: O(n²). We only need to know if the complement of the current number appeared earlier, which a hash map answers in O(1).",
      },
      { heading: "What to store", body: "Map each value we've passed to its index." },
      {
        heading: "How to proceed",
        body: "For index i with value x: if target - x is in the map, return [map[target - x], i]. Otherwise store map[x] = i. Checking before storing avoids pairing an element with itself.",
      },
    ],
    solutionPython:
      "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n",
    complexity: "O(n) time, O(n) space",
  },
  {
    id: "valid-anagram",
    title: "Valid Anagram",
    difficulty: "Easy",
    topic: "Arrays & Hashing",
    pattern: "Frequency counting",
    knownAs: "Classic interview problem (LeetCode 242)",
    statement:
      "Given two strings s and t, return true if t is an anagram of s (same letters with the same counts, in any order), and false otherwise.",
    inputFormat: "s: string, t: string (lowercase English letters)",
    outputFormat: "Boolean",
    constraints: ["1 ≤ s.length, t.length ≤ 5 × 10^4", "Lowercase English letters only"],
    examples: [ex('s = "anagram", t = "nagaram"', "true"), ex('s = "rat", t = "car"', "false")],
    testCases: [
      t('s = "a", t = "ab"', "false", "different lengths"),
      t('s = "aacc", t = "ccac"', "false", "same letters, different counts"),
      t('s = "listen", t = "silent"', "true"),
    ],
    expectations: [...COMMON, "O(n) time; say how you'd handle Unicode."],
    starters: {
      python: "def is_anagram(s: str, t: str) -> bool:\n    pass\n",
      javascript: "function isAnagram(s, t) {\n  \n}\n",
    },
    hints: [
      "If the lengths differ, can they be anagrams?",
      "Anagrams have the same count for every letter.",
      "Count letters of s up, letters of t down (26-slot array or hash map); all counts must end at 0.",
    ],
    steps: [
      {
        heading: "Why counting?",
        body: "Order doesn't matter, only how many of each letter. Counting captures exactly that.",
      },
      {
        heading: "What to track",
        body: "A count per letter: +1 for each letter in s, -1 for each in t.",
      },
      {
        heading: "How to proceed",
        body: "Return false early if lengths differ. After counting, every count must be zero.",
      },
    ],
    solutionPython:
      "def is_anagram(s, t):\n    if len(s) != len(t):\n        return False\n    counts = {}\n    for a, b in zip(s, t):\n        counts[a] = counts.get(a, 0) + 1\n        counts[b] = counts.get(b, 0) - 1\n    return all(v == 0 for v in counts.values())\n",
    complexity: "O(n) time, O(1) space for a fixed alphabet",
  },
  {
    id: "subarray-sum-k",
    title: "Subarray Sum Equals K",
    difficulty: "Medium",
    topic: "Arrays & Hashing",
    pattern: "Prefix sums",
    knownAs: "Frequently asked (LeetCode 560)",
    statement:
      "Given an integer array nums and an integer k, return the number of contiguous non-empty subarrays whose sum equals k.",
    inputFormat: "nums: list of integers (may be negative), k: integer",
    outputFormat: "Integer count",
    constraints: ["1 ≤ nums.length ≤ 2 × 10^4", "-1000 ≤ nums[i] ≤ 1000", "-10^7 ≤ k ≤ 10^7"],
    examples: [
      ex("nums = [1, 1, 1], k = 2", "2", "[1,1] at indices 0–1 and 1–2"),
      ex("nums = [1, 2, 3], k = 3", "2"),
    ],
    testCases: [
      t("nums = [1, -1, 0], k = 0", "3", "negatives and zero"),
      t("nums = [3], k = 3", "1"),
      t("nums = [1, 2, 1, 2, 1], k = 3", "4"),
    ],
    expectations: [...COMMON, "Explain why sliding window fails with negative numbers."],
    starters: {
      python: "def subarray_sum(nums: list[int], k: int) -> int:\n    pass\n",
      javascript: "function subarraySum(nums, k) {\n  \n}\n",
    },
    hints: [
      "The sum of nums[i..j] equals prefix[j+1] - prefix[i].",
      "You want the number of earlier prefixes equal to currentPrefix - k.",
      "Keep a hash map from prefix sum → how many times it has occurred, starting with {0: 1}.",
    ],
    steps: [
      {
        heading: "Why prefix sums?",
        body: "Negative numbers break the sliding window. Prefix sums turn 'subarray sums to k' into 'two prefixes differ by k'.",
      },
      {
        heading: "What to store",
        body: "Counts of each prefix sum seen so far; start with 0 seen once (the empty prefix).",
      },
      {
        heading: "How to proceed",
        body: "Running sum s; add count[s - k] to the answer, then increment count[s].",
      },
    ],
    solutionPython:
      "def subarray_sum(nums, k):\n    count = {0: 1}\n    s = ans = 0\n    for x in nums:\n        s += x\n        ans += count.get(s - k, 0)\n        count[s] = count.get(s, 0) + 1\n    return ans\n",
    complexity: "O(n) time, O(n) space",
  },
  {
    id: "container-most-water",
    title: "Container With Most Water",
    difficulty: "Medium",
    topic: "Two Pointers",
    pattern: "Opposite ends",
    knownAs: "Classic interview problem (LeetCode 11)",
    statement:
      "You are given heights of vertical lines at positions 0..n-1. Choose two lines that, with the x-axis, hold the most water. Return that maximum area (width × shorter height).",
    inputFormat: "height: list of non-negative integers",
    outputFormat: "Integer (maximum area)",
    constraints: ["2 ≤ height.length ≤ 10^5", "0 ≤ height[i] ≤ 10^4"],
    examples: [
      ex("height = [1, 8, 6, 2, 5, 4, 8, 3, 7]", "49", "lines at 1 and 8: width 7 × height 7"),
      ex("height = [1, 1]", "1"),
    ],
    testCases: [
      t("height = [4, 3, 2, 1, 4]", "16"),
      t("height = [1, 2, 1]", "2"),
      t("height = [0, 0]", "0", "all zero"),
    ],
    expectations: [...COMMON, "Justify why moving the shorter line is safe."],
    starters: {
      python: "def max_area(height: list[int]) -> int:\n    pass\n",
      javascript: "function maxArea(height) {\n  \n}\n",
    },
    hints: [
      "Start with the widest container: the first and last lines.",
      "The shorter line limits the area. Moving the taller one can never help. Why?",
      "Move the pointer at the shorter line inward, tracking the best area.",
    ],
    steps: [
      {
        heading: "Why two pointers?",
        body: "Checking all pairs is O(n²). Starting wide and shrinking lets us skip pairs that can't be better.",
      },
      {
        heading: "What decides the move",
        body: "Area = width × min(h[l], h[r]). Moving the taller line only shrinks width without raising the min, so move the shorter one.",
      },
      {
        heading: "How to proceed",
        body: "l = 0, r = n-1; update best; move the shorter side; stop when l meets r.",
      },
    ],
    solutionPython:
      "def max_area(height):\n    l, r, best = 0, len(height) - 1, 0\n    while l < r:\n        best = max(best, (r - l) * min(height[l], height[r]))\n        if height[l] < height[r]:\n            l += 1\n        else:\n            r -= 1\n    return best\n",
    complexity: "O(n) time, O(1) space",
  },
  {
    id: "longest-substring",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "Medium",
    topic: "Sliding Window",
    pattern: "Variable window",
    knownAs: "Classic interview problem (LeetCode 3)",
    statement:
      "Given a string s, return the length of the longest substring (contiguous) that has no repeated characters.",
    inputFormat: "s: string",
    outputFormat: "Integer length",
    constraints: ["0 ≤ s.length ≤ 5 × 10^4", "s has letters, digits, symbols and spaces"],
    examples: [ex('s = "abcabcbb"', "3", '"abc"'), ex('s = "bbbbb"', "1")],
    testCases: [
      t('s = ""', "0", "empty string"),
      t('s = "pwwkew"', "3", '"wke"'),
      t('s = "abba"', "2", "left pointer must not move backwards"),
    ],
    expectations: [...COMMON, "O(n) time."],
    starters: {
      python: "def length_of_longest_substring(s: str) -> int:\n    pass\n",
      javascript: "function lengthOfLongestSubstring(s) {\n  \n}\n",
    },
    hints: [
      "Keep a window [left, right] that never contains a repeat.",
      "When s[right] repeats inside the window, move left just past its previous position.",
      "Store the last index of each character; left = max(left, last[c] + 1).",
    ],
    steps: [
      {
        heading: "Why a sliding window?",
        body: "Every valid substring is a window; we extend right and only shrink left when a rule breaks, so each index moves at most once.",
      },
      { heading: "What to track", body: "The last index where each character appeared." },
      {
        heading: "How to proceed",
        body: "For each right: if s[right] was seen at or after left, set left to last+1. Update last and the best length right-left+1.",
      },
    ],
    solutionPython:
      "def length_of_longest_substring(s):\n    last, left, best = {}, 0, 0\n    for right, c in enumerate(s):\n        if c in last and last[c] >= left:\n            left = last[c] + 1\n        last[c] = right\n        best = max(best, right - left + 1)\n    return best\n",
    complexity: "O(n) time, O(min(n, alphabet)) space",
  },
  {
    id: "binary-search",
    title: "Binary Search",
    difficulty: "Easy",
    topic: "Binary Search",
    pattern: "Classic search in a sorted array",
    knownAs: "Classic interview problem (LeetCode 704)",
    statement:
      "Given a sorted (ascending) array of distinct integers nums and a target, return the index of target, or -1 if it isn't present. Your algorithm must run in O(log n).",
    inputFormat: "nums: sorted list of distinct integers, target: integer",
    outputFormat: "Index or -1",
    constraints: ["1 ≤ nums.length ≤ 10^4", "All values distinct and sorted ascending"],
    examples: [
      ex("nums = [-1, 0, 3, 5, 9, 12], target = 9", "4"),
      ex("nums = [-1, 0, 3, 5, 9, 12], target = 2", "-1"),
    ],
    testCases: [
      t("nums = [5], target = 5", "0", "single element"),
      t("nums = [1, 3], target = 3", "1", "last element"),
      t("nums = [1, 3], target = 0", "-1", "smaller than all"),
    ],
    expectations: [...COMMON, "Avoid overflow when computing mid in fixed-width languages."],
    starters: {
      python: "def search(nums: list[int], target: int) -> int:\n    pass\n",
      javascript: "function search(nums, target) {\n  \n}\n",
    },
    hints: [
      "Compare target with the middle element. What does that tell you about each half?",
      "Keep lo and hi as the range that could still contain target.",
      "Loop while lo <= hi; mid = lo + (hi - lo) // 2; move lo = mid + 1 or hi = mid - 1.",
    ],
    steps: [
      {
        heading: "Why it works",
        body: "Sorted order means one comparison rules out half the remaining range.",
      },
      { heading: "What the invariant is", body: "If target exists, it's inside [lo, hi]." },
      {
        heading: "How to proceed",
        body: "Check mid; equal → return; smaller → search right; larger → search left. Empty range → -1.",
      },
    ],
    solutionPython:
      "def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = lo + (hi - lo) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n",
    complexity: "O(log n) time, O(1) space",
  },
  {
    id: "first-last-position",
    title: "Find First and Last Position of Element",
    difficulty: "Medium",
    topic: "Binary Search",
    pattern: "First / last occurrence (bounds)",
    knownAs: "Frequently asked (LeetCode 34)",
    statement:
      "Given a sorted array nums (may contain duplicates) and a target, return [first, last], the first and last index of target. Return [-1, -1] if target is absent. Must be O(log n).",
    inputFormat: "nums: sorted list of integers, target: integer",
    outputFormat: "[first, last]",
    constraints: ["0 ≤ nums.length ≤ 10^5", "nums sorted ascending"],
    examples: [
      ex("nums = [5, 7, 7, 8, 8, 10], target = 8", "[3, 4]"),
      ex("nums = [5, 7, 7, 8, 8, 10], target = 6", "[-1, -1]"),
    ],
    testCases: [
      t("nums = [], target = 0", "[-1, -1]", "empty array"),
      t("nums = [2, 2, 2], target = 2", "[0, 2]", "all equal"),
      t("nums = [1], target = 1", "[0, 0]"),
    ],
    expectations: [...COMMON, "Two O(log n) searches, not a linear scan after finding one match."],
    starters: {
      python: "def search_range(nums: list[int], target: int) -> list[int]:\n    pass\n",
      javascript: "function searchRange(nums, target) {\n  \n}\n",
    },
    hints: [
      "A normal binary search stops at any match. You need the boundary.",
      "When you find target, record it and keep searching left (for first) or right (for last).",
      "Or write lower_bound(x): first index with nums[i] >= x. Then first = lower_bound(target), last = lower_bound(target + 1) - 1.",
    ],
    steps: [
      {
        heading: "Why not stop at a match?",
        body: "Duplicates mean the first match may not be the first occurrence.",
      },
      {
        heading: "What to compute",
        body: "The lowest index with nums[i] >= target, and the lowest index with nums[i] > target.",
      },
      {
        heading: "How to proceed",
        body: "Implement lower_bound with lo = 0, hi = n (half-open). Check the found index actually holds target.",
      },
    ],
    solutionPython:
      "def search_range(nums, target):\n    def lower(x):\n        lo, hi = 0, len(nums)\n        while lo < hi:\n            mid = (lo + hi) // 2\n            if nums[mid] < x:\n                lo = mid + 1\n            else:\n                hi = mid\n        return lo\n    first = lower(target)\n    if first == len(nums) or nums[first] != target:\n        return [-1, -1]\n    return [first, lower(target + 1) - 1]\n",
    complexity: "O(log n) time, O(1) space",
  },
  {
    id: "rotated-search",
    title: "Search in Rotated Sorted Array",
    difficulty: "Medium",
    topic: "Binary Search",
    pattern: "Rotated sorted array",
    knownAs: "Classic interview problem (LeetCode 33)",
    statement:
      "A sorted array of distinct integers was rotated at an unknown pivot (e.g. [0,1,2,4,5,6,7] → [4,5,6,7,0,1,2]). Given the rotated array and a target, return its index or -1, in O(log n).",
    inputFormat: "nums: rotated sorted list of distinct integers, target: integer",
    outputFormat: "Index or -1",
    constraints: ["1 ≤ nums.length ≤ 5000", "All values distinct"],
    examples: [
      ex("nums = [4, 5, 6, 7, 0, 1, 2], target = 0", "4"),
      ex("nums = [4, 5, 6, 7, 0, 1, 2], target = 3", "-1"),
    ],
    testCases: [
      t("nums = [1], target = 0", "-1"),
      t("nums = [3, 1], target = 1", "1", "two elements"),
      t("nums = [5, 1, 3], target = 5", "0"),
    ],
    expectations: [...COMMON, "Explain how you know which half is sorted."],
    starters: {
      python: "def search(nums: list[int], target: int) -> int:\n    pass\n",
      javascript: "function search(nums, target) {\n  \n}\n",
    },
    hints: [
      "Split at mid: at least one half is still perfectly sorted.",
      "If nums[lo] <= nums[mid], the left half is sorted.",
      "If target lies within the sorted half's range, search there; otherwise search the other half.",
    ],
    steps: [
      {
        heading: "Why binary search still works",
        body: "Rotation breaks global order, but one side of mid is always sorted, and we can test if target is inside it.",
      },
      {
        heading: "What to check",
        body: "Which half is sorted (compare nums[lo] with nums[mid]), then whether target is within that half's min and max.",
      },
      {
        heading: "How to proceed",
        body: "Discard the half that can't contain target, just like classic binary search.",
      },
    ],
    solutionPython:
      "def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[lo] <= nums[mid]:\n            if nums[lo] <= target < nums[mid]:\n                hi = mid - 1\n            else:\n                lo = mid + 1\n        else:\n            if nums[mid] < target <= nums[hi]:\n                lo = mid + 1\n            else:\n                hi = mid - 1\n    return -1\n",
    complexity: "O(log n) time, O(1) space",
  },
  {
    id: "koko-bananas",
    title: "Koko Eating Bananas",
    difficulty: "Medium",
    topic: "Binary Search",
    pattern: "Search on the answer",
    knownAs: "Frequently asked (LeetCode 875)",
    statement:
      "There are piles of bananas; piles[i] is the size of pile i. Koko eats at speed k bananas per hour, one pile at a time (if a pile has fewer than k, she finishes it and waits for the hour to end). Return the minimum integer k that lets her finish all piles within h hours.",
    inputFormat: "piles: list of positive integers, h: integer",
    outputFormat: "Minimum speed k",
    constraints: ["1 ≤ piles.length ≤ 10^4", "piles.length ≤ h ≤ 10^9", "1 ≤ piles[i] ≤ 10^9"],
    examples: [
      ex("piles = [3, 6, 7, 11], h = 8", "4"),
      ex("piles = [30, 11, 23, 4, 20], h = 5", "30"),
    ],
    testCases: [
      t("piles = [30, 11, 23, 4, 20], h = 6", "23"),
      t("piles = [1], h = 1", "1"),
      t("piles = [1000000000], h = 2", "500000000", "large values"),
    ],
    expectations: [...COMMON, "Explain why 'can finish at speed k' is monotonic."],
    starters: {
      python: "def min_eating_speed(piles: list[int], h: int) -> int:\n    pass\n",
      javascript: "function minEatingSpeed(piles, h) {\n  \n}\n",
    },
    hints: [
      "If speed k works, does every faster speed also work?",
      "The answer is between 1 and max(piles). Binary search that range.",
      "hours(k) = sum(ceil(p / k)). Find the smallest k with hours(k) <= h.",
    ],
    steps: [
      {
        heading: "Why search the answer?",
        body: "We can't search the array directly, but 'is k fast enough?' is yes for all k above some threshold. That monotonic yes/no is binary-searchable.",
      },
      {
        heading: "What the check is",
        body: "Total hours at speed k: sum of ceil(pile / k). Feasible if ≤ h.",
      },
      {
        heading: "How to proceed",
        body: "lo = 1, hi = max(piles). While lo < hi: mid feasible → hi = mid, else lo = mid + 1. Return lo.",
      },
    ],
    solutionPython:
      "def min_eating_speed(piles, h):\n    lo, hi = 1, max(piles)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        hours = sum((p + mid - 1) // mid for p in piles)\n        if hours <= h:\n            hi = mid\n        else:\n            lo = mid + 1\n    return lo\n",
    complexity: "O(n log max(piles)) time, O(1) space",
  },
  {
    id: "search-2d-matrix",
    title: "Search a 2D Matrix",
    difficulty: "Medium",
    topic: "Binary Search",
    pattern: "2D matrix search",
    knownAs: "Frequently asked (LeetCode 74)",
    statement:
      "An m × n matrix has each row sorted ascending, and each row's first value is greater than the previous row's last value. Return true if target is in the matrix. Must be O(log(m·n)).",
    inputFormat: "matrix: m × n list of lists, target: integer",
    outputFormat: "Boolean",
    constraints: ["1 ≤ m, n ≤ 100", "-10^4 ≤ values, target ≤ 10^4"],
    examples: [
      ex("matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 3", "true"),
      ex("matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 13", "false"),
    ],
    testCases: [
      t("matrix = [[1]], target = 1", "true"),
      t("matrix = [[1, 3]], target = 3", "true", "single row"),
      t("matrix = [[1], [3]], target = 2", "false", "single column"),
    ],
    expectations: [...COMMON, "Explain the index mapping between 1D and 2D."],
    starters: {
      python: "def search_matrix(matrix: list[list[int]], target: int) -> bool:\n    pass\n",
      javascript: "function searchMatrix(matrix, target) {\n  \n}\n",
    },
    hints: [
      "Reading the matrix row by row gives one long sorted list.",
      "Index i in that list maps to row i // n, column i % n.",
      "Run classic binary search over 0 .. m·n - 1 using that mapping.",
    ],
    steps: [
      {
        heading: "Why it's one sorted list",
        body: "Rows are sorted and each row starts above the previous row's end.",
      },
      { heading: "What the mapping is", body: "Virtual index i → matrix[i // n][i % n]." },
      { heading: "How to proceed", body: "Binary search lo = 0, hi = m·n - 1 with the mapping." },
    ],
    solutionPython:
      "def search_matrix(matrix, target):\n    m, n = len(matrix), len(matrix[0])\n    lo, hi = 0, m * n - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        v = matrix[mid // n][mid % n]\n        if v == target:\n            return True\n        if v < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return False\n",
    complexity: "O(log(m·n)) time, O(1) space",
  },
  {
    id: "find-peak",
    title: "Find Peak Element",
    difficulty: "Medium",
    topic: "Binary Search",
    pattern: "Peak finding",
    knownAs: "Frequently asked (LeetCode 162)",
    statement:
      "A peak is an element strictly greater than its neighbors. Given nums where nums[i] != nums[i+1], and imagining nums[-1] = nums[n] = -∞, return the index of any peak in O(log n).",
    inputFormat: "nums: list of integers, adjacent values differ",
    outputFormat: "Index of any peak",
    constraints: ["1 ≤ nums.length ≤ 1000", "nums[i] != nums[i + 1]"],
    examples: [
      ex("nums = [1, 2, 3, 1]", "2"),
      ex("nums = [1, 2, 1, 3, 5, 6, 4]", "1 or 5", "either peak is accepted"),
    ],
    testCases: [
      t("nums = [1]", "0"),
      t("nums = [2, 1]", "0", "peak at the start"),
      t("nums = [1, 2]", "1", "peak at the end"),
    ],
    expectations: [...COMMON, "Explain why moving toward the larger neighbor guarantees a peak."],
    starters: {
      python: "def find_peak_element(nums: list[int]) -> int:\n    pass\n",
      javascript: "function findPeakElement(nums) {\n  \n}\n",
    },
    hints: [
      "If nums[mid] < nums[mid + 1], you're on a rising slope.",
      "A rising slope must eventually come down (the edge is -∞), so a peak exists to the right.",
      "Binary search with lo < hi: rising → lo = mid + 1, else hi = mid.",
    ],
    steps: [
      {
        heading: "Why binary search on unsorted data?",
        body: "We don't need order, just a guarantee: moving toward the bigger neighbor always leads to a peak.",
      },
      { heading: "What to compare", body: "nums[mid] with nums[mid + 1]." },
      {
        heading: "How to proceed",
        body: "Shrink toward the larger side until lo == hi; that index is a peak.",
      },
    ],
    solutionPython:
      "def find_peak_element(nums):\n    lo, hi = 0, len(nums) - 1\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < nums[mid + 1]:\n            lo = mid + 1\n        else:\n            hi = mid\n    return lo\n",
    complexity: "O(log n) time, O(1) space",
  },
  {
    id: "reverse-linked-list",
    title: "Reverse Linked List",
    difficulty: "Easy",
    topic: "Linked List",
    pattern: "Reversal",
    knownAs: "Classic interview problem (LeetCode 206)",
    statement: "Given the head of a singly linked list, reverse the list and return the new head.",
    inputFormat: "head: first node of a singly linked list (shown as a list of values)",
    outputFormat: "Head of the reversed list",
    constraints: ["0 ≤ number of nodes ≤ 5000", "-5000 ≤ node value ≤ 5000"],
    examples: [ex("head = [1, 2, 3, 4, 5]", "[5, 4, 3, 2, 1]"), ex("head = [1, 2]", "[2, 1]")],
    testCases: [
      t("head = []", "[]", "empty list"),
      t("head = [7]", "[7]", "single node"),
      t("head = [1, 1, 2]", "[2, 1, 1]"),
    ],
    expectations: [...COMMON, "Iterative O(1) space; mention the recursive version too."],
    starters: {
      python:
        "class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head: ListNode | None) -> ListNode | None:\n    pass\n",
      javascript:
        "// function ListNode(val, next) { this.val = val; this.next = next ?? null; }\nfunction reverseList(head) {\n  \n}\n",
    },
    hints: [
      "Each node's next should point to the node before it.",
      "You need to remember the previous node and the next node before you overwrite next.",
      "prev = None; while cur: nxt = cur.next; cur.next = prev; prev = cur; cur = nxt.",
    ],
    steps: [
      {
        heading: "What changes",
        body: "Only the next pointers: each one flips to point backward.",
      },
      {
        heading: "Why three variables",
        body: "Overwriting cur.next loses the rest of the list, so save it in nxt first.",
      },
      {
        heading: "How to proceed",
        body: "Walk once, flipping pointers; prev ends as the new head.",
      },
    ],
    solutionPython:
      "def reverse_list(head):\n    prev, cur = None, head\n    while cur:\n        nxt = cur.next\n        cur.next = prev\n        prev, cur = cur, nxt\n    return prev\n",
    complexity: "O(n) time, O(1) space",
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Easy",
    topic: "Stack & Queue",
    pattern: "Matching pairs",
    knownAs: "Classic interview problem (LeetCode 20)",
    statement:
      "Given a string of only '(', ')', '{', '}', '[' and ']', return true if every opener is closed by the same type of bracket in the correct order.",
    inputFormat: "s: string of bracket characters",
    outputFormat: "Boolean",
    constraints: ["1 ≤ s.length ≤ 10^4"],
    examples: [ex('s = "()[]{}"', "true"), ex('s = "(]"', "false")],
    testCases: [
      t('s = "([)]"', "false", "wrong order"),
      t('s = "{[]}"', "true", "nested"),
      t('s = "(("', "false", "unclosed"),
    ],
    expectations: [...COMMON],
    starters: {
      python: "def is_valid(s: str) -> bool:\n    pass\n",
      javascript: "function isValid(s) {\n  \n}\n",
    },
    hints: [
      "The most recent unclosed opener must be closed first.",
      "Last-in, first-out: that's a stack.",
      "Push openers; on a closer, the stack top must be its matching opener. The stack must be empty at the end.",
    ],
    steps: [
      {
        heading: "Why a stack?",
        body: "Brackets close in reverse order of opening, which is exactly LIFO.",
      },
      { heading: "What to map", body: "Each closer to its opener: ')'→'(', ']'→'[', '}'→'{'." },
      {
        heading: "How to proceed",
        body: "Scan; push openers; for closers, pop and compare. Fail on mismatch or an empty stack; succeed if the stack ends empty.",
      },
    ],
    solutionPython:
      "def is_valid(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for c in s:\n        if c in pairs:\n            if not stack or stack.pop() != pairs[c]:\n                return False\n        else:\n            stack.append(c)\n    return not stack\n",
    complexity: "O(n) time, O(n) space",
  },
  {
    id: "daily-temperatures",
    title: "Daily Temperatures",
    difficulty: "Medium",
    topic: "Stack & Queue",
    pattern: "Monotonic stack",
    knownAs: "Frequently asked (LeetCode 739)",
    statement:
      "Given daily temperatures, return an array where answer[i] is how many days you wait after day i for a warmer temperature, or 0 if there is none.",
    inputFormat: "temperatures: list of integers",
    outputFormat: "List of integers (same length)",
    constraints: ["1 ≤ temperatures.length ≤ 10^5", "30 ≤ temperatures[i] ≤ 100"],
    examples: [
      ex("temperatures = [73, 74, 75, 71, 69, 72, 76, 73]", "[1, 1, 4, 2, 1, 1, 0, 0]"),
      ex("temperatures = [30, 40, 50, 60]", "[1, 1, 1, 0]"),
    ],
    testCases: [
      t("temperatures = [30, 60, 90]", "[1, 1, 0]"),
      t("temperatures = [90, 80, 70]", "[0, 0, 0]", "never warmer"),
      t("temperatures = [50, 50, 51]", "[2, 1, 0]", "equal is not warmer"),
    ],
    expectations: [...COMMON, "O(n): explain why each index is pushed and popped once."],
    starters: {
      python: "def daily_temperatures(temperatures: list[int]) -> list[int]:\n    pass\n",
      javascript: "function dailyTemperatures(temperatures) {\n  \n}\n",
    },
    hints: [
      "For each day you need the next greater element to the right.",
      "Keep days that are still waiting for a warmer day on a stack.",
      "The stack holds indices with decreasing temperatures; a warmer day pops them and fills in their answers.",
    ],
    steps: [
      {
        heading: "Why a monotonic stack?",
        body: "A warmer day resolves every cooler day still waiting, most recent first.",
      },
      {
        heading: "What the stack holds",
        body: "Indices whose answer isn't known yet, in decreasing temperature order.",
      },
      {
        heading: "How to proceed",
        body: "For each i: while the stack top is cooler, pop j and set ans[j] = i - j. Push i.",
      },
    ],
    solutionPython:
      "def daily_temperatures(temperatures):\n    ans = [0] * len(temperatures)\n    stack = []\n    for i, t in enumerate(temperatures):\n        while stack and temperatures[stack[-1]] < t:\n            j = stack.pop()\n            ans[j] = i - j\n        stack.append(i)\n    return ans\n",
    complexity: "O(n) time, O(n) space",
  },
  {
    id: "max-depth-tree",
    title: "Maximum Depth of Binary Tree",
    difficulty: "Easy",
    topic: "Trees",
    pattern: "Depth-first recursion",
    knownAs: "Classic interview problem (LeetCode 104)",
    statement:
      "Given the root of a binary tree, return its maximum depth: the number of nodes on the longest path from the root down to a leaf.",
    inputFormat: "root: binary tree (shown in level order, null for missing children)",
    outputFormat: "Integer depth",
    constraints: ["0 ≤ number of nodes ≤ 10^4"],
    examples: [ex("root = [3, 9, 20, null, null, 15, 7]", "3"), ex("root = [1, null, 2]", "2")],
    testCases: [
      t("root = []", "0", "empty tree"),
      t("root = [1]", "1"),
      t("root = [1, 2, null, 3, null, 4]", "4", "skewed tree"),
    ],
    expectations: [...COMMON, "Mention recursion depth risk on skewed trees."],
    starters: {
      python:
        "class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val, self.left, self.right = val, left, right\n\ndef max_depth(root: TreeNode | None) -> int:\n    pass\n",
      javascript: "function maxDepth(root) {\n  \n}\n",
    },
    hints: [
      "What is the depth of an empty tree?",
      "The depth of a node is 1 + the deeper of its two subtrees.",
      "Recursively: 0 for None, else 1 + max(depth(left), depth(right)).",
    ],
    steps: [
      {
        heading: "Why recursion?",
        body: "A tree is made of smaller trees; the answer for a node depends only on its children's answers.",
      },
      { heading: "Base case", body: "An empty subtree has depth 0." },
      {
        heading: "How to proceed",
        body: "Return 1 + max(left depth, right depth). BFS level counting also works.",
      },
    ],
    solutionPython:
      "def max_depth(root):\n    if not root:\n        return 0\n    return 1 + max(max_depth(root.left), max_depth(root.right))\n",
    complexity: "O(n) time, O(h) space for recursion",
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    difficulty: "Medium",
    topic: "Graphs",
    pattern: "Grid DFS / connected components",
    knownAs: "Classic interview problem (LeetCode 200)",
    statement:
      "Given an m × n grid of '1' (land) and '0' (water), return the number of islands. An island is land connected horizontally or vertically.",
    inputFormat: "grid: m × n list of '1'/'0' characters",
    outputFormat: "Integer count",
    constraints: ["1 ≤ m, n ≤ 300"],
    examples: [
      ex('grid = [["1","1","0"],["1","0","0"],["0","0","1"]]', "2"),
      ex('grid = [["0"]]', "0"),
    ],
    testCases: [
      t('grid = [["1"]]', "1"),
      t('grid = [["1","0","1","0","1"]]', "3", "separate cells"),
      t('grid = [["1","1"],["1","1"]]', "1", "one block"),
    ],
    expectations: [...COMMON, "Discuss BFS vs DFS and recursion depth."],
    starters: {
      python: "def num_islands(grid: list[list[str]]) -> int:\n    pass\n",
      javascript: "function numIslands(grid) {\n  \n}\n",
    },
    hints: [
      "Each island is a connected component of '1' cells.",
      "When you find unvisited land, explore its whole island so you never count it again.",
      "Loop over cells; on a '1', add 1 and flood-fill (DFS/BFS) turning connected land into '0'.",
    ],
    steps: [
      {
        heading: "Why flood fill?",
        body: "Counting components = count how many times you start a new exploration.",
      },
      { heading: "What marks visited", body: "Overwrite land with '0' (or use a visited set)." },
      {
        heading: "How to proceed",
        body: "For every cell that is '1': count it, then DFS to its 4 neighbors inside the grid.",
      },
    ],
    solutionPython:
      "def num_islands(grid):\n    m, n = len(grid), len(grid[0])\n    def sink(r, c):\n        if 0 <= r < m and 0 <= c < n and grid[r][c] == '1':\n            grid[r][c] = '0'\n            sink(r + 1, c); sink(r - 1, c); sink(r, c + 1); sink(r, c - 1)\n    count = 0\n    for r in range(m):\n        for c in range(n):\n            if grid[r][c] == '1':\n                count += 1\n                sink(r, c)\n    return count\n",
    complexity: "O(m·n) time, O(m·n) worst-case space",
  },
  {
    id: "kth-largest",
    title: "Kth Largest Element in an Array",
    difficulty: "Medium",
    topic: "Heaps / Priority Queue",
    pattern: "Top K elements",
    knownAs: "Frequently asked (LeetCode 215)",
    statement:
      "Given an integer array nums and an integer k, return the kth largest element (in sorted order, not the kth distinct).",
    inputFormat: "nums: list of integers, k: integer",
    outputFormat: "Integer",
    constraints: ["1 ≤ k ≤ nums.length ≤ 10^5"],
    examples: [
      ex("nums = [3, 2, 1, 5, 6, 4], k = 2", "5"),
      ex("nums = [3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4", "4"),
    ],
    testCases: [
      t("nums = [1], k = 1", "1"),
      t("nums = [2, 2, 2], k = 2", "2", "duplicates"),
      t("nums = [-1, -5, 3], k = 3", "-5"),
    ],
    expectations: [...COMMON, "Better than sorting when k is small; mention quickselect."],
    starters: {
      python: "def find_kth_largest(nums: list[int], k: int) -> int:\n    pass\n",
      javascript: "function findKthLargest(nums, k) {\n  \n}\n",
    },
    hints: [
      "Sorting works in O(n log n). Can you avoid sorting everything?",
      "Keep only the k largest values seen so far.",
      "Use a min-heap of size k; the heap's top is the kth largest.",
    ],
    steps: [
      {
        heading: "Why a min-heap of size k?",
        body: "The smallest of the k largest values is exactly the answer, and a min-heap keeps it at the top.",
      },
      {
        heading: "What to do per element",
        body: "Push it; if the heap grows past k, pop the smallest.",
      },
      { heading: "How to finish", body: "Return the heap top. O(n log k)." },
    ],
    solutionPython:
      "import heapq\n\ndef find_kth_largest(nums, k):\n    heap = []\n    for x in nums:\n        heapq.heappush(heap, x)\n        if len(heap) > k:\n            heapq.heappop(heap)\n    return heap[0]\n",
    complexity: "O(n log k) time, O(k) space",
  },
  {
    id: "subsets",
    title: "Subsets",
    difficulty: "Medium",
    topic: "Backtracking",
    pattern: "Subsets",
    knownAs: "Classic interview problem (LeetCode 78)",
    statement:
      "Given an array of distinct integers, return all possible subsets (the power set), with no duplicate subsets, in any order.",
    inputFormat: "nums: list of distinct integers",
    outputFormat: "List of subsets",
    constraints: ["1 ≤ nums.length ≤ 10", "All values distinct"],
    examples: [
      ex("nums = [1, 2, 3]", "[[], [1], [2], [1,2], [3], [1,3], [2,3], [1,2,3]]"),
      ex("nums = [0]", "[[], [0]]"),
    ],
    testCases: [
      t("nums = [5, 6]", "[[], [5], [6], [5,6]]"),
      t("nums = [1, 2, 3, 4]", "16 subsets", "count check"),
      t("nums = [-1]", "[[], [-1]]"),
    ],
    expectations: [...COMMON, "Explain why there are 2^n subsets."],
    starters: {
      python: "def subsets(nums: list[int]) -> list[list[int]]:\n    pass\n",
      javascript: "function subsets(nums) {\n  \n}\n",
    },
    hints: [
      "Every element is either in a subset or not.",
      "Make that choice one element at a time, recursively.",
      "Backtrack(i, path): record path; for j from i to n-1, add nums[j], recurse with j + 1, then remove it.",
    ],
    steps: [
      {
        heading: "Why backtracking?",
        body: "The answer is every combination of include/skip choices; backtracking explores them systematically.",
      },
      { heading: "What the state is", body: "The index to consider next and the current path." },
      {
        heading: "How to proceed",
        body: "Add a copy of path at each call, extend with later elements only, undo after each recursive call.",
      },
    ],
    solutionPython:
      "def subsets(nums):\n    res, path = [], []\n    def backtrack(i):\n        res.append(path[:])\n        for j in range(i, len(nums)):\n            path.append(nums[j])\n            backtrack(j + 1)\n            path.pop()\n    backtrack(0)\n    return res\n",
    complexity: "O(n · 2^n) time, O(n) extra space",
  },
  {
    id: "climbing-stairs",
    title: "Climbing Stairs",
    difficulty: "Easy",
    topic: "Dynamic Programming",
    pattern: "1D DP",
    knownAs: "Classic interview problem (LeetCode 70)",
    statement:
      "You climb a staircase of n steps, taking 1 or 2 steps at a time. How many distinct ways can you reach the top?",
    inputFormat: "n: integer",
    outputFormat: "Integer number of ways",
    constraints: ["1 ≤ n ≤ 45"],
    examples: [ex("n = 2", "2", "1+1 or 2"), ex("n = 3", "3", "1+1+1, 1+2, 2+1")],
    testCases: [
      t("n = 1", "1"),
      t("n = 5", "8"),
      t("n = 45", "1836311903", "must not be exponential"),
    ],
    expectations: [...COMMON, "Go from recursion to O(1) space."],
    starters: {
      python: "def climb_stairs(n: int) -> int:\n    pass\n",
      javascript: "function climbStairs(n) {\n  \n}\n",
    },
    hints: [
      "Your last move was either 1 step or 2 steps.",
      "ways(n) = ways(n - 1) + ways(n - 2).",
      "Plain recursion repeats work; build up from the bottom keeping just the last two values.",
    ],
    steps: [
      {
        heading: "Why DP?",
        body: "The same subproblems (ways to reach step k) repeat many times in naive recursion.",
      },
      {
        heading: "What the recurrence is",
        body: "ways(n) = ways(n-1) + ways(n-2), with ways(1) = 1 and ways(2) = 2.",
      },
      { heading: "How to proceed", body: "Iterate from 3 to n keeping two variables." },
    ],
    solutionPython:
      "def climb_stairs(n):\n    a, b = 1, 1\n    for _ in range(n - 1):\n        a, b = b, a + b\n    return b\n",
    complexity: "O(n) time, O(1) space",
  },
  {
    id: "coin-change",
    title: "Coin Change",
    difficulty: "Medium",
    topic: "Dynamic Programming",
    pattern: "Knapsack",
    knownAs: "Classic interview problem (LeetCode 322)",
    statement:
      "Given coin denominations and an amount, return the fewest coins that add up to the amount, or -1 if it can't be made. You have unlimited coins of each type.",
    inputFormat: "coins: list of positive integers, amount: integer",
    outputFormat: "Minimum number of coins or -1",
    constraints: ["1 ≤ coins.length ≤ 12", "1 ≤ coins[i] ≤ 2^31 - 1", "0 ≤ amount ≤ 10^4"],
    examples: [
      ex("coins = [1, 2, 5], amount = 11", "3", "5 + 5 + 1"),
      ex("coins = [2], amount = 3", "-1"),
    ],
    testCases: [
      t("coins = [1], amount = 0", "0", "zero amount"),
      t("coins = [2, 5, 10, 1], amount = 27", "4"),
      t("coins = [186, 419, 83, 408], amount = 6249", "20", "greedy fails"),
    ],
    expectations: [...COMMON, "Show why greedy (largest coin first) is wrong."],
    starters: {
      python: "def coin_change(coins: list[int], amount: int) -> int:\n    pass\n",
      javascript: "function coinChange(coins, amount) {\n  \n}\n",
    },
    hints: [
      "Taking the biggest coin first doesn't always give the fewest coins.",
      "Let dp[a] be the fewest coins to make amount a.",
      "dp[a] = 1 + min(dp[a - c]) over coins c ≤ a; dp[0] = 0; unreachable stays infinity.",
    ],
    steps: [
      {
        heading: "Why DP?",
        body: "The best way to make a uses the best way to make a - c for some last coin c.",
      },
      { heading: "What the table is", body: "dp[0..amount], dp[0] = 0, others start at infinity." },
      {
        heading: "How to proceed",
        body: "For a from 1 to amount, for each coin ≤ a, dp[a] = min(dp[a], dp[a-c] + 1). Answer dp[amount] or -1.",
      },
    ],
    solutionPython:
      "def coin_change(coins, amount):\n    INF = float('inf')\n    dp = [0] + [INF] * amount\n    for a in range(1, amount + 1):\n        for c in coins:\n            if c <= a and dp[a - c] + 1 < dp[a]:\n                dp[a] = dp[a - c] + 1\n    return dp[amount] if dp[amount] != INF else -1\n",
    complexity: "O(amount × coins) time, O(amount) space",
  },
  {
    id: "merge-intervals",
    title: "Merge Intervals",
    difficulty: "Medium",
    topic: "Intervals",
    pattern: "Merge intervals",
    knownAs: "Classic interview problem (LeetCode 56)",
    statement:
      "Given a list of intervals [start, end], merge all overlapping intervals and return the non-overlapping result.",
    inputFormat: "intervals: list of [start, end]",
    outputFormat: "List of merged intervals",
    constraints: ["1 ≤ intervals.length ≤ 10^4", "0 ≤ start ≤ end ≤ 10^4"],
    examples: [
      ex("intervals = [[1,3],[2,6],[8,10],[15,18]]", "[[1,6],[8,10],[15,18]]"),
      ex("intervals = [[1,4],[4,5]]", "[[1,5]]", "touching counts as overlapping"),
    ],
    testCases: [
      t("intervals = [[1,4],[0,4]]", "[[0,4]]", "unsorted input"),
      t("intervals = [[1,4],[2,3]]", "[[1,4]]", "contained interval"),
      t("intervals = [[1,2]]", "[[1,2]]"),
    ],
    expectations: [...COMMON],
    starters: {
      python: "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    pass\n",
      javascript: "function merge(intervals) {\n  \n}\n",
    },
    hints: [
      "Overlaps are easy to spot if intervals are in order of start time.",
      "After sorting, an interval overlaps the last merged one if its start ≤ that end.",
      "Sort by start; extend the last merged end with max(end) or append a new interval.",
    ],
    steps: [
      {
        heading: "Why sort?",
        body: "Once sorted by start, only the most recent merged interval can overlap the next one.",
      },
      { heading: "What to compare", body: "Current start vs the last merged interval's end." },
      {
        heading: "How to proceed",
        body: "Overlap → last.end = max(last.end, end); otherwise append.",
      },
    ],
    solutionPython:
      "def merge(intervals):\n    intervals.sort(key=lambda x: x[0])\n    out = []\n    for s, e in intervals:\n        if out and s <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], e)\n        else:\n            out.append([s, e])\n    return out\n",
    complexity: "O(n log n) time, O(n) space",
  },
  {
    id: "jump-game",
    title: "Jump Game",
    difficulty: "Medium",
    topic: "Greedy",
    pattern: "Reachability",
    knownAs: "Frequently asked (LeetCode 55)",
    statement:
      "You start at index 0. nums[i] is the maximum jump length from index i. Return true if you can reach the last index.",
    inputFormat: "nums: list of non-negative integers",
    outputFormat: "Boolean",
    constraints: ["1 ≤ nums.length ≤ 10^4", "0 ≤ nums[i] ≤ 10^5"],
    examples: [
      ex("nums = [2, 3, 1, 1, 4]", "true"),
      ex("nums = [3, 2, 1, 0, 4]", "false", "always stuck at index 3"),
    ],
    testCases: [
      t("nums = [0]", "true", "already at the end"),
      t("nums = [0, 1]", "false"),
      t("nums = [2, 0, 0]", "true"),
    ],
    expectations: [...COMMON, "O(n) greedy; explain why DP isn't needed."],
    starters: {
      python: "def can_jump(nums: list[int]) -> bool:\n    pass\n",
      javascript: "function canJump(nums) {\n  \n}\n",
    },
    hints: [
      "You don't need to know the path, only how far you can get.",
      "Track the farthest index reachable so far.",
      "Scan left to right; if i > farthest you're stuck; otherwise farthest = max(farthest, i + nums[i]).",
    ],
    steps: [
      {
        heading: "Why greedy?",
        body: "Reaching index i means every index before it was reachable too, so one number (farthest) captures everything.",
      },
      { heading: "What to track", body: "farthest = the max of i + nums[i] over reachable i." },
      {
        heading: "How to proceed",
        body: "If you ever reach an i beyond farthest, return false; if farthest ≥ last index, return true.",
      },
    ],
    solutionPython:
      "def can_jump(nums):\n    farthest = 0\n    for i, x in enumerate(nums):\n        if i > farthest:\n            return False\n        farthest = max(farthest, i + x)\n    return True\n",
    complexity: "O(n) time, O(1) space",
  },
  {
    id: "implement-trie",
    title: "Implement Trie (Prefix Tree)",
    difficulty: "Medium",
    topic: "Tries",
    pattern: "Prefix tree basics",
    knownAs: "Classic interview problem (LeetCode 208)",
    statement:
      "Implement a Trie with insert(word), search(word) → true if the exact word was inserted, and startsWith(prefix) → true if any inserted word starts with prefix.",
    inputFormat: "A sequence of operations on lowercase words",
    outputFormat: "Results of search/startsWith calls",
    constraints: ["1 ≤ word.length, prefix.length ≤ 2000", "At most 3 × 10^4 calls"],
    examples: [
      ex(
        'insert("apple"), search("apple"), search("app"), startsWith("app"), insert("app"), search("app")',
        "true, false, true, true",
      ),
    ],
    testCases: [
      t('search("a") on an empty trie', "false"),
      t('insert("a"), startsWith("a")', "true"),
      t('insert("abc"), search("ab")', "false", "prefix is not a word"),
    ],
    expectations: [...COMMON, "Explain the end-of-word marker."],
    starters: {
      python:
        "class Trie:\n    def __init__(self):\n        pass\n\n    def insert(self, word: str) -> None:\n        pass\n\n    def search(self, word: str) -> bool:\n        pass\n\n    def starts_with(self, prefix: str) -> bool:\n        pass\n",
      javascript:
        "class Trie {\n  constructor() {}\n  insert(word) {}\n  search(word) {}\n  startsWith(prefix) {}\n}\n",
    },
    hints: [
      "Each node represents a prefix; children are the next letters.",
      "You need a flag to tell whether a node ends a full word.",
      "Walk/create children for insert; search needs the end flag, startsWith doesn't.",
    ],
    steps: [
      {
        heading: "Why a trie?",
        body: "Words sharing a prefix share nodes, so prefix checks take O(length).",
      },
      { heading: "What a node holds", body: "A map of child letters and an is_end flag." },
      {
        heading: "How to proceed",
        body: "A shared walk(prefix) helper returns the node or None; search checks is_end.",
      },
    ],
    solutionPython:
      "class Trie:\n    def __init__(self):\n        self.root = {}\n\n    def insert(self, word):\n        node = self.root\n        for c in word:\n            node = node.setdefault(c, {})\n        node['$'] = True\n\n    def _walk(self, s):\n        node = self.root\n        for c in s:\n            if c not in node:\n                return None\n            node = node[c]\n        return node\n\n    def search(self, word):\n        node = self._walk(word)\n        return node is not None and '$' in node\n\n    def starts_with(self, prefix):\n        return self._walk(prefix) is not None\n",
    complexity: "O(L) per operation, O(total characters) space",
  },
  {
    id: "single-number",
    title: "Single Number",
    difficulty: "Easy",
    topic: "Bit Manipulation",
    pattern: "XOR tricks",
    knownAs: "Classic interview problem (LeetCode 136)",
    statement:
      "Every element in a non-empty array appears twice except one. Find that single element using O(n) time and O(1) extra space.",
    inputFormat: "nums: list of integers",
    outputFormat: "The single integer",
    constraints: ["1 ≤ nums.length ≤ 3 × 10^4", "Every element appears twice except one"],
    examples: [ex("nums = [2, 2, 1]", "1"), ex("nums = [4, 1, 2, 1, 2]", "4")],
    testCases: [
      t("nums = [1]", "1"),
      t("nums = [-3, 7, 7]", "-3", "negative"),
      t("nums = [0, 5, 5]", "0"),
    ],
    expectations: [...COMMON, "O(1) extra space: no hash set."],
    starters: {
      python: "def single_number(nums: list[int]) -> int:\n    pass\n",
      javascript: "function singleNumber(nums) {\n  \n}\n",
    },
    hints: [
      "A hash set works but uses O(n) space.",
      "What is x XOR x? What is x XOR 0?",
      "XOR all numbers together: pairs cancel to 0, leaving the single number.",
    ],
    steps: [
      {
        heading: "Why XOR?",
        body: "x ^ x = 0, x ^ 0 = x, and XOR is order-independent, so duplicates cancel.",
      },
      { heading: "What to keep", body: "One running XOR value." },
      { heading: "How to proceed", body: "Fold XOR over the array; the result is the answer." },
    ],
    solutionPython:
      "def single_number(nums):\n    result = 0\n    for x in nums:\n        result ^= x\n    return result\n",
    complexity: "O(n) time, O(1) space",
  },
];

export function bankToProblem(entry: BankEntry, language: PracticeLanguage): PracticeProblem {
  const starter =
    language === "python"
      ? entry.starters.python
      : language === "javascript"
        ? entry.starters.javascript
        : blankStarter(language, entry.title);
  return {
    id: `bank-${entry.id}`,
    title: entry.title,
    difficulty: entry.difficulty,
    topic: entry.topic,
    pattern: entry.pattern,
    knownAs: entry.knownAs,
    statement: entry.statement,
    inputFormat: entry.inputFormat,
    outputFormat: entry.outputFormat,
    constraints: entry.constraints,
    examples: entry.examples,
    testCases: entry.testCases,
    expectations: entry.expectations,
    starterCode: starter,
    starterLanguage: language,
  };
}

export function findBankEntry(problemId: string): BankEntry | undefined {
  return BANK.find((e) => `bank-${e.id}` === problemId);
}
