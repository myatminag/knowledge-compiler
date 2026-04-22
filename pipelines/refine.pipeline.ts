import { z } from "zod";

import { callStructured, LLMResult } from "../llm/llm.client";
import { Knowledge } from "../schemas/knowledge.schema";
import { cleanArray, dedupeCaseInsensitive } from "../utils/arrays";

export const KnowledgeDiffSchema = z.object({
  additionalTags: z.array(z.string()).default([]),
  additionalKeyConcepts: z.array(z.string()).default([]),
  supersede: z
    .array(z.object({ old: z.string(), new: z.string() }))
    .default([]),
  summaryUpdate: z.string().nullable().default(null),
  deepDiveAppend: z.string().nullable().default(null),
  additionalRelated: z.array(z.string()).default([]),
  additionalOpenQuestions: z.array(z.string()).default([]),
  resolvedOpenQuestions: z.array(z.string()).default([]),
});

export type KnowledgeDiff = z.infer<typeof KnowledgeDiffSchema>;

const SYSTEM_PROMPT = `
You are a knowledge refiner.

You are given an existing structured knowledge note AND new source content.
Produce a minimal DIFF that improves the note with facts from the new content.

Rules:
- Do not drop existing concepts unless they are clearly superseded.
- Prefer adding new concepts over rewriting old ones.
- Keep concepts atomic (short phrases, not sentences).
- Never hallucinate facts that the new content does not support.
- Return empty arrays / null when no change is warranted.
`;

function buildUserPrompt(existing: Knowledge, newContent: string): string {
  return `
    Existing note:
    """
    ${JSON.stringify(existing, null, 2)}
    """

    New source content:
    """
    ${newContent}
    """

    Produce the diff.
  `;
}

export async function generateDiff(
  existing: Knowledge,
  newContent: string,
): Promise<LLMResult<KnowledgeDiff>> {
  return callStructured(KnowledgeDiffSchema, "knowledge_diff", {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(existing, newContent),
  });
}

export function applyDiff(existing: Knowledge, diff: KnowledgeDiff): Knowledge {
  const supersedeMap = new Map<string, string>();

  for (const s of diff.supersede) {
    supersedeMap.set(s.old.trim().toLowerCase(), s.new.trim());
  }

  const mappedConcepts = existing.keyConcepts.map((c) => {
    const replacement = supersedeMap.get(c.trim().toLowerCase());
    return replacement ?? c;
  });

  const keyConcepts = dedupeCaseInsensitive([
    ...mappedConcepts,
    ...diff.additionalKeyConcepts,
  ]);

  const tags = dedupeCaseInsensitive([
    ...existing.tags,
    ...diff.additionalTags,
  ]);

  const resolvedSet = new Set(
    diff.resolvedOpenQuestions.map((q) => q.trim().toLowerCase()),
  );

  const remainingQuestions = existing.openQuestions.filter(
    (q) => !resolvedSet.has(q.trim().toLowerCase()),
  );

  const openQuestions = dedupeCaseInsensitive([
    ...remainingQuestions,
    ...diff.additionalOpenQuestions,
  ]);

  const related = dedupeCaseInsensitive([
    ...existing.related,
    ...diff.additionalRelated,
  ]);

  const summary = diff.summaryUpdate?.trim() || existing.summary;

  const deepDive = diff.deepDiveAppend
    ? `${existing.deepDive.trim()}\n\n${diff.deepDiveAppend.trim()}`
    : existing.deepDive;

  return {
    title: existing.title,
    tags: cleanArray(tags),
    summary,
    keyConcepts: cleanArray(keyConcepts),
    deepDive,
    related: cleanArray(related),
    openQuestions: cleanArray(openQuestions),
  };
}

export async function refineNote(
  existing: Knowledge,
  newContent: string,
): Promise<{
  knowledge: Knowledge;
  diff: KnowledgeDiff;
  result: LLMResult<KnowledgeDiff>;
}> {
  const result = await generateDiff(existing, newContent);
  const knowledge = applyDiff(existing, result.data);

  return { knowledge, diff: result.data, result };
}
