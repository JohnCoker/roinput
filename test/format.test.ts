import { describe, expect, it } from "vitest";
import { InputFile, formatFloat } from "../src/InputFile";
import { validFixtures } from "./fixtures";

// formatFloat keeps a decimal point, trims trailing zeros (1.2 not 1.2000), uses at
// least one decimal (1 → 1.0), adds decimals only to preserve precision, and drops
// them only to fit the 9-char slot cap.
describe("formatFloat", () => {
  it.each([
    [0, "0.0"],
    [1, "1.0"],
    [1.2, "1.2"],
    [1.5, "1.5"],
    [385, "385.0"],
    [0.27083, "0.27083"],
    [45000, "45000.0"],
    [102186.7, "102186.7"],
    [-45000, "-45000.0"],
    [3.14159265, "3.1415927"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatFloat(input)).toBe(expected);
  });

  it.each([0, 1.5, 0.27083, 45000, 102186.7, -45000, 3.14159265, -0.5784])(
    "keeps %p within 9 chars (a separating space remains)",
    (x) => {
      expect(formatFloat(x).length).toBeLessThanOrEqual(9);
    },
  );

  // Characterization of the known limit: beyond ~7 integer digits even one decimal
  // overflows the slot, so values this large (well outside any field's valid range)
  // cannot keep their separating space. Documented so the limit is intentional.
  it("cannot fit magnitudes beyond the slot width", () => {
    expect(formatFloat(-1234567.8).length).toBeGreaterThan(9);
  });
});

// Data-driven guarantee: every numeric cell our serializer emits for a real file is
// <= 9 chars, so no two adjacent values ever abut in their 10-column slots.
describe("serialized columns keep a separating space", () => {
  it.each(validFixtures)("$name", ({ dat }) => {
    const text = InputFile.parse(dat).file.serialize();
    for (const line of text.split(/\r?\n/)) {
      for (const tok of line.trim().split(/\s+/).filter(Boolean)) {
        if (Number.isFinite(Number(tok))) {
          expect(tok.length).toBeLessThanOrEqual(9);
        }
      }
    }
  });
});
