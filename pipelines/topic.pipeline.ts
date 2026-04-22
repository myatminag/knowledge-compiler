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
import {
  applyDiff,
  KnowledgeDiff,
  KnowledgeDiffSchema,
} from "./refine.pipeline";
import {
  cleanArray,
  cleanArrayOfObjects,
  dedupeCaseInsensitive,
} from "../utils/arrays";
import {
  Knowledge,
  KeyConcept,
  KnowledgeSchema,
  DeepDiveSection,
} from "../schemas/knowledge.schema";
import {
  extractVerbatimSnippets,
  formatVerbatimAppendix,
} from "../utils/verbatim";
import { logger } from "../utils/logger";
import { config } from "../config/config";
import { lintNote } from "./lint.pipeline";
import { chunkText } from "./chunk.pipeline";
import { appendRunLog } from "../utils/runlog";
import { filterRawByTags } from "./raw.pipeline";
import { toMarkdown } from "./markdown.transform";
import { saveVersion } from "./versions.pipeline";
import { callStructured } from "../llm/llm.client";
import { rebuildIndexIfEnabled } from "./index.pipeline";
import { RawNote, readNoteIfExists, sha256 } from "../utils/vault";

const SYNTHESIS_SYSTEM_PROMPT = `
You are a knowledge compiler that synthesizes multiple source documents
into a single, detailed, reference-quality topic entry.

Targets:
- 6-12 key concepts. Each is { name, explanation, aliases?, sources }.
  The explanation MUST be 1-2 sentences, never a bare term.
- 3-6 Deep Dive sub-sections (e.g. Mechanism, Variants, Trade-offs,
  Applications, History). Aim for 600-1200 words across sub-sections total.
- Cite every concept and every Deep Dive sub-section with the 0-indexed
  \`sources\` array pointing into the provided excerpts ([source 0], [source 1], ...).

Rules:
- Preserve formulas, equations, pseudocode, and code snippets VERBATIM from
  the source excerpts. Do NOT rewrite or paraphrase them.
- Merge duplicate concepts across sources; note alternative terminology via
  the \`aliases\` field.
- Never invent facts not supported by the sources.
- Prefer precise, canonical terms; resolve conflicts in Deep Dive.
- Leave the top-level \`sources\` metadata as an empty array; the caller
  fills it from provenance metadata.
`;

const REFINE_SYSTEM_PROMPT = `
You are a knowledge refiner for a topic note. Produce a minimal DIFF that
improves the existing topic note using new source excerpts.

Rules:
- Do not drop existing concepts unless clearly superseded.
- Prefer ADDING new concepts over rewriting old ones.
- Each concept must have \`name\` plus a 1-2 sentence \`explanation\`.
- To add new sub-sections use \`appendDeepDiveSections\`.
- To overwrite an existing sub-section (matched by heading, case-insensitive) use \`replaceDeepDiveSections\`.
- Cite sources via the 0-indexed \`sources\` arrays.
- Preserve formulas and code VERBATIM from the new content when you reference them.
- Never hallucinate facts that the new content does not support.
- Return empty arrays / null when no change is warranted.
`;

function buildSynthesisPrompt(topic: string, body: string): string {
  const snippets = extractVerbatimSnippets(body);
  const appendix = formatVerbatimAppendix(snippets);
  const suffix = appendix ? `\n\n${appendix}` : "";

  return `
Topic: ${topic}

The following excerpts come from raw source documents in my inbox. They are
numbered starting at 0 (i.e. [source 0], [source 1], ...). Use those indexes
when populating the \`sources\` arrays on concepts and deep-dive sections.

Synthesize them into a single structured topic note.

${body}${suffix}
  `;
}

function buildRefinePrompt(
  topic: string,
  existing: Knowledge,
  body: string,
): string {
  const snippets = extractVerbatimSnippets(body);
  const appendix = formatVerbatimAppendix(snippets);
  const suffix = appendix ? `\n\n${appendix}` : "";

  return `
Topic: ${topic}

Existing topic note:
"""
${JSON.stringify(existing, null, 2)}
"""

New source excerpts to incorporate (numbered starting at 0):
${body}${suffix}

Produce a diff.
  `;
}

function formatSources(raws: RawNote[]): string {
  return raws
    .map((r, i) => {
      const url = r.frontmatter.source_url
        ? ` (${r.frontmatter.source_url})`
        : "";
      return `### [source ${i}] ${r.frontmatter.title}${url}\n\n${r.body.trim()}`;
    })
    .join("\n\n---\n\n");
}

