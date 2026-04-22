import fs from "fs";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";

import {
  Frontmatter,
  safeParseFrontmatter,
} from "../schemas/frontmatter.schema";
import {
  RawFrontmatter,
  safeParseRawFrontmatter,
} from "../schemas/raw-frontmatter.schema";
import { config } from "../config/config";
import { resolveRawDir } from "./path-resolver";

export interface VaultNote {
  path: string;
  frontmatter: Frontmatter;
  body: string;
}

export interface RawNote {
  path: string;
  frontmatter: RawFrontmatter;
  body: string;
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function readNoteIfExists(filePath: string): VaultNote | null {
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);

  const fm = safeParseFrontmatter(parsed.data);
  if (!fm.ok) return null;

  return {
    path: filePath,
    frontmatter: fm.data,
    body: parsed.content,
  };
}

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkMarkdown(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }

  return acc;
}

export interface ScanResult {
  notes: VaultNote[];
  invalid: { path: string; error: string }[];
}

export function scanVault(
  roots: string | string[] = path.join(config.vault.path, "03-notes"),
): ScanResult {
  const rootList = Array.isArray(roots) ? roots : [roots];
  const seen = new Set<string>();
  const notes: VaultNote[] = [];
  const invalid: { path: string; error: string }[] = [];

  for (const root of rootList) {
    for (const file of walkMarkdown(root)) {
      if (seen.has(file)) continue;
      seen.add(file);

      const raw = fs.readFileSync(file, "utf-8");
      const parsed = matter(raw);
      const fm = safeParseFrontmatter(parsed.data);

      if (fm.ok) {
        notes.push({ path: file, frontmatter: fm.data, body: parsed.content });
      } else {
        invalid.push({ path: file, error: fm.error });
      }
    }
  }

  return { notes, invalid };
}

export interface RawScanResult {
  notes: RawNote[];
  invalid: { path: string; error: string }[];
}

export function scanRaw(root: string = resolveRawDir()): RawScanResult {
  const files = walkMarkdown(root);
  const notes: RawNote[] = [];
  const invalid: { path: string; error: string }[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = matter(raw);
    const fm = safeParseRawFrontmatter(parsed.data);

    if (fm.ok) {
      notes.push({ path: file, frontmatter: fm.data, body: parsed.content });
    } else {
      invalid.push({ path: file, error: fm.error });
    }
  }

  return { notes, invalid };
}

export function readRawIfExists(filePath: string): RawNote | null {
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);

  const fm = safeParseRawFrontmatter(parsed.data);
  if (!fm.ok) return null;

  return {
    path: filePath,
    frontmatter: fm.data,
    body: parsed.content,
  };
}
