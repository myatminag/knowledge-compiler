import fs from "fs";
import path from "path";
import "dotenv/config";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { toMarkdown } from "../pipelines/markdown.transform";
import { safeGenerate } from "../pipelines/generate-note.pipeline";

// CLI config
const argv = yargs(hideBin(process.argv))
  .option("input", {
    type: "string",
    default: "input.txt",
    describe: "Path to input file",
  })
  .option("domain", {
    type: "string",
    default: "backend",
    describe: "Knowledge domain folder",
  })
  .option("overwrite", {
    type: "boolean",
    default: false,
    describe: "Overwrite existing file",
  })
  .option("versioned", {
    type: "boolean",
    default: false,
    describe: "Create versioned file instead of overwrite",
  })
  .help()
  .parseSync();

async function main() {
  const inputPath = path.resolve(argv.input);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const input = fs.readFileSync(inputPath, "utf-8");

  console.log("Processing input:", inputPath);

  const note = await safeGenerate(input);

  const { content, fileName } = toMarkdown(note);

  const outputDir = path.resolve(`knowledge/${argv.domain}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, fileName);

  // File strategy
  if (fs.existsSync(outputPath)) {
    if (argv.versioned) {
      const versionedPath = path.join(
        outputDir,
        `${fileName.replace(".md", "")}-${Date.now()}.md`,
      );

      fs.writeFileSync(versionedPath, content);

      console.log("Generated (versioned):", versionedPath);
      return;
    }

    if (!argv.overwrite) {
      console.log("Skipped (already exists):", outputPath);
      return;
    }

    console.log("Overwriting existing file:", outputPath);
  }

  fs.writeFileSync(outputPath, content);

  console.log("Generated:", outputPath);
}

// Error handling
main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
