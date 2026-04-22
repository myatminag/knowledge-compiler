import fs from "fs";
import path from "path";
import crypto from "crypto";

import { logger } from "./logger";
import { config } from "../config/config";

export interface CacheKeyParts {
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  promptVersion: string;
  temperature: number;
}

export function cacheKey(parts: CacheKeyParts): string {
  const hash = crypto.createHash("sha256");
  hash.update(parts.schemaName);
  hash.update("\0");
  hash.update(parts.systemPrompt);
  hash.update("\0");
  hash.update(parts.userPrompt);
  hash.update("\0");
  hash.update(parts.model);
  hash.update("\0");
  hash.update(parts.promptVersion);
  hash.update("\0");
  hash.update(parts.temperature.toString());

  return hash.digest("hex");
}

function cachePath(key: string): string {
  return path.join(config.cache.dir, `${key}.json`);
}

export function readCache<T>(key: string): T | null {
  if (!config.cache.enabled) return null;

  const file = cachePath(key);

  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, "utf-8");
    logger.debug("Cache hit", { key });
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn("Cache read failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (!config.cache.enabled) return;

  const file = cachePath(key);

  if (!fs.existsSync(config.cache.dir)) {
    fs.mkdirSync(config.cache.dir, { recursive: true });
  }

  try {
    fs.writeFileSync(file, JSON.stringify(value));
  } catch (err) {
    logger.warn("Cache write failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
