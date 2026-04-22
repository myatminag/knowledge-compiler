import fs from "fs";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";

import { config } from "../config/config";
import { Frontmatter, safeParseFrontmatter } from "../schemas/frontmatter.schema";

export interface VaultNote {
  path: string;
  frontmatter: Frontmatter;
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
  root: string = path.join(config.vault.path, "03-notes"),
): ScanResult {
  const files = walkMarkdown(root);
  const notes: VaultNote[] = [];
  const invalid: { path: string; error: string }[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = matter(raw);
    const fm = safeParseFrontmatter(parsed.data);

    if (fm.ok) {
      notes.push({ path: file, frontmatter: fm.data, body: parsed.content });
    } else {
      invalid.push({ path: file, error: fm.error });
    }
  }

  return { notes, invalid };
}
