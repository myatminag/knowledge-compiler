import OpenAI from "openai";
import type { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { logger } from "../utils/logger";
import { config } from "../config/config";
import { estimateCostUsd } from "../utils/pricing";
import { cacheKey, readCache, writeCache } from "../utils/cache";

const client = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface LLMResult<T> {
  data: T;
  usage: LLMUsage;
  model: string;
  cached?: boolean;
}

export interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

interface CacheEntry<T> {
  data: T;
  usage: LLMUsage;
  model: string;
}

export async function callStructured<TSchema extends z.ZodType>(
  schema: TSchema,
  schemaName: string,
  options: CallOptions,
): Promise<LLMResult<z.infer<TSchema>>> {
  const model = options.model ?? config.openai.model;
  const temperature = options.temperature ?? config.openai.temperature;

  const key = cacheKey({
    schemaName,
    systemPrompt: options.systemPrompt,
    userPrompt: options.userPrompt,
    model,
    promptVersion: config.prompt.version,
    temperature,
  });

  const cached = readCache<CacheEntry<z.infer<TSchema>>>(key);
  if (cached) {
    return {
      data: cached.data,
      usage: cached.usage,
      model: cached.model,
      cached: true,
    };
  }

  const completion = await client.chat.completions.parse({
    model,
    temperature,
    response_format: zodResponseFormat(schema, schemaName),
    messages: [
      { role: "system", content: options.systemPrompt.trim() },
      { role: "user", content: options.userPrompt.trim() },
    ],
  });

  const message = completion.choices[0]?.message;

  if (!message) throw new Error("Empty response from LLM");
  if (message.refusal) throw new Error(`LLM refused: ${message.refusal}`);
  if (!message.parsed) throw new Error("LLM did not return parsed content");

  const usage: LLMUsage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };

  usage.costUsd = estimateCostUsd(model, usage) ?? undefined;

  logger.debug("LLM usage", { model, ...usage });

  const data = message.parsed as z.infer<TSchema>;

  writeCache<CacheEntry<z.infer<TSchema>>>(key, { data, usage, model });

  return { data, usage, model };
}
