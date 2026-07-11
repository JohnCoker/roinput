import { describe, expect, it } from "vitest";
import { cloneInputFile, writeScalar, writeVectorElement } from "../src/fieldBinding";
import { InputFile } from "../src/InputFile";
import { buildNavTree, findNavNode } from "../src/navTree";
import { validFixtures } from "./fixtures";

describe("n_stages resize", () => {
  it("restores trimmed stages when the count is raised again", () => {
    const multi = validFixtures.find((f) => f.name === "DATA-10A - US Units")!;
    const { file } = InputFile.parse(multi.dat);
    expect(file.stages).toHaveLength(4);

    const working = cloneInputFile(file);
    working.stages[3].tvcGimbal = 42;

    writeScalar(working, "n_stages", 2);
    expect(working.stages).toHaveLength(2);
    expect(working.trimmedStages).toHaveLength(2);

    writeScalar(working, "n_stages", 4);
    expect(working.stages).toHaveLength(4);
    expect(working.stages[3].tvcGimbal).toBe(42);
    expect(working.trimmedStages).toHaveLength(0);
  });

  it("marks a new default stage incomplete until breakpoint vectors are distinct", () => {
    const multi = validFixtures.find((f) => f.name === "DATA-10A - US Units")!;
    const { file } = InputFile.parse(multi.dat);
    const working = cloneInputFile(file);

    writeScalar(working, "n_stages", 5);
    const issues = working.validate();
    expect(
      issues.some((i) => i.stage === 5 && i.fieldId === "aoa" && /unique/.test(i.message)),
    ).toBe(true);
    expect(
      issues.some((i) => i.stage === 5 && i.fieldId === "mach" && /unique/.test(i.message)),
    ).toBe(true);

    const tree = buildNavTree(working, issues);
    expect(findNavNode(tree, "p3-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "p4-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "p5-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "p6-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "p7-s5")?.status).toBe("complete");
    expect(findNavNode(tree, "p8-s5")?.status).toBe("complete");

    writeVectorElement(working, "aoa", 0, "1", 5);
    writeVectorElement(working, "aoa", 1, "2", 5);
    writeVectorElement(working, "aoa", 2, "3", 5);
    const afterAoa = working.validate();
    expect(findNavNode(buildNavTree(working, afterAoa), "p3-s5")?.status).toBe(
      "incomplete",
    );
    expect(
      afterAoa.some((i) => i.stage === 5 && i.fieldId === "aoa" && /unique/.test(i.message)),
    ).toBe(false);
  });
});
