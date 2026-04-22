import { config } from "../config/config";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: Level): boolean {
  return ORDER[level] >= ORDER[config.logger.level];
}

function format(level: Level, msg: string, meta?: unknown): string {
  const time = new Date().toISOString();
  const base = `[${time}] ${level.toUpperCase()} ${msg}`;

  if (meta === undefined) return base;

  try {
    return `${base} ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  } catch {
    return base;
  }
}

export const logger = {
  debug(msg: string, meta?: unknown) {
    if (shouldLog("debug")) console.debug(format("debug", msg, meta));
  },
  info(msg: string, meta?: unknown) {
    if (shouldLog("info")) console.log(format("info", msg, meta));
  },
  warn(msg: string, meta?: unknown) {
    if (shouldLog("warn")) console.warn(format("warn", msg, meta));
  },
  error(msg: string, meta?: unknown) {
    if (shouldLog("error")) console.error(format("error", msg, meta));
  },
};
