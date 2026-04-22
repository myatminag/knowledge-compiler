import { callStructured, LLMResult } from "../llm/llm.client";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { cleanArray } from "../utils/arrays";
import { KnowledgeSchema, Knowledge } from "../schemas/knowledge.schema";

const SYSTEM_PROMPT = `
You are a knowledge compiler.

You transform raw content into structured, reusable knowledge.

Rules:
- Return only the JSON that matches the provided schema.
- Do not hallucinate facts that are not supported by the source.
- Keep concepts atomic and reusable (phrases, not sentences).
- Avoid duplicates and vague wording.
- Prefer precise, canonical terms over paraphrases.
`;

function buildUserPrompt(input: string): string {
  return `
Convert the following content into structured knowledge following the schema.

Content:
"""
${input}
"""
  `;
}

function buildRetryPrompt(input: string, lastError: string): string {
  return `
Your previous response failed validation with error:
"""
${lastError}
"""

Please regenerate strictly following the schema for this content:
"""
${input}
"""
  `;
}

function postProcess(note: Knowledge): Knowledge {
  return {
    ...note,
    tags: cleanArray(note.tags),
    keyConcepts: cleanArray(note.keyConcepts),
    related: cleanArray(note.related),
    openQuestions: cleanArray(note.openQuestions),
  };
}

export async function generateNote(
  input: string,
): Promise<LLMResult<Knowledge>> {
  const result = await callStructured(KnowledgeSchema, "knowledge", {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
  });

  return { ...result, data: postProcess(result.data) };
}

export async function safeGenerate(
  input: string,
  retries: number = config.llm.maxRetries,
): Promise<LLMResult<Knowledge>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (attempt === 1) return await generateNote(input);

      const errMsg =
        lastError instanceof Error ? lastError.message : String(lastError);

      logger.warn("Self-correcting retry", { attempt, error: errMsg });

      const result = await callStructured(KnowledgeSchema, "knowledge", {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildRetryPrompt(input, errMsg),
      });

      return { ...result, data: postProcess(result.data) };
    } catch (err) {
      lastError = err;
      logger.warn(`Attempt ${attempt} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw lastError ?? new Error("Unknown generation failure");
}
