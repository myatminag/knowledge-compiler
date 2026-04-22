import { describe, expect, test } from "bun:test";
import { diffKnowledge } from "../pipelines/versions.pipeline";
import type { Knowledge } from "../schemas/knowledge.schema";

const prev: Knowledge = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary: "Original summary",
  keyConcepts: [
    {
      name: "Token Bucket",
      explanation: "Refills tokens at a fixed rate.",
      aliases: [],
      sources: [0],
    },
  ],
  deepDive: [
    {
      heading: "Mechanism",
      body: "Original explanation.",
      sources: [0],
    },
  ],
  related: ["API Gateway"],
  openQuestions: ["Q1"],
};

const next: Knowledge = {
  title: "Rate Limiting",
  tags: ["backend", "distributed-systems"],
  summary: "Updated summary",
  keyConcepts: [
    {
      name: "Token Bucket",
      explanation: "Refills tokens at a fixed rate.",
      aliases: [],
      sources: [0],
    },
    {
      name: "Sliding Window",
      explanation: "Counts requests over a rolling window.",
      aliases: [],
      sources: [0],
    },
  ],
  deepDive: [
    {
      heading: "Mechanism",
      body: "Updated explanation.",
      sources: [0],
    },
    {
      heading: "Trade-offs",
      body: "New section discussing costs.",
      sources: [0],
    },
  ],
  related: ["API Gateway"],
  openQuestions: [],
};

describe("diffKnowledge", () => {
  test("detects changed summary and deep-dive sections", () => {
    const d = diffKnowledge(prev, next);
    expect(d.summary.changed).toBe(true);
    expect(d.deepDive.added).toEqual(["Trade-offs"]);
  });

  test("detects added tags and concepts by name", () => {
    const d = diffKnowledge(prev, next);
    expect(d.tags.added).toEqual(["distributed-systems"]);
    expect(d.keyConcepts.added).toEqual(["Sliding Window"]);
  });

  test("detects removed open questions", () => {
    const d = diffKnowledge(prev, next);
    expect(d.openQuestions.removed).toEqual(["Q1"]);
  });

  test("no previous means everything is 'to' only", () => {
    const d = diffKnowledge(null, next);
    expect(d.title.from).toBeNull();
    expect(d.tags.removed).toEqual([]);
  });
});
