import { callLLM } from "./llm.client";
import { KnowledgeSchema, Knowledge } from "../schemas/knowledge.schema";

function safeParseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON from LLM");
  }
}

export async function generateNote(input: string): Promise<Knowledge> {
  const raw = await callLLM(input);

  const parsed = safeParseJSON(raw);

  const validated = KnowledgeSchema.parse(parsed);

  return validated;
}

export async function safeGenerate(
  input: string,
  retries = 3,
): Promise<Knowledge> {
  for (let i = 0; i < retries; i++) {
    try {
      return await generateNote(input);
    } catch (err) {
      console.warn(`Retry ${i + 1} failed`, err);

      if (i === retries - 1) {
        throw err;
      }
    }
  }

  throw new Error("Unexpected failure");
}
