import fs from "fs";
import matter from "gray-matter";

import { logger } from "../utils/logger";
import { config } from "../config/config";
import { scanVault, VaultNote } from "../utils/vault";
import { parseWikilink, renderWikilinkById } from "../utils/obsidian-link";

const WIKILINK_REGEX = /\[\[([^\]\n]+)\]\]/g;
const BACKLINKS_SECTION_REGEX = /\n*##\s+Backlinks[\s\S]*$/;

export interface LinkIndex {
  byId: Map<string, VaultNote>;
  byTitle: Map<string, string>;
}

export function buildIndex(notes: VaultNote[]): LinkIndex {
  const byId = new Map<string, VaultNote>();
  const byTitle = new Map<string, string>();

  for (const note of notes) {
    byId.set(note.frontmatter.id, note);
    byTitle.set(
      note.frontmatter.title.trim().toLowerCase(),
      note.frontmatter.id,
    );
  }

  return { byId, byTitle };
}

export function resolveTarget(target: string, index: LinkIndex): string | null {
  const trimmed = target.trim();

  if (index.byId.has(trimmed)) return trimmed;

  const titleHit = index.byTitle.get(trimmed.toLowerCase());
  if (titleHit) return titleHit;

  return null;
}

export function extractWikilinks(body: string): string[] {
  const links = new Set<string>();
  const stripped = body.replace(BACKLINKS_SECTION_REGEX, "");

  let match: RegExpExecArray | null;
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(stripped)) !== null) {
    const parsed = parseWikilink(match[0]);
    if (parsed.target) links.add(parsed.target);
  }

  return [...links];
}

export interface LinkGraph {
  forward: Map<string, Set<string>>;
  backward: Map<string, Set<string>>;
  orphans: { fromId: string; target: string }[];
}

export function buildGraph(index: LinkIndex): LinkGraph {
  const forward = new Map<string, Set<string>>();
  const backward = new Map<string, Set<string>>();
  const orphans: { fromId: string; target: string }[] = [];

  for (const note of index.byId.values()) {
    const links = extractWikilinks(note.body);
    const outbound = new Set<string>();

    for (const target of links) {
      const resolved = resolveTarget(target, index);

      if (!resolved) {
        orphans.push({ fromId: note.frontmatter.id, target });
        continue;
      }

      outbound.add(resolved);

      const inbound = backward.get(resolved) ?? new Set<string>();
      inbound.add(note.frontmatter.id);
      backward.set(resolved, inbound);
    }

    forward.set(note.frontmatter.id, outbound);
  }

  return { forward, backward, orphans };
}

export interface BacklinkUpdate {
  updated: string[];
  unchanged: string[];
  orphans: { fromId: string; target: string }[];
}

function renderBacklinks(ids: string[], index: LinkIndex): string {
  const style = config.obsidian.linkStyle;

  const items = ids
    .map((id) => {
      const note = index.byId.get(id);
      const title = note ? note.frontmatter.title : id;
      return `- ${renderWikilinkById(id, title, style)}`;
    })
    .sort();

  return `## Backlinks\n\n${items.join("\n")}\n`;
}

function stripBacklinks(body: string): string {
  return body.replace(BACKLINKS_SECTION_REGEX, "").trimEnd() + "\n";
}

export function applyBacklinks(options: { apply: boolean }): BacklinkUpdate {
  const scan = scanVault();
  const index = buildIndex(scan.notes);
  const graph = buildGraph(index);

  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const note of scan.notes) {
    const inbound = [...(graph.backward.get(note.frontmatter.id) ?? [])];
    const baseBody = stripBacklinks(note.body);

    const newBody =
      inbound.length > 0
        ? `${baseBody.trimEnd()}\n\n${renderBacklinks(inbound, index)}`
        : baseBody;

    if (newBody.trim() === note.body.trim()) {
      unchanged.push(note.frontmatter.id);
      continue;
    }

    if (options.apply) {
      const file = matter.stringify(newBody, {
        ...note.frontmatter,
        updated_at: new Date().toISOString(),
      });
      fs.writeFileSync(note.path, file);
    }

    updated.push(note.frontmatter.id);
  }

  logger.info("Link pipeline complete", {
    updated: updated.length,
    unchanged: unchanged.length,
    orphans: graph.orphans.length,
  });

  return { updated, unchanged, orphans: graph.orphans };
}
