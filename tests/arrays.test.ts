import { describe, expect, test } from "bun:test";
import { unique, cleanArray, dedupeCaseInsensitive } from "../utils/arrays";

describe("array utils", () => {
  test("unique removes duplicates preserving order", () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  test("cleanArray trims, filters empty, and dedupes", () => {
    expect(cleanArray([" a ", "", "a", "b"])).toEqual(["a", "b"]);
  });

  test("dedupeCaseInsensitive ignores case and trims", () => {
    expect(dedupeCaseInsensitive(["Token", "token ", "Bucket"])).toEqual([
      "Token",
      "Bucket",
    ]);
  });
});
