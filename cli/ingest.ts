import fs from "fs";
import path from "path";
import yargs from "yargs";
import pLimit from "p-limit";
import { hideBin } from "yargs/helpers";

import { logger } from "../utils/logger";
import { processSource } from "../pipelines/orchestrator";
import { InputSource, InputType } from "../types/input-source";

interface IngestArgs {
  dir: string;
  concurrency: number;
  overwrite: boolean;
  inbox: boolean;
  include: string;
}

function detectType(filename: string): InputType {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  return "raw_text";
}

function readSource(filePath: string): InputSource {
  const type = detectType(filePath);

  if (type === "raw_text") {
    return { type, content: fs.readFileSync(filePath, "utf-8") };
  }

  return { type, content: filePath };
}

function listTargets(dir: string, include: string): string[] {
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

async function run(args: IngestArgs) {
  const files = listTargets(args.dir, args.include);

  logger.info("Ingest start", {
    files: files.length,
    concurrency: args.concurrency,
  });

  const limit = pLimit(args.concurrency);

  const results = await Promise.allSettled(
    files.map((file) =>
      limit(async () => {
        const source = readSource(file);
        const outcome = await processSource(source, {
          inbox: args.inbox,
          overwrite: args.overwrite,
          command: "ingest",
        });

        logger.info(`${path.basename(file)} -> ${outcome.status}`, {
          path: outcome.path,
          tokens: outcome.totalTokens,
          issues: outcome.issues.length,
        });

        return outcome;
      }),
    ),
  );

  const successes = results.filter((r) => r.status === "fulfilled").length;
  const failures = results.filter((r) => r.status === "rejected");

  logger.info("Ingest complete", {
    total: files.length,
    successes,
    failures: failures.length,
  });

  for (const f of failures) {
    if (f.status === "rejected") {
      logger.error("Ingest failure", {
        reason: f.reason instanceof Error ? f.reason.message : String(f.reason),
      });
    }
  }

  if (failures.length > 0) process.exit(1);
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("dir", { type: "string", demandOption: true })
    .option("concurrency", { type: "number", default: 2 })
    .option("overwrite", { type: "boolean", default: false })
    .option("inbox", { type: "boolean", default: false })
    .option("include", { type: "string", default: ".txt,.md,.pdf" })
    .strict()
    .help()
    .parseAsync();

  await run({
    dir: argv.dir,
    concurrency: argv.concurrency,
    overwrite: argv.overwrite,
    inbox: argv.inbox,
    include: argv.include,
  });
}

main().catch((err) => {
  logger.error("Fatal", {
    message: err instanceof Error ? err.message : String(err),
  });
  console.error(err);
  process.exit(1);
});
