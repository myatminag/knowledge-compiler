# Data Model

Knowledge Compiler has two main persisted surfaces: structured objects in TypeScript/Zod and Markdown files in the vault. Zod schemas define the expected shape before Markdown is written or existing frontmatter is accepted.

## Input Source

`types/input-source.ts` defines user-provided source input:

```ts
interface InputSource {
  type: 'raw_text' | 'url' | 'pdf' | 'youtube' | 'github_repo' | 'rss';
  content: string;
  title?: string;
}
```

After normalization, each input becomes a `NormalizedDocument` with:

- `type`: internal normalized type such as `text`, `article`, `paper`, `repo`, `video`, or `feed`.
- `title`: extracted or inferred title.
- `content`: plain text body sent to the LLM or written as raw draft body.
- `sourceUrl`: optional original URL.

## Knowledge Schema

`schemas/knowledge.schema.ts` defines the main generated object:

```ts
interface Knowledge {
  title: string;
  tags: string[];
  summary: string;
  keyConcepts: KeyConcept[];
  deepDive: DeepDiveSection[];
  related: string[];
  openQuestions: string[];
}
```

`KeyConcept`:

```ts
interface KeyConcept {
  name: string;
  explanation: string;
  aliases: string[];
  sources: number[];
}
```

`DeepDiveSection`:

```ts
interface DeepDiveSection {
  heading: string;
  body: string;
  sources: number[];
}
```

The `sources` arrays are zero-based source indexes. When rendered to Markdown with topic sources, they become footnote citations such as `[^s1]`.

## Generated Note Frontmatter

`schemas/frontmatter.schema.ts` defines generated note frontmatter:

```ts
interface Frontmatter {
  id: string;
  title: string;
  aliases?: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  source_type?: string;
  source_url?: string;
  source_hash?: string;
  prompt_version?: string;
  model?: string;
}
```

`pipelines/markdown.transform.ts` creates this frontmatter while rendering the Markdown body. The note `id` and filename are derived from the title with `slugify`. Tags are normalized to lowercase strict slugs.

Generated Markdown sections are:

- `## Summary`
- `## Key Concepts`
- `## Deep Dive`
- `## Related`
- `## Open Questions`
- `## Sources` when topic sources exist

## Raw Draft Frontmatter

`schemas/raw-frontmatter.schema.ts` defines raw draft metadata for `00-raw/`:

```ts
interface RawFrontmatter {
  id: string;
  title: string;
  aliases?: string[];
  tags: string[];
  draft: boolean;
  source_type?: string;
  source_url?: string;
  source_hash: string;
  ingested_at: string;
  compiled_into?: string[];
}
```

Raw drafts are deterministic and do not require an LLM. `compiled_into` tracks topic notes that consumed the raw draft.

## Topic Notes

Topic notes use the base `Knowledge` shape plus source metadata. Topic compilation adds frontmatter fields:

- `topic_slug`
- `topic_tags`
- `source_count`

Topic notes render a `## Sources` section where each source is a footnote pointing back to a raw draft wikilink and optional source URL.

## Vault Layout

Paths are centralized in `utils/path-resolver.ts`.

```text
$KNOWLEDGE_VAULT_PATH/
  00-inbox/             optional generated inbox output
  00-raw/               raw drafts for later topic compilation
  03-notes/
    articles/           normalized URL articles
    papers/             PDFs
    repos/              GitHub repository README summaries
    videos/             YouTube transcript notes
    feeds/              RSS feed notes
    general/            raw text and default outputs
  04-topics/            compiled topic notes
  .audits/              audit reports
  .runs/                daily JSONL run logs
  .versions/<note-id>/  structured version records
  index.md              generated global index
```

## Version Records

`pipelines/versions.pipeline.ts` stores JSON records under `.versions/<id>/<timestamp>.json`:

```ts
interface VersionRecord {
  timestamp: string;
  id: string;
  model?: string;
  promptVersion?: string;
  sourceHash?: string;
  previous: Knowledge | null;
  next: Knowledge;
}
```

The `diff` command summarizes changes in title, summary, deep-dive headings, tags, key concepts, related links, and open questions.

## Run Logs

`utils/runlog.ts` appends JSONL entries under `.runs/YYYY-MM-DD.jsonl`:

```ts
interface RunLogEntry {
  timestamp: string;
  command: string;
  id: string;
  model: string;
  sourceType: string;
  sourceHash: string;
  totalTokens: number;
  costUsd?: number;
  cached?: boolean;
  issues: string[];
  outputPath: string;
}
```

Run logs make LLM usage, cache hits, lint issues, and output paths auditable over time.

## Link Model

Notes are treated as nodes in a Markdown graph:

- `frontmatter.id` identifies a node.
- `frontmatter.title` can resolve a wikilink target.
- `[[target]]` links become graph edges.
- Backlinks are generated in a `## Backlinks` section.

`OBSIDIAN_LINK_STYLE` controls whether rendered links prefer pipe-style `[[id|Title]]` links or alias-based links.
