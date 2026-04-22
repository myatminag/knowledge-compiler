import { LLMUsage } from "../llm/llm.client";

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8 },
};

export function resolvePricing(model: string): ModelPricing | null {
  const normalized = model.toLowerCase();

  for (const [key, pricing] of Object.entries(PRICING)) {
    if (normalized.includes(key)) return pricing;
  }

  return null;
}

export function estimateCostUsd(model: string, usage: LLMUsage): number | null {
  const pricing = resolvePricing(model);
  if (!pricing) return null;

  return (
    (usage.promptTokens * pricing.inputPer1M) / 1_000_000 +
    (usage.completionTokens * pricing.outputPer1M) / 1_000_000
  );
}
