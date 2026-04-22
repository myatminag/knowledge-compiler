import fs from "fs";
import path from "path";

import {
  ensureDir,
  resolveInboxPath,
  resolveOutputPath,
} from "../utils/path-resolver";
import { logger } from "../utils/logger";
import { config } from "../config/config";
import { lintNote } from "./lint.pipeline";
import { chunkText } from "./chunk.pipeline";
import { refineNote } from "./refine.pipeline";
import { appendRunLog } from "../utils/runlog";
import { toMarkdown } from "./markdown.transform";
import { saveVersion } from "./versions.pipeline";
import { InputSource } from "../types/input-source";
import { rebuildIndexIfEnabled } from "./index.pipeline";
import { safeGenerate } from "./generate-note.pipeline";
import { Knowledge } from "../schemas/knowledge.schema";
import { readNoteIfExists, sha256, VaultNote } from "../utils/vault";
import { normalize, NormalizedDocument } from "./normalize.pipeline";

export interface GenerateOptions {
  inbox?: boolean;
  overwrite?: boolean;
  command?: string;
}

export interface GenerateOutcome {
  status: "generated" | "refined" | "skipped";
  path?: string;
  id?: string;
  issues: string[];
  totalTokens: number;
  costUsd?: number;
  cached?: boolean;
}

function findExistingBySourceHash(dir: string, hash: string): VaultNote | null {
  if (!fs.existsSync(dir)) return null;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;

    const note = readNoteIfExists(path.join(dir, file));
    if (note?.frontmatter.source_hash === hash) return note;
  }

  return null;
}

export async function processSource(
  source: InputSource,
  options: GenerateOptions = {},
): Promise<GenerateOutcome> {
  const normalized = await normalize(source);
  const sourceHash = sha256(normalized.content);

  const outputDir = options.inbox
    ? path.dirname(resolveInboxPath("pending.md"))
    : path.dirname(resolveOutputPath(normalized.type, "pending.md"));

  const existing = findExistingBySourceHash(outputDir, sourceHash);

  if (existing && !options.overwrite) {
    logger.info("Source hash unchanged, skipping", { path: existing.path });
    return {
      status: "skipped",
      path: existing.path,
      id: existing.frontmatter.id,
      issues: [],
      totalTokens: 0,
    };
  }

  const runRefine = existing && options.overwrite;

  const { knowledge, model, totalTokens, previous, costUsd, cached } = runRefine
    ? await refineFlow(existing, normalized)
    : await generateFlow(normalized);

  const issues = lintNote(knowledge);

  const md = toMarkdown(knowledge, {
    createdAt: existing?.frontmatter.created_at,
    sourceType: normalized.type,
    sourceUrl: normalized.sourceUrl,
    sourceHash,
    promptVersion: config.prompt.version,
    model,
  });

  const finalPath = options.inbox
    ? resolveInboxPath(md.fileName)
    : resolveOutputPath(normalized.type, md.fileName);

  ensureDir(finalPath);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  saveVersion({
    timestamp,
    id: md.id,
    model,
    promptVersion: config.prompt.version,
    sourceHash,
    previous,
    next: knowledge,
  });

  fs.writeFileSync(finalPath, md.content);

  appendRunLog({
    timestamp: new Date().toISOString(),
    command: options.command ?? (runRefine ? "refine" : "generate"),
    id: md.id,
    model,
    sourceType: normalized.type,
    sourceHash,
    totalTokens,
    costUsd,
    cached,
    issues,
    outputPath: finalPath,
  });

  rebuildIndexIfEnabled();

  return {
    status: runRefine ? "refined" : "generated",
    path: finalPath,
    id: md.id,
    issues,
    totalTokens,
    costUsd,
    cached,
  };
}

interface FlowResult {
  knowledge: Knowledge;
  model: string;
  totalTokens: number;
  costUsd?: number;
  cached?: boolean;
  previous: Knowledge | null;
}

async function generateFlow(
  normalized: NormalizedDocument,
): Promise<FlowResult> {
  if (normalized.content.length <= config.chunk.thresholdChars) {
    const generated = await safeGenerate(normalized.content);
    return {
      knowledge: generated.data,
      model: generated.model,
      totalTokens: generated.usage.totalTokens,
      costUsd: generated.usage.costUsd,
      cached: generated.cached,
      previous: null,
    };
  }

  const chunks = chunkText(normalized.content, {
    maxChars: config.chunk.sizeChars,
    overlap: config.chunk.overlapChars,
  });

  logger.info("Chunked input", { chunks: chunks.length });

  const first = await safeGenerate(chunks[0]);
  let knowledge = first.data;
  let model = first.model;
  let totalTokens = first.usage.totalTokens;
  let totalCost = first.usage.costUsd ?? 0;
  let allCached = first.cached ?? false;

  for (let i = 1; i < chunks.length; i++) {
    logger.debug("Refining with chunk", { index: i, total: chunks.length });
    const { knowledge: merged, result } = await refineNote(
      knowledge,
      chunks[i],
    );
    knowledge = merged;
    model = result.model;
    totalTokens += result.usage.totalTokens;
    totalCost += result.usage.costUsd ?? 0;
    allCached = allCached && (result.cached ?? false);
  }

  return {
    knowledge,
    model,
    totalTokens,
    costUsd: totalCost > 0 ? totalCost : undefined,
    cached: allCached,
    previous: null,
  };
}

async function refineFlow(
  existing: VaultNote,
  normalized: NormalizedDocument,
): Promise<FlowResult> {
  const existingKnowledge: Knowledge = {
    title: existing.frontmatter.title,
    tags: existing.frontmatter.tags,
    summary: "",
    keyConcepts: [],
    deepDive: [],
    related: [],
    openQuestions: [],
  };

  const { knowledge, result } = await refineNote(
    existingKnowledge,
    normalized.content,
  );

  return {
    knowledge,
    model: result.model,
    totalTokens: result.usage.totalTokens,
    costUsd: result.usage.costUsd,
    cached: result.cached,
    previous: existingKnowledge,
  };
}
