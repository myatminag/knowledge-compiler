import fs from "fs";
import slugify from "slugify";
import matter from "gray-matter";

import {
  ensureDir,
  resolveTopicPath,
  resolveTopicsDir,
} from "../utils/path-resolver";
import {
  TopicSource,
  TopicKnowledge,
  TopicKnowledgeSchema,
} from "../schemas/topic.schema";
import { logger } from "../utils/logger";
import { config } from "../config/config";
import { lintNote } from "./lint.pipeline";
import { chunkText } from "./chunk.pipeline";
import { appendRunLog } from "../utils/runlog";
import { filterRawByTags } from "./raw.pipeline";
import { rebuildIndexIfEnabled } from "./index.pipeline";
import { toMarkdown } from "./markdown.transform";
import { saveVersion } from "./versions.pipeline";
import { callStructured } from "../llm/llm.client";
import { RawNote, readNoteIfExists, sha256 } from "../utils/vault";
import { KnowledgeDiffSchema, applyDiff } from "./refine.pipeline";
import { cleanArray, dedupeCaseInsensitive } from "../utils/arrays";
import { Knowledge, KnowledgeSchema } from "../schemas/knowledge.schema";

const SYNTHESIS_SYSTEM_PROMPT = `
You are a knowledge compiler that synthesizes MULTIPLE source documents into a single, coherent topic entry.

You are given a topic name and several source excerpts. Your job is to:
- Produce ONE unified structured note that represents the current best understanding of the topic.
- Merge and deduplicate concepts across sources.
- Keep concepts atomic (short phrases, not sentences).
- Prefer precise, canonical terms; resolve terminology conflicts by stating the canonical form and noting alternatives in Deep Dive.
- Never hallucinate facts not supported by the provided sources.
- Return only JSON matching the provided schema.
- Leave "sources" as an empty array; the caller fills it from provenance metadata.
`;

const REFINE_SYSTEM_PROMPT = `
You are a knowledge refiner for a topic note. Produce a minimal DIFF that improves the existing topic note using new source excerpts.

Rules:
- Do not drop existing concepts unless clearly superseded.
- Prefer adding new concepts over rewriting old ones.
- Keep concepts atomic.
- Never hallucinate facts that the new content does not support.
- Return empty arrays / null when no change is warranted.
`;

function buildSynthesisPrompt(topic: string, body: string): string {
  return `
Topic: ${topic}

The following excerpts come from raw source documents in my inbox. Synthesize them into a single structured topic note.

${body}
  `;
}

function buildRefinePrompt(
  topic: string,
  existing: Knowledge,
  body: string,
): string {
  return `
Topic: ${topic}

Existing topic note:
"""
${JSON.stringify(existing, null, 2)}
"""

New source excerpts to incorporate:
${body}

Produce a diff.
  `;
}

function formatSources(raws: RawNote[]): string {
  return raws
    .map((r, i) => {
      const url = r.frontmatter.source_url
        ? ` (${r.frontmatter.source_url})`
        : "";
      return `### [source ${i + 1}] ${r.frontmatter.title}${url}\n\n${r.body.trim()}`;
    })
    .join("\n\n---\n\n");
}

function readExistingTopicAsKnowledge(
  filePath: string,
): { knowledge: TopicKnowledge; createdAt?: string } | null {
  const existing = readNoteIfExists(filePath);
  if (!existing) return null;

  const sections = parseTopicBody(existing.body);

  const knowledge: TopicKnowledge = {
    title: existing.frontmatter.title,
    tags: existing.frontmatter.tags,
    summary: sections.summary,
    keyConcepts: sections.keyConcepts,
    deepDive: sections.deepDive,
    related: sections.related,
    openQuestions: sections.openQuestions,
    sources: sections.sources,
  };

  return { knowledge, createdAt: existing.frontmatter.created_at };
}

interface ParsedTopicSections {
  summary: string;
  keyConcepts: string[];
  deepDive: string;
  related: string[];
  openQuestions: string[];
  sources: TopicSource[];
}

function parseTopicBody(body: string): ParsedTopicSections {
  const sections = splitBySections(body);

  return {
    summary: sections.Summary ?? "",
    keyConcepts: parseBulletList(sections["Key Concepts"] ?? ""),
    deepDive: sections["Deep Dive"] ?? "",
    related: parseBulletList(sections.Related ?? "").map(stripWikilinkSyntax),
    openQuestions: parseBulletList(sections["Open Questions"] ?? ""),
    sources: parseSources(sections.Sources ?? ""),
  };
}

