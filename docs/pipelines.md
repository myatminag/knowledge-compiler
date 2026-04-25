# Pipelines

Pipelines are small modules that transform inputs, validate outputs, and apply vault side effects. Most commands are composed from these modules rather than embedding processing logic directly in the CLI.

## Normalization

Module: `pipelines/normalize.pipeline.ts`

Purpose: convert supported input sources into plain-text `NormalizedDocument` objects.

Input types:

- `raw_text`: reads text content directly.
- `url`: fetches HTML and extracts article text with Readability.
- `pdf`: extracts text from a local PDF file.
- `youtube`: fetches a transcript and joins transcript segments.
- `github_repo`: fetches repository README and metadata from GitHub.
- `rss`: fetches and parses feed entries into a text document.

Output:

- normalized internal type,
- title,
- content,
- optional source URL.

## Single-Source Generate And Refine

Module: `pipelines/orchestrator.ts`

Purpose: process one normalized source into a generated note.

Steps:

1. Normalize the input source.
2. Compute a SHA-256 hash of normalized content.
3. Resolve the output directory based on normalized type or inbox mode.
4. Skip if a note with the same `source_hash` already exists and overwrite is false.
5. Generate new knowledge or refine existing knowledge when overwrite is true.
6. Lint the generated `Knowledge` object.
7. Render Markdown and frontmatter.
8. Save a structured version record.
9. Write the Markdown note to the vault.
10. Append a run log entry.
11. Rebuild `index.md` when enabled.

Long content is chunked with `CHUNK_SIZE_CHARS` and `CHUNK_OVERLAP_CHARS`. The first chunk generates the initial note. Later chunks refine it.

## LLM Structured Calls

Module: `llm/llm.client.ts`

Purpose: call an OpenAI-compatible model and parse the response into a Zod schema.

Behavior:

- Uses `zodResponseFormat` for structured outputs.
- Selects `options.model` or falls back to `OPENAI_MODEL`.
- Uses `OPENAI_TEMPERATURE` unless overridden.
- Builds cache keys from schema name, prompts, model, prompt version, and temperature.
- Returns parsed data, token usage, estimated cost, model, and cache status.

Caching is controlled by `CACHE_ENABLED` and `CACHE_DIR`.

## Markdown Rendering

Module: `pipelines/markdown.transform.ts`

Purpose: render a validated `Knowledge` object to Obsidian-compatible Markdown.

Behavior:

- Slugifies note title into `id` and filename.
- Normalizes tags.
- Deduplicates key concepts, deep-dive sections, related links, and open questions.
- Adds aliases, timestamps, source metadata, prompt version, model, and extra frontmatter.
- Renders wikilinks according to `OBSIDIAN_LINK_STYLE`.
- Renders source indexes as footnote citations when topic sources are provided.

## Raw Ingestion

Module: `pipelines/raw.pipeline.ts`

Purpose: write source material into `00-raw/` without calling an LLM.

Modes:

- `writeRaw`: normalize external input and write a tagged raw Markdown draft.
- `adoptRaw`: retrofit frontmatter onto existing Markdown files already in `00-raw/`.
- `filterRawByTags`: return raw drafts whose tags match a requested topic compile.

Deduplication uses `source_hash`. When the same source appears again, tags are merged unless overwrite is requested.

## Topic Compilation

Module: `pipelines/topic.pipeline.ts`

Purpose: synthesize multiple raw drafts into one topic note in `04-topics/`.

Steps:

1. Slugify the requested topic.
2. Select raw drafts by supplied tags or the topic slug.
3. Cap sources with `TOPIC_MAX_SOURCES`.
4. Format matched raw drafts as numbered source excerpts.
5. Synthesize from scratch or refine an existing topic note.
6. Validate with the topic schema.
7. Render Markdown with source footnotes.
8. Save a version record.
9. Mark source raw drafts with `compiled_into`.
10. Append a run log entry.
11. Rebuild the index when enabled.

`OPENAI_MODEL_COMPILE` can override the default model for this pipeline only.

## Refinement

Module: `pipelines/refine.pipeline.ts`

Purpose: merge new content into existing structured knowledge through a minimal diff.

The refinement prompts prefer additive changes and structured operations. Topic refinement uses this pattern to process additional source chunks or update an existing topic note.

## Chunking

Module: `pipelines/chunk.pipeline.ts`

Purpose: split large text into overlapping chunks before LLM processing.

Configuration:

- `CHUNK_THRESHOLD_CHARS`: when single-source generation should switch to chunked processing.
- `CHUNK_SIZE_CHARS`: maximum chunk size.
- `CHUNK_OVERLAP_CHARS`: overlap between adjacent chunks.

Chunking keeps each LLM call bounded while allowing later chunks to refine the knowledge object.

## Linking

Module: `pipelines/link.pipeline.ts`

Purpose: build a graph from vault wikilinks and maintain backlink sections.

Behavior:

- Scans notes into an index by id and title.
- Extracts wikilinks outside existing backlink sections.
- Resolves links against ids or titles.
- Reports orphan links.
- Writes `## Backlinks` sections when `apply` is true.
- Updates note `updated_at` timestamps for changed backlink sections.

## Indexing

Module: `pipelines/index.pipeline.ts`

Purpose: rebuild the vault root `index.md`.

The index contains:

- generated frontmatter for the index page,
- total note/topic/raw/orphan counts,
- topics grouped by primary tag,
- notes grouped by primary tag,
- raw inbox count,
- orphan link report,
- optional Dataview block.

`INDEX_AUTO_REBUILD` controls whether generate, refine, compile, and audit apply operations rebuild the index automatically.

## Audit

Module: `pipelines/audit.pipeline.ts`

Purpose: produce a vault health report under `.audits/`.

Deterministic checks include:

- orphan wikilinks,
- stale raw drafts older than `AUDIT_STALE_DAYS`,
- frontmatter drift,
- near-duplicate notes by title and key-concept similarity.

LLM-assisted checks include:

- factual contradictions between related notes,
- missing cross-reference suggestions.

Use `--skip-llm` for deterministic-only audits. Use `--apply` to apply supported deterministic fixes and rebuild the index when enabled.

## Versioning

Module: `pipelines/versions.pipeline.ts`

Purpose: persist structured before/after knowledge records and summarize changes.

Version files are written to `.versions/<id>/<timestamp>.json`. The `diff` command reads those records and prints summaries for tags, key concepts, related links, open questions, summary changes, and deep-dive changes.

## Vault Linting

Function: `runLintVault` in `cli/generate-note.ts`

Purpose: scan existing generated notes for required structure and valid frontmatter.

Current checks include:

- invalid frontmatter,
- missing `## Summary`,
- missing `## Deep Dive`.

## Side Effects By Pipeline

- Generate/refine writes notes, versions, run logs, and optionally index.
- Raw ingest writes or updates raw drafts only.
- Topic compile writes topic notes, raw `compiled_into` updates, versions, run logs, and optionally index.
- Link writes backlink sections when applied.
- Index writes `index.md`.
- Audit writes `.audits/` reports and can apply deterministic fixes.
