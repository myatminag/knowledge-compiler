# Knowledge Compiler

Knowledge Compiler turns unstructured sources into structured, versioned Markdown knowledge assets for an Obsidian-compatible vault.

It is a local-first Bun and TypeScript CLI for building a compiled knowledge base: ingest raw material, normalize it, generate schema-validated notes with an LLM, maintain links and indexes, and keep audit/version metadata alongside the vault.

## What It Does

- Converts raw text, URLs, PDFs, YouTube transcripts, GitHub repositories, and RSS feeds into structured Markdown notes.
- Uses Zod schemas and OpenAI structured outputs instead of freeform Markdown generation.
- Writes durable notes, topic notes, raw drafts, run logs, versions, indexes, and audit reports to a local vault.
- Supports an Obsidian-friendly workflow with wikilinks, aliases, backlinks, callouts, and properties.
- Lets raw drafts accumulate in `00-raw/`, then compiles tagged groups into stable topic notes in `04-topics/`.

## Core Principles

- Structured output over freeform generation.
- Markdown files as the source of truth.
- Deterministic local workflows where possible.
- Small composable pipelines instead of a heavyweight RAG stack.
- Incremental refinement, versioning, linking, and auditability over time.

## How It Works

```text
Input source
  -> Normalize to plain text
  -> Generate or refine structured knowledge with an LLM
  -> Validate with Zod and lint rules
  -> Render Markdown with frontmatter and wikilinks
  -> Write to the vault
  -> Rebuild index, save versions, and append run logs
```

The raw-to-topic loop follows a similar path, but starts with deterministic raw ingestion:

```text
00-raw/ drafts
  -> compile by topic and tags
  -> 04-topics/ topic note
  -> index.md
  -> .audits/ health reports
```

## Quick Start

Install dependencies:

```bash
bun install
```

Create a `.env` file:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
KNOWLEDGE_VAULT_PATH=/absolute/path/to/your/knowledge-vault
```

Generate a note from a text file:

```bash
echo "Rate limiting prevents abuse in distributed systems." > input.txt
bun run generate --input ./input.txt
```

Output is written under `$KNOWLEDGE_VAULT_PATH/03-notes/...`.

## Common Workflows

Generate notes from different source types:

```bash
bun run generate --input https://example.com/article --type url
bun run generate --input ./paper.pdf --type pdf
bun run generate --input https://youtube.com/watch?v=abc123 --type youtube
bun run generate --input owner/repo --type github_repo
```

Ingest raw drafts without calling the LLM:

```bash
bun run raw-ingest --dir ./inbox --tags systems,rate-limits
bun run raw-ingest --adopt --tags clipped,reading
```

Compile tagged raw drafts into a topic note:

```bash
bun run compile --topic "Rate Limiting" --tags rate-limits,systems
```

Maintain and inspect the vault:

```bash
bun run index
bun run audit --skip-llm
bun run link
bun run lint-vault
bun run diff --id rate-limiting
bun run ingest --dir ./inbox --concurrency 3
```

## Documentation

- [Documentation index](docs/README.md)
- [Developer guide](docs/developer-guide.md)
- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli-reference.md)
- [Data model](docs/data-model.md)
- [Pipelines](docs/pipelines.md)

## Project Structure

```text
knowledge-compiler/
  cli/          command-line entry points
  config/       environment configuration
  llm/          OpenAI structured-output client
  pipelines/    processing, indexing, audit, linking, and vault workflows
  schemas/      Zod contracts
  tests/        Bun tests
  types/        shared TypeScript types
  utils/        vault, path, cache, logging, pricing, and link helpers
  docs/         developer documentation
```

## Testing

Run the full test suite:

```bash
bun test
```

CI runs the same test command with Bun on pushes and pull requests to `main`.

## Status

Implemented:

- Schema validation with Zod
- Structured note generation
- Raw draft ingestion
- Topic compilation
- Auto-maintained `index.md`
- Wikilink and backlink maintenance
- Version records and diffs
- Vault health audits

Planned:

- Full-text search
- Optional semantic search

## Design Philosophy

Knowledge Compiler intentionally keeps the durable layer simple: Markdown in a local vault, structured metadata in frontmatter, and JSON sidecar records for versions and runs. Vector databases, heavyweight retrieval infrastructure, and complex service orchestration can be added later if they earn their place.
