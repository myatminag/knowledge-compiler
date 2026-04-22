import "dotenv/config";
import path from "path";
import { z } from "zod";

const homeDir = process.env.HOME || process.env.USERPROFILE || "";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_COMPILE: z.string().optional(),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  KNOWLEDGE_VAULT_PATH: z
    .string()
    .default(path.join(homeDir, "knowledge-vault")),
  MAX_LLM_RETRIES: z.coerce.number().int().positive().default(3),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CACHE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  CACHE_DIR: z
    .string()
    .default(path.join(homeDir, ".knowledge-compiler-cache")),
  PROMPT_VERSION: z.string().default("v1"),
  CHUNK_THRESHOLD_CHARS: z.coerce.number().int().positive().default(12000),
  CHUNK_SIZE_CHARS: z.coerce.number().int().positive().default(8000),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().nonnegative().default(200),
  AUDIT_STALE_DAYS: z.coerce.number().int().positive().default(14),
  TOPIC_MAX_SOURCES: z.coerce.number().int().positive().default(40),
  INDEX_AUTO_REBUILD: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "true" || v === "1"),
  INDEX_DATAVIEW: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  OBSIDIAN_LINK_STYLE: z.enum(["pipe", "alias"]).default("pipe"),
});

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const flat = parsed.error.flatten();
    console.error("Invalid environment configuration:", flat.fieldErrors);
    throw new Error("Invalid environment configuration");
  }

  const env = parsed.data;

  return {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
      modelCompile: env.OPENAI_MODEL_COMPILE,
      temperature: env.OPENAI_TEMPERATURE,
    },
    vault: {
      path: env.KNOWLEDGE_VAULT_PATH,
    },
    llm: {
      maxRetries: env.MAX_LLM_RETRIES,
    },
    logger: {
      level: env.LOG_LEVEL,
    },
    cache: {
      enabled: env.CACHE_ENABLED ?? false,
      dir: env.CACHE_DIR,
    },
    prompt: {
      version: env.PROMPT_VERSION,
    },
    chunk: {
      thresholdChars: env.CHUNK_THRESHOLD_CHARS,
      sizeChars: env.CHUNK_SIZE_CHARS,
      overlapChars: env.CHUNK_OVERLAP_CHARS,
    },
    audit: {
      staleDays: env.AUDIT_STALE_DAYS,
    },
    topic: {
      maxSources: env.TOPIC_MAX_SOURCES,
    },
    index: {
      autoRebuild: env.INDEX_AUTO_REBUILD ?? true,
      dataview: env.INDEX_DATAVIEW ?? false,
    },
    obsidian: {
      linkStyle: env.OBSIDIAN_LINK_STYLE,
    },
  };
}

export const config = loadConfig();

export type Config = typeof config;
