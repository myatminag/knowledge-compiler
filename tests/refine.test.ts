import { describe, expect, test } from "bun:test";
import { applyDiff } from "../pipelines/refine.pipeline";

const base = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary: "Rate limiting caps request rate.",
  keyConcepts: ["Token Bucket", "Leaky Bucket"],
  deepDive: "Original deep dive.",
  related: ["API Gateway"],
  openQuestions: ["How to tune burst size?"],
};

describe("applyDiff", () => {
  test("appends new concepts and tags without dropping existing", () => {
    const merged = applyDiff(base, {
      additionalTags: ["distributed-systems"],
      additionalKeyConcepts: ["Sliding Window"],
      supersede: [],
      summaryUpdate: null,
      deepDiveAppend: null,
      additionalRelated: [],
      additionalOpenQuestions: [],
      resolvedOpenQuestions: [],
    });

    expect(merged.tags).toEqual(["backend", "distributed-systems"]);
    expect(merged.keyConcepts).toEqual([
      "Token Bucket",
      "Leaky Bucket",
      "Sliding Window",
    ]);
  });

  test("supersedes concepts case-insensitively", () => {
    const merged = applyDiff(base, {
      additionalTags: [],
      additionalKeyConcepts: [],
      supersede: [{ old: "token bucket", new: "Generic Cell Rate Algorithm" }],
      summaryUpdate: null,
      deepDiveAppend: null,
      additionalRelated: [],
      additionalOpenQuestions: [],
      resolvedOpenQuestions: [],
    });

    expect(merged.keyConcepts).toEqual([
      "Generic Cell Rate Algorithm",
      "Leaky Bucket",
    ]);
  });

  test("removes resolved open questions and appends new ones", () => {
    const merged = applyDiff(base, {
      additionalTags: [],
      additionalKeyConcepts: [],
      supersede: [],
      summaryUpdate: null,
      deepDiveAppend: null,
      additionalRelated: [],
      additionalOpenQuestions: ["What about global rate limiters?"],
      resolvedOpenQuestions: ["How to tune burst size?"],
    });

    expect(merged.openQuestions).toEqual(["What about global rate limiters?"]);
  });

  test("appends to deepDive when deepDiveAppend provided", () => {
    const merged = applyDiff(base, {
      additionalTags: [],
      additionalKeyConcepts: [],
      supersede: [],
      summaryUpdate: null,
      deepDiveAppend: "Additional nuance.",
      additionalRelated: [],
      additionalOpenQuestions: [],
      resolvedOpenQuestions: [],
    });

    expect(merged.deepDive).toContain("Original deep dive.");
    expect(merged.deepDive).toContain("Additional nuance.");
  });

  test("replaces summary when summaryUpdate provided", () => {
    const merged = applyDiff(base, {
      additionalTags: [],
      additionalKeyConcepts: [],
      supersede: [],
      summaryUpdate: "New summary.",
      deepDiveAppend: null,
      additionalRelated: [],
      additionalOpenQuestions: [],
      resolvedOpenQuestions: [],
    });

    expect(merged.summary).toBe("New summary.");
  });
});
