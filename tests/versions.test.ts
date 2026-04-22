import { describe, expect, test } from "bun:test";
import { diffKnowledge } from "../pipelines/versions.pipeline";

const prev = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary: "Original summary",
  keyConcepts: ["Token Bucket"],
  deepDive: "Original",
  related: ["API Gateway"],
  openQuestions: ["Q1"],
};

const next = {
  title: "Rate Limiting",
  tags: ["backend", "distributed-systems"],
  summary: "Updated summary",
  keyConcepts: ["Token Bucket", "Sliding Window"],
  deepDive: "Updated",
  related: ["API Gateway"],
  openQuestions: [],
};

describe("diffKnowledge", () => {
  test("detects changed summary and deepDive", () => {
    const d = diffKnowledge(prev, next);
    expect(d.summary.changed).toBe(true);
    expect(d.deepDive.changed).toBe(true);
  });

  test("detects added tags and concepts", () => {
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
