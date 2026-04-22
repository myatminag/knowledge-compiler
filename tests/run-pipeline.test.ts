import { beforeAll, describe, expect, test, mock } from "bun:test";
import type { runPipeline as RunPipelineType } from "../pipelines/run.pipeline";

const mockCallStructured = mock(async () => ({
  data: {
    title: "Rate Limiting",
    tags: ["backend"],
    summary:
      "Rate limiting prevents abuse in distributed systems by capping request rates.",
    keyConcepts: ["Token Bucket", "Leaky Bucket"],
    deepDive:
      "Rate limiting is commonly implemented with a token bucket algorithm. " +
      "It replenishes tokens at a fixed rate and rejects requests when empty.",
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
    expect(result.knowledge.keyConcepts).toEqual([
      "Token Bucket",
      "Leaky Bucket",
    ]);
    expect(result.issues).toEqual([]);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.model).toBe("mock-model");
  });
});
