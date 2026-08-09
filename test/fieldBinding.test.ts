import { describe, expect, it } from "vitest";
import {
  choiceOptions,
  cloneInputFile,
  displayLabel,
  displayLabelLines,
  fieldHidden,
  formatScalarValue,
  writeScalar,
  writeVectorElement,
} from "../src/fieldBinding";
import { InputFile } from "../src/InputFile";
import { field } from "../src/metadata";
import { buildNavTree, findNavNode } from "../src/navTree";
import { validFixtures } from "./fixtures";

describe("fieldHidden", () => {
  it("always hides initial_heading_azimuth", () => {
    const conventional = new InputFile();
    conventional.launch.mode = "conventional";
    const vertical = new InputFile();
    vertical.launch.mode = "vertical";
    const def = field("initial_heading_azimuth");
    expect(fieldHidden(conventional, def)).toBe(true);
    expect(fieldHidden(vertical, def)).toBe(true);
  });
});

describe("choiceOptions", () => {
  it("lists Yes before No for nose_heating_model", () => {
    const file = new InputFile();
    const options = choiceOptions(file, field("nose_heating_model"));
    expect(options?.map((o) => o.label)).toEqual(["Yes", "No"]);
    expect(options?.map((o) => o.value)).toEqual([1, 0]);
  });

  it("lists angle-of-attack trajectory control before pitch attitude", () => {
    const file = new InputFile();
    const options = choiceOptions(file, field("traj_control"));
    expect(options?.map((o) => o.value)).toEqual([1, 0]);
  });

  it("wraps thrust time history engine type across four lines", () => {
    const file = new InputFile();
    const options = choiceOptions(file, field("engine_type"));
    expect(options?.[2].labelLines).toEqual([
      "Thrust Time History Model",
      "Thrust Variation with",
      "Altitude Using Nozzle Exit",
      "Area",
    ]);
    expect(options?.[2].label).not.toContain("–");
  });
});

describe("formatScalarValue", () => {
  it("formats floats like the file writer", () => {
    const def = field("initial_altitude");
    expect(formatScalarValue(385, def)).toBe("385.0");
    expect(formatScalarValue(1.2, def)).toBe("1.2");
    expect(formatScalarValue(null, def)).toBe("");
  });

  it("leaves integers unformatted", () => {
    expect(formatScalarValue(5, field("n_aoa"))).toBe("5");
    expect(formatScalarValue(15, field("n_mach"))).toBe("15");
  });

  it("formats vector and matrix cells the same as scalars", () => {
    const def = field("cn");
    expect(formatScalarValue(0, def)).toBe("0.0");
    expect(formatScalarValue(-15, def)).toBe("-15.0");
  });
});

