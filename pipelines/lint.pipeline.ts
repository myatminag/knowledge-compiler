import { Knowledge } from "../schemas/knowledge.schema";

export function lintNote(note: Knowledge): string[] {
  const issues: string[] = [];

  if (note.summary.length < 50) {
    issues.push("Summary too short");
  }

  if (note.keyConcepts.length === 0) {
    issues.push("Missing key concepts");
  }

  if (note.deepDive.length < 100) {
    issues.push("Deep dive too shallow");
  }

  return issues;
}
