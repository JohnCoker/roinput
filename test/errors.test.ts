import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { validFixtures } from "./fixtures";

const x15 = validFixtures.find((f) => f.name.includes("X-15 - US"))!;
const titleLine = InputFile.parse(x15.dat).file.title;
const lines = (): string[] => x15.dat.split(/\r?\n/);

describe("crafted desyncs", () => {
  it("flags a count above its range", () => {
    const ls = lines();
    ls[2] = "99"; // n_aoa (valid range 3-8)
    const { report } = InputFile.parse(ls.join("\n"));
    expect(report.ok).toBe(false);
    expect(report.issues[0].message).toMatch(/Angles of Attack/i);
  });

  it("flags a short aero-table row", () => {
    const ls = lines();
    ls[6] = ls[6].trim().split(/\s+/).slice(0, 4).join("  "); // drop one CN value
    const { report } = InputFile.parse(ls.join("\n"));
    expect(report.ok).toBe(false);
    expect(report.issues[0].message).toMatch(/row/i);
  });

  it("flags truncation (early EOF)", () => {
    const { report } = InputFile.parse(lines().slice(0, 10).join("\n"));
    expect(report.ok).toBe(false);
    expect(report.issues[0].message).toMatch(/end of file/i);
  });

  it("flags a non-numeric value instead of silently storing NaN", () => {
    const ls = lines();
    ls[5] = ls[5].replace(/[\d.]+/, "12x.3"); // garble a value in the AoA vector
    const { report } = InputFile.parse(ls.join("\n"));
    expect(report.ok).toBe(false);
    expect(report.issues[0].message).toMatch(/found "12x\.3"/i);
  });

  it("keeps the good prefix and quarantines the rest", () => {
    const ls = lines();
    ls[2] = "99";
    const { file } = InputFile.parse(ls.join("\n"));
    expect(file.title).toBe(titleLine);
    expect(file.stages.length).toBe(0); // failed inside stage 1 aero, nothing committed
  });
});
