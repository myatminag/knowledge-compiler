import {
  extractVerbatimSnippets,
  formatVerbatimAppendix,
} from "../utils/verbatim";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { callStructured, LLMResult } from "../llm/llm.client";
import { cleanArray, cleanArrayOfObjects } from "../utils/arrays";
import { KnowledgeSchema, Knowledge } from "../schemas/knowledge.schema";

const SYSTEM_PROMPT = `
You are a knowledge compiler that turns raw content into a detailed,
reference-quality structured note.

Targets:
- 6-12 key concepts. Each is { name, explanation, aliases?, sources }.
  The explanation MUST be 1-2 sentences, never a bare term.
- 3-6 Deep Dive sub-sections (e.g. Mechanism, Variants, Trade-offs,
  Applications, History). Aim for 600-1200 words across sub-sections total.
- Cite every concept and every Deep Dive sub-section with the 0-indexed
  \`sources\` array. Since input is a single document, use [0] for every
  citation.

Rules:
- Preserve formulas, equations, pseudocode, and code snippets VERBATIM from
  the content. Do NOT rewrite or paraphrase them.
- Merge duplicate concepts and note alternative terminology via \`aliases\`.
- Never invent facts not supported by the content.
- Prefer precise, canonical terms; resolve conflicts inside Deep Dive.
- Return only JSON matching the provided schema.
`;

function buildUserPrompt(input: string): string {
  const snippets = extractVerbatimSnippets(input);
  const appendix = formatVerbatimAppendix(snippets);
  const suffix = appendix ? `\n\n${appendix}` : "";

  return `
Convert the following content into structured knowledge.

Content:
"""
${input}
"""${suffix}
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
    keyConcepts: cleanArrayOfObjects(note.keyConcepts, (c) =>
      c.name.trim().toLowerCase(),
    ),
    deepDive: cleanArrayOfObjects(note.deepDive, (s) =>
      s.heading.trim().toLowerCase(),
    ),
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
