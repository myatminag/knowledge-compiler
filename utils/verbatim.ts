export interface VerbatimSnippet {
  kind: "code-block" | "inline-code" | "math-block" | "math-inline" | "equation";
  content: string;
}

const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]{2,}`/g;
const MATH_BLOCK = /\$\$[\s\S]+?\$\$/g;
const MATH_INLINE = /\$[^$\n]{2,}?\$/g;

const EQUATION_MIN_LENGTH = 3;
const EQUATION_MAX_LENGTH = 120;

function pushUnique(acc: VerbatimSnippet[], next: VerbatimSnippet) {
  const key = `${next.kind}:${next.content}`;
  if (!acc.some((s) => `${s.kind}:${s.content}` === key)) acc.push(next);
}

function stripForScan(text: string, patterns: RegExp[]): string {
  let stripped = text;
  for (const pattern of patterns) {
    stripped = stripped.replace(pattern, (m) => " ".repeat(m.length));
  }
  return stripped;
}

function collectMatches(
  text: string,
  pattern: RegExp,
  kind: VerbatimSnippet["kind"],
  acc: VerbatimSnippet[],
) {
  const matches = text.match(pattern) ?? [];
  for (const raw of matches) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    pushUnique(acc, { kind, content: trimmed });
  }
}

function looksLikeEquation(line: string): boolean {
  const trimmed = line.trim();

  if (trimmed.length < EQUATION_MIN_LENGTH) return false;
  if (trimmed.length > EQUATION_MAX_LENGTH) return false;
  if (!trimmed.includes("=")) return false;

  const hasWordChar = /[A-Za-z0-9_]/.test(trimmed);
  if (!hasWordChar) return false;

  const operatorCount = (trimmed.match(/[+\-*/^√∑∏∫<>()|]/g) ?? []).length;
  const alnumCount = (trimmed.match(/[A-Za-z0-9_]/g) ?? []).length;
  const alphaRatio = alnumCount / trimmed.length;

  if (operatorCount < 1) return false;
  if (alphaRatio < 0.25) return false;

  if (/^(https?:|\/\/|-\s|\*\s|#\s)/.test(trimmed)) return false;

  return true;
}

export function extractVerbatimSnippets(text: string): VerbatimSnippet[] {
  const snippets: VerbatimSnippet[] = [];

  collectMatches(text, FENCED_CODE, "code-block", snippets);
  collectMatches(text, MATH_BLOCK, "math-block", snippets);

  const withoutBlocks = stripForScan(text, [FENCED_CODE, MATH_BLOCK]);

  collectMatches(withoutBlocks, INLINE_CODE, "inline-code", snippets);
  collectMatches(withoutBlocks, MATH_INLINE, "math-inline", snippets);

  const withoutAll = stripForScan(withoutBlocks, [INLINE_CODE, MATH_INLINE]);

  for (const line of withoutAll.split("\n")) {
    if (looksLikeEquation(line)) {
      pushUnique(snippets, { kind: "equation", content: line.trim() });
    }
  }

  return snippets;
}

export function formatVerbatimAppendix(snippets: VerbatimSnippet[]): string {
  if (snippets.length === 0) return "";

  const groups = new Map<VerbatimSnippet["kind"], string[]>();

  for (const s of snippets) {
    const bucket = groups.get(s.kind) ?? [];
    bucket.push(s.content);
    groups.set(s.kind, bucket);
  }

  const order: VerbatimSnippet["kind"][] = [
    "code-block",
    "math-block",
    "equation",
    "math-inline",
    "inline-code",
  ];

  const labels: Record<VerbatimSnippet["kind"], string> = {
    "code-block": "Code blocks",
    "math-block": "Math blocks",
    equation: "Equations",
    "math-inline": "Inline math",
    "inline-code": "Inline code",
  };

  const lines: string[] = [
    "VERBATIM SNIPPETS (preserve these exactly when you reference them; do NOT paraphrase):",
  ];

  for (const kind of order) {
    const items = groups.get(kind);
    if (!items || items.length === 0) continue;
    lines.push("");
    lines.push(`${labels[kind]}:`);
    for (const item of items) lines.push(`- ${item}`);
  }

  return lines.join("\n");
}
