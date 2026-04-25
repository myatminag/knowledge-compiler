# Developer Guide

Knowledge Compiler is a headless knowledge engine built with Bun, TypeScript, Zod, OpenAI structured outputs, and Markdown files. It writes generated notes, topic notes, raw drafts, run logs, versions, indexes, and audit reports into a local vault directory.

## Requirements

- Bun
- Node-compatible runtime APIs available through Bun
- An OpenAI-compatible API key
- A writable knowledge vault directory

Install dependencies from the repository root:

```bash
bun install
```

## Environment

Configuration is loaded from `.env` through `dotenv/config` and validated in `config/config.ts`.

Minimum useful configuration:

```bash
OPENAI_API_KEY=your_api_key
KNOWLEDGE_VAULT_PATH=/absolute/path/to/your/knowledge-vault
```

Common optional configuration:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_MODEL_COMPILE=gpt-4o
OPENAI_TEMPERATURE=0
MAX_LLM_RETRIES=3
LOG_LEVEL=info
CACHE_ENABLED=false
CACHE_DIR=$HOME/.knowledge-compiler-cache
PROMPT_VERSION=v1
CHUNK_THRESHOLD_CHARS=12000
CHUNK_SIZE_CHARS=8000
CHUNK_OVERLAP_CHARS=200
AUDIT_STALE_DAYS=14
TOPIC_MAX_SOURCES=40
INDEX_AUTO_REBUILD=true
INDEX_DATAVIEW=false
OBSIDIAN_LINK_STYLE=pipe
```

Defaults are applied for every optional key. `OPENAI_API_KEY` is required. If `KNOWLEDGE_VAULT_PATH` is omitted, the default is `$HOME/knowledge-vault`.

## Project Structure

```text
knowledge-compiler/
  cli/          CLI entry points and yargs command definitions
  config/       validated runtime configuration
  llm/          OpenAI structured-output client and cache integration
  pipelines/    normalization, generation, refinement, indexing, audit, and vault workflows
  schemas/      Zod schemas for generated notes and frontmatter
  tests/        Bun tests for pipeline and utility behavior
  types/        shared TypeScript input types
  utils/        path, vault, link, logger, cache, pricing, and run log helpers
```

## Development Workflow

Run one-off commands through package scripts:

```bash
bun run generate --input ./input.txt
bun run raw-ingest --dir ./inbox --tags systems,rate-limits
bun run compile --topic "Rate Limiting" --tags rate-limits
bun run audit --skip-llm
```

Run direct CLI commands when you need subcommand help:

```bash
bun cli/generate-note.ts --help
bun cli/generate-note.ts generate --help
bun cli/ingest.ts --help
```

The CLI writes outside the repository when `KNOWLEDGE_VAULT_PATH` points to an external vault. Tests use temporary vault helpers and a dummy API key in CI.

## Testing And CI

Run the full test suite:

```bash
bun test
```

CI runs on pushes and pull requests to `main` through `.github/workflows/ci.yml`. The workflow installs dependencies with `bun install --frozen-lockfile` and runs `bun test` with `OPENAI_API_KEY=ci-dummy-key`.

There is no separate lint script in `package.json`. Runtime vault validation is exposed as:

```bash
bun run lint-vault
```

## Implementation Notes

- Prefer adding new behavior as a small pipeline or utility function, then exposing it through `cli/generate-note.ts`.
- Keep generated note structure aligned with `schemas/knowledge.schema.ts` and `pipelines/markdown.transform.ts`.
- Keep vault paths centralized in `utils/path-resolver.ts`.
- Use Zod schemas for LLM outputs and frontmatter parsing instead of ad hoc object checks.
- When a command mutates vault files, consider whether it should append a run log, save a version, or rebuild `index.md`.
