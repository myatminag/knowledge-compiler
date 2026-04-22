import { z } from "zod";

export const KeyConceptSchema = z.object({
  name: z.string().min(1),
  explanation: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  sources: z.array(z.number().int().nonnegative()).default([]),
});

export const DeepDiveSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  sources: z.array(z.number().int().nonnegative()).default([]),
});

export const KnowledgeSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  keyConcepts: z.array(KeyConceptSchema),
  deepDive: z.array(DeepDiveSectionSchema),
  related: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type KeyConcept = z.infer<typeof KeyConceptSchema>;
export type DeepDiveSection = z.infer<typeof DeepDiveSectionSchema>;
export type Knowledge = z.infer<typeof KnowledgeSchema>;
