import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { InputSource } from "../types/input-source";

export type NormalizedDocument = {
  type: string;
  title: string;
  content: string;
};

export async function normalize(
  input: InputSource,
): Promise<NormalizedDocument> {
  switch (input.type) {
    case "raw_text":
      return {
        type: "text",
        title: "manual-input",
        content: input.content,
      };

    case "url":
      return await normalizeUrl(input.content);

    default:
      throw new Error(`Unsupported input type: ${input.type}`);
  }
}

async function normalizeUrl(url: string): Promise<NormalizedDocument> {
  const res = await fetch(url);
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Failed to extract article content");
  }

  return {
    type: "article",
    title: article.title || "untitled",
    content: article.textContent || "",
  };
}
