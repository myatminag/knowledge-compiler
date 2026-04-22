import { z } from "zod";

export const FrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  source_type: z.string().optional(),
  source_url: z.string().url().optional(),
  source_hash: z.string().optional(),
  prompt_version: z.string().optional(),
  model: z.string().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export function parseFrontmatter(data: unknown): Frontmatter {
  return FrontmatterSchema.parse(data);
}

export function safeParseFrontmatter(
  data: unknown,
): { ok: true; data: Frontmatter } | { ok: false; error: string } {
  const result = FrontmatterSchema.safeParse(data);

  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}
