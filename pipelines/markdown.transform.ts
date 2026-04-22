import slugify from "slugify";
import matter from "gray-matter";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import type { Root, Content, List, Heading, Paragraph } from "mdast";

import { Knowledge } from "../schemas/knowledge.schema";
import { cleanArray } from "../utils/arrays";

function createHeading(text: string): Heading {
  return {
    type: "heading",
    depth: 2,
    children: [{ type: "text", value: text }],
  };
}

function createParagraph(text: string): Paragraph {
  return {
    type: "paragraph",
    children: [{ type: "text", value: text.trim() }],
  };
}

function createList(items: string[], isLink = false): List {
  return {
    type: "list",
    ordered: false,
    spread: false,
    children: items.map((item) => ({
      type: "listItem",
      spread: false,
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: isLink ? `[[${item.trim()}]]` : item.trim(),
            },
          ],
        },
      ],
    })),
  };
}

function normalizeTags(tags: string[]): string[] {
  return tags.map((t) => slugify(t, { lower: true, strict: true }));
}

function buildTree(note: Knowledge): Root {
  const children: Content[] = [];

  children.push(createHeading("Summary"));
  children.push(createParagraph(note.summary));

  if (note.keyConcepts.length > 0) {
    children.push(createHeading("Key Concepts"));
    children.push(createList(note.keyConcepts));
  }

  children.push(createHeading("Deep Dive"));
  children.push(createParagraph(note.deepDive));

  if (note.related.length > 0) {
    children.push(createHeading("Related"));
    children.push(createList(note.related, true));
  }

  if (note.openQuestions.length > 0) {
    children.push(createHeading("Open Questions"));
    children.push(createList(note.openQuestions));
  }

  return {
    type: "root",
    children,
  };
}

export interface ToMarkdownOptions {
  createdAt?: string;
  updatedAt?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceHash?: string;
  promptVersion?: string;
  model?: string;
}

export interface MarkdownOutput {
  content: string;
  fileName: string;
  id: string;
  frontmatter: Record<string, unknown>;
}

export function toMarkdown(
  note: Knowledge,
  options: ToMarkdownOptions = {},
): MarkdownOutput {
  const id = slugify(note.title, { lower: true, strict: true });
  const now = new Date().toISOString();

  const normalized: Knowledge = {
    ...note,
    tags: normalizeTags(note.tags),
    keyConcepts: cleanArray(note.keyConcepts),
    related: cleanArray(note.related),
    openQuestions: cleanArray(note.openQuestions),
  };

  const tree = buildTree(normalized);

  const processor = unified().use(remarkGfm).use(remarkStringify, {
    bullet: "-",
    listItemIndent: "one",
    fences: true,
  });

  const markdownBody = processor
    .stringify(tree)
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]");

  const frontmatter: Record<string, unknown> = {
    id,
    title: normalized.title,
    tags: normalized.tags,
    created_at: options.createdAt ?? now,
    updated_at: options.updatedAt ?? now,
  };

  if (options.sourceType) frontmatter.source_type = options.sourceType;
  if (options.sourceUrl) frontmatter.source_url = options.sourceUrl;
  if (options.sourceHash) frontmatter.source_hash = options.sourceHash;
  if (options.promptVersion) frontmatter.prompt_version = options.promptVersion;
  if (options.model) frontmatter.model = options.model;

  const final = matter.stringify(markdownBody.trim(), frontmatter);

  return {
    content: final,
    fileName: `${id}.md`,
    id,
    frontmatter,
  };
}
