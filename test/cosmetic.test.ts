import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { canonicalPath, cosmeticFixtures, validFixtures, validName } from "./fixtures";

// Cosmetic variants contain only spacing, padding, blank lines, rewrapped vectors, etc.
// They must parse without structural errors, match the corrected model in valid/, and
// serialize to the same canonical golden.
describe.each(cosmeticFixtures)("cosmetic $name", ({ name, dat }) => {
  const corrected = validName(name);
  const valid = validFixtures.find((f) => f.name === corrected);

  it("has a matching valid/ fixture", () => {
    expect(valid, `no valid/${corrected}.dat to pair with`).toBeDefined();
  });

  it("parses without structural errors", () => {
    const { report } = InputFile.parse(dat);
    expect(report.issues).toEqual([]);
  });

  it("parses to the same model as the corrected file", () => {
    const fromCosmetic = InputFile.parse(dat).file;
    const fromValid = InputFile.parse(valid!.dat).file;
    expect(fromCosmetic).toEqual(fromValid);
  });

  it("serializes to the shared canonical golden", async () => {
    const text = InputFile.parse(dat).file.serialize();
    await expect(text).toMatchFileSnapshot(canonicalPath(corrected));
  });
});
