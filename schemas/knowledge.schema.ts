import { z } from "zod";

export const KnowledgeSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  keyConcepts: z.array(z.string()),
  deepDive: z.string(),
  related: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type Knowledge = z.infer<typeof KnowledgeSchema>;
