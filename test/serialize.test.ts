import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { canonicalPath, validFixtures } from "./fixtures";

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
