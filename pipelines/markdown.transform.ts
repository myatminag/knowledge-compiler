import slugify from "slugify";
import matter from "gray-matter";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import type { Root, Content, List, Heading, Paragraph } from "mdast";

import { Knowledge } from "../schemas/knowledge.schema";

/* -------------------------- */
/* 🔧 Helpers (AST Builders)  */
/* -------------------------- */

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

/* -------------------------- */
/* 🧠 Normalization Layer     */
/* -------------------------- */

function normalizeTags(tags: string[]): string[] {
  return tags.map((t) => slugify(t, { lower: true, strict: true }));
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function cleanArray(arr: string[]): string[] {
  return unique(arr.map((x) => x.trim()).filter((x) => x.length > 0));
}

/* -------------------------- */
/* 🏗️ Build AST              */
/* -------------------------- */

function buildTree(note: Knowledge): Root {
  const children: Content[] = [];

  // Summary
  children.push(createHeading("Summary"));
  children.push(createParagraph(note.summary));

  // Key Concepts
  if (note.keyConcepts.length > 0) {
    children.push(createHeading("Key Concepts"));
    children.push(createList(note.keyConcepts));
  }

  // Deep Dive
  children.push(createHeading("Deep Dive"));
  children.push(createParagraph(note.deepDive));

  // Related
  if (note.related.length > 0) {
    children.push(createHeading("Related"));
    children.push(createList(note.related, true));
  }

  // Open Questions
  if (note.openQuestions.length > 0) {
    children.push(createHeading("Open Questions"));
    children.push(createList(note.openQuestions));
  }

  return {
    type: "root",
    children,
  };
}

/* -------------------------- */
/* 📝 Main Export             */
/* -------------------------- */

export function toMarkdown(note: Knowledge): {
  content: string;
  fileName: string;
} {
  const id = slugify(note.title, { lower: true, strict: true });
  const now = new Date().toISOString();

  // Normalize data
  const normalized: Knowledge = {
    ...note,
    tags: normalizeTags(note.tags),
    keyConcepts: cleanArray(note.keyConcepts),
    related: cleanArray(note.related),
    openQuestions: cleanArray(note.openQuestions),
  };

  // Build AST
  const tree = buildTree(normalized);

  // Markdown processor
  const processor = unified()
    .use(remarkGfm) // tables support (future-proof)
    .use(remarkStringify, {
      bullet: "-",
      listItemIndent: "one",
      fences: true,
    });

  const markdownBody = processor.stringify(tree);

  // Add frontmatter
  const final = matter.stringify(markdownBody.trim(), {
    id,
    title: normalized.title,
    tags: normalized.tags,
    created_at: now,
    updated_at: now,
  });

  return {
    content: final,
    fileName: `${id}.md`,
  };
}
