import { lintNote } from "./lint.pipeline";
import { normalize, NormalizedDocument } from "./normalize.pipeline";
import { InputSource } from "../types/input-source";
import { safeGenerate } from "./generate-note.pipeline";
import { LLMUsage } from "../llm/llm.client";
import { Knowledge } from "../schemas/knowledge.schema";

export interface PipelineResult {
  normalized: NormalizedDocument;
  knowledge: Knowledge;
  issues: string[];
  usage: LLMUsage;
  model: string;
}

export async function runPipeline(input: InputSource): Promise<PipelineResult> {
  const normalized = await normalize(input);

  const generated = await safeGenerate(normalized.content);

  const issues = lintNote(generated.data);

  return {
    normalized,
    knowledge: generated.data,
    issues,
    usage: generated.usage,
    model: generated.model,
  };
}
