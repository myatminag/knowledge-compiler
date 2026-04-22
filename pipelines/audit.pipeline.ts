import fs from "fs";
import { z } from "zod";
import matter from "gray-matter";

import { config } from "../config/config";
import { logger } from "../utils/logger";
import { callStructured } from "../llm/llm.client";
import { buildGraph, buildIndex } from "./link.pipeline";
import { renderWikilinkById, toSlug } from "../utils/obsidian-link";
import { dedupeCaseInsensitive } from "../utils/arrays";
import {
  ensureDir,
  resolveAuditPath,
  resolveNotesDir,
  resolveTopicsDir,
} from "../utils/path-resolver";
import { scanRaw, scanVault, VaultNote } from "../utils/vault";

const CONTRADICTION_SYSTEM_PROMPT = `
You are an auditor of a personal knowledge base. You are given TWO notes that may or may not contradict each other.

Return a structured verdict:
- If they do not contradict, return { "contradicts": false }.
- If they contradict, return { "contradicts": true, "summary": <short>, "suggestedFix": <short action> }.
- Disagreements about terminology or emphasis are not contradictions. Only factual clashes count.
- Return valid JSON.
`;

const CROSSREF_SYSTEM_PROMPT = `
You are an auditor suggesting cross-references between knowledge-base notes.

Given TWO related notes, decide if they should reference each other via [[Related]] entries.

Return:
- { "shouldLink": false } if they do not belong in each other's Related list.
- { "shouldLink": true, "direction": "both" | "a->b" | "b->a", "reason": <short> } otherwise.
- Return valid JSON.
`;

const ContradictionSchema = z.object({
  contradicts: z.boolean(),
  summary: z.string().optional(),
  suggestedFix: z.string().optional(),
});

const CrossrefSchema = z.object({
  shouldLink: z.boolean(),
  direction: z.enum(["both", "a->b", "b->a"]).optional(),
  reason: z.string().optional(),
});

export interface OrphanIssue {
  fromId: string;
  target: string;
  suggestion?: string;
}

export interface StaleRawIssue {
  path: string;
  id: string;
  title: string;
  ageDays: number;
}

export interface FrontmatterDriftIssue {
  path: string;
  error: string;
}

export interface NearDuplicateIssue {
  a: { id: string; title: string };
  b: { id: string; title: string };
  jaccard: number;
}

export interface ContradictionIssue {
  a: { id: string; title: string };
  b: { id: string; title: string };
  summary: string;
  suggestedFix: string;
}

export interface CrossrefSuggestion {
  a: { id: string; title: string };
  b: { id: string; title: string };
  direction: "both" | "a->b" | "b->a";
  reason: string;
}

