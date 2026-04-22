# Knowledge Compiler

> A system that transforms unstructured information into structured, evolving knowledge assets using LLMs.

---

## 🧠 Overview

Knowledge Compiler is a deterministic pipeline that converts raw content (articles, notes, PDFs) into structured Markdown-based knowledge units.

Instead of ephemeral AI outputs, this system produces **persistent, versioned, and continuously improving knowledge**.

The system is designed as a **headless knowledge engine**, with tools like Obsidian acting as the visualization layer.

---

## 🎯 Core Principles

- **Structured over freeform** — every output follows a strict schema
- **Deterministic pipelines** — no ad-hoc prompting
- **Markdown as source of truth** — portable, versionable, and human-readable
- **Composable system** — simple primitives over complex infrastructure
- **Incremental refinement** — knowledge improves over time

---

## ⚙️ Architecture

```
Input Sources → LLM Processing → Structured Markdown → Retrieval & Refinement
```

### Components

- **Input Layer**
  - Raw text, PDFs, notes, articles

- **Processing Layer**
  - LLM transforms input into structured knowledge units

- **Storage Layer**
  - Markdown files (`/knowledge`) as the source of truth

- **Consumption Layer**
  - Obsidian or any Markdown-compatible viewer

- **Refinement Layer (future)**
  - Improves, links, and updates existing knowledge

---

## 📁 Project Structure

```
knowledge-compiler/
│
├── knowledge/        # Compiled knowledge (Markdown files / Obsidian vault)
│   ├── backend/
│
├── pipelines/        # LLM processing logic
├── schemas/          # Knowledge contracts (zod / types)
├── scripts/          # CLI / execution scripts
│
├── README.md
```

---

## 🧱 Knowledge Schema

Each knowledge unit follows a strict structure:

```md
---
id: rate-limiting
title: Rate Limiting
tags: [backend, distributed-systems]
created_at: YYYY-MM-DD
updated_at: YYYY-MM-DD
source: article | pdf | manual
---

## Summary

...

## Key Concepts

...

## Deep Dive

...

## Related

- [[Token Bucket]]
- [[Leaky Bucket]]

## Open Questions

...
```

---

## 🧠 Knowledge Model

The system treats each Markdown file as a **node in a knowledge graph**:

- Files → nodes
- `[[links]]` → edges
- Tags → semantic grouping

This enables:

- Graph-based navigation (via Obsidian)
- Context-aware refinement
- Future semantic retrieval

---

## 🔄 Pipeline Flow

1. Read raw input
2. Send to LLM with structured prompt
3. Validate output format
4. Save as Markdown file
5. (Future) Refine and link with existing knowledge

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Create a `.env` in the project root:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
KNOWLEDGE_VAULT_PATH=/absolute/path/to/your/knowledge-vault
```

### 3. Run the pipeline

```bash
bun run generate --input ./input.txt
```

---

## 🧪 Example Workflow

```bash
echo "Rate limiting prevents abuse in distributed systems..." > input.txt
bun run generate --input ./input.txt
```

Output is written under `$KNOWLEDGE_VAULT_PATH/03-notes/...`.

### Other commands

```bash
bun run generate --input https://example.com/article --type url
bun run generate --input ./paper.pdf --type pdf
bun run refine   --input ./input.txt
bun run link
bun run lint-vault
bun run diff     --id rate-limiting
bun run ingest   --dir ./inbox --concurrency 3
```

---

## 🔁 The Karpathy "LLM Wiki" loop (Obsidian-ready)

Inspired by Karpathy's idea of treating a personal knowledge base like a **compiled wiki** instead of a retrieval index, this project ships with a four-step loop that runs entirely on Markdown files in your Obsidian vault.

```
raw drafts  (00-raw/)
    │  kc raw-ingest --dir inbox --tags transformers,attention
    ▼
LLM compile
    │  kc compile --topic "transformer architecture" --tags transformers
    ▼
topic notes (04-topics/)
    │  auto-rebuild index.md
    ▼
global index (index.md)
    │  kc audit   (periodic)
    ▼
