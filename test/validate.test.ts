import { describe, expect, it } from "vitest";
import {
  InputFile,
  type ChamberPressureEngine,
} from "../src/InputFile";
import { validFixtures } from "./fixtures";

describe.each(validFixtures)("validate $name", ({ dat }) => {
  it("has no validation errors", () => {
    const { file } = InputFile.parse(dat);
    expect(file.validate()).toEqual([]);
  });
});

const x15 = validFixtures.find((f) => f.name.includes("X-15 - US"))!;
const multi = validFixtures.find((f) => f.name === "DATA-10A - US Units")!;
const loadX15 = (): InputFile => InputFile.parse(x15.dat).file;
const loadMulti = (): InputFile => InputFile.parse(multi.dat).file;

function zeroCpEngine(): ChamberPressureEngine {
  return {
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
  };
}

describe("validation rules", () => {
  it("flags an out-of-range scalar", () => {
    const f = loadX15();
    f.launch.geodeticLatitude = 120;
    expect(f.validate().some((e) => e.fieldId === "geodetic_latitude")).toBe(true);
  });

  it("flags an out-of-range vector element with its index", () => {
    const f = loadX15();
    f.trajectory.angle[0] = 200;
    expect(
      f.validate().some((e) => e.fieldId === "traj_angle" && e.index === 0),
    ).toBe(true);
  });

  it("flags printout rate below the integration time step", () => {
    const f = loadX15();
    f.launch.integrationTimeStep = 0.01;
    f.launch.printoutRate = 0.001;
    expect(f.validate().some((e) => e.fieldId === "printout_rate")).toBe(true);
  });

  it("flags a non-zero first engine-history time", () => {
    const f = loadX15();
    f.engineHistory!.time[0] = 1;
    expect(
      f.validate().some((e) => e.fieldId === "history_time" && e.index === 0),
    ).toBe(true);
  });

  it("flags a glider stage that is not last", () => {
    const f = loadMulti();
    f.stages[0].engine = { kind: "none" };
    expect(
      f.validate().some((e) => e.fieldId === "engine_type" && e.stage === 1),
    ).toBe(true);
  });

  it("flags mixed engine models", () => {
    const f = loadMulti();
    f.stages[f.stages.length - 1].engine = zeroCpEngine();
    expect(
      f
        .validate()
        .some(
          (e) => e.fieldId === "engine_type" && /same engine model/.test(e.message),
        ),
    ).toBe(true);
  });

  it("reports required fields missing on an empty file", () => {
    expect(new InputFile().validate().length).toBeGreaterThan(0);
  });
});