export interface AuditReport {
  generatedAt: string;
  path: string;
  orphans: OrphanIssue[];
  staleRaw: StaleRawIssue[];
  frontmatterDrift: FrontmatterDriftIssue[];
  nearDuplicates: NearDuplicateIssue[];
  contradictions: ContradictionIssue[];
  crossrefs: CrossrefSuggestion[];
  appliedFixes: string[];
  llm: { totalTokens: number; costUsd?: number };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function conceptSet(note: VaultNote): Set<string> {
  const result = new Set<string>();
  const matches = note.body.matchAll(/^\s*-\s+([^\n]+)$/gm);

  for (const m of matches) {
    const cleaned = m[1]
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
      .replace(/`/g, "")
      .trim();

    if (cleaned) result.add(cleaned.toLowerCase());
  }

  return result;
}

function detectOrphans(notes: VaultNote[]): OrphanIssue[] {
  const index = buildIndex(notes);
  const graph = buildGraph(index);

  const lowerMap = new Map<string, string>();
  for (const note of notes) {
    lowerMap.set(note.frontmatter.id.toLowerCase(), note.frontmatter.id);
    lowerMap.set(
      note.frontmatter.title.toLowerCase(),
      note.frontmatter.id,
    );
  }

  return graph.orphans.map((o) => {
    const hint = lowerMap.get(o.target.toLowerCase());
    return hint ? { ...o, suggestion: hint } : o;
  });
}

function detectStaleRaw(): StaleRawIssue[] {
  const { notes } = scanRaw();
  const now = Date.now();
  const staleMs = config.audit.staleDays * 24 * 60 * 60 * 1000;

  return notes
    .filter((n) => !n.frontmatter.compiled_into?.length)
    .map((n) => {
      const ingested = Date.parse(n.frontmatter.ingested_at);
      const ageDays = Number.isFinite(ingested)
        ? (now - ingested) / (24 * 60 * 60 * 1000)
        : Number.POSITIVE_INFINITY;

      return {
        path: n.path,
        id: n.frontmatter.id,
        title: n.frontmatter.title,
        ageDays: Math.round(ageDays),
      };
    })
    .filter((i) => i.ageDays * 24 * 60 * 60 * 1000 >= staleMs);
}

function detectFrontmatterDrift(): FrontmatterDriftIssue[] {
  const scan = scanVault([resolveNotesDir(), resolveTopicsDir()]);
  return scan.invalid.map((i) => ({ path: i.path, error: i.error }));
}

function detectNearDuplicates(
  notes: VaultNote[],
  threshold = 0.6,
): NearDuplicateIssue[] {
  const seen = new Map<string, string>();
  const titleDupes: NearDuplicateIssue[] = [];

  for (const note of notes) {
    const key = note.frontmatter.title.trim().toLowerCase();
    const hit = seen.get(key);
    if (hit && hit !== note.frontmatter.id) {
      titleDupes.push({
        a: { id: hit, title: key },
        b: { id: note.frontmatter.id, title: note.frontmatter.title },
        jaccard: 1,
      });
      continue;
    }
    seen.set(key, note.frontmatter.id);
  }

  const concepts = notes.map((n) => ({
    note: n,
    set: conceptSet(n),
  }));

  const conceptDupes: NearDuplicateIssue[] = [];
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const j_v = jaccard(concepts[i].set, concepts[j].set);
      if (j_v >= threshold) {
        conceptDupes.push({
          a: {
            id: concepts[i].note.frontmatter.id,
            title: concepts[i].note.frontmatter.title,
          },
          b: {
            id: concepts[j].note.frontmatter.id,
            title: concepts[j].note.frontmatter.title,
          },
          jaccard: Math.round(j_v * 100) / 100,
        });
      }
    }
  }

  return [...titleDupes, ...conceptDupes];
}

function sharedTags(a: VaultNote, b: VaultNote): string[] {
  const setB = new Set(b.frontmatter.tags);
  return a.frontmatter.tags.filter((t) => setB.has(t));
}

function noteContainsRelatedLink(note: VaultNote, targetId: string): boolean {
  const lowered = note.body.toLowerCase();
  return (
    lowered.includes(`[[${targetId.toLowerCase()}]]`) ||
    lowered.includes(`[[${targetId.toLowerCase()}|`)
  );
}

async function runLlmChecks(notes: VaultNote[]): Promise<{
  contradictions: ContradictionIssue[];
  crossrefs: CrossrefSuggestion[];
  totalTokens: number;
  costUsd: number;
}> {
  const contradictions: ContradictionIssue[] = [];
  const crossrefs: CrossrefSuggestion[] = [];

  let totalTokens = 0;
  let totalCost = 0;

  const candidates: { a: VaultNote; b: VaultNote; shared: string[] }[] = [];

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const shared = sharedTags(notes[i], notes[j]);
      if (shared.length > 0) {
        candidates.push({ a: notes[i], b: notes[j], shared });
      }
    }
  }

  logger.info("Audit LLM candidate pairs", { count: candidates.length });

  for (const { a, b, shared } of candidates) {
    const userPrompt = buildContradictionPrompt(a, b);

    try {
      const result = await callStructured(
        ContradictionSchema,
        "audit_contradiction",
        {
          systemPrompt: CONTRADICTION_SYSTEM_PROMPT,
          userPrompt,
        },
      );

      totalTokens += result.usage.totalTokens;
      totalCost += result.usage.costUsd ?? 0;

      if (result.data.contradicts) {
        contradictions.push({
          a: { id: a.frontmatter.id, title: a.frontmatter.title },
          b: { id: b.frontmatter.id, title: b.frontmatter.title },
          summary: result.data.summary ?? "Contradiction detected",
          suggestedFix: result.data.suggestedFix ?? "",
        });
      }
    } catch (err) {
      logger.warn("Audit LLM contradiction failed", {
        a: a.frontmatter.id,
        b: b.frontmatter.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const alreadyLinkedAB = noteContainsRelatedLink(a, b.frontmatter.id);
    const alreadyLinkedBA = noteContainsRelatedLink(b, a.frontmatter.id);
    if (alreadyLinkedAB && alreadyLinkedBA) continue;

    try {
      const result = await callStructured(CrossrefSchema, "audit_crossref", {
        systemPrompt: CROSSREF_SYSTEM_PROMPT,
        userPrompt: buildCrossrefPrompt(a, b, shared),
      });

      totalTokens += result.usage.totalTokens;
      totalCost += result.usage.costUsd ?? 0;

      if (result.data.shouldLink) {
        crossrefs.push({
          a: { id: a.frontmatter.id, title: a.frontmatter.title },
          b: { id: b.frontmatter.id, title: b.frontmatter.title },
          direction: result.data.direction ?? "both",
          reason: result.data.reason ?? `Shared tags: ${shared.join(", ")}`,
        });
      }
    } catch (err) {
      logger.warn("Audit LLM crossref failed", {
        a: a.frontmatter.id,
        b: b.frontmatter.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { contradictions, crossrefs, totalTokens, costUsd: totalCost };
}

function buildContradictionPrompt(a: VaultNote, b: VaultNote): string {
  return `
Note A: ${a.frontmatter.title}
---
${a.body.slice(0, 3000)}

Note B: ${b.frontmatter.title}
---
${b.body.slice(0, 3000)}
`;
}

function buildCrossrefPrompt(
  a: VaultNote,
  b: VaultNote,
  sharedTagList: string[],
): string {
  return `
Note A: ${a.frontmatter.title} (tags: ${a.frontmatter.tags.join(", ")})
---
${a.body.slice(0, 2000)}

Note B: ${b.frontmatter.title} (tags: ${b.frontmatter.tags.join(", ")})
---
${b.body.slice(0, 2000)}

Shared tags: ${sharedTagList.join(", ") || "(none)"}
`;
}

function renderReport(report: AuditReport): string {
  const parts: string[] = [
    "# Audit Report",
    "",
    `_Generated at ${report.generatedAt}_`,
    "",
    `- Orphan links: ${report.orphans.length}`,
    `- Stale raw drafts: ${report.staleRaw.length}`,
    `- Frontmatter drift: ${report.frontmatterDrift.length}`,
    `- Near duplicates: ${report.nearDuplicates.length}`,
    `- Contradictions: ${report.contradictions.length}`,
    `- Cross-reference suggestions: ${report.crossrefs.length}`,
    `- Applied fixes: ${report.appliedFixes.length}`,
    "",
  ];

  const style = config.obsidian.linkStyle;

  if (report.orphans.length > 0) {
    parts.push("## Orphan Links", "");
    parts.push(
      "> [!warning] These wikilinks don't resolve to any note. Fix casing or create the target.",
      "",
    );
    for (const o of report.orphans) {
      const fix = o.suggestion ? ` → try \`[[${o.suggestion}]]\`` : "";
      parts.push(`- [ ] \`${o.fromId}\` → \`${o.target}\`${fix}`);
    }
    parts.push("");
  }

  if (report.staleRaw.length > 0) {
    parts.push("## Stale Raw Drafts", "");
    parts.push(
      `> [!info] These drafts in \`00-raw/\` are older than ${config.audit.staleDays} days and have not been compiled into any topic.`,
      "",
    );
    for (const s of report.staleRaw) {
      parts.push(
        `- [ ] ${renderWikilinkById(s.id, s.title, style)} — ${s.ageDays} days old`,
      );
    }
    parts.push("");
  }

  if (report.frontmatterDrift.length > 0) {
    parts.push("## Frontmatter Drift", "");
    parts.push(
      "> [!warning] These notes have invalid or outdated frontmatter.",
      "",
    );
    for (const d of report.frontmatterDrift) {
      parts.push(`- [ ] \`${d.path}\` — ${d.error}`);
    }
    parts.push("");
  }

  if (report.nearDuplicates.length > 0) {
    parts.push("## Near Duplicates", "");
    parts.push(
      "> [!info] Pairs that share many concepts. Consider merging or cross-linking.",
      "",
    );
    for (const d of report.nearDuplicates) {
      parts.push(
        `- [ ] ${renderWikilinkById(d.a.id, d.a.title, style)} ↔ ${renderWikilinkById(d.b.id, d.b.title, style)} (Jaccard ${d.jaccard})`,
      );
    }
    parts.push("");
  }

  if (report.contradictions.length > 0) {
    parts.push("## Contradictions", "");
    for (const c of report.contradictions) {
      parts.push(
        "> [!warning] Contradiction",
        `> ${renderWikilinkById(c.a.id, c.a.title, style)} vs ${renderWikilinkById(c.b.id, c.b.title, style)}`,
        `> ${c.summary}`,
        c.suggestedFix ? `> Suggested fix: ${c.suggestedFix}` : "",
        "",
      );
    }
  }

  if (report.crossrefs.length > 0) {
    parts.push("## Missing Cross-References", "");
    parts.push(
      "> [!info] These note pairs look related. Consider adding `[[link]]` in Related.",
      "",
    );
    for (const c of report.crossrefs) {
      parts.push(
        `- [ ] ${renderWikilinkById(c.a.id, c.a.title, style)} ↔ ${renderWikilinkById(c.b.id, c.b.title, style)} (${c.direction}) — ${c.reason}`,
      );
    }
    parts.push("");
  }

  if (report.appliedFixes.length > 0) {
    parts.push("## Applied Fixes", "");
    for (const f of report.appliedFixes) parts.push(`- ${f}`);
    parts.push("");
  }

  parts.push(
    "## Machine-readable",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    "",
  );

  return parts.join("\n");
}

interface ApplyFixesInput {
  notes: VaultNote[];
  orphans: OrphanIssue[];
  crossrefs: CrossrefSuggestion[];
}

function applyOrphanCasingFixes(input: ApplyFixesInput): string[] {
  const applied: string[] = [];
  const style = config.obsidian.linkStyle;

  const byPath = new Map<string, VaultNote>();
  for (const n of input.notes) byPath.set(n.path, n);

  const fixByFromId = new Map<string, Map<string, string>>();

  for (const o of input.orphans) {
    if (!o.suggestion) continue;
    const bucket = fixByFromId.get(o.fromId) ?? new Map<string, string>();
    bucket.set(o.target, o.suggestion);
    fixByFromId.set(o.fromId, bucket);
  }

  for (const note of input.notes) {
    const fixes = fixByFromId.get(note.frontmatter.id);
    if (!fixes || fixes.size === 0) continue;

    let body = note.body;
    let changed = false;

    for (const [bad, good] of fixes) {
      const escaped = bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, "g");
      const target = input.notes.find((n) => n.frontmatter.id === good);
      if (!target) continue;

      const replacement = renderWikilinkById(
        good,
        target.frontmatter.title,
        style,
      );

      const nextBody = body.replace(regex, replacement);
      if (nextBody !== body) {
        body = nextBody;
        changed = true;
        applied.push(`${note.frontmatter.id}: [[${bad}]] → [[${good}]]`);
      }
    }

    if (changed) {
      const fileContents = matter.stringify(body, {
        ...note.frontmatter,
        updated_at: new Date().toISOString(),
      });
      fs.writeFileSync(note.path, fileContents);
    }
  }

  return applied;
}

function applyCrossrefs(input: ApplyFixesInput): string[] {
  const applied: string[] = [];
  const style = config.obsidian.linkStyle;

  const toAddMap = new Map<string, Set<string>>();

  const addEdge = (fromId: string, toId: string) => {
    const bucket = toAddMap.get(fromId) ?? new Set<string>();
    bucket.add(toId);
    toAddMap.set(fromId, bucket);
  };

  for (const c of input.crossrefs) {
    if (c.direction === "both" || c.direction === "a->b") {
      addEdge(c.a.id, c.b.id);
    }
    if (c.direction === "both" || c.direction === "b->a") {
      addEdge(c.b.id, c.a.id);
    }
  }

  for (const note of input.notes) {
    const targets = toAddMap.get(note.frontmatter.id);
    if (!targets || targets.size === 0) continue;

    const additions: string[] = [];

    for (const target of targets) {
      const targetNote = input.notes.find(
        (n) => n.frontmatter.id === target,
      );
      if (!targetNote) continue;
      if (noteContainsRelatedLink(note, target)) continue;

      additions.push(
        `- ${renderWikilinkById(target, targetNote.frontmatter.title, style)}`,
      );
    }

    if (additions.length === 0) continue;

    const updatedBody = appendRelated(note.body, additions);

    const fileContents = matter.stringify(updatedBody, {
      ...note.frontmatter,
      updated_at: new Date().toISOString(),
    });
    fs.writeFileSync(note.path, fileContents);

    applied.push(
      `${note.frontmatter.id}: +related ${additions.length} link(s)`,
    );
  }

  return applied;
}

function appendRelated(body: string, additions: string[]): string {
  if (/^##\s+Related\s*$/m.test(body)) {
    return body.replace(/^(##\s+Related\s*\n)([\s\S]*?)(?=\n##\s+|$)/m, (_, hdr, section) => {
      const existing = section.trimEnd();
      const combined = existing
        ? `${existing}\n${additions.join("\n")}\n`
        : `${additions.join("\n")}\n`;
      return `${hdr}${combined}`;
    });
  }

  return `${body.trimEnd()}\n\n## Related\n\n${additions.join("\n")}\n`;
}

export interface AuditOptions {
  apply?: boolean;
  skipLlm?: boolean;
}

export async function audit(options: AuditOptions = {}): Promise<AuditReport> {
  const scan = scanVault([resolveNotesDir(), resolveTopicsDir()]);

  const orphans = detectOrphans(scan.notes);
  const staleRaw = detectStaleRaw();
  const drift = detectFrontmatterDrift();
  const nearDups = detectNearDuplicates(scan.notes);

  let contradictions: ContradictionIssue[] = [];
  let crossrefs: CrossrefSuggestion[] = [];
  let llmTokens = 0;
  let llmCost = 0;

  if (!options.skipLlm) {
    const llm = await runLlmChecks(scan.notes);
    contradictions = llm.contradictions;
    crossrefs = llm.crossrefs;
    llmTokens = llm.totalTokens;
    llmCost = llm.costUsd;
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    path: "",
    orphans,
    staleRaw,
    frontmatterDrift: drift,
    nearDuplicates: nearDups,
    contradictions,
    crossrefs,
    appliedFixes: [],
    llm: { totalTokens: llmTokens, costUsd: llmCost > 0 ? llmCost : undefined },
  };

  if (options.apply) {
    const orphanFixes = applyOrphanCasingFixes({
      notes: scan.notes,
      orphans,
      crossrefs,
    });

    const crossrefFixes = applyCrossrefs({
      notes: scan.notes,
      orphans,
      crossrefs,
    });

    report.appliedFixes = [...orphanFixes, ...crossrefFixes];
  }

  const tsSlug = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = resolveAuditPath(`${tsSlug}.md`);
  report.path = reportPath;

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, renderReport(report));

  logger.info("Audit complete", {
    path: reportPath,
    orphans: orphans.length,
    stale: staleRaw.length,
    drift: drift.length,
    nearDups: nearDups.length,
    contradictions: contradictions.length,
    crossrefs: crossrefs.length,
    applied: report.appliedFixes.length,
  });

  return report;
}

export const __testing = {
  jaccard,
  conceptSet,
  detectNearDuplicates,
  appendRelated,
  toSlug,
  dedupeCaseInsensitive,
};
