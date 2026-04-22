import {
  Knowledge,
  KeyConcept,
  DeepDiveSection,
} from "../schemas/knowledge.schema";

const MIN_SUMMARY_LENGTH = 50;
const MIN_DEEP_DIVE_TOTAL_LENGTH = 300;
const MIN_DEEP_DIVE_SECTIONS = 2;
const MIN_EXPLANATION_LENGTH = 20;
const MIN_SECTION_BODY_LENGTH = 80;
const MIN_KEY_CONCEPTS = 3;

function countBodyChars(sections: DeepDiveSection[]): number {
  return sections.reduce((acc, s) => acc + s.body.trim().length, 0);
}

function findDuplicateNames(concepts: KeyConcept[]): string[] {
  const seen = new Map<string, number>();

  for (const c of concepts) {
    const key = c.name.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function findDuplicateHeadings(sections: DeepDiveSection[]): string[] {
  const seen = new Map<string, number>();

  for (const s of sections) {
    const key = s.heading.trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function findDuplicateStrings(arr: string[]): string[] {
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

export interface LintOptions {
  sourceCount?: number;
}

export function lintNote(note: Knowledge, options: LintOptions = {}): string[] {
  const issues: string[] = [];

  if (note.summary.trim().length < MIN_SUMMARY_LENGTH) {
    issues.push(
      `Summary too short (${note.summary.trim().length} chars, expected >= ${MIN_SUMMARY_LENGTH})`,
    );
  }

  if (note.tags.length === 0) issues.push("Missing tags");

  if (note.keyConcepts.length < MIN_KEY_CONCEPTS) {
    issues.push(
      `Too few key concepts (${note.keyConcepts.length}, expected >= ${MIN_KEY_CONCEPTS})`,
    );
  }

  const emptyExplanations = note.keyConcepts.filter(
    (c) => c.explanation.trim().length < MIN_EXPLANATION_LENGTH,
  );
  if (emptyExplanations.length > 0) {
    issues.push(
      `Concepts with weak explanations (<${MIN_EXPLANATION_LENGTH} chars): ${emptyExplanations
        .slice(0, 3)
        .map((c) => c.name)
        .join(" | ")}`,
    );
  }

  const conceptDupes = findDuplicateNames(note.keyConcepts);
  if (conceptDupes.length > 0) {
    issues.push(`Duplicate key concepts: ${conceptDupes.join(", ")}`);
  }

  if (note.deepDive.length < MIN_DEEP_DIVE_SECTIONS) {
    issues.push(
      `Too few deep-dive sub-sections (${note.deepDive.length}, expected >= ${MIN_DEEP_DIVE_SECTIONS})`,
    );
  }

  const totalBody = countBodyChars(note.deepDive);
  if (totalBody < MIN_DEEP_DIVE_TOTAL_LENGTH) {
    issues.push(
      `Deep dive too shallow (${totalBody} chars total, expected >= ${MIN_DEEP_DIVE_TOTAL_LENGTH})`,
    );
  }

  const shortSections = note.deepDive.filter(
    (s) => s.body.trim().length < MIN_SECTION_BODY_LENGTH,
  );
  if (shortSections.length > 0) {
    issues.push(
      `Shallow deep-dive sections: ${shortSections
        .slice(0, 3)
        .map((s) => s.heading)
        .join(" | ")}`,
    );
  }

  const headingDupes = findDuplicateHeadings(note.deepDive);
  if (headingDupes.length > 0) {
    issues.push(`Duplicate deep-dive headings: ${headingDupes.join(", ")}`);
  }

  if (options.sourceCount !== undefined && options.sourceCount > 0) {
    const sourceCount = options.sourceCount;

    const conceptsMissingCitations = note.keyConcepts.filter(
      (c) => !c.sources || c.sources.length === 0,
    );
    if (conceptsMissingCitations.length > 0) {
      issues.push(
        `Concepts missing citations: ${conceptsMissingCitations
          .slice(0, 3)
          .map((c) => c.name)
          .join(" | ")}`,
      );
    }

    const badIndexes = [
      ...note.keyConcepts.flatMap((c) => c.sources),
      ...note.deepDive.flatMap((s) => s.sources),
    ].filter((i) => !Number.isInteger(i) || i < 0 || i >= sourceCount);

    if (badIndexes.length > 0) {
      issues.push(
        `Out-of-range source indexes: ${[...new Set(badIndexes)].join(", ")} (max ${sourceCount - 1})`,
      );
    }
  }

  const relatedDupes = findDuplicateStrings(note.related);
  if (relatedDupes.length > 0) {
    issues.push(`Duplicate related links: ${relatedDupes.join(", ")}`);
  }

  if (note.related.length > 20) {
    issues.push(`Too many related links (${note.related.length}, >20)`);
  }

  return issues;
}
