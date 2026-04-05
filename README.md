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
npm install
```

### 2. Configure environment

```bash
OPENAI_API_KEY=your_api_key
```

### 3. Run the pipeline

```bash
npm run generate
```

---

## 🧪 Example Workflow

```bash
echo "Rate limiting prevents abuse in distributed systems..." > input.txt
npm run generate
```

Output:

```
/knowledge/backend/rate-limiting.md
```

---

## 🛣️ Roadmap

- [ ] Schema validation with zod
- [ ] Auto-linking between knowledge units
- [ ] Incremental refinement pipeline
- [ ] Full-text search
- [ ] Semantic search (optional)
- [ ] Version diffing and rollback

---

## ⚠️ Design Philosophy

This project intentionally avoids:

- Heavy RAG pipelines
- Vector databases (early stage)
- Over-engineered abstractions

Focus is on **clarity, determinism, and long-term knowledge quality**.
