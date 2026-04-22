import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  loadVersion,
  listVersions,
  diffKnowledge,
} from "../pipelines/versions.pipeline";
import { logger } from "../utils/logger";
import { scanVault } from "../utils/vault";
import { processSource } from "../pipelines/orchestrator";
import { applyBacklinks } from "../pipelines/link.pipeline";
import { InputSource, InputType } from "../types/input-source";

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