function splitBySections(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = body.split("\n");

  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      result[currentHeading] = buffer.join("\n").trim();
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }

    if (currentHeading !== null) buffer.push(line);
  }

  flush();
  return result;
}

function parseBulletList(section: string): string[] {
  return section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function stripWikilinkSyntax(value: string): string {
  const stripped = value.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  const parts = stripped.split("|");
  return (parts[1] ?? parts[0]).trim();
}

function parseSources(section: string): TopicSource[] {
  return parseBulletList(section)
    .map((line) => {
      const urlMatch = line.match(/—\s*(https?:\S+)/);
      const sourceUrl = urlMatch?.[1];
      const linkPart = line.replace(/—\s*https?:\S+/, "").trim();
      const wikilink = linkPart.match(/\[\[([^\]]+)\]\]/);
      if (!wikilink) return null;

      const inside = wikilink[1];
      const [id, title] = inside.includes("|")
        ? inside.split("|").map((s) => s.trim())
        : [inside.trim(), inside.trim()];

      if (!id) return null;

      return {
        id,
        title: title || id,
        sourceUrl,
      } as TopicSource;
    })
    .filter((s): s is TopicSource => s !== null);
}

export interface TopicCompileOptions {
  topic: string;
  tags?: string[];
  overwrite?: boolean;
}

export interface TopicCompileOutcome {
  status: "compiled" | "refined" | "skipped";
  path: string;
  id: string;
  sourceCount: number;
  issues: string[];
  totalTokens: number;
  costUsd?: number;
}

async function synthesizeFromScratch(
  topic: string,
  body: string,
): Promise<{
  knowledge: Knowledge;
  model: string;
  totalTokens: number;
  costUsd: number;
}> {
  const chunks = chunkText(body, {
    maxChars: config.chunk.sizeChars,
    overlap: config.chunk.overlapChars,
  });

  logger.info("Topic synthesis chunking", {
    topic,
    chunks: chunks.length,
  });

  const first = await callStructured(KnowledgeSchema, "topic_knowledge", {
    systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
    userPrompt: buildSynthesisPrompt(topic, chunks[0]),
  });

  let knowledge: Knowledge = first.data;
  let model = first.model;
  let totalTokens = first.usage.totalTokens;
  let totalCost = first.usage.costUsd ?? 0;

  for (let i = 1; i < chunks.length; i++) {
    logger.debug("Topic refining with next chunk", {
      topic,
      index: i,
      total: chunks.length,
    });

    const diffResult = await callStructured(
      KnowledgeDiffSchema,
      "topic_knowledge_diff",
      {
        systemPrompt: REFINE_SYSTEM_PROMPT,
        userPrompt: buildRefinePrompt(topic, knowledge, chunks[i]),
      },
    );

    knowledge = applyDiff(knowledge, diffResult.data);
    model = diffResult.model;
    totalTokens += diffResult.usage.totalTokens;
    totalCost += diffResult.usage.costUsd ?? 0;
  }

  return { knowledge, model, totalTokens, costUsd: totalCost };
}

async function refineExisting(
  topic: string,
  existing: Knowledge,
  body: string,
): Promise<{
  knowledge: Knowledge;
  model: string;
  totalTokens: number;
  costUsd: number;
}> {
  const chunks = chunkText(body, {
    maxChars: config.chunk.sizeChars,
    overlap: config.chunk.overlapChars,
  });

  let knowledge = existing;
  let model = "";
  let totalTokens = 0;
  let totalCost = 0;

  for (const chunk of chunks) {
    const result = await callStructured(
      KnowledgeDiffSchema,
      "topic_knowledge_diff",
      {
        systemPrompt: REFINE_SYSTEM_PROMPT,
        userPrompt: buildRefinePrompt(topic, knowledge, chunk),
      },
    );

    knowledge = applyDiff(knowledge, result.data);
    model = result.model;
    totalTokens += result.usage.totalTokens;
    totalCost += result.usage.costUsd ?? 0;
  }

  return { knowledge, model, totalTokens, costUsd: totalCost };
}

