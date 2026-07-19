import { describe, expect, it } from "vitest";
import { displayLabel } from "../src/fieldBinding";
import { InputFile } from "../src/InputFile";
import { field } from "../src/metadata";
import { PAGE_IDS, pageRows, resolvePageCopy } from "../src/pages";
import { validFixtures } from "./fixtures";

describe("pages.csv", () => {
  it("loads all page ids", () => {
    expect(PAGE_IDS).toHaveLength(13);
    expect(new Set(pageRows.map((r) => r.id)).size).toBe(13);
  });

  it("resolves CN/CA branch notes on aero_notes", () => {
    const file = new InputFile();
    file.aeroType = "cnca";
    const copy = resolvePageCopy("aero_notes", file);
    expect(copy?.heading).toContain("delta axial force");
    expect(copy?.heading).not.toContain("delta drag coefficient increment is then added");
  });

  it("resolves CL/CD branch notes on aero_notes without axial-force wording", () => {
    const file = new InputFile();
    file.aeroType = "clcd";
    const copy = resolvePageCopy("aero_notes", file);
    expect(copy?.heading).toContain("delta drag coefficient increment");
    expect(copy?.heading).not.toContain(
      "Power-off delta axial force increment is assumed constant",
    );
  });

  it("shows all launch mode descriptions on launch_setup", () => {
    const conventional = new InputFile();
    conventional.launch.mode = "conventional";
    const vertical = new InputFile();
    vertical.launch.mode = "vertical";
    const copyConventional = resolvePageCopy("launch_setup", conventional);
    const copyVertical = resolvePageCopy("launch_setup", vertical);
    expect(copyConventional?.heading).toContain("Conventional Flight");
    expect(copyConventional?.heading).toContain("Vertical Launch");
    expect(copyConventional?.heading).toContain("Launch Azimuth");
    expect(copyVertical?.heading).toBe(copyConventional?.heading);
  });

  it("resolves CL branch title on normal_force_coef", () => {
    const file = new InputFile();
    file.aeroType = "clcd";
    const copy = resolvePageCopy("normal_force_coef", file);
    expect(copy?.title).toBe("Lift Coefficient");
    expect(copy?.heading).toBe("Enter lift coefficient.");
  });

  it("resolves Drag Coefficient branch on axial_force_coef", () => {
    const file = new InputFile();
    file.aeroType = "clcd";
    const copy = resolvePageCopy("axial_force_coef", file);
    expect(copy?.title).toBe("Drag Coefficient");
    expect(copy?.heading).toBe("Enter the drag coefficient.");
  });

  it("keeps commas inside the stage_data heading", () => {
    const copy = resolvePageCopy("stage_data", new InputFile());
    expect(copy?.heading).toBe(
      "Enter stage timing, aerodynamic reference area, weights, and rocket engine model type.",
    );
    expect(copy?.footing).toContain("Rocket engine can be liquid rocket engine");
    expect(copy?.footing).not.toContain("engine model type is 0");
  });

  it("extends trajectory_control footing", () => {
    const copy = resolvePageCopy("trajectory_control", new InputFile());
    expect(copy?.footing).toContain("Last time must be equal to the total run time");
  });

  it("hides engine_time_history when unpowered", () => {
    const file = InputFile.parse(validFixtures[0].dat).file;
    const glider = new InputFile();
    glider.stages = [{ ...file.stages[0], engine: { kind: "none" } }];
    expect(resolvePageCopy("engine_time_history", glider)).toBeNull();
  });
});

describe("displayLabel unit suffixes", () => {
  it("adds English units to CG and weight", () => {
    const file = new InputFile();
    file.units = "english";
    expect(displayLabel(file, field("weight"))).toBe("Weight (lbs)");
    expect(displayLabel(file, field("cg"))).toBe(
      "Center of Gravity (CG) – (inches from nose tip)",
    );
  });

  it("adds SI units to stage aerodynamic reference area", () => {
    const file = new InputFile();
    file.units = "si";
    expect(displayLabel(file, field("aero_ref_area"))).toBe(
      "Stage Aerodynamic Reference Area (m²)",
    );
  });
});
