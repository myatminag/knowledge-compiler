import { describe, expect, test } from "bun:test";

import {
  extractVerbatimSnippets,
  formatVerbatimAppendix,
} from "../utils/verbatim";

describe("extractVerbatimSnippets", () => {
  test("captures fenced code blocks", () => {
    const input =
      "Here is some code:\n```python\nprint('hello')\n```\nAnd prose.";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets.some((s) => s.kind === "code-block")).toBe(true);
    expect(snippets.find((s) => s.kind === "code-block")?.content).toContain(
      "print('hello')",
    );
  });

  test("captures inline code", () => {
    const input = "Use the `git rebase -i` command carefully.";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets.some((s) => s.kind === "inline-code")).toBe(true);
  });

  test("captures inline math", () => {
    const input = "We compute $a^2 + b^2 = c^2$ in the loop.";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets.some((s) => s.kind === "math-inline")).toBe(true);
  });

  test("captures block math", () => {
    const input = "Before.\n$$\n\\int_0^1 x^2 dx = 1/3\n$$\nAfter.";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets.some((s) => s.kind === "math-block")).toBe(true);
  });

  test("captures equation-like lines", () => {
    const input =
      "Scaled dot-product attention:\nsoftmax(QK^T / sqrt(d_k)) V = output";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets.some((s) => s.kind === "equation")).toBe(true);
  });

  test("ignores prose sentences without equation markers", () => {
    const input = "This is a normal sentence with no code or math.";
    const snippets = extractVerbatimSnippets(input);
    expect(snippets).toHaveLength(0);
  });

  test("dedupes identical snippets", () => {
    const input = "`foo` then `foo` again.";
    const snippets = extractVerbatimSnippets(input);
    const inlineCount = snippets.filter((s) => s.kind === "inline-code").length;
    expect(inlineCount).toBe(1);
  });
});

describe("formatVerbatimAppendix", () => {
  test("returns empty string when no snippets", () => {
    expect(formatVerbatimAppendix([])).toBe("");
  });

  test("groups snippets by kind with labels", () => {
    const appendix = formatVerbatimAppendix([
      { kind: "code-block", content: "```js\nconst x = 1;\n```" },
      { kind: "inline-code", content: "`foo`" },
    ]);

    expect(appendix).toContain("VERBATIM SNIPPETS");
    expect(appendix).toContain("Code blocks:");
    expect(appendix).toContain("Inline code:");
    expect(appendix).toContain("const x = 1;");
  });
});