self-heal report (.audits/<ts>.md)
```

### 1. Drop raw drafts into `00-raw/`

Two modes are supported:

```bash
# External files (PDF/TXT/MD from anywhere)
bun run raw-ingest --dir ./inbox --tags transformers,attention

# In-place adoption of files Obsidian Web Clipper dropped into 00-raw/
bun run raw-ingest --adopt --tags transformers
```

`raw-ingest` is deterministic and does **not** call the LLM. It writes `00-raw/{slug}.md` with `draft: true`, dedupes by `source_hash`, and merges new tags into existing drafts.

### 2. Compile a topic note from many drafts

```bash
bun run compile --topic "Transformer Architecture" --tags transformers,attention
```

This pulls **only** from `00-raw/` files matching the requested tags, synthesizes them into a single `04-topics/{slug}.md` note, adds a `## Sources` section with `[[raw-id|Raw Title]]` wikilinks, and marks each source draft with `compiled_into: [topic-slug]` in its frontmatter. Re-running the command refines the existing topic note instead of overwriting it (pass `--overwrite` to start from scratch).

### 3. Auto-maintained global index

Every time you generate, refine, or compile, `index.md` at the vault root is rebuilt deterministically:

- Topics and notes grouped by primary tag, alphabetically sorted
- Raw inbox counter
- Orphan wikilinks section
- Optional Dataview block (`INDEX_DATAVIEW=true`)

Rebuild on demand:

```bash
bun run index
```

### 4. Periodic health check

```bash
bun run audit            # dry run → .audits/{ts}.md
bun run audit --apply    # also fix orphan casing and add missing Related links
```

The auditor is split in two phases:

- **Deterministic**: orphan wikilinks, stale raw drafts (> `AUDIT_STALE_DAYS`, default 14), frontmatter drift, near-duplicate concepts (title match + Jaccard over Key Concepts).
- **LLM-assisted**: contradictions and missing cross-references between notes that share tags.

Reports use Obsidian callouts (`> [!warning]`, `> [!info]`) and actionable `- [ ]` checklists so you can process them inside Obsidian.

## 🧩 Obsidian compatibility

- **Wikilinks**: emitted as `[[slug|Title]]` so they resolve against filenames even when the title differs from the slug. Override via `OBSIDIAN_LINK_STYLE=alias` to emit bare `[[Title]]` and rely on frontmatter aliases instead.
- **Aliases**: every note gets `aliases: [Title]` so `[[Title]]` always resolves.
- **Properties panel**: snake_case keys (`created_at`, `source_url`, `source_hash`, `compiled_into`) render natively in Obsidian's Properties UI.
- **Callouts**: audit reports and the global index use `> [!info]` / `> [!warning]` blocks.
- **Web Clipper**: point the Obsidian Web Clipper at `00-raw/` and run `bun run raw-ingest --adopt` to retrofit frontmatter without rewriting the body.

### New config keys

Set these in `.env` to tune the loop:

```bash
AUDIT_STALE_DAYS=14          # how long a raw can sit before audit flags it
TOPIC_MAX_SOURCES=40         # safety cap before chunking in compile
INDEX_AUTO_REBUILD=true      # rebuild index.md after every write
INDEX_DATAVIEW=false         # include a Dataview codeblock in index.md
OBSIDIAN_LINK_STYLE=pipe     # pipe | alias
```

---

## 🛣️ Roadmap

- [x] Schema validation with zod
- [x] Auto-linking between knowledge units
- [x] Incremental refinement pipeline
- [x] Version diffing and rollback
- [x] Tagged `00-raw/` inbox + topic compiler (Karpathy loop)
- [x] Auto-maintained global `index.md`
- [x] Health-check auditor (orphans, contradictions, stale raw)
- [ ] Full-text search
- [ ] Semantic search (optional)

---

## ⚠️ Design Philosophy

This project intentionally avoids:

- Heavy RAG pipelines
- Vector databases (early stage)
- Over-engineered abstractions

Focus is on **clarity, determinism, and long-term knowledge quality**.
