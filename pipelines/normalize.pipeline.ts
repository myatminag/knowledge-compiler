import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { XMLParser } from "fast-xml-parser";
import { Readability } from "@mozilla/readability";
import { extractText, getDocumentProxy } from "unpdf";
import { YoutubeTranscript } from "youtube-transcript";

import { InputSource } from "../types/input-source";

export type NormalizedType =
  | "text"
  | "article"
  | "paper"
  | "repo"
  | "video"
  | "feed";

export interface NormalizedDocument {
  type: NormalizedType;
  title: string;
  content: string;
  sourceUrl?: string;
}

export async function normalize(
  input: InputSource,
): Promise<NormalizedDocument> {
  switch (input.type) {
    case "raw_text":
      return {
        type: "text",
        title: input.title?.trim() || "manual-input",
        content: input.content,
      };

    case "url":
      return await normalizeUrl(input.content);

    case "pdf":
      return await normalizePdf(input.content);

    case "youtube":
      return await normalizeYoutube(input.content);

    case "github_repo":
      return await normalizeGithubRepo(input.content);

    case "rss":
      return await normalizeRss(input.content);

    default:
      throw new Error(`Unsupported input type: ${(input as InputSource).type}`);
  }
}

async function normalizeUrl(url: string): Promise<NormalizedDocument> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article) throw new Error("Failed to extract article content");

  return {
    type: "article",
    title: article.title || "untitled",
    content: article.textContent || "",
    sourceUrl: url,
  };
}

async function normalizePdf(filePath: string): Promise<NormalizedDocument> {
  const abs = path.resolve(filePath);

  if (!fs.existsSync(abs)) throw new Error(`PDF not found: ${abs}`);

  const buffer = fs.readFileSync(abs);
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });

  return {
    type: "paper",
    title: path.basename(abs, path.extname(abs)),
    content: Array.isArray(text) ? text.join("\n\n") : text,
  };
}

async function normalizeYoutube(url: string): Promise<NormalizedDocument> {
  const segments = await YoutubeTranscript.fetchTranscript(url);
  const content = segments.map((s) => s.text).join(" ");

  return {
    type: "video",
    title: extractYoutubeTitle(url),
    content,
    sourceUrl: url,
  };
}

function extractYoutubeTitle(url: string): string {
  try {
    const u = new URL(url);
    return (
      u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "youtube-video"
    );
  } catch {
    return "youtube-video";
  }
}

async function normalizeGithubRepo(repo: string): Promise<NormalizedDocument> {
  const { owner, name } = parseGithubRepo(repo);

  const readmeRes = await fetch(
    `https://api.github.com/repos/${owner}/${name}/readme`,
    { headers: { Accept: "application/vnd.github.v3.raw" } },
  );

  if (!readmeRes.ok) {
    throw new Error(
      `Failed to fetch README for ${owner}/${name}: ${readmeRes.status}`,
    );
  }

  const readme = await readmeRes.text();

  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${name}`);
  const meta = metaRes.ok ? await metaRes.json() : null;

  const description = meta?.description
    ? `Description: ${meta.description}\n\n`
    : "";
  const lang = meta?.language ? `Language: ${meta.language}\n\n` : "";

  return {
    type: "repo",
    title: `${owner}/${name}`,
    content: `${description}${lang}${readme}`,
    sourceUrl: `https://github.com/${owner}/${name}`,
  };
}

function parseGithubRepo(input: string): { owner: string; name: string } {
  const cleaned = input.trim().replace(/\.git$/, "");

  const urlMatch = cleaned.match(/github\.com[:/]([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], name: urlMatch[2] };

  const shortMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) return { owner: shortMatch[1], name: shortMatch[2] };

  throw new Error(`Invalid github repo reference: ${input}`);
}

async function normalizeRss(url: string): Promise<NormalizedDocument> {
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Failed to fetch feed ${url}: ${res.status}`);

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel ?? parsed?.feed;
  const items: any[] = channel?.item ?? channel?.entry ?? [];
  const title = channel?.title ?? "feed";

  const list = Array.isArray(items) ? items : [items];

  const body = list
    .map((item) => {
      const t = item.title ?? "untitled";
      const desc =
        item.description ??
        item.summary ??
        item.content ??
        item["content:encoded"] ??
        "";
      return `## ${typeof t === "string" ? t : (t?.["#text"] ?? "untitled")}\n\n${typeof desc === "string" ? desc : (desc?.["#text"] ?? "")}`;
    })
    .join("\n\n");

  return {
    type: "feed",
    title: typeof title === "string" ? title : "feed",
    content: body,
    sourceUrl: url,
  };
}
