import { describe, expect, test } from "bun:test";
import { KnowledgeSchema } from "../schemas/knowledge.schema";

describe("KnowledgeSchema", () => {
  test("accepts a well-formed object", () => {
    const valid = {
      title: "Rate Limiting",
      tags: ["backend"],
      summary: "Rate limiting prevents abuse in distributed systems.",
      keyConcepts: ["Token Bucket", "Leaky Bucket"],
      deepDive: "Rate limiting is commonly implemented with a token bucket.",
      related: ["API Gateway"],
      openQuestions: ["How to tune burst size?"],
    };

    const parsed = KnowledgeSchema.parse(valid);
    expect(parsed.title).toBe("Rate Limiting");
  });

  test("rejects missing fields", () => {
    expect(() => KnowledgeSchema.parse({ title: "x" })).toThrow();
  });

  test("rejects wrong types", () => {
    expect(() =>
      KnowledgeSchema.parse({
        title: "x",
        tags: "not-an-array",
        summary: "s",
        keyConcepts: [],
        deepDive: "d",
        related: [],
        openQuestions: [],
      }),
    ).toThrow();
  });
});
