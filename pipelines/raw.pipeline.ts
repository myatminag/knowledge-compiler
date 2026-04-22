import fs from "fs";
import path from "path";
import slugify from "slugify";
import matter from "gray-matter";

import {
  ensureDir,
  resolveRawDir,
  resolveRawPath,
} from "../utils/path-resolver";
import { logger } from "../utils/logger";
import { cleanArray } from "../utils/arrays";
import { normalize } from "./normalize.pipeline";
import { InputSource } from "../types/input-source";
import { readRawIfExists, scanRaw, sha256 } from "../utils/vault";
import { RawFrontmatter } from "../schemas/raw-frontmatter.schema";

function normalizeTagList(tags: string[]): string[] {
  return cleanArray(
    tags.map((t) => slugify(t.trim(), { lower: true, strict: true })),
  );
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

function mergeTags(existing: string[] = [], incoming: string[] = []): string[] {
  return cleanArray([...existing, ...normalizeTagList(incoming)]);
}

function findExistingBySourceHash(hash: string) {
  const dir = resolveRawDir();
  if (!fs.existsSync(dir)) return null;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readRawIfExists(path.join(dir, file));
    if (raw?.frontmatter.source_hash === hash) return raw;
  }

  return null;
}

function uniqueFileName(baseSlug: string, existingPath?: string): string {
  const dir = resolveRawDir();
  let candidate = `${baseSlug}.md`;
  let counter = 2;

  while (
    fs.existsSync(path.join(dir, candidate)) &&
    path.join(dir, candidate) !== existingPath
  ) {
    candidate = `${baseSlug}-${counter}.md`;
    counter += 1;
  }

  return candidate;
}

export interface WriteRawInput {
  source: InputSource;
  tags: string[];
  overwrite?: boolean;
}

export interface WriteRawOutcome {
  status: "written" | "skipped" | "updated";
  path: string;
  id: string;
  sourceHash: string;
}

export async function writeRaw(input: WriteRawInput): Promise<WriteRawOutcome> {
  const normalized = await normalize(input.source);
  const sourceHash = sha256(normalized.content);

  const existing = findExistingBySourceHash(sourceHash);

  if (existing && !input.overwrite) {
    const frontmatter: RawFrontmatter = {
      ...existing.frontmatter,
      tags: mergeTags(existing.frontmatter.tags, input.tags),
    };

    if (
      JSON.stringify(frontmatter.tags) !==
      JSON.stringify(existing.frontmatter.tags)
    ) {
      const fileContents = matter.stringify(
        existing.body,
        pruneUndefined(frontmatter),
      );
      fs.writeFileSync(existing.path, fileContents);

      return {
        status: "updated",
        path: existing.path,
        id: existing.frontmatter.id,
        sourceHash,
      };
    }

    logger.info("Raw source already ingested", { path: existing.path });

    return {
      status: "skipped",
      path: existing.path,
      id: existing.frontmatter.id,
      sourceHash,
    };
  }

  const baseSlug = slugify(normalized.title || "raw-entry", {
    lower: true,
    strict: true,
  });

  const fileName = uniqueFileName(baseSlug, existing?.path);
  const targetPath = resolveRawPath(fileName);

  const now = new Date().toISOString();
  const id = path.basename(fileName, ".md");

  const frontmatter: RawFrontmatter = {
    id,
    title: normalized.title || id,
    tags: normalizeTagList(input.tags),
    draft: true,
    source_type: normalized.type,
    source_url: normalized.sourceUrl,
    source_hash: sourceHash,
    ingested_at: now,
  };

  ensureDir(targetPath);
  const fileContents = matter.stringify(
    normalized.content.trim() + "\n",
    pruneUndefined(frontmatter),
  );
  fs.writeFileSync(targetPath, fileContents);

  return {
    status: existing ? "updated" : "written",
    path: targetPath,
    id,
    sourceHash,
  };
}

export interface AdoptResult {
  adopted: string[];
  alreadyTagged: string[];
  invalid: { path: string; error: string }[];
}

export function adoptRaw(options: { tags: string[] }): AdoptResult {
  const dir = resolveRawDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const adopted: string[] = [];
  const alreadyTagged: string[] = [];
  const invalid: { path: string; error: string }[] = [];

  const newTags = normalizeTagList(options.tags);
  const now = new Date().toISOString();

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const filePath = path.join(dir, entry.name);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);

    const body = parsed.content;
    const data = parsed.data ?? {};

    const existingTags = Array.isArray(data.tags)
      ? normalizeTagList(data.tags as string[])
      : [];

    const mergedTags = cleanArray([...existingTags, ...newTags]);

    const id =
      typeof data.id === "string" && data.id.length > 0
        ? data.id
        : path.basename(entry.name, ".md");

    const title =
      typeof data.title === "string" && data.title.length > 0 ? data.title : id;

    const sourceHash =
      typeof data.source_hash === "string" && data.source_hash.length > 0
        ? data.source_hash
        : sha256(body);

    const ingestedAt =
      typeof data.ingested_at === "string" ? data.ingested_at : now;

    const updated: RawFrontmatter = {
      id,
      title,
      tags: mergedTags,
      draft: typeof data.draft === "boolean" ? data.draft : true,
      source_type:
        typeof data.source_type === "string" ? data.source_type : undefined,
      source_url:
        typeof data.source_url === "string" ? data.source_url : undefined,
      source_hash: sourceHash,
      ingested_at: ingestedAt,
      compiled_into: Array.isArray(data.compiled_into)
        ? (data.compiled_into as string[])
        : undefined,
    };

    const before = JSON.stringify({
      tags: existingTags,
      id: data.id,
      title: data.title,
      draft: data.draft,
      source_hash: data.source_hash,
      ingested_at: data.ingested_at,
    });

    const after = JSON.stringify({
      tags: updated.tags,
      id: updated.id,
      title: updated.title,
      draft: updated.draft,
      source_hash: updated.source_hash,
      ingested_at: updated.ingested_at,
    });

    if (before === after) {
      alreadyTagged.push(filePath);
      continue;
    }

    try {
      const fileContents = matter.stringify(body, pruneUndefined(updated));
      fs.writeFileSync(filePath, fileContents);
      adopted.push(filePath);
    } catch (err) {
      invalid.push({
        path: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { adopted, alreadyTagged, invalid };
}

export function filterRawByTags(tags: string[]) {
  const normalized = new Set(normalizeTagList(tags));
  const { notes, invalid } = scanRaw();

  if (normalized.size === 0) return { matched: notes, invalid };

  const matched = notes.filter((n) =>
    n.frontmatter.tags.some((t) => normalized.has(t)),
  );

  return { matched, invalid };
}
