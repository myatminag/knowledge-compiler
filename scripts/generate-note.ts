import fs from "fs";
import "dotenv/config";
import path from "path";

import { toMarkdown } from "../pipelines/markdown.transform";
import { safeGenerate } from "../pipelines/generate-note.pipeline";

async function main() {
  const inputPath = path.resolve("input.txt");

  if (!fs.existsSync(inputPath)) {
    throw new Error("input.txt not found");
  }

  const input = fs.readFileSync(inputPath, "utf-8");

  console.log("Processing input...");

  const note = await safeGenerate(input);

  const { content, fileName } = toMarkdown(note);

  const outputDir = path.resolve("knowledge/backend");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, fileName);

  fs.writeFileSync(outputPath, content);

  console.log("Generated:", outputPath);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
