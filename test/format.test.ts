import { describe, expect, it } from "vitest";
import { InputFile, formatFloat } from "../src/InputFile";
import { validFixtures } from "./fixtures";

// formatFloat keeps a decimal point and >= 4 decimals, adds decimals only to preserve
// precision, and drops them only to fit. The 10-column slot needs the result to be
// <= 9 chars so a separating space remains (our reader splits on whitespace).
describe("formatFloat", () => {
  it.each([
    [0, "0.0000"],
    [1.5, "1.5000"],
    [0.27083, "0.27083"], // extra decimals kept for precision
    [45000, "45000.000"], // 4th decimal dropped to fit 9 chars
    [102186.7, "102186.70"], // large thrust: trimmed to fit
    [-45000, "-45000.00"], // minus sign eats a column
    [3.14159265, "3.1415927"], // rounded to fit the slot
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
