import fs from "fs";
import path from "path";
import yargs from "yargs";
import pLimit from "p-limit";
import { hideBin } from "yargs/helpers";

import {
  rebuildIndex,
  rebuildIndexIfEnabled,
} from "../pipelines/index.pipeline";
import {
  loadVersion,
  listVersions,
  diffKnowledge,
} from "../pipelines/versions.pipeline";
import { logger } from "../utils/logger";
import { scanVault } from "../utils/vault";
import { audit } from "../pipelines/audit.pipeline";
import { processSource } from "../pipelines/orchestrator";
import { compileTopic } from "../pipelines/topic.pipeline";
import { applyBacklinks } from "../pipelines/link.pipeline";
import { InputSource, InputType } from "../types/input-source";
import { adoptRaw, writeRaw } from "../pipelines/raw.pipeline";

async function readInput(
  inputArg: string,
  type: InputType,
): Promise<InputSource> {
  if (type === "raw_text") {
    const inputPath = path.resolve(inputArg);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    return { type, content: fs.readFileSync(inputPath, "utf-8") };
  }

  return { type, content: inputArg };
}

async function runGenerate(args: {
  input: string;
  type: InputType;
  overwrite: boolean;
  inbox: boolean;
}) {
  const source = await readInput(args.input, args.type);
  const outcome = await processSource(source, {
    inbox: args.inbox,
    overwrite: args.overwrite,
    command: "generate",
  });

  if (outcome.status === "skipped") return;

  logger.info(`${outcome.status}`, { path: outcome.path });

  if (outcome.issues.length > 0) {
    logger.warn("Lint issues", outcome.issues);
  }
}

async function runRefine(args: { input: string; type: InputType }) {
  const source = await readInput(args.input, args.type);
  const outcome = await processSource(source, {
    overwrite: true,
    command: "refine",
  });

  logger.info(`${outcome.status}`, { path: outcome.path });
  if (outcome.issues.length > 0) logger.warn("Lint issues", outcome.issues);
}

function runLink(apply: boolean) {
  const result = applyBacklinks({ apply });

  logger.info("Links", {
    updated: result.updated.length,
    unchanged: result.unchanged.length,
    orphans: result.orphans.length,
  });

  if (result.orphans.length > 0) {
    logger.warn("Orphan links", result.orphans.slice(0, 20));
  }
}

function runLintVault() {
  const scan = scanVault();
  let totalIssues = 0;

  for (const note of scan.notes) {
    const issues: string[] = [];

    if (!note.body.includes("## Summary"))
      issues.push("Missing Summary section");
    if (!note.body.includes("## Deep Dive"))
      issues.push("Missing Deep Dive section");

    if (issues.length > 0) {
      totalIssues += issues.length;
      logger.warn(note.frontmatter.id, issues);
    }
  }

  for (const bad of scan.invalid) {
    logger.error("Invalid frontmatter", bad);
  }

  logger.info("Lint vault complete", {
    notes: scan.notes.length,
    invalid: scan.invalid.length,
    issues: totalIssues,
  });
}

function detectRawType(filename: string): InputType {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  return "raw_text";
}

function listRawTargets(dir: string, include: string): string[] {
  const abs = path.resolve(dir);

  if (!fs.existsSync(abs)) {
    throw new Error(`Directory not found: ${abs}`);
  }

  const extensions = include.split(",").map((e) => e.trim().toLowerCase());

  return fs
    .readdirSync(abs)
    .map((f) => path.join(abs, f))
    .filter((p) => fs.statSync(p).isFile())
    .filter((p) => extensions.includes(path.extname(p).toLowerCase()));
}

