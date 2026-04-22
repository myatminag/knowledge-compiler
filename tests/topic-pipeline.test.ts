import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

import { makeTmpVault, TmpVault } from "./helpers/tmp-vault";

type TopicPipeline = typeof import("../pipelines/topic.pipeline");
type RawPipeline = typeof import("../pipelines/raw.pipeline");

let vault: TmpVault;
let topicPipeline: TopicPipeline;
let rawPipeline: RawPipeline;

const mockKnowledge = {
  title: "Transformer Architecture",
  tags: ["transformers", "ml"],
  summary:
    "Transformers use self-attention to model sequences without recurrence, scaling well on parallel hardware.",
  keyConcepts: [
    {
      name: "Self-Attention",
      explanation:
        "Computes weighted sums across the input sequence so every position attends to every other position.",
      aliases: [],
      sources: [0],
    },
    {
      name: "Multi-Head Attention",
      explanation:
        "Projects Q, K, V into H subspaces and concatenates outputs to capture diverse relations.",
      aliases: [],
      sources: [1],
    },
    {
      name: "Positional Encoding",
      explanation:
        "Injects order information into otherwise permutation-invariant attention.",
      aliases: [],
      sources: [0],
    },
  ],
  deepDive: [
    {
      heading: "Mechanism",
      body: "Transformers consist of encoder and decoder stacks. Each layer combines multi-head attention with feed-forward sublayers, connected by residual paths and layer normalization.",
      sources: [0, 1],
    },
    {
      heading: "Variants",
      body: "Decoder-only stacks power modern LLMs; encoder-only variants such as BERT are used for classification and retrieval tasks.",
      sources: [1],
    },
  ],
  related: ["Attention Mechanism", "Sequence Modeling"],
  openQuestions: ["How do positional schemes scale to long contexts?"],
};

const mockCallStructured = mock(async () => ({
  data: mockKnowledge,
  usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
  model: "mock-model",
}));

beforeAll(async () => {
  vault = makeTmpVault("topic-pipeline-");

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
      chunk: { thresholdChars: 100000, sizeChars: 100000, overlapChars: 0 },
      audit: { staleDays: 14 },
      topic: { maxSources: 40 },
      index: { autoRebuild: false, dataview: false },
      obsidian: { linkStyle: "pipe" },
    },
  }));

  await mock.module("../llm/llm.client", () => ({
    callStructured: mockCallStructured,
  }));

  topicPipeline = await import("../pipelines/topic.pipeline");
  rawPipeline = await import("../pipelines/raw.pipeline");

  await rawPipeline.writeRaw({
    source: {
      type: "raw_text",
      content:
        "Self-attention computes weighted sums across the input sequence.",
    },
    tags: ["transformers"],
  });

  await rawPipeline.writeRaw({
    source: {
      type: "raw_text",
      content:
        "Multi-head attention projects queries, keys, and values into subspaces.",
    },
    tags: ["transformers", "attention"],
  });
});

afterAll(() => {
  vault.cleanup();
  mockCallStructured.mockClear();
});

describe("compileTopic", () => {
  test("produces a topic note with Sources section referencing raws", async () => {
    const outcome = await topicPipeline.compileTopic({
      topic: "Transformer Architecture",
      tags: ["transformers"],
    });

    expect(outcome.status).toBe("compiled");
    expect(outcome.sourceCount).toBeGreaterThanOrEqual(2);

    const content = fs.readFileSync(outcome.path, "utf-8");
    const parsed = matter(content);

    expect(parsed.content).toContain("## Sources");
    expect(parsed.content).toMatch(/\[\[[^\]]+\]\]/);

    expect(parsed.data.aliases).toContain("Transformer Architecture");
    expect(parsed.data.topic_slug).toBe("transformer-architecture");
    expect(parsed.data.source_count).toBeGreaterThanOrEqual(2);
  });

  test("marks raws with compiled_into after compile", async () => {
    const { matched } = rawPipeline.filterRawByTags(["transformers"]);
    for (const raw of matched) {
      const reread = matter(fs.readFileSync(raw.path, "utf-8"));
      expect(reread.data.compiled_into).toEqual(
        expect.arrayContaining(["transformer-architecture"]),
      );
    }
  });

  test("skips when no raw drafts match the tags", async () => {
    const outcome = await topicPipeline.compileTopic({
      topic: "Nonexistent Topic",
      tags: ["no-such-tag"],
    });

    expect(outcome.status).toBe("skipped");
    expect(outcome.sourceCount).toBe(0);
  });
});
