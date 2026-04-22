import { describe, expect, test } from "bun:test";
import { lintNote } from "../pipelines/lint.pipeline";

const goodNote = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary:
    "Rate limiting prevents abuse in distributed systems by bounding the number of requests a client can issue.",
  keyConcepts: ["Token Bucket", "Leaky Bucket", "Sliding Window"],
  deepDive:
    "Rate limiting is commonly implemented with a token bucket algorithm. " +
    "It replenishes tokens at a fixed rate and rejects or delays requests " +
    "when tokens are exhausted.",
  related: ["API Gateway"],
  openQuestions: [],
};

describe("lintNote", () => {
  test("returns no issues for a well-formed note", () => {
    expect(lintNote(goodNote)).toEqual([]);
  });

  test("flags short summary", () => {
    const issues = lintNote({ ...goodNote, summary: "too short" });
    expect(issues.some((i) => i.includes("Summary too short"))).toBe(true);
  });

  test("flags short deep dive", () => {
    const issues = lintNote({ ...goodNote, deepDive: "short" });
    expect(issues.some((i) => i.includes("Deep dive too shallow"))).toBe(true);
  });

  test("flags missing tags", () => {
    const issues = lintNote({ ...goodNote, tags: [] });
    expect(issues).toContain("Missing tags");
  });

  test("flags missing key concepts", () => {
    const issues = lintNote({ ...goodNote, keyConcepts: [] });
    expect(issues).toContain("Missing key concepts");
  });

  test("flags duplicate concepts (case-insensitive)", () => {
    const issues = lintNote({
      ...goodNote,
      keyConcepts: ["Token Bucket", "token bucket"],
    });
    expect(issues.some((i) => i.includes("Duplicate key concepts"))).toBe(true);
  });

  test("flags sentence-like concepts", () => {
    const issues = lintNote({
      ...goodNote,
      keyConcepts: [
        "A token bucket is a widely used rate limiting algorithm indeed.",
      ],
    });
    expect(issues.some((i) => i.includes("Sentence-like"))).toBe(true);
  });
});
