import fs from "fs";
import os from "os";
import path from "path";

export interface TmpVault {
  root: string;
  rawDir: string;
  notesDir: string;
  topicsDir: string;
  auditsDir: string;
  cleanup: () => void;
}

export function makeTmpVault(prefix = "knowledge-vault-"): TmpVault {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const rawDir = path.join(root, "00-raw");
  const notesDir = path.join(root, "03-notes");
  const topicsDir = path.join(root, "04-topics");
  const auditsDir = path.join(root, ".audits");

  for (const dir of [rawDir, notesDir, topicsDir, auditsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    root,
    rawDir,
    notesDir,
    topicsDir,
    auditsDir,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
