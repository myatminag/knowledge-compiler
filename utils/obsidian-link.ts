import slugify from "slugify";

export type ObsidianLinkStyle = "pipe" | "alias";

export interface ParsedWikilink {
  target: string;
  display?: string;
  raw: string;
}

export function toSlug(value: string): string {
  return slugify(value.trim(), { lower: true, strict: true });
}

export function parseWikilink(raw: string): ParsedWikilink {
  const stripped = raw
    .replace(/^\s*\[\[/, "")
    .replace(/\]\]\s*$/, "")
    .trim();
  const [targetRaw, ...displayParts] = stripped.split("|");
  const display =
    displayParts.length > 0 ? displayParts.join("|").trim() : undefined;

  return {
    target: targetRaw.trim(),
    display: display && display.length > 0 ? display : undefined,
    raw: stripped,
  };
}

export function resolveTargetSlug(target: string): string {
  return toSlug(target);
}

export function renderWikilink(
  nameOrLink: string,
  options: { style?: ObsidianLinkStyle; displayOverride?: string } = {},
): string {
  const style = options.style ?? "pipe";
  const parsed = parseWikilink(nameOrLink);
  const display = options.displayOverride ?? parsed.display ?? parsed.target;
  const slug = resolveTargetSlug(parsed.target);

  if (style === "alias") {
    return `[[${display}]]`;
  }

  if (!slug) return `[[${display}]]`;

  if (slug === display || slug === display.toLowerCase()) {
    return `[[${slug}]]`;
  }

  return `[[${slug}|${display}]]`;
}

export function renderWikilinkById(
  id: string,
  title: string,
  style: ObsidianLinkStyle = "pipe",
): string {
  if (style === "alias") return `[[${title}]]`;
  if (!id) return `[[${title}]]`;
  if (id === title || id === title.toLowerCase()) return `[[${id}]]`;
  return `[[${id}|${title}]]`;
}

export function extractWikilinkTargets(body: string): ParsedWikilink[] {
  const regex = /\[\[([^\]\n]+)\]\]/g;
  const results: ParsedWikilink[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    results.push(parseWikilink(match[0]));
  }

  return results;
}