function readExistingTopicAsKnowledge(
  filePath: string,
): { knowledge: TopicKnowledge; createdAt?: string } | null {
  const existing = readNoteIfExists(filePath);
  if (!existing) return null;

  try {
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

    const parsed = TopicKnowledgeSchema.safeParse(knowledge);
    if (!parsed.success) {
      logger.warn("Existing topic note failed schema parse; regenerating", {
        path: filePath,
        issues: parsed.error.issues.slice(0, 3),
      });
      return null;
    }

    return {
      knowledge: parsed.data,
      createdAt: existing.frontmatter.created_at,
    };
  } catch (err) {
    logger.warn("Failed to parse existing topic note; regenerating", {
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface ParsedTopicSections {
  summary: string;
  keyConcepts: KeyConcept[];
  deepDive: DeepDiveSection[];
  related: string[];
  openQuestions: string[];
  sources: TopicSource[];
}

function parseTopicBody(body: string): ParsedTopicSections {
  const sections = splitByH2(body);

  return {
    summary: (sections.Summary ?? "").trim(),
    keyConcepts: parseConceptBullets(sections["Key Concepts"] ?? ""),
    deepDive: parseDeepDive(sections["Deep Dive"] ?? ""),
    related: parseBulletList(sections.Related ?? "").map(stripWikilinkSyntax),
    openQuestions: parseBulletList(sections["Open Questions"] ?? ""),
    sources: parseSourceFootnotes(sections.Sources ?? ""),
  };
}

function splitByH2(body: string): Record<string, string> {
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
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentHeading = match[1].trim();
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
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function stripWikilinkSyntax(value: string): string {
  const stripped = value.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  const parts = stripped.split("|");
  return (parts[1] ?? parts[0]).trim();
}

function extractCitationIndexes(text: string): number[] {
  const matches = text.match(/\[\^s(\d+)\]/g) ?? [];
  return matches
    .map((m) => {
      const n = parseInt(m.match(/\d+/)?.[0] ?? "0", 10);
      return n - 1;
    })
    .filter((n) => Number.isInteger(n) && n >= 0);
}

function stripCitations(text: string): string {
  return text.replace(/\s*\[\^s\d+\]/g, "").trim();
}

function parseConceptBullets(section: string): KeyConcept[] {
  const lines = section.split("\n");
  const concepts: KeyConcept[] = [];
  let current: { raw: string; aliasLine?: string } | null = null;

  const flush = () => {
    if (!current) return;
    const parsed = parseConceptLine(current.raw, current.aliasLine);
    if (parsed) concepts.push(parsed);
    current = null;
  };

  for (const line of lines) {
    if (/^-\s+\*\*/.test(line)) {
      flush();
      current = { raw: line.trim() };
    } else if (current && /^\s+_aliases:/.test(line)) {
      current.aliasLine = line.trim();
    } else if (current && line.trim().length > 0 && !/^-\s/.test(line)) {
      current.raw = `${current.raw} ${line.trim()}`;
    }
  }

  flush();
  return concepts;
}

function parseConceptLine(
  raw: string,
  aliasLine: string | undefined,
): KeyConcept | null {
  const match = raw.match(/^-\s+\*\*(.+?)\*\*\s*[—-]\s*(.+)$/);
  if (!match) return null;

  const name = match[1].trim();
  const rest = match[2];

  const sources = extractCitationIndexes(rest);
  const explanation = stripCitations(rest);

  let aliases: string[] = [];
  if (aliasLine) {
    const aliasMatch = aliasLine.match(/_aliases:\s*(.+)_/);
    if (aliasMatch) {
      aliases = aliasMatch[1]
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    }
  }

  return { name, explanation, aliases, sources };
}

function parseDeepDive(section: string): DeepDiveSection[] {
  const lines = section.split("\n");
  const sections: DeepDiveSection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const rawBody = buffer.join("\n").trim();
    if (!rawBody) {
      currentHeading = null;
      buffer = [];
      return;
    }
    const sources = extractCitationIndexes(rawBody);
    const body = stripCitations(rawBody);
    sections.push({ heading: currentHeading, body, sources });
    currentHeading = null;
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) {
      flush();
      currentHeading = match[1].trim();
      continue;
    }
    if (currentHeading !== null) buffer.push(line);
  }

  flush();
  return sections;
}

function parseSourceFootnotes(section: string): TopicSource[] {
  const result: TopicSource[] = [];

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\[\^s\d+\]:\s*(.+)$/);
    if (!match) continue;

    const rest = match[1];
    const [linkPart, urlPartRaw] = rest.split(" — ");
    const sourceUrl = urlPartRaw?.trim();

    const wikilink = (linkPart ?? "").match(/\[\[([^\]]+)\]\]/);
    if (!wikilink) continue;

    const inside = wikilink[1];
    const [id, title] = inside.includes("|")
      ? inside.split("|").map((s) => s.trim())
      : [inside.trim(), inside.trim()];

    if (!id) continue;

    result.push({
      id,
      title: title || id,
      sourceUrl: sourceUrl || undefined,
    });
  }

  return result;
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

function compileModel(): string | undefined {
  return config.openai.modelCompile;
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
    model: compileModel(),
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
        model: compileModel(),
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
        model: compileModel(),
      },
    );

    knowledge = applyDiff(knowledge, result.data as KnowledgeDiff);
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

  const existingFile =
    !options.overwrite && fs.existsSync(topicPath)
      ? readExistingTopicAsKnowledge(topicPath)
      : null;

  const runRefine = !!existingFile;

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

  for (const src of existingSources) sourcesMap.set(src.id, src);

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
    keyConcepts: cleanArrayOfObjects(knowledge.keyConcepts, (c) =>
      c.name.trim().toLowerCase(),
    ),
    deepDive: cleanArrayOfObjects(knowledge.deepDive, (s) =>
      s.heading.trim().toLowerCase(),
    ),
    related: cleanArray(knowledge.related),
    openQuestions: cleanArray(knowledge.openQuestions),
    sources,
  };

  const validated = TopicKnowledgeSchema.parse(topicKnowledge);
  const issues = lintNote(validated, { sourceCount: limitedRaws.length });

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
