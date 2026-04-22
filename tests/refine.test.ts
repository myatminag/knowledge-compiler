import { describe, expect, test } from "bun:test";
import { applyDiff } from "../pipelines/refine.pipeline";
import type { Knowledge, KeyConcept } from "../schemas/knowledge.schema";

const tokenBucket: KeyConcept = {
  name: "Token Bucket",
  explanation: "Refills tokens at a fixed rate; each request consumes a token.",
  aliases: [],
  sources: [0],
};

const leakyBucket: KeyConcept = {
  name: "Leaky Bucket",
  explanation: "Requests drain from a queue at a constant rate.",
  aliases: [],
  sources: [0],
};

const base: Knowledge = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary: "Rate limiting caps request rate.",
  keyConcepts: [tokenBucket, leakyBucket],
  deepDive: [
    {
      heading: "Mechanism",
      body: "Most rate limiters are token-bucket variants.",
      sources: [0],
    },
  ],
  related: ["API Gateway"],
  openQuestions: ["How to tune burst size?"],
};

const emptyDiff = {
  additionalTags: [],
  additionalKeyConcepts: [],
  supersedeConcepts: [],
  summaryUpdate: null,
  appendDeepDiveSections: [],
  replaceDeepDiveSections: [],
  additionalRelated: [],
  additionalOpenQuestions: [],
  resolvedOpenQuestions: [],
};

describe("applyDiff", () => {
  test("appends new concepts and tags without dropping existing", () => {
    const slidingWindow: KeyConcept = {
      name: "Sliding Window",
      explanation: "Counts requests over a moving time window for accuracy.",
      aliases: [],
      sources: [1],
    };

    const merged = applyDiff(base, {
      ...emptyDiff,
      additionalTags: ["distributed-systems"],
      additionalKeyConcepts: [slidingWindow],
    });

    expect(merged.tags).toEqual(["backend", "distributed-systems"]);
    expect(merged.keyConcepts.map((c) => c.name)).toEqual([
      "Token Bucket",
      "Leaky Bucket",
      "Sliding Window",
    ]);
  });

  test("supersedes concepts case-insensitively", () => {
    const replacement: KeyConcept = {
      name: "Generic Cell Rate Algorithm",
      explanation: "A generalized leaky bucket variant used in telecom.",
      aliases: ["GCRA"],
      sources: [0],
    };

    const merged = applyDiff(base, {
      ...emptyDiff,
      supersedeConcepts: [{ oldName: "token bucket", replacement }],
    });

    expect(merged.keyConcepts.map((c) => c.name)).toEqual([
      "Generic Cell Rate Algorithm",
      "Leaky Bucket",
    ]);
  });

  test("removes resolved open questions and appends new ones", () => {
    const merged = applyDiff(base, {
      ...emptyDiff,
      additionalOpenQuestions: ["What about global rate limiters?"],
      resolvedOpenQuestions: ["How to tune burst size?"],
    });

    expect(merged.openQuestions).toEqual(["What about global rate limiters?"]);
  });

  test("appends new deep-dive sections", () => {
    const merged = applyDiff(base, {
      ...emptyDiff,
      appendDeepDiveSections: [
        {
          heading: "Trade-offs",
          body: "Token bucket allows bursts; leaky bucket smooths them.",
          sources: [0],
        },
      ],
    });

    expect(merged.deepDive.map((s) => s.heading)).toEqual([
      "Mechanism",
      "Trade-offs",
    ]);
  });

  test("replaces deep-dive sections by heading (case-insensitive)", () => {
    const merged = applyDiff(base, {
      ...emptyDiff,
      replaceDeepDiveSections: [
        {
          heading: "mechanism",
          body: "Updated explanation.",
          sources: [1],
        },
      ],
    });

    expect(merged.deepDive).toHaveLength(1);
    expect(merged.deepDive[0].body).toBe("Updated explanation.");
    expect(merged.deepDive[0].sources).toEqual([1]);
  });

  test("replaces summary when summaryUpdate provided", () => {
    const merged = applyDiff(base, {
      ...emptyDiff,
      summaryUpdate: "New summary.",
    });

    expect(merged.summary).toBe("New summary.");
  });
});
