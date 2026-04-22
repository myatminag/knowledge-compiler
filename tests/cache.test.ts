import { describe, expect, test } from "bun:test";

import { cacheKey } from "../utils/cache";
import { estimateCostUsd, resolvePricing } from "../utils/pricing";

describe("cacheKey", () => {
  const base = {
    schemaName: "knowledge",
    systemPrompt: "system",
    userPrompt: "user",
    model: "gpt-4o-mini",
    promptVersion: "v1",
    temperature: 0,
  };

  test("is deterministic for identical inputs", () => {
    expect(cacheKey(base)).toBe(cacheKey(base));
  });

  test("changes when model changes", () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, model: "gpt-4o" }));
  });

  test("changes when prompt version changes", () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, promptVersion: "v2" }));
  });
});

describe("pricing", () => {
  test("resolves gpt-4o-mini", () => {
    expect(resolvePricing("gpt-4o-mini")).toBeTruthy();
  });

  test("estimates cost for known model", () => {
    const cost = estimateCostUsd("gpt-4o-mini", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });

    expect(cost).toBeGreaterThan(0);
  });

  test("returns null for unknown models", () => {
    expect(resolvePricing("random-llm-xyz")).toBeNull();
  });
});
