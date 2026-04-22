import fs from "fs";
import path from "path";

import {
  Knowledge,
  KeyConcept,
  DeepDiveSection,
} from "../schemas/knowledge.schema";
import { ensureDir, resolveVersionsDir } from "../utils/path-resolver";

export interface VersionRecord {
  timestamp: string;
  id: string;
  model?: string;
  promptVersion?: string;
  sourceHash?: string;
  previous: Knowledge | null;
  next: Knowledge;
}

export interface FieldDiff {
  added: string[];
  removed: string[];
  changed: boolean;
}

export interface KnowledgeDiffSummary {
  title: { from: string | null; to: string };
  summary: { changed: boolean; from: string | null; to: string };
  deepDive: FieldDiff;
  tags: FieldDiff;
  keyConcepts: FieldDiff;
  related: FieldDiff;
  openQuestions: FieldDiff;
}

function arrayDiff(a: string[] = [], b: string[] = []): FieldDiff {
  const setA = new Set(a.map((x) => x.trim().toLowerCase()));
  const setB = new Set(b.map((x) => x.trim().toLowerCase()));

  const added = b.filter((x) => !setA.has(x.trim().toLowerCase()));
  const removed = a.filter((x) => !setB.has(x.trim().toLowerCase()));

  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}

function conceptNames(concepts: KeyConcept[] = []): string[] {
  return concepts.map((c) => c.name);
}

function sectionHeadings(sections: DeepDiveSection[] = []): string[] {
  return sections.map((s) => s.heading);
}

export function diffKnowledge(
  previous: Knowledge | null,
  next: Knowledge,
): KnowledgeDiffSummary {
  return {
    title: { from: previous?.title ?? null, to: next.title },
    summary: {
      from: previous?.summary ?? null,
      to: next.summary,
      changed: previous?.summary !== next.summary,
    },
    deepDive: arrayDiff(
      sectionHeadings(previous?.deepDive ?? []),
      sectionHeadings(next.deepDive),
    ),
    tags: arrayDiff(previous?.tags ?? [], next.tags),
    keyConcepts: arrayDiff(
      conceptNames(previous?.keyConcepts ?? []),
      conceptNames(next.keyConcepts),
    ),
    related: arrayDiff(previous?.related ?? [], next.related),
    openQuestions: arrayDiff(previous?.openQuestions ?? [], next.openQuestions),
  };
}

export function saveVersion(record: VersionRecord): string {
  const dir = resolveVersionsDir(record.id);
  const filePath = path.join(dir, `${record.timestamp}.json`);

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));

  return filePath;
}

export function listVersions(id: string): string[] {
  const dir = resolveVersionsDir(id);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

export function loadVersion(id: string, filename: string): VersionRecord {
  const filePath = path.join(resolveVersionsDir(id), filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as VersionRecord;
}
