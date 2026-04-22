import { z } from "zod";

export const RawFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(true),
  source_type: z.string().optional(),
  source_url: z.string().url().optional(),
  source_hash: z.string().min(1),
  ingested_at: z.string().min(1),
  compiled_into: z.array(z.string()).optional(),
});

export type RawFrontmatter = z.infer<typeof RawFrontmatterSchema>;

export function safeParseRawFrontmatter(
  data: unknown,
): { ok: true; data: RawFrontmatter } | { ok: false; error: string } {
  const result = RawFrontmatterSchema.safeParse(data);

  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}