async function runRawIngest(args: {
  dir?: string;
  tags: string;
  include: string;
  concurrency: number;
  adopt: boolean;
  overwrite: boolean;
}) {
  const tagList = args.tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (args.adopt) {
    const result = adoptRaw({ tags: tagList });

    logger.info("Raw adopt complete", {
      adopted: result.adopted.length,
      alreadyTagged: result.alreadyTagged.length,
      invalid: result.invalid.length,
    });

    for (const bad of result.invalid) logger.error("Adopt failed", bad);
    return;
  }

  if (!args.dir) {
    throw new Error("Either --dir or --adopt is required");
  }

  const files = listRawTargets(args.dir, args.include);

  logger.info("Raw ingest start", {
    files: files.length,
    concurrency: args.concurrency,
    tags: tagList,
  });

  const limit = pLimit(args.concurrency);

  const results = await Promise.allSettled(
    files.map((file) =>
      limit(async () => {
        const type = detectRawType(file);
        const source: InputSource =
          type === "raw_text"
            ? {
                type,
                content: fs.readFileSync(file, "utf-8"),
                title: path.basename(file, path.extname(file)),
              }
            : { type, content: file };

        const outcome = await writeRaw({
          source,
          tags: tagList,
          overwrite: args.overwrite,
        });

        logger.info(`${path.basename(file)} -> ${outcome.status}`, {
          path: outcome.path,
          id: outcome.id,
        });

        return outcome;
      }),
    ),
  );

  const failures = results.filter((r) => r.status === "rejected");

  logger.info("Raw ingest complete", {
    total: files.length,
    successes: results.length - failures.length,
    failures: failures.length,
  });

  for (const f of failures) {
    if (f.status === "rejected") {
      logger.error("Raw ingest failure", {
        reason: f.reason instanceof Error ? f.reason.message : String(f.reason),
      });
    }
  }

  if (failures.length > 0) process.exit(1);
}

async function runAudit(args: { apply: boolean; skipLlm: boolean }) {
  const report = await audit({ apply: args.apply, skipLlm: args.skipLlm });

  logger.info("Audit report", {
    path: report.path,
    orphans: report.orphans.length,
    staleRaw: report.staleRaw.length,
    drift: report.frontmatterDrift.length,
    nearDuplicates: report.nearDuplicates.length,
    contradictions: report.contradictions.length,
    crossrefs: report.crossrefs.length,
    appliedFixes: report.appliedFixes.length,
    totalTokens: report.llm.totalTokens,
  });

  if (args.apply) rebuildIndexIfEnabled();
}

async function runCompile(args: {
  topic: string;
  tags: string;
  overwrite: boolean;
}) {
  const tagList = args.tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const outcome = await compileTopic({
    topic: args.topic,
    tags: tagList,
    overwrite: args.overwrite,
  });

  logger.info(`Topic ${outcome.status}`, {
    path: outcome.path,
    id: outcome.id,
    sources: outcome.sourceCount,
    tokens: outcome.totalTokens,
    costUsd: outcome.costUsd,
  });

  if (outcome.issues.length > 0) logger.warn("Lint issues", outcome.issues);
}

function runDiff(id: string, limit: number) {
  const versions = listVersions(id);

  if (versions.length === 0) {
    logger.warn("No versions found", { id });
    return;
  }

  const slice = versions.slice(-limit);

  for (const filename of slice) {
    const rec = loadVersion(id, filename);
    const summary = diffKnowledge(rec.previous, rec.next);

    console.log(`\n=== ${rec.timestamp} (${rec.model ?? "unknown"}) ===`);
    console.log(
      `Title: ${summary.title.from ?? "(new)"} -> ${summary.title.to}`,
    );
    console.log(`Tags        added: ${summary.tags.added.join(", ") || "-"}`);
    console.log(
      `Tags        removed: ${summary.tags.removed.join(", ") || "-"}`,
    );
    console.log(
      `Concepts    added: ${summary.keyConcepts.added.join(", ") || "-"}`,
    );
    console.log(
      `Concepts    removed: ${summary.keyConcepts.removed.join(", ") || "-"}`,
    );
    console.log(
      `Related     added: ${summary.related.added.join(", ") || "-"}`,
    );
    console.log(
      `Questions   added: ${summary.openQuestions.added.join(", ") || "-"}`,
    );
    console.log(`Summary changed: ${summary.summary.changed}`);
    console.log(`DeepDive changed: ${summary.deepDive.changed}`);
  }

  console.log(
    `\nTotal versions: ${versions.length} (showing last ${slice.length})`,
  );
}

