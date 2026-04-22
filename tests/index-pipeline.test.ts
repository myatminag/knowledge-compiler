import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

import { makeTmpVault, TmpVault } from "./helpers/tmp-vault";

type IndexPipeline = typeof import("../pipelines/index.pipeline");

let vault: TmpVault;
let pipeline: IndexPipeline;

function writeNote(dir: string, name: string, fm: Record<string, unknown>, body: string) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, matter.stringify(body, fm));
}

beforeAll(async () => {
  vault = makeTmpVault("index-pipeline-");

  await mock.module("../config/config", () => ({
    config: {
      openai: {
        apiKey: "test",
        baseUrl: undefined,
        model: "gpt-4o-mini",
        temperature: 0,
      },
      vault: { path: vault.root },
      llm: { maxRetries: 1 },
      logger: { level: "warn" },
      cache: { enabled: false, dir: path.join(vault.root, ".cache") },
      prompt: { version: "v1" },
      chunk: { thresholdChars: 12000, sizeChars: 8000, overlapChars: 200 },
      audit: { staleDays: 14 },
      topic: { maxSources: 40 },
      index: { autoRebuild: true, dataview: false },
      obsidian: { linkStyle: "pipe" },
    },
  }));

  pipeline = await import("../pipelines/index.pipeline");

  const now = new Date().toISOString();
  const baseFm = {
    created_at: now,
    updated_at: now,
  };

  writeNote(
    vault.notesDir,
    "rate-limiting.md",
    {
      id: "rate-limiting",
      title: "Rate Limiting",
      tags: ["backend"],
      aliases: ["Rate Limiting"],
      ...baseFm,
    },
    "## Summary\n\nRate limiting caps request volume.\n\n## Deep Dive\n\nToken bucket.\n",
  );

  writeNote(
    vault.notesDir,
    "api-gateway.md",
    {
      id: "api-gateway",
      title: "API Gateway",
      tags: ["backend", "networking"],
      aliases: ["API Gateway"],
      ...baseFm,
    },
    "## Summary\n\nAPI gateway fronts microservices.\n\n## Deep Dive\n\nRouting.\n",
  );

  writeNote(
    vault.topicsDir,
    "transformers.md",
    {
      id: "transformers",
      title: "Transformers",
      tags: ["ml"],
      aliases: ["Transformers"],
      ...baseFm,
    },
    "## Summary\n\nSelf-attention networks.\n\n## Deep Dive\n\nScaled dot-product.\n",
  );

  writeNote(
    vault.rawDir,
    "raw-draft.md",
    {
      id: "raw-draft",
      title: "Raw Draft",
      tags: ["ml"],
      draft: true,
      source_hash: "abc",
      ingested_at: now,
    },
    "Some draft text.\n",
  );
});

afterAll(() => vault.cleanup());

describe("rebuildIndex", () => {
  test("writes index.md with topic + note sections and raw inbox", () => {
    const stats = pipeline.rebuildIndex();

    expect(stats.noteCount).toBe(2);
    expect(stats.topicCount).toBe(1);
    expect(stats.rawCount).toBe(1);

    const content = fs.readFileSync(stats.path, "utf-8");
    const parsed = matter(content);

    expect(parsed.data.cssclass).toBe("index");
    expect(parsed.data.pinned).toBe(true);

    expect(parsed.content).toContain("## Topics");
    expect(parsed.content).toContain("## Notes");
    expect(parsed.content).toContain("[[rate-limiting|Rate Limiting]]");
    expect(parsed.content).toContain("[[transformers]]");
    expect(parsed.content).toContain("## Raw Inbox");
  });

  test("is idempotent — two rebuilds produce the same body", () => {
    pipeline.rebuildIndex();
    const first = matter(fs.readFileSync(pipeline.rebuildIndex().path, "utf-8"));
    const second = matter(fs.readFileSync(pipeline.rebuildIndex().path, "utf-8"));

    expect(second.content).toBe(first.content);
  });
});
