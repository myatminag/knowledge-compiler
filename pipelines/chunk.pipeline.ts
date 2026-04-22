export interface ChunkOptions {
  maxChars: number;
  overlap?: number;
}

export function chunkText(content: string, options: ChunkOptions): string[] {
  const { maxChars, overlap = 0 } = options;

  if (content.length <= maxChars) return [content];

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim().length > 0) chunks.push(current.trim());
    current =
      overlap > 0 ? current.slice(Math.max(0, current.length - overlap)) : "";
  };

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      if (current) flush();
      chunks.push(...splitSentence(p, maxChars));
      continue;
    }

    if ((current + "\n\n" + p).length > maxChars) flush();

    current = current ? `${current}\n\n${p}` : p;
  }

  flush();

  return chunks.filter((c) => c.length > 0);
}

function splitSentence(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]?\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + s).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = s;

      while (current.length > maxChars) {
        chunks.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    } else {
      current += s;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
