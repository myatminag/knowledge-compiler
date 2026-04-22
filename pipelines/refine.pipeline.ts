import { z } from "zod";

import {
  Knowledge,
  KeyConcept,
  DeepDiveSection,
  KeyConceptSchema,
  DeepDiveSectionSchema,
} from "../schemas/knowledge.schema";
import {
  cleanArray,
  cleanArrayOfObjects,
  dedupeCaseInsensitive,
} from "../utils/arrays";
import { callStructured, LLMResult } from "../llm/llm.client";

export const KnowledgeDiffSchema = z.object({
  additionalTags: z.array(z.string()).default([]),
  additionalKeyConcepts: z.array(KeyConceptSchema).default([]),
  supersedeConcepts: z
    .array(
      z.object({
        oldName: z.string(),
        replacement: KeyConceptSchema,
      }),
    )
    .default([]),
  summaryUpdate: z.string().nullable().default(null),
  appendDeepDiveSections: z.array(DeepDiveSectionSchema).default([]),
  replaceDeepDiveSections: z.array(DeepDiveSectionSchema).default([]),
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
- Do not drop existing concepts unless clearly superseded by a better version.
- Prefer ADDING new concepts over rewriting old ones.
- Each concept must have \`name\` plus a 1-2 sentence \`explanation\` (never a bare term).
- Each deep-dive section must have a \`heading\` and \`body\` paragraph.
- To add new sub-sections use \`appendDeepDiveSections\`.
- To overwrite an existing sub-section (matched by heading, case-insensitive) use \`replaceDeepDiveSections\`.
- Preserve formulas, code, equations VERBATIM from the source when citing them.
- Use the \`sources\` array on concepts/sections to cite the 0-indexed source excerpts.
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
  options: { model?: string } = {},
): Promise<LLMResult<KnowledgeDiff>> {
  return callStructured(KnowledgeDiffSchema, "knowledge_diff", {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(existing, newContent),
    model: options.model,
  });
}

function mergeConcepts(
  existing: KeyConcept[],
  diff: KnowledgeDiff,
): KeyConcept[] {
  const supersedeMap = new Map<string, KeyConcept>();
  for (const s of diff.supersedeConcepts) {
    supersedeMap.set(s.oldName.trim().toLowerCase(), s.replacement);
  }

  const replaced = existing.map((c) => {
    const replacement = supersedeMap.get(c.name.trim().toLowerCase());
    return replacement ?? c;
  });

  const combined = [...replaced, ...diff.additionalKeyConcepts];

  return cleanArrayOfObjects(combined, (c) => c.name.trim().toLowerCase());
}

function mergeDeepDive(
  existing: DeepDiveSection[],
  diff: KnowledgeDiff,
): DeepDiveSection[] {
  const replaceMap = new Map<string, DeepDiveSection>();
  for (const s of diff.replaceDeepDiveSections) {
    replaceMap.set(s.heading.trim().toLowerCase(), s);
  }

  const replaced = existing.map((s) => {
    const replacement = replaceMap.get(s.heading.trim().toLowerCase());
    return replacement ?? s;
  });

  const combined = [...replaced, ...diff.appendDeepDiveSections];

  return cleanArrayOfObjects(combined, (s) => s.heading.trim().toLowerCase());
}

export function applyDiff(existing: Knowledge, diff: KnowledgeDiff): Knowledge {
  const tags = dedupeCaseInsensitive([
    ...existing.tags,
    ...diff.additionalTags,
  ]);

  const keyConcepts = mergeConcepts(existing.keyConcepts, diff);
  const deepDive = mergeDeepDive(existing.deepDive, diff);

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

  return {
    title: existing.title,
    tags: cleanArray(tags),
    summary,
    keyConcepts,
    deepDive,
    related: cleanArray(related),
    openQuestions: cleanArray(openQuestions),
  };
}

export async function refineNote(
  existing: Knowledge,
  newContent: string,
  options: { model?: string } = {},
): Promise<{
  knowledge: Knowledge;
  diff: KnowledgeDiff;
  result: LLMResult<KnowledgeDiff>;
}> {
  const result = await generateDiff(existing, newContent, options);
  const knowledge = applyDiff(existing, result.data);

  return { knowledge, diff: result.data, result };
}
