import slugify from "slugify";
import matter from "gray-matter";

import {
  Knowledge,
  KeyConcept,
  DeepDiveSection,
} from "../schemas/knowledge.schema";
import { config } from "../config/config";
import { cleanArrayOfObjects, cleanArray } from "../utils/arrays";
import { renderWikilink, renderWikilinkById } from "../utils/obsidian-link";

export interface TopicSource {
  id: string;
  title: string;
  sourceUrl?: string;
}

function normalizeTags(tags: string[]): string[] {
  return tags.map((t) => slugify(t, { lower: true, strict: true }));
}

function renderCitations(indexes: number[], sourceCount: number): string {
  const inRange = [...new Set(indexes)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < sourceCount)
    .sort((a, b) => a - b);

  if (inRange.length === 0) return "";
  return inRange.map((i) => `[^s${i + 1}]`).join("");
}

function renderConceptBullet(concept: KeyConcept, sourceCount: number): string {
  const citations = renderCitations(concept.sources, sourceCount);
  const explanation = concept.explanation.trim();
  const suffix = citations ? ` ${citations}` : "";

  const headline = `- **${concept.name.trim()}** — ${explanation}${suffix}`;

  const aliases = (concept.aliases ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  if (aliases.length === 0) return headline;

  return `${headline}\n  _aliases: ${aliases.join(", ")}_`;
}

function renderDeepDiveSection(
  section: DeepDiveSection,
  sourceCount: number,
): string {
  const citations = renderCitations(section.sources, sourceCount);
  const body = section.body.trim();
  const heading = `### ${section.heading.trim()}`;

  if (!citations) return `${heading}\n\n${body}`;
  return `${heading}\n\n${body} ${citations}`;
}

function renderSourceFootnotes(sources: TopicSource[]): string {
  const style = config.obsidian.linkStyle;

  return sources
    .map((src, i) => {
      const link = renderWikilinkById(src.id, src.title, style);
      const url = src.sourceUrl ? ` — ${src.sourceUrl}` : "";
      return `[^s${i + 1}]: ${link}${url}`;
    })
    .join("\n");
}

function renderRelatedList(related: string[]): string {
  const style = config.obsidian.linkStyle;

  return related.map((r) => `- ${renderWikilink(r, { style })}`).join("\n");
}

function renderBody(note: Knowledge, sources: TopicSource[]): string {
  const sourceCount = sources.length;
  const sections: string[] = [];

  sections.push(`## Summary\n\n${note.summary.trim()}`);

  if (note.keyConcepts.length > 0) {
    const bullets = note.keyConcepts
      .map((c) => renderConceptBullet(c, sourceCount))
      .join("\n");
    sections.push(`## Key Concepts\n\n${bullets}`);
  }

  if (note.deepDive.length > 0) {
    const subsections = note.deepDive
      .map((s) => renderDeepDiveSection(s, sourceCount))
      .join("\n\n");
    sections.push(`## Deep Dive\n\n${subsections}`);
  }

  if (note.related.length > 0) {
    sections.push(`## Related\n\n${renderRelatedList(note.related)}`);
  }

  if (note.openQuestions.length > 0) {
    const bullets = note.openQuestions.map((q) => `- ${q.trim()}`).join("\n");
    sections.push(`## Open Questions\n\n${bullets}`);
  }

  if (sources.length > 0) {
    const footnotes = renderSourceFootnotes(sources);
    sections.push(`## Sources\n\n${footnotes}`);
  }

  return sections.join("\n\n");
}

export interface ToMarkdownOptions {
  createdAt?: string;
  updatedAt?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
  aliases?: string[];
  sources?: TopicSource[];
  extraFrontmatter?: Record<string, unknown>;
}

export interface MarkdownOutput {
  content: string;
  fileName: string;
  id: string;
  frontmatter: Record<string, unknown>;
}

function buildAliases(title: string, extra: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of [title, ...extra]) {
    const trimmed = candidate.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function normalizeKnowledge(note: Knowledge): Knowledge {
  return {
    ...note,
    tags: normalizeTags(note.tags),
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

export function toMarkdown(
  note: Knowledge,
  options: ToMarkdownOptions = {},
): MarkdownOutput {
  const id = slugify(note.title, { lower: true, strict: true });
  const now = new Date().toISOString();

  const normalized = normalizeKnowledge(note);
  const sources = options.sources ?? [];

  const markdownBody = renderBody(normalized, sources).trim();

  const aliases = buildAliases(normalized.title, options.aliases ?? []);

  const frontmatter: Record<string, unknown> = {
    id,
    title: normalized.title,
    aliases,
    tags: normalized.tags,
    created_at: options.createdAt ?? now,
    updated_at: options.updatedAt ?? now,
  };

  if (options.sourceType) frontmatter.source_type = options.sourceType;
  if (options.sourceUrl) frontmatter.source_url = options.sourceUrl;
  if (options.sourceHash) frontmatter.source_hash = options.sourceHash;
  if (options.promptVersion) frontmatter.prompt_version = options.promptVersion;
  if (options.model) frontmatter.model = options.model;

  if (options.extraFrontmatter) {
    for (const [key, value] of Object.entries(options.extraFrontmatter)) {
      frontmatter[key] = value;
    }
  }

  const final = matter.stringify(markdownBody, frontmatter);

  return {
    content: final,
    fileName: `${id}.md`,
    id,
    frontmatter,
  };
}
