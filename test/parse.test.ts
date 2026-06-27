import { describe, expect, it } from "vitest";
import { InputFile } from "../src/InputFile";
import { validFixtures } from "./fixtures";
import { parseOutEcho } from "./outEcho";

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-3 + 1e-4 * Math.abs(b);
}

function expectVec(actual: number[], expected: number[], label: string): void {
  expect(actual.length, `${label} length`).toBe(expected.length);
  actual.forEach((v, i) => {
    expect(close(v, expected[i]), `${label}[${i}]: ${v} != ${expected[i]}`).toBe(true);
  });
}

function expectMat(actual: number[][], expected: number[][], label: string): void {
  expect(actual.length, `${label} rows`).toBe(expected.length);
  actual.forEach((row, r) => expectVec(row, expected[r], `${label}[${r}]`));
}

describe.each(validFixtures)("parse $name", ({ dat, out }) => {
  const { file, report } = InputFile.parse(dat);
  const echo = parseOutEcho(out);

  it("parses without structural errors", () => {
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("matches the .out echo header", () => {
    expect(file.title).toBe(echo.title);
    expect(file.stages.length).toBe(echo.nStages);
    expect(file.units).toBe(echo.units);
    expect(file.aeroType).toBe(echo.aeroType);
  });

  it("matches the .out echo aero tables", () => {
    echo.stages.forEach((es, i) => {
      const s = file.stages[i];
      expectVec(s.aoa, es.aoa, `stage ${i + 1} aoa`);
      expectVec(s.mach, es.mach, `stage ${i + 1} mach`);
      expectMat(s.cn, es.cn, `stage ${i + 1} cn`);
      expectMat(s.ca, es.ca, `stage ${i + 1} ca`);
      expectMat(s.cp, es.cp, `stage ${i + 1} cp`);
      expectVec(s.dcaOff, es.dcaOff, `stage ${i + 1} dcaOff`);
      expectVec(s.weight, es.weight, `stage ${i + 1} weight`);
      expectVec(s.cg, es.cg, `stage ${i + 1} cg`);
      expectVec(s.inertia, es.inertia, `stage ${i + 1} inertia`);
    });
  });

  it("matches the .out echo engine history and trajectory", () => {
    if (echo.history) {
      expect(file.engineHistory).toBeDefined();
      expectVec(file.engineHistory!.time, echo.history.time, "history time");
      expectVec(file.engineHistory!.value, echo.history.value, "history value");
    }
    expectVec(file.trajectory.time, echo.trajectory.time, "traj time");
    expectVec(file.trajectory.angle, echo.trajectory.angle, "traj angle");
    expectVec(file.trajectory.bank, echo.trajectory.bank, "traj bank");
  });

  it("matches the .out echo nose radius when present", () => {
    if (echo.noseRadius !== undefined) {
      expect(file.launch.noseRadius).not.toBeNull();
      expect(close(file.launch.noseRadius!, echo.noseRadius)).toBe(true);
    }
  });
});
