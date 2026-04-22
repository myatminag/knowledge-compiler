import { describe, expect, test } from "bun:test";
import { toMarkdown } from "../pipelines/markdown.transform";

const note = {
  title: "Rate Limiting",
  tags: ["Backend Systems", "distributed-systems"],
  summary: "Rate limiting bounds request volume.",
  keyConcepts: ["Token Bucket", "Leaky Bucket", "Token Bucket"],
  deepDive: "The token bucket algorithm replenishes at a fixed rate.",
  related: ["API Gateway", "Circuit Breaker"],
  openQuestions: ["How to tune burst size?"],
};

describe("toMarkdown", () => {
  test("produces a slugified filename and id", () => {
    const out = toMarkdown(note);
    expect(out.fileName).toBe("rate-limiting.md");
    expect(out.id).toBe("rate-limiting");
  });

  test("normalizes tags to kebab-case", () => {
    const out = toMarkdown(note);
    expect(out.frontmatter.tags).toEqual([
      "backend-systems",
      "distributed-systems",
    ]);
  });

  test("renders related as wiki links", () => {
    const out = toMarkdown(note);
    expect(out.content).toContain("[[API Gateway]]");
    expect(out.content).toContain("[[Circuit Breaker]]");
  });

  test("preserves createdAt when provided and bumps updatedAt", () => {
    const created = "2024-01-01T00:00:00.000Z";
    const out = toMarkdown(note, { createdAt: created });

    expect(out.frontmatter.created_at).toBe(created);
    expect(out.frontmatter.updated_at).not.toBe(created);
  });

  test("includes source metadata when supplied", () => {
    const out = toMarkdown(note, {
      sourceUrl: "https://example.com/x",
      sourceHash: "abc123",
      sourceType: "article",
      promptVersion: "v1",
      model: "gpt-4o-mini",
    });

    expect(out.frontmatter.source_url).toBe("https://example.com/x");
    expect(out.frontmatter.source_hash).toBe("abc123");
    expect(out.frontmatter.source_type).toBe("article");
  });

  test("deduplicates keyConcepts", () => {
    const out = toMarkdown(note);
    const concepts = (out.content.match(/- Token Bucket/g) ?? []).length;
    expect(concepts).toBe(1);
  });
});