async function main() {
  await yargs(hideBin(process.argv))
    .scriptName("knowledge-compiler")
    .command(
      "generate",
      "Generate a knowledge note from input",
      (y) =>
        y
          .option("input", { type: "string", demandOption: true })
          .option("type", {
            type: "string",
            choices: [
              "raw_text",
              "url",
              "pdf",
              "youtube",
              "github_repo",
              "rss",
            ] as const,
            default: "raw_text" as const,
          })
          .option("overwrite", { type: "boolean", default: false })
          .option("inbox", { type: "boolean", default: false }),
      (args) =>
        runGenerate({
          input: args.input,
          type: args.type as InputType,
          overwrite: args.overwrite,
          inbox: args.inbox,
        }),
    )
    .command(
      "refine",
      "Refine an existing note with new content",
      (y) =>
        y
          .option("input", { type: "string", demandOption: true })
          .option("type", {
            type: "string",
            choices: [
              "raw_text",
              "url",
              "pdf",
              "youtube",
              "github_repo",
              "rss",
            ] as const,
            default: "raw_text" as const,
          }),
      (args) =>
        runRefine({
          input: args.input,
          type: args.type as InputType,
        }),
    )
    .command(
      "link",
      "Resolve [[links]] and generate backlinks",
      (y) => y.option("apply", { type: "boolean", default: true }),
      (args) => runLink(args.apply),
    )
    .command(
      "lint-vault",
      "Validate frontmatter and structure across the vault",
      (y) => y,
      () => runLintVault(),
    )
    .command(
      "diff",
      "Show version history for a note id",
      (y) =>
        y
          .option("id", { type: "string", demandOption: true })
          .option("limit", { type: "number", default: 5 }),
      (args) => runDiff(args.id, args.limit),
    )
    .command(
      "raw-ingest",
      "Ingest files into 00-raw/ as tagged drafts (no LLM)",
      (y) =>
        y
          .option("dir", { type: "string" })
          .option("tags", { type: "string", default: "" })
          .option("include", { type: "string", default: ".txt,.md,.pdf" })
          .option("concurrency", { type: "number", default: 2 })
          .option("adopt", { type: "boolean", default: false })
          .option("overwrite", { type: "boolean", default: false }),
      (args) =>
        runRawIngest({
          dir: args.dir,
          tags: args.tags,
          include: args.include,
          concurrency: args.concurrency,
          adopt: args.adopt,
          overwrite: args.overwrite,
        }),
    )
    .command(
      "compile",
      "Compile multiple tagged raw drafts into one topic note",
      (y) =>
        y
          .option("topic", { type: "string", demandOption: true })
          .option("tags", { type: "string", default: "" })
          .option("overwrite", { type: "boolean", default: false }),
      (args) =>
        runCompile({
          topic: args.topic,
          tags: args.tags,
          overwrite: args.overwrite,
        }),
    )
    .command(
      "index",
      "Rebuild the global index.md (deterministic, no LLM)",
      (y) => y,
      () => {
        const stats = rebuildIndex();
        logger.info("Index written", stats);
      },
    )
    .command(
      "audit",
      "Run health checks (orphans, stale raw, contradictions) and write a report",
      (y) =>
        y
          .option("apply", { type: "boolean", default: false })
          .option("skip-llm", { type: "boolean", default: false }),
      (args) =>
        runAudit({
          apply: args.apply,
          skipLlm: args["skip-llm"] as boolean,
        }),
    )
    .demandCommand(1)
    .strict()
    .help()
    .parseAsync();
}

main().catch((err) => {
  logger.error("Fatal", {
    message: err instanceof Error ? err.message : String(err),
  });
  console.error(err);
  process.exit(1);
});
