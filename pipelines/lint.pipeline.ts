import { Knowledge } from "../schemas/knowledge.schema";

const MAX_CONCEPT_WORDS = 8;
const MIN_SUMMARY_LENGTH = 50;
const MIN_DEEP_DIVE_LENGTH = 100;

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function findCaseInsensitiveDuplicates(arr: string[]): string[] {
  const seen = new Map<string, number>();

  for (const item of arr) {
    const key = item.trim().toLowerCase();

    if (!key) continue;

    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function isSentenceLike(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (wordCount(trimmed) > MAX_CONCEPT_WORDS) return true;

  return /[.!?]$/.test(trimmed);
}

export function lintNote(note: Knowledge): string[] {
  const issues: string[] = [];

  if (note.summary.length < MIN_SUMMARY_LENGTH) {
    issues.push(
      `Summary too short (${note.summary.length} chars, expected >= ${MIN_SUMMARY_LENGTH})`,
    );
  }

  if (note.deepDive.length < MIN_DEEP_DIVE_LENGTH) {
    issues.push(
      `Deep dive too shallow (${note.deepDive.length} chars, expected >= ${MIN_DEEP_DIVE_LENGTH})`,
    );
  }

  if (note.tags.length === 0) {
    issues.push("Missing tags");
  }

  if (note.keyConcepts.length === 0) {
    issues.push("Missing key concepts");
  }

  const conceptDupes = findCaseInsensitiveDuplicates(note.keyConcepts);
  if (conceptDupes.length > 0) {
    issues.push(`Duplicate key concepts: ${conceptDupes.join(", ")}`);
  }

  const vagueConcepts = note.keyConcepts.filter(isSentenceLike);
  if (vagueConcepts.length > 0) {
    issues.push(
      `Sentence-like key concepts (>${MAX_CONCEPT_WORDS} words or ending with punctuation): ${vagueConcepts
        .slice(0, 3)
        .join(" | ")}`,
    );
  }

  const relatedDupes = findCaseInsensitiveDuplicates(note.related);
  if (relatedDupes.length > 0) {
    issues.push(`Duplicate related links: ${relatedDupes.join(", ")}`);
  }

  if (note.related.length > 20) {
    issues.push(`Too many related links (${note.related.length}, >20)`);
  }

  return issues;
}
