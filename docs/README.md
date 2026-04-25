# Knowledge Compiler Documentation

This directory contains developer-facing documentation for Knowledge Compiler, a Bun and TypeScript CLI that turns unstructured sources into structured Markdown knowledge assets for an Obsidian-compatible vault.

## Reading Order

1. [Developer Guide](developer-guide.md) - local setup, environment variables, development workflow, tests, and CI.
2. [Architecture](architecture.md) - system boundaries, module responsibilities, and the end-to-end data flow.
3. [CLI Reference](cli-reference.md) - commands, options, examples, and package scripts.
4. [Data Model](data-model.md) - schemas, frontmatter contracts, vault layout, versions, audits, and run logs.
5. [Pipelines](pipelines.md) - normalization, generation, refinement, raw ingestion, topic compilation, linking, indexing, auditing, caching, and versioning.

## Source Of Truth

The implementation lives in:

- `cli/` for command-line entry points.
- `pipelines/` for processing steps.
- `schemas/` for Zod contracts.
- `utils/` for vault, linking, logging, paths, cache, and pricing helpers.
- `config/config.ts` for environment-driven runtime configuration.

The root `README.md` remains the product overview and quick-start reference. These docs focus on how the code works and how to maintain it.
