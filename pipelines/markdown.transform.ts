import slugify from "slugify";

import { Knowledge } from "../schemas/knowledge.schema";

export function toMarkdown(note: Knowledge): {
  content: string;
  fileName: string;
} {
  const id = slugify(note.title, { lower: true, strict: true });

  const now = new Date().toISOString();

  const markdown = `
    ---
    id: ${id}
    title: ${note.title}
    tags: [${note.tags.join(", ")}]
    created_at: ${now}
    updated_at: ${now}
    ---

    ## Summary
    ${note.summary}

    ## Key Concepts
    ${note.keyConcepts.map((c) => `- ${c}`).join("\n")}

    ## Deep Dive
    ${note.deepDive}

    ## Related
    ${note.related.map((r) => `- [[${r}]]`).join("\n")}

    ## Open Questions
    ${note.openQuestions.map((q) => `- ${q}`).join("\n")}
  `;

  return {
    content: markdown,
    fileName: `${id}.md`,
  };
}
