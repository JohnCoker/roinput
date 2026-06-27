import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { brokenFixtures } from "./fixtures";

// Broken fixtures have structural damage (a value added or dropped). Parsing must
// stop, report the problem, and quarantine the rest — never silently mis-read.
describe.each(brokenFixtures)("broken $name", ({ dat }) => {
  it("is flagged with a structural parse error", () => {
    const { report } = InputFile.parse(dat);
    expect(report.ok).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
