import { lintNote } from "./lint.pipeline";
import { normalize } from "./normalize.pipeline";
import { InputSource } from "../types/input-source";
import { safeGenerate } from "./generate-note.pipeline";

export async function runPipeline(input: InputSource) {
  const normalized = await normalize(input);

  const knowledge = await safeGenerate(normalized.content);

  const issues = lintNote(knowledge);

  return {
    normalized,
    knowledge,
    issues,
  };
}
