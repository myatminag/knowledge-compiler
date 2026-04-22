import { describe, expect, test } from "bun:test";
import { KnowledgeSchema } from "../schemas/knowledge.schema";

describe("KnowledgeSchema", () => {
  test("accepts a well-formed object", () => {
    const valid = {
      title: "Rate Limiting",
      tags: ["backend"],
      summary: "Rate limiting prevents abuse in distributed systems.",
      keyConcepts: [
        {
          name: "Token Bucket",
          explanation:
            "Refills tokens at a steady rate; a request consumes tokens.",
          aliases: [],
          sources: [0],
        },
      ],
      deepDive: [
        {
          heading: "Mechanism",
          body: "Most implementations maintain a token counter updated lazily.",
          sources: [0],
        },
      ],
      related: ["API Gateway"],
      openQuestions: ["How to tune burst size?"],
    };

    const parsed = KnowledgeSchema.parse(valid);
    expect(parsed.title).toBe("Rate Limiting");
    expect(parsed.keyConcepts[0].name).toBe("Token Bucket");
    expect(parsed.deepDive[0].heading).toBe("Mechanism");
  });

  test("rejects missing fields", () => {
    expect(() => KnowledgeSchema.parse({ title: "x" })).toThrow();
  });

  test("rejects wrong types on nested shape", () => {
    expect(() =>
      KnowledgeSchema.parse({
        title: "x",
        tags: "not-an-array",
        summary: "s",
        keyConcepts: [{ name: "x" }],
        deepDive: [{ heading: "h" }],
        related: [],
        openQuestions: [],
      }),
    ).toThrow();
  });

  test("rejects bare-string keyConcepts", () => {
    expect(() =>
      KnowledgeSchema.parse({
        title: "x",
        tags: [],
        summary: "s",
        keyConcepts: ["plain string"],
        deepDive: [],
        related: [],
        openQuestions: [],
      }),
    ).toThrow();
  });
});
