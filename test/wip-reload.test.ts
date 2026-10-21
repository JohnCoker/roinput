import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createDefaultStage } from "../src/fieldBinding";
import { InputFile } from "../src/InputFile";
import { fields } from "../src/metadata";
import { buildNavTree, type NodeStatus } from "../src/navTree";

function leafStatus(file: InputFile, pageId: string): NodeStatus | undefined {
  const issues = file.validate();
  const walk = (nodes: ReturnType<typeof buildNavTree>): NodeStatus | undefined => {
    for (const n of nodes) {
      if (n.kind === "leaf" && n.pageId === pageId) return n.status;
      if (n.kind === "branch") {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(buildNavTree(file, issues));
}

describe("WIP save reload outline", () => {
  it("new file vs reloaded: placeholder zeros mark WIP pages incomplete", () => {
    const fresh = new InputFile();
    fresh.stages = [createDefaultStage()];

    expect(leafStatus(fresh, "configuration")).toBe("incomplete");
    expect(leafStatus(fresh, "cg_and_inertia")).toBe("incomplete");
    expect(leafStatus(fresh, "stage_data")).toBe("incomplete");
    expect(leafStatus(fresh, "trajectory_control")).toBe("incomplete");

    fresh.title = "Foo";
    expect(leafStatus(fresh, "configuration")).toBe("complete");

    const { file: loaded } = InputFile.parse(fresh.serialize());

    expect(leafStatus(loaded, "cg_and_inertia")).toBe("incomplete");
    expect(leafStatus(loaded, "stage_data")).toBe("incomplete");
    expect(leafStatus(loaded, "trajectory_control")).toBe("incomplete");
  });

  it("keeps thrust vectoring incomplete until its page has been left", () => {
    const fresh = new InputFile();
    fresh.stages = [createDefaultStage()];
    expect(leafStatus(fresh, "aero_notes")).toBe("complete");
    expect(leafStatus(fresh, "thrust_vectoring")).toBe("incomplete");

    const { file: reloadedTemplate } = InputFile.parse(fresh.serialize());
    expect(leafStatus(reloadedTemplate, "thrust_vectoring")).toBe("incomplete");

    fresh.stages[0].tvcVisited = true;
    expect(leafStatus(fresh, "thrust_vectoring")).toBe("complete");

    fresh.stages[0].tvcVisited = false;
    fresh.stages[0].aoa = [0, 5, 10];
    const { file: reloadedWithAero } = InputFile.parse(fresh.serialize());
    expect(leafStatus(reloadedWithAero, "thrust_vectoring")).toBe("complete");
  });

  it("matches expected page status after round-trip with title only", () => {
    const file = new InputFile();
    file.title = "Foo";
    file.stages = [createDefaultStage()];
    const text = file.serialize();
    const { file: loaded, report } = InputFile.parse(text);
    expect(report.ok).toBe(true);
    expect(loaded.title).toBe("Foo");

    expect(leafStatus(loaded, "configuration")).toBe("complete");
    expect(leafStatus(loaded, "aero_data")).toBe("incomplete");
    expect(leafStatus(loaded, "cg_and_inertia")).toBe("incomplete");
    expect(leafStatus(loaded, "stage_data")).toBe("incomplete");
    expect(leafStatus(loaded, "launch_setup")).toBe("error");
    expect(leafStatus(loaded, "trajectory_control")).toBe("incomplete");

    const launchIssues = loaded
      .validate()
      .filter((i) => fields.find((f) => f.id === i.fieldId)?.pageId === "launch_setup");
    expect(launchIssues.some((i) => /must not be zero/.test(i.message))).toBe(true);
  });
});

