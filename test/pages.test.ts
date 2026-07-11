import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { pageNumbers, pageRows, resolvePageCopy } from "../src/pages";
import { validFixtures } from "./fixtures";

describe("pages.csv", () => {
  it("loads all 12 pages", () => {
    expect(pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(pageRows.length).toBeGreaterThanOrEqual(12);
  });

  it("resolves CN/CA branch notes on page 2", () => {
    const file = new InputFile();
    file.aeroType = "cnca";
    const copy = resolvePageCopy(2, file);
    expect(copy?.heading).toContain("delta axial force");
    expect(copy?.heading).not.toContain("delta drag coefficient increment is then added");
  });

  it("resolves launch mode heading on page 9", () => {
    const file = new InputFile();
    file.launch.mode = "vertical";
    const copy = resolvePageCopy(9, file);
    expect(copy?.heading).toContain("Vertical launch");
  });

  it("keeps commas inside the page 10 heading", () => {
    const copy = resolvePageCopy(10, new InputFile());
    expect(copy?.heading).toBe(
      "Enter stage timing, weights, reference area, and engine model.",
    );
    expect(copy?.footing).toBe(
      "If engine model type is 0 (no engine), there are no further engine inputs for that stage.",
    );
  });

  it("hides page 11 when unpowered", () => {
    const file = InputFile.parse(validFixtures[0].dat).file;
    const glider = new InputFile();
    glider.stages = [{ ...file.stages[0], engine: { kind: "none" } }];
    expect(resolvePageCopy(11, glider)).toBeNull();
  });
});
