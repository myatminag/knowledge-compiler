import { describe, expect, test } from "bun:test";

import {
  extractWikilinkTargets,
  parseWikilink,
  renderWikilink,
  renderWikilinkById,
} from "../utils/obsidian-link";

describe("obsidian-link", () => {
  test("renderWikilink turns titles into pipe-form wikilinks", () => {
    expect(renderWikilink("API Gateway")).toBe("[[api-gateway|API Gateway]]");
  });

  test("renderWikilink collapses when slug equals display", () => {
    expect(renderWikilink("API Gateway", { displayOverride: "api-gateway" }))
      .toBe("[[api-gateway]]");
  });

  test("renderWikilink alias style keeps bare title form", () => {
    expect(renderWikilink("API Gateway", { style: "alias" }))
      .toBe("[[API Gateway]]");
  });

  test("renderWikilink handles already-wiki-formatted inputs", () => {
    expect(renderWikilink("[[API Gateway]]")).toBe(
      "[[api-gateway|API Gateway]]",
    );
    expect(renderWikilink("[[api-gateway|API Gateway]]")).toBe(
      "[[api-gateway|API Gateway]]",
    );
  });

  test("renderWikilinkById respects slug-title collapse", () => {
    expect(renderWikilinkById("rate-limiting", "Rate Limiting")).toBe(
      "[[rate-limiting|Rate Limiting]]",
    );
    expect(renderWikilinkById("rate-limiting", "rate-limiting")).toBe(
      "[[rate-limiting]]",
    );
  });

  test("parseWikilink splits slug|display pairs", () => {
    expect(parseWikilink("[[api-gateway|API Gateway]]")).toEqual({
      target: "api-gateway",
      display: "API Gateway",
      raw: "api-gateway|API Gateway",
    });

    expect(parseWikilink("[[API Gateway]]")).toEqual({
      target: "API Gateway",
      display: undefined,
      raw: "API Gateway",
    });
  });

  test("extractWikilinkTargets returns parsed links from prose", () => {
    const body =
      "See also [[api-gateway|API Gateway]] and [[rate-limiting]] for context.";
    const targets = extractWikilinkTargets(body).map((t) => t.target);
    expect(targets).toEqual(["api-gateway", "rate-limiting"]);
  });
});