function markRawsCompiledInto(raws: RawNote[], topicSlug: string) {
  for (const raw of raws) {
    const current = raw.frontmatter.compiled_into ?? [];
    if (current.includes(topicSlug)) continue;

    const updated = {
      ...raw.frontmatter,
      compiled_into: [...current, topicSlug],
    };

    try {
      const pruned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (v !== undefined) pruned[k] = v;
      }
      const fileContents = matter.stringify(raw.body, pruned);
      fs.writeFileSync(raw.path, fileContents);
    } catch (err) {
      logger.warn("Failed to mark raw as compiled_into", {
        path: raw.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function compileTopic(
  options: TopicCompileOptions,
): Promise<TopicCompileOutcome> {
  const topic = options.topic.trim();
  if (!topic) throw new Error("Topic is required");

  const topicSlug = slugify(topic, { lower: true, strict: true });
  const topicFileName = `${topicSlug}.md`;
  const topicPath = resolveTopicPath(topicFileName);

  const candidateTags =
    options.tags && options.tags.length > 0 ? options.tags : [topicSlug];

  const { matched: rawNotes } = filterRawByTags(candidateTags);

  if (rawNotes.length === 0) {
    logger.warn("No raw drafts matched", { topic, tags: candidateTags });
    return {
      status: "skipped",
      path: topicPath,
      id: topicSlug,
      sourceCount: 0,
      issues: ["No raw drafts matched the requested tags"],
      totalTokens: 0,
    };
  }

  const limitedRaws = rawNotes.slice(0, config.topic.maxSources);

  if (limitedRaws.length < rawNotes.length) {
    logger.warn("Capping raw sources", {
      topic,
      total: rawNotes.length,
      using: limitedRaws.length,
      cap: config.topic.maxSources,
    });
  }

  const body = formatSources(limitedRaws);

  ensureDir(topicPath);

  const existingFile = fs.existsSync(topicPath)
    ? readExistingTopicAsKnowledge(topicPath)
    : null;

  const runRefine = !!existingFile && !options.overwrite;

  let knowledge: Knowledge;
  let model: string;
  let totalTokens: number;
  let costUsd: number;

  if (runRefine && existingFile) {
    const result = await refineExisting(topic, existingFile.knowledge, body);
    knowledge = result.knowledge;
    model = result.model;
    totalTokens = result.totalTokens;
    costUsd = result.costUsd;
  } else {
    const result = await synthesizeFromScratch(topic, body);
    knowledge = {
      ...result.knowledge,
      title: result.knowledge.title || topic,
    };
    model = result.model;
    totalTokens = result.totalTokens;
    costUsd = result.costUsd;
  }

  const existingSources = existingFile?.knowledge.sources ?? [];

  const sourcesMap = new Map<string, TopicSource>();

  for (const src of existingSources) {
    sourcesMap.set(src.id, src);
  }

  for (const raw of limitedRaws) {
    sourcesMap.set(raw.frontmatter.id, {
      id: raw.frontmatter.id,
      title: raw.frontmatter.title,
      sourceUrl: raw.frontmatter.source_url,
    });
  }

  const sources = [...sourcesMap.values()];

  const topicKnowledge: TopicKnowledge = {
    ...knowledge,
    tags: dedupeCaseInsensitive([...knowledge.tags, ...candidateTags]),
    keyConcepts: cleanArray(knowledge.keyConcepts),
    related: cleanArray(knowledge.related),
    openQuestions: cleanArray(knowledge.openQuestions),
    sources,
  };

  const validated = TopicKnowledgeSchema.parse(topicKnowledge);
  const issues = lintNote(validated);

  const sourceHash = sha256(body);

  const md = toMarkdown(validated, {
    createdAt: existingFile?.createdAt,
    sourceType: "topic",
    sourceHash,
    promptVersion: config.prompt.version,
    model,
    sources: validated.sources,
    extraFrontmatter: {
      topic_slug: topicSlug,
      topic_tags: candidateTags,
      source_count: limitedRaws.length,
    },
  });

  const finalPath = resolveTopicPath(md.fileName);
  ensureDir(finalPath);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  saveVersion({
    timestamp,
    id: md.id,
    model,
    promptVersion: config.prompt.version,
    sourceHash,
    previous: existingFile?.knowledge ?? null,
    next: validated,
  });

  fs.writeFileSync(finalPath, md.content);

  markRawsCompiledInto(limitedRaws, topicSlug);

  appendRunLog({
    timestamp: new Date().toISOString(),
    command: runRefine ? "compile-refine" : "compile",
    id: md.id,
    model,
    sourceType: "topic",
    sourceHash,
    totalTokens,
    costUsd: costUsd > 0 ? costUsd : undefined,
    issues,
    outputPath: finalPath,
  });

  rebuildIndexIfEnabled();

  return {
    status: runRefine ? "refined" : "compiled",
    path: finalPath,
    id: md.id,
    sourceCount: limitedRaws.length,
    issues,
    totalTokens,
    costUsd: costUsd > 0 ? costUsd : undefined,
  };
}

export function topicsDir(): string {
  return resolveTopicsDir();
}
