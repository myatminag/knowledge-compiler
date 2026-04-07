import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  ensureDir,
  resolveInboxPath,
  resolveOutputPath,
} from "../utils/path-resolver";
import { runPipeline } from "../pipelines/run.pipeline";
import { toMarkdown } from "../pipelines/markdown.transform";

const argv = yargs(hideBin(process.argv))
  .option("input", { type: "string", demandOption: true })
  .option("type", { type: "string", default: "raw_text" })
  .option("overwrite", { type: "boolean", default: false })
  .option("versioned", { type: "boolean", default: false })
  .option("inbox", { type: "boolean", default: false })
  .help()
  .parseSync();

async function main() {
  let content = argv.input;

  if (argv.type === "raw_text") {
    const inputPath = path.resolve(argv.input);

    if (!fs.existsSync(inputPath)) {
      throw new Error("Input file not found");
    }

    content = fs.readFileSync(inputPath, "utf-8");
  }

  const result = await runPipeline({
    type: argv.type as any,
    content,
  });

  const { content: md, fileName } = toMarkdown(result.knowledge);

  // choose path
  const outputPath = argv.inbox
    ? resolveInboxPath(fileName)
    : resolveOutputPath(result.normalized.type, fileName);

  ensureDir(outputPath);

  if (fs.existsSync(outputPath)) {
    if (argv.versioned) {
      const versioned = outputPath.replace(".md", `-${Date.now()}.md`);
      fs.writeFileSync(versioned, md);
      console.log("Generated (versioned):", versioned);
      return;
    }

    if (!argv.overwrite) {
      console.log("Skipped:", outputPath);
      return;
    }
  }

  fs.writeFileSync(outputPath, md);

  console.log("Generated:", outputPath);

  if (result.issues.length > 0) {
    console.warn("\nLint Issues:");
    result.issues.forEach((i) => console.warn("-", i));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
