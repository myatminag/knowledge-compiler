import { describe, expect, test } from "bun:test";
import { toMarkdown } from "../pipelines/markdown.transform";
import type { Knowledge } from "../schemas/knowledge.schema";

const note: Knowledge = {
  title: "Rate Limiting",
  tags: ["Backend Systems", "distributed-systems"],
  summary: "Rate limiting bounds request volume.",
  keyConcepts: [
    {
      name: "Token Bucket",
      explanation:
        "Refills tokens at a fixed rate; each request consumes a token.",
      aliases: ["bucket algorithm"],
      sources: [0],
    },
    {
      name: "Leaky Bucket",
      explanation: "Drains requests from a queue at a constant rate.",
      aliases: [],
      sources: [0, 1],
    },
    {
      name: "Token Bucket",
      explanation: "Duplicate that should be removed.",
      aliases: [],
      sources: [],
    },
  ],
  deepDive: [
    {
      heading: "Mechanism",
      body: "The token bucket algorithm replenishes at a fixed rate.",
      sources: [0],
    },
    {
      heading: "Trade-offs",
      body: "Bursts are allowed by token bucket but smoothed by leaky bucket.",
      sources: [1],
    },
  ],
  related: ["API Gateway", "Circuit Breaker"],
  openQuestions: ["How to tune burst size?"],
};

const sources = [
  { id: "paper-a", title: "Paper A" },
  { id: "paper-b", title: "Paper B", sourceUrl: "https://example.com/b" },
];

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

  test("renders related as Obsidian pipe wiki links", () => {
    const out = toMarkdown(note);
    expect(out.content).toContain("[[api-gateway|API Gateway]]");
    expect(out.content).toContain("[[circuit-breaker|Circuit Breaker]]");
  });

  test("renders each key concept as bold name + explanation", () => {
    const out = toMarkdown(note);
    expect(out.content).toContain(
      "- **Token Bucket** — Refills tokens at a fixed rate",
    );
    expect(out.content).toContain("- **Leaky Bucket** —");
  });

  test("renders aliases beneath the concept when present", () => {
    const out = toMarkdown(note);
    expect(out.content).toContain("_aliases: bucket algorithm_");
  });

  test("renders deep-dive sub-sections as H3 headings", () => {
    const out = toMarkdown(note);
    expect(out.content).toContain("### Mechanism");
    expect(out.content).toContain("### Trade-offs");
  });

  test("emits footnote citations and source footnotes when sources provided", () => {
    const out = toMarkdown(note, { sources });
    expect(out.content).toContain(
      "- **Token Bucket** — Refills tokens at a fixed rate; each request consumes a token. [^s1]",
    );
    expect(out.content).toMatch(/\[\^s2\]/);
    expect(out.content).toContain("[^s1]: [[paper-a|Paper A]]");
    expect(out.content).toContain(
      "[^s2]: [[paper-b|Paper B]] — https://example.com/b",
    );
  });

  test("omits citations when source indexes are out of range", () => {
    const out = toMarkdown(note, { sources: [sources[0]] });
    const mechanismSection = out.content.split("### Mechanism")[1];
    expect(mechanismSection).toContain("[^s1]");
    const tradeoffsSection = out.content.split("### Trade-offs")[1];
    expect(tradeoffsSection).not.toContain("[^s2]");
  });

  test("emits aliases so bare [[Title]] links still resolve in Obsidian", () => {
    const out = toMarkdown(note);
    expect(out.frontmatter.aliases).toEqual(["Rate Limiting"]);
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

  test("deduplicates keyConcepts by name (case-insensitive)", () => {
    const out = toMarkdown(note);
    const occurrences = (out.content.match(/- \*\*Token Bucket\*\*/g) ?? [])
      .length;
    expect(occurrences).toBe(1);
  });
});
