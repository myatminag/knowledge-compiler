# CLI Reference

The project exposes Bun scripts in `package.json` and yargs commands in `cli/generate-note.ts` and `cli/ingest.ts`.

## Package Scripts

```bash
bun run generate
bun run generate:versioned
bun run generate:overwrite
bun run refine
bun run link
bun run lint-vault
bun run diff
bun run ingest
bun run raw-ingest
bun run compile
bun run index
bun run audit
bun run test
```

Most scripts forward arguments to `bun cli/generate-note.ts <command>`. `bun run ingest` forwards to `bun cli/ingest.ts`.

`generate:versioned` is present in `package.json`, but the current `generate` command does not define a `--versioned` option. Version records are saved automatically during generate/refine/compile flows and inspected with `diff`.

## Main CLI

Show help:

```bash
bun cli/generate-note.ts --help
bun cli/generate-note.ts <command> --help
```

Supported input types:

- `raw_text`
- `url`
- `pdf`
- `youtube`
- `github_repo`
- `rss`

### `generate`

Generate a knowledge note from one input source.

```bash
bun run generate --input ./input.txt
bun run generate --input https://example.com/article --type url
bun run generate --input ./paper.pdf --type pdf
bun run generate --input https://youtube.com/watch?v=abc123 --type youtube
bun run generate --input owner/repo --type github_repo
bun run generate --input https://example.com/feed.xml --type rss
```

Options:

- `--input <string>`: required source path, URL, repository reference, or text-file path.
- `--type <input-type>`: defaults to `raw_text`.
- `--overwrite`: regenerate/refine when a note with the same source hash exists.
- `--inbox`: write generated output to `00-inbox/` instead of typed `03-notes/` directories.

Side effects:

- Normalizes the source.
- Calls the LLM unless skipped by source hash.
- Writes a Markdown note.
- Saves a version record.
- Appends a run log.
- Rebuilds `index.md` when `INDEX_AUTO_REBUILD` is enabled.

### `refine`

Refine through the same source processing path as `generate`, but pass `overwrite: true` into the orchestrator. If an existing note with the same source hash is found, the pipeline runs structured refinement; otherwise it follows the normal generate path.

```bash
bun run refine --input ./new-notes.txt
bun run refine --input https://example.com/update --type url
```

Options:

- `--input <string>`: required.
- `--type <input-type>`: defaults to `raw_text`.

### `raw-ingest`

Ingest files into `00-raw/` as deterministic tagged drafts without an LLM call.

```bash
bun run raw-ingest --dir ./inbox --tags transformers,attention
bun run raw-ingest --dir ./inbox --tags systems --include .txt,.md,.pdf --concurrency 3
bun run raw-ingest --adopt --tags clipped,reading
```

Options:

- `--dir <path>`: directory of files to ingest.
- `--tags <csv>`: comma-separated tags.
- `--include <csv>`: file extensions, default `.txt,.md,.pdf`.
- `--concurrency <number>`: default `2`.
- `--adopt`: add raw frontmatter to existing Markdown files already in `00-raw/`.
- `--overwrite`: allow rewriting an existing raw entry for the same source hash.

### `compile`

Compile tagged raw drafts into one topic note in `04-topics/`.

```bash
bun run compile --topic "Transformer Architecture" --tags transformers,attention
bun run compile --topic "Rate Limiting" --tags rate-limits --overwrite
```

Options:

- `--topic <string>`: required display topic.
- `--tags <csv>`: source tags to match. If omitted, the topic slug is used.
- `--overwrite`: synthesize from scratch instead of refining an existing topic note.

Side effects:

- Reads matching `00-raw/` notes, capped by `TOPIC_MAX_SOURCES`.
- Calls the LLM for synthesis or structured refinement.
- Writes a topic note.
- Marks source raw drafts with `compiled_into`.
- Saves a version record.
- Appends a run log.
- Rebuilds `index.md` when enabled.

### `index`

Rebuild the vault root `index.md` deterministically.

```bash
bun run index
```

The index groups notes and topics by primary tag, reports raw inbox count, lists orphan links, and optionally includes a Dataview block when `INDEX_DATAVIEW=true`.

### `audit`

Run vault health checks and write an audit report under `.audits/`.

```bash
bun run audit
bun run audit --skip-llm
bun run audit --apply
```

Options:

- `--apply`: apply deterministic fixes where supported, then rebuild the index when enabled.
- `--skip-llm`: skip LLM-assisted contradiction and cross-reference checks.

The audit checks orphan links, stale raw drafts, frontmatter drift, near duplicates, contradictions, and missing cross-references.

### `link`

Resolve wikilinks and maintain backlink sections.

```bash
bun run link
bun cli/generate-note.ts link --apply false
```

Options:

- `--apply`: defaults to `true`. Set to `false` to calculate updates without writing them.

### `lint-vault`

Validate vault note structure and frontmatter.

```bash
bun run lint-vault
```

This scans vault notes and reports missing required sections or invalid frontmatter.

### `diff`

Show version history summaries for a note id.

```bash
bun run diff --id rate-limiting
bun run diff --id rate-limiting --limit 10
```

Options:

- `--id <string>`: required note id.
- `--limit <number>`: number of recent versions to show, default `5`.

## Bulk Ingest CLI

`cli/ingest.ts` processes a directory of source files concurrently through the same `processSource` orchestrator used by `generate`.

```bash
bun run ingest --dir ./inbox
bun run ingest --dir ./inbox --concurrency 4 --include .txt,.md,.pdf
bun run ingest --dir ./inbox --inbox --overwrite
```

Options:

- `--dir <path>`: required.
- `--concurrency <number>`: default `2`.
- `--overwrite`: pass overwrite into the generate pipeline.
- `--inbox`: write generated output to `00-inbox/`.
- `--include <csv>`: file extensions, default `.txt,.md,.pdf`.

Files ending in `.pdf` are treated as `pdf`; all other included files are treated as `raw_text`.