describe("displayLabel unit suffixes", () => {
  it("adds launch and integration units in English", () => {
    const file = new InputFile();
    file.units = "english";
    file.launch.mode = "vertical";
    expect(displayLabel(file, field("initial_velocity"))).toBe("Initial Velocity (ft/sec)");
    expect(displayLabel(file, field("nose_radius"))).toBe("Nose Radius (ft)");
    expect(displayLabel(file, field("integration_time_step"))).toBe(
      "Integration Time Step (sec)",
    );
    expect(displayLabel(file, field("total_time"))).toBe(
      "Total Time for Trajectory Run (sec)",
    );
    expect(displayLabel(file, field("geodetic_latitude"))).toBe("Geodetic Latitude (deg)");
    expect(displayLabel(file, field("launch_azimuth"))).toBe("Launch Azimuth (deg)");
  });

  it("labels launch azimuth as Initial Heading in conventional mode", () => {
    const file = new InputFile();
    file.units = "english";
    file.launch.mode = "conventional";
    expect(displayLabel(file, field("launch_azimuth"))).toBe("Initial Heading (deg)");
  });

  it("uses the shorter printout label", () => {
    expect(displayLabel(new InputFile(), field("printout_rate"))).toBe(
      "Printout Output Rate (every x sec)",
    );
  });

  it("uses chamber pressure time history points label", () => {
    const file = new InputFile();
    file.stages = [
      {
        ...new InputFile().stages[0],
        engine: {
          kind: "chamberPressure",
          throatArea: 1,
          nozzleExpansionRatio: 1,
          nozzleDivergenceHalfAngle: 1,
          burnTime: 1,
          refThrust: 1,
          refSpecificImpulse: 1,
          refChamberPressure: 1,
          refAtmPressure: 1,
          ratioSpecificHeats: 1,
          thrustCoeffRatio: 1,
          nozzleType: 1,
          negativeThrust: false,
        },
      },
    ];
    expect(displayLabel(file, field("n_history"))).toBe(
      "Number of Chamber Pressure Time History Points",
    );
  });

  it("splits thrust vectoring labels across two lines", () => {
    const file = new InputFile();
    file.units = "english";
    expect(displayLabelLines(file, field("tvc_gimbal"))).toEqual([
      "Thrust Vectoring Gimbal Location",
      "(inches from nose tip)",
    ]);
    expect(displayLabelLines(file, field("tvc_percent"))).toEqual([
      "Percent of Thrust for Pitch Thrust Vectoring",
      "Enter 1.0 for 100%, 0.5 for 50%",
    ]);
    expect(displayLabelLines(file, field("tvc_maxangle"))).toEqual([
      "Maximum Thrust Vector Angle (deg)",
      "",
    ]);
    expect(displayLabel(file, field("tvc_percent"))).toBe(
      "Percent of Thrust for Pitch Thrust Vectoring Enter 1.0 for 100%, 0.5 for 50%",
    );
    expect(displayLabel(file, field("tvc_maxangle"))).toBe(
      "Maximum Thrust Vector Angle (deg)",
    );
  });

  it("adds SI velocity, length, and thrust units", () => {
    const file = new InputFile();
    file.units = "si";
    expect(displayLabel(file, field("initial_velocity"))).toBe("Initial Velocity (m/sec)");
    expect(displayLabel(file, field("nose_radius"))).toBe("Nose Radius (m)");
    expect(displayLabel(file, field("ref_thrust"))).toBe("Reference Thrust (newtons)");
  });

  it("adds engine-history value units", () => {
    const thrust = new InputFile();
    thrust.units = "english";
    thrust.stages = [
      {
        ...new InputFile().stages[0],
        engine: { kind: "thrustHistory", burnTime: 1, nozzleExitArea: 1, refAtmPressure: 1, negativeThrust: false },
      },
    ];
    expect(displayLabel(thrust, field("history_value"))).toBe("Thrust (lbs)");

    const chamber = new InputFile();
    chamber.units = "si";
    chamber.stages = [
      {
        ...new InputFile().stages[0],
        engine: {
          kind: "chamberPressure",
          throatArea: 1,
          nozzleExpansionRatio: 1,
          nozzleDivergenceHalfAngle: 1,
          burnTime: 1,
          refThrust: 1,
          refSpecificImpulse: 1,
          refChamberPressure: 1,
          refAtmPressure: 1,
          ratioSpecificHeats: 1,
          thrustCoeffRatio: 1,
          nozzleType: "bell",
          negativeThrust: false,
        },
      },
    ];
    expect(displayLabel(chamber, field("history_value"))).toBe("Chamber Pressure (MPa)");
  });
});

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
      issues.some(
        (i) => i.stage === 5 && i.fieldId === "aoa" && /default zero/.test(i.message),
      ),
    ).toBe(true);
    expect(
      issues.some(
        (i) => i.stage === 5 && i.fieldId === "mach" && /default zero/.test(i.message),
      ),
    ).toBe(true);

    const tree = buildNavTree(working, issues);
    expect(findNavNode(tree, "aero_data-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "normal_force_coef-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "axial_force_coef-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "center_of_pressure-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "cg_and_inertia-s5")?.status).toBe("incomplete");
    expect(findNavNode(tree, "thrust_vectoring-s5")?.status).toBe("complete");
    expect(findNavNode(tree, "stage_data-s5")?.status).toBe("incomplete");

    writeVectorElement(working, "aoa", 0, "1", 5);
    writeVectorElement(working, "aoa", 1, "2", 5);
    writeVectorElement(working, "aoa", 2, "3", 5);
    const afterAoa = working.validate();
    expect(findNavNode(buildNavTree(working, afterAoa), "aero_data-s5")?.status).toBe(
      "incomplete",
    );
    expect(
      afterAoa.some((i) => i.stage === 5 && i.fieldId === "aoa" && /unique/.test(i.message)),
    ).toBe(false);
  });
});
