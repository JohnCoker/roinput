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

  it("shows launch mode descriptions with mode-specific compass line", () => {
    const conventional = new InputFile();
    conventional.launch.mode = "conventional";
    const vertical = new InputFile();
    vertical.launch.mode = "vertical";
    const copyConventional = resolvePageCopy("launch_setup", conventional);
    const copyVertical = resolvePageCopy("launch_setup", vertical);
    expect(copyConventional?.heading).toContain("Conventional Flight");
    expect(copyConventional?.heading).toContain("Vertical Launch");
    expect(copyConventional?.heading).toContain("Initial Heading");
    expect(copyVertical?.heading).toContain("Launch Azimuth");
    expect(copyVertical?.heading).not.toContain("Initial Heading - True North");
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
    expect(copy?.heading).toBe("Enter drag coefficient.");
  });

  it("keeps commas inside the stage_data heading", () => {
    const copy = resolvePageCopy("stage_data", new InputFile());
    expect(copy?.heading).toBe(
      "Enter stage timing, aerodynamic reference area, weights, and rocket engine model type.",
    );
    expect(copy?.footing).toContain("Rocket engine can be liquid rocket engine");
    expect(copy?.footing).not.toContain("engine model type is 0");
  });

  it("uses comma in coefficient page footing", () => {
    const copy = resolvePageCopy("normal_force_coef", new InputFile());
    expect(copy?.footing).toBe("Mach number = rows, angle of attack = columns.");
  });

  it("uses commas in CG and Inertia footing", () => {
    const copy = resolvePageCopy("cg_and_inertia", new InputFile());
    expect(copy?.footing).toContain("will still run, thrust vector angle");
    expect(copy?.footing).toContain("will still run, time-to-double-amplitude");
  });

  it("orders configuration footing like the radio buttons", () => {
    const copy = resolvePageCopy("configuration", new InputFile());
    expect(copy?.footing).toContain("CL/CD/CP or CN/CA/CP");
  });

  it("uses lowercase fly-back booster note on stage_data", () => {
    const copy = resolvePageCopy("stage_data", new InputFile());
    expect(copy?.footing).toContain("Negative thrust is for fly-back boosters.");
  });

  it("adds the to engine history footing", () => {
    const file = InputFile.parse(validFixtures[0].dat).file;
    const copy = resolvePageCopy("engine_time_history", file);
    expect(copy?.footing).toContain("less than the total time");
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
