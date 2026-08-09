import { describe, expect, it } from "vitest";
import { createDefaultStage } from "../src/fieldBinding";
import { InputFile } from "../src/InputFile";
import { canonicalPath, validFixtures } from "./fixtures";

describe("partial documents", () => {
  it("serializes a new in-progress file without validation", () => {
    const file = new InputFile();
    file.stages = [createDefaultStage()];
    const text = file.serialize();
    const { file: loaded, report } = InputFile.parse(text);
    expect(report.ok).toBe(true);
    expect(loaded.stages).toHaveLength(1);
    expect(loaded.launch.azimuth).toBe(0);
    expect(loaded.trajectory.time).toHaveLength(2);
  });
});

describe.each(validFixtures)("serialize $name", ({ name, dat }) => {
  const { file } = InputFile.parse(dat);

  it("round-trips on parsed values", () => {
    const reparsed = InputFile.parse(file.serialize()).file;
    expect(reparsed).toEqual(file);
  });

  it("is idempotent (serialize -> parse -> serialize)", () => {
    const once = file.serialize();
    const twice = InputFile.parse(once).file.serialize();
    expect(twice).toBe(once);
  });

  it("matches the canonical golden", async () => {
    await expect(file.serialize()).toMatchFileSnapshot(canonicalPath(name));
  });
});
