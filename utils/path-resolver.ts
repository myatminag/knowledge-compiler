import fs from "fs";
import path from "path";

import { config } from "../config/config";

function vault(): string {
  return config.vault.path;
}

export function resolveOutputPath(type: string, fileName: string): string {
  switch (type) {
    case "article":
      return path.join(vault(), "03-notes", "articles", fileName);

    case "paper":
      return path.join(vault(), "03-notes", "papers", fileName);

    case "repo":
      return path.join(vault(), "03-notes", "repos", fileName);

    case "video":
      return path.join(vault(), "03-notes", "videos", fileName);

    case "feed":
      return path.join(vault(), "03-notes", "feeds", fileName);

    default:
      return path.join(vault(), "03-notes", "general", fileName);
  }
}

export function resolveInboxPath(fileName: string): string {
  return path.join(vault(), "00-inbox", fileName);
}

export function resolveRawDir(): string {
  return path.join(vault(), "00-raw");
}

export function resolveRawPath(fileName: string): string {
  return path.join(resolveRawDir(), fileName);
}

export function resolveTopicsDir(): string {
  return path.join(vault(), "04-topics");
}

export function resolveTopicPath(fileName: string): string {
  return path.join(resolveTopicsDir(), fileName);
}

export function resolveNotesDir(): string {
  return path.join(vault(), "03-notes");
}

export function resolveIndexPath(): string {
  return path.join(vault(), "index.md");
}

export function resolveAuditsDir(): string {
  return path.join(vault(), ".audits");
}

export function resolveAuditPath(fileName: string): string {
  return path.join(resolveAuditsDir(), fileName);
}

export function resolveVersionsDir(id: string): string {
  return path.join(vault(), ".versions", id);
}

export function resolveRunsDir(): string {
  return path.join(vault(), ".runs");
}

export function vaultRoot(): string {
  return vault();
}

export function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
