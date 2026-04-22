import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { beforeAll, afterAll, describe, expect, test, mock } from "bun:test";

import { makeTmpVault, TmpVault } from "./helpers/tmp-vault";

type RawPipeline = typeof import("../pipelines/raw.pipeline");

let vault: TmpVault;
let pipeline: RawPipeline;

beforeAll(async () => {
  vault = makeTmpVault("raw-pipeline-");

  await mock.module("../config/config", () => ({
    config: {
      openai: {
        apiKey: "test",
        baseUrl: undefined,
        model: "gpt-4o-mini",
        modelCompile: undefined,
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
      index: { autoRebuild: false, dataview: false },
      obsidian: { linkStyle: "pipe" },
    },
  }));

  pipeline = await import("../pipelines/raw.pipeline");
});

afterAll(() => {
  vault.cleanup();
});

describe("writeRaw", () => {
  test("writes a raw draft with normalized frontmatter", async () => {
    const outcome = await pipeline.writeRaw({
      source: {
        type: "raw_text",
        content:
          "Transformers use self-attention layers to compute contextual representations.",
      },
      tags: ["Transformers", "NLP"],
    });

    expect(outcome.status).toBe("written");
    expect(fs.existsSync(outcome.path)).toBe(true);

    const raw = fs.readFileSync(outcome.path, "utf-8");
    const parsed = matter(raw);
    expect(parsed.data.draft).toBe(true);
    expect(parsed.data.tags).toEqual(["transformers", "nlp"]);
    expect(parsed.data.source_hash).toBeDefined();
  });

  test("dedupes identical content via source_hash", async () => {
    const content = "Attention is all you need.";

    const a = await pipeline.writeRaw({
      source: { type: "raw_text", content },
      tags: ["attention"],
    });

    const b = await pipeline.writeRaw({
      source: { type: "raw_text", content },
      tags: ["attention", "transformers"],
    });

    expect(a.path).toBe(b.path);
    expect(["skipped", "updated"]).toContain(b.status);

    const parsed = matter(fs.readFileSync(b.path, "utf-8"));
    expect(parsed.data.tags).toEqual(
      expect.arrayContaining(["attention", "transformers"]),
    );
  });
});

describe("filterRawByTags", () => {
  test("only returns raws tagged with at least one requested tag", async () => {
    await pipeline.writeRaw({
      source: { type: "raw_text", content: "Positional encoding content." },
      tags: ["transformers"],
    });

    await pipeline.writeRaw({
      source: { type: "raw_text", content: "Rate limiting systems design." },
      tags: ["rate-limiting"],
    });

    const { matched } = pipeline.filterRawByTags(["transformers"]);
    expect(matched.length).toBeGreaterThan(0);
    for (const n of matched) {
      expect(n.frontmatter.tags).toContain("transformers");
    }
  });
});

describe("adoptRaw", () => {
  test("adds frontmatter to files missing it (simulating Web Clipper output)", () => {
    const rawPath = path.join(vault.rawDir, "clipped-article.md");
    fs.writeFileSync(
      rawPath,
      "---\nsource_url: https://example.com\n---\n\n# Clipped Article\n\nSome body text.",
    );

    const result = pipeline.adoptRaw({ tags: ["clipped"] });
    expect(result.adopted).toContain(rawPath);

    const parsed = matter(fs.readFileSync(rawPath, "utf-8"));
    expect(parsed.data.draft).toBe(true);
    expect(parsed.data.tags).toEqual(expect.arrayContaining(["clipped"]));
    expect(parsed.data.source_hash).toBeDefined();
  });
});
