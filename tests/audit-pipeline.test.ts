import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

import { makeTmpVault, TmpVault } from "./helpers/tmp-vault";

type AuditPipeline = typeof import("../pipelines/audit.pipeline");

let vault: TmpVault;
let pipeline: AuditPipeline;

function writeFile(filePath: string, fm: Record<string, unknown>, body: string) {
  fs.writeFileSync(filePath, matter.stringify(body, fm));
}

beforeAll(async () => {
  vault = makeTmpVault("audit-pipeline-");

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
      index: { autoRebuild: false, dataview: false },
      obsidian: { linkStyle: "pipe" },
    },
  }));

  pipeline = await import("../pipelines/audit.pipeline");

  const now = new Date().toISOString();
  const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  writeFile(
    path.join(vault.notesDir, "rate-limiting.md"),
    {
      id: "rate-limiting",
      title: "Rate Limiting",
      tags: ["backend"],
      aliases: ["Rate Limiting"],
      created_at: now,
      updated_at: now,
    },
    "## Summary\n\nRate limiting caps request volume.\n\n## Key Concepts\n\n- Token Bucket\n- Leaky Bucket\n\n## Deep Dive\n\nToken bucket algorithm.\n\n## Related\n\n- [[nonexistent-target|Missing]]\n",
  );

  writeFile(
    path.join(vault.notesDir, "token-bucket.md"),
    {
      id: "token-bucket",
      title: "Token Bucket",
      tags: ["backend"],
      aliases: ["Token Bucket"],
      created_at: now,
      updated_at: now,
    },
    "## Summary\n\nToken bucket is a rate limiting algorithm.\n\n## Key Concepts\n\n- Token Bucket\n- Leaky Bucket\n\n## Deep Dive\n\nDetails.\n",
  );

  writeFile(
    path.join(vault.rawDir, "old-draft.md"),
    {
      id: "old-draft",
      title: "Old Draft",
      tags: ["stale"],
      draft: true,
      source_hash: "oldhash",
      ingested_at: oldDate,
    },
    "Some stale draft.\n",
  );

  writeFile(
    path.join(vault.rawDir, "fresh-draft.md"),
    {
      id: "fresh-draft",
      title: "Fresh Draft",
      tags: ["fresh"],
      draft: true,
      source_hash: "freshhash",
      ingested_at: now,
    },
    "Recent draft.\n",
  );
});

afterAll(() => vault.cleanup());

describe("audit (deterministic only)", () => {
  test("detects orphan wikilinks and stale raw drafts", async () => {
    const report = await pipeline.audit({ skipLlm: true });

    expect(report.orphans.length).toBeGreaterThan(0);
    expect(
      report.orphans.some((o) => o.target === "nonexistent-target"),
    ).toBe(true);

    expect(report.staleRaw.some((s) => s.id === "old-draft")).toBe(true);
    expect(report.staleRaw.some((s) => s.id === "fresh-draft")).toBe(false);

    expect(fs.existsSync(report.path)).toBe(true);
    const body = fs.readFileSync(report.path, "utf-8");
    expect(body).toContain("> [!warning]");
    expect(body).toContain("[[old-draft|Old Draft]]");
  });

  test("detects near-duplicate concept overlap", async () => {
    const report = await pipeline.audit({ skipLlm: true });
    expect(
      report.nearDuplicates.some(
        (d) =>
          (d.a.id === "rate-limiting" && d.b.id === "token-bucket") ||
          (d.a.id === "token-bucket" && d.b.id === "rate-limiting"),
      ),
    ).toBe(true);
  });
});

describe("audit --apply", () => {
  test("does not crash when applying fixes with no suggestions", async () => {
    const report = await pipeline.audit({ apply: true, skipLlm: true });
    expect(Array.isArray(report.appliedFixes)).toBe(true);
  });
});
