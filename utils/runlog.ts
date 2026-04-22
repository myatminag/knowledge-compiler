import fs from "fs";
import path from "path";

import { ensureDir, resolveRunsDir } from "./path-resolver";

export interface RunLogEntry {
  timestamp: string;
  command: string;
  id: string;
  model: string;
  sourceType: string;
  sourceHash: string;
  totalTokens: number;
  costUsd?: number;
  cached?: boolean;
  issues: string[];
  outputPath: string;
}

export function appendRunLog(entry: RunLogEntry) {
  const dir = resolveRunsDir();
  const file = path.join(dir, `${entry.timestamp.slice(0, 10)}.jsonl`);

  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}
