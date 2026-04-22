import fs from "fs";
import path from "path";

import { config } from "../config/config";

const VAULT = config.vault.path;

export function resolveOutputPath(type: string, fileName: string): string {
  switch (type) {
    case "article":
      return path.join(VAULT, "03-notes", "articles", fileName);

    case "paper":
      return path.join(VAULT, "03-notes", "papers", fileName);

    case "repo":
      return path.join(VAULT, "03-notes", "repos", fileName);

    case "video":
      return path.join(VAULT, "03-notes", "videos", fileName);

    case "feed":
      return path.join(VAULT, "03-notes", "feeds", fileName);

    default:
      return path.join(VAULT, "03-notes", "general", fileName);
  }
}

export function resolveInboxPath(fileName: string): string {
  return path.join(VAULT, "00-inbox", fileName);
}

export function resolveVersionsDir(id: string): string {
  return path.join(VAULT, ".versions", id);
}

export function resolveRunsDir(): string {
  return path.join(VAULT, ".runs");
}

export function vaultRoot(): string {
  return VAULT;
}

export function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
