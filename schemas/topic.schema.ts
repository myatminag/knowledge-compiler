import { z } from "zod";

import { KnowledgeSchema } from "./knowledge.schema";

export const TopicSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export const TopicKnowledgeSchema = KnowledgeSchema.extend({
  sources: z.array(TopicSourceSchema).default([]),
});

export type TopicSource = z.infer<typeof TopicSourceSchema>;
export type TopicKnowledge = z.infer<typeof TopicKnowledgeSchema>;
