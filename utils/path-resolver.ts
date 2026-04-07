import path from "path";

const homeDir = process.env.HOME || process.env.USERPROFILE;

const VAULT = path.join(homeDir!, "knowledge-vault");

export function resolveOutputPath(type: string, fileName: string): string {
  switch (type) {
    case "article":
      return path.join(VAULT, "03-notes", "articles", fileName);

    case "paper":
      return path.join(VAULT, "03-notes", "papers", fileName);

    case "repo":
      return path.join(VAULT, "03-notes", "repos", fileName);

    default:
      return path.join(VAULT, "03-notes", "general", fileName);
  }
}

export function resolveInboxPath(fileName: string): string {
  return path.join(VAULT, "00-inbox", fileName);
}

export function ensureDir(filePath: string) {
  const fs = require("fs");
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
