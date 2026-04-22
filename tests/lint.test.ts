import { describe, expect, test } from "bun:test";
import { lintNote } from "../pipelines/lint.pipeline";
import type { Knowledge } from "../schemas/knowledge.schema";

const goodNote: Knowledge = {
  title: "Rate Limiting",
  tags: ["backend"],
  summary:
    "Rate limiting prevents abuse in distributed systems by bounding the number of requests a client can issue.",
  keyConcepts: [
    {
      name: "Token Bucket",
      explanation:
        "Refills tokens at a fixed rate; each request consumes a token.",
      aliases: [],
      sources: [0],
    },
    {
      name: "Leaky Bucket",
      explanation:
        "Requests drip out of a queue at a constant rate, absorbing bursts.",
      aliases: [],
      sources: [0],
    },
    {
      name: "Sliding Window",
      explanation:
        "Counts requests in a moving time window to smooth burst limits.",
      aliases: [],
      sources: [0],
    },
  ],
  deepDive: [
    {
      heading: "Mechanism",
      body: "Rate limiting is commonly implemented with a token bucket algorithm. It replenishes tokens at a fixed rate and rejects or delays requests when tokens are exhausted. Clients typically observe the remaining budget through response headers.",
      sources: [0],
    },
    {
      heading: "Trade-offs",
      body: "Token bucket allows bursts while leaky bucket smooths them; sliding window gives higher accuracy at the cost of more state. In practice, operators pick based on traffic shape and tolerable memory cost per client.",
      sources: [0],
    },
  ],
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

  test("flags shallow deep dive", () => {
    const issues = lintNote({
      ...goodNote,
      deepDive: [{ heading: "Only", body: "too brief", sources: [] }],
    });
    expect(issues.some((i) => i.includes("Deep dive too shallow"))).toBe(true);
  });

  test("flags too few deep-dive sections", () => {
    const issues = lintNote({
      ...goodNote,
      deepDive: [goodNote.deepDive[0]],
    });
    expect(
      issues.some((i) => i.includes("Too few deep-dive sub-sections")),
    ).toBe(true);
  });

  test("flags missing tags", () => {
    const issues = lintNote({ ...goodNote, tags: [] });
    expect(issues).toContain("Missing tags");
  });

  test("flags too few key concepts", () => {
    const issues = lintNote({ ...goodNote, keyConcepts: [] });
    expect(issues.some((i) => i.includes("Too few key concepts"))).toBe(true);
  });

  test("flags duplicate concepts (case-insensitive)", () => {
    const issues = lintNote({
      ...goodNote,
      keyConcepts: [
        goodNote.keyConcepts[0],
        goodNote.keyConcepts[1],
        {
          ...goodNote.keyConcepts[0],
          name: "token bucket",
        },
      ],
    });
    expect(issues.some((i) => i.includes("Duplicate key concepts"))).toBe(true);
  });

  test("flags concepts with weak explanations", () => {
    const issues = lintNote({
      ...goodNote,
      keyConcepts: [
        goodNote.keyConcepts[0],
        goodNote.keyConcepts[1],
        { ...goodNote.keyConcepts[2], explanation: "short" },
      ],
    });
    expect(
      issues.some((i) => i.includes("Concepts with weak explanations")),
    ).toBe(true);
  });

  test("flags concepts missing citations when sourceCount provided", () => {
    const issues = lintNote(
      {
        ...goodNote,
        keyConcepts: [
          { ...goodNote.keyConcepts[0], sources: [] },
          goodNote.keyConcepts[1],
          goodNote.keyConcepts[2],
        ],
      },
      { sourceCount: 3 },
    );
    expect(issues.some((i) => i.includes("Concepts missing citations"))).toBe(
      true,
    );
  });

  test("flags out-of-range source indexes when sourceCount provided", () => {
    const issues = lintNote(
      {
        ...goodNote,
        keyConcepts: [
          { ...goodNote.keyConcepts[0], sources: [5] },
          goodNote.keyConcepts[1],
          goodNote.keyConcepts[2],
        ],
      },
      { sourceCount: 2 },
    );
    expect(issues.some((i) => i.includes("Out-of-range source indexes"))).toBe(
      true,
    );
  });
});
