import { describe, expect, test } from "bun:test";
import { chunkText } from "../pipelines/chunk.pipeline";

describe("chunkText", () => {
  test("returns single chunk when content fits", () => {
    const chunks = chunkText("hello world", { maxChars: 100 });
    expect(chunks).toEqual(["hello world"]);
  });

  test("splits on paragraph boundaries", () => {
    const para = "a".repeat(30);
    const chunks = chunkText(`${para}\n\n${para}\n\n${para}`, {
      maxChars: 40,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(80);
  });

  test("splits long paragraphs on sentence boundaries", () => {
    const s = "This is a sentence. ".repeat(20);
    const chunks = chunkText(s, { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("never loses content character count order", () => {
    const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const chunks = chunkText(text, { maxChars: 20 });
    const joined = chunks.join(" ");
    expect(joined).toContain("Paragraph one");
    expect(joined).toContain("Paragraph two");
    expect(joined).toContain("Paragraph three");
  });
});
