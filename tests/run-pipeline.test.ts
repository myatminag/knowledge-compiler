import { beforeAll, describe, expect, test, mock } from "bun:test";
import type { runPipeline as RunPipelineType } from "../pipelines/run.pipeline";

const mockCallStructured = mock(async () => ({
  data: {
    title: "Rate Limiting",
    tags: ["backend"],
    summary:
      "Rate limiting prevents abuse in distributed systems by capping request rates.",
    keyConcepts: [
      {
        name: "Token Bucket",
        explanation:
          "Refills tokens at a fixed rate; a request consumes one token.",
        aliases: [],
        sources: [0],
      },
      {
        name: "Leaky Bucket",
        explanation: "Drains requests from a queue at a constant rate.",
        aliases: [],
        sources: [0],
      },
      {
        name: "Sliding Window",
        explanation: "Counts requests over a moving time window for accuracy.",
        aliases: [],
        sources: [0],
      },
    ],
    deepDive: [
      {
        heading: "Mechanism",
        body: "Rate limiting is commonly implemented with a token bucket algorithm that replenishes tokens at a fixed rate and rejects requests when empty. Servers decrement the client's counter on each admitted request.",
        sources: [0],
      },
      {
        heading: "Trade-offs",
        body: "Token bucket permits bursts whereas leaky bucket smooths them; sliding window adds state overhead in exchange for higher accuracy. Pick based on expected traffic shape.",
        sources: [0],
      },
    ],
    related: ["API Gateway"],
    openQuestions: ["How to tune burst size?"],
  },
  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  model: "mock-model",
}));

let runPipeline: typeof RunPipelineType;

beforeAll(async () => {
  await mock.module("../llm/llm.client", () => ({
    callStructured: mockCallStructured,
  }));

  ({ runPipeline } = await import("../pipelines/run.pipeline"));
});

describe("runPipeline", () => {
  test("normalizes raw_text, generates knowledge, and lints", async () => {
    const result = await runPipeline({
      type: "raw_text",
      content: "Rate limiting prevents abuse in distributed systems.",
    });

    expect(result.normalized.type).toBe("text");
    expect(result.knowledge.title).toBe("Rate Limiting");
    expect(result.knowledge.keyConcepts.map((c) => c.name)).toEqual([
      "Token Bucket",
      "Leaky Bucket",
      "Sliding Window",
    ]);
    expect(result.issues).toEqual([]);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.model).toBe("mock-model");
  });
});
