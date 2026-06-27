// Extracts the labeled input echo that RASOrbit writes at the top of each .out file.
// This is an independent oracle for the parse test: it is how RASOrbit itself reads
// the .dat, so matching it proves our reader (especially the matrix orientation)
// agrees with the simulator, not just with our own writer.

import type { AeroType, Units } from "../src/InputFile";

export interface OutStage {
  aoa: number[];
  mach: number[];
  cn: number[][];
  ca: number[][];
  cp: number[][];
  dcaOff: number[];
  weight: number[];
  cg: number[];
  inertia: number[];
}

export interface OutEcho {
  title: string;
  nStages: number;
  units: Units;
  aeroType: AeroType;
  stages: OutStage[];
  noseRadius?: number;
  history?: { time: number[]; value: number[] };
  trajectory: { time: number[]; angle: number[]; bank: number[] };
}

function findIdx(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

function findBefore(lines: string[], re: RegExp, before: number): number {
  let found = -1;
  for (let i = 0; i < before; i++) {
    if (re.test(lines[i])) found = i;
  }
  return found;
}

/**
 * Collect whitespace-separated numbers from the lines after `headerIdx`. Leading
 * blank lines are skipped (the echo separates some labels from their values with a
 * blank line), then numeric lines are gathered until the next blank/non-numeric line.
 */
function numbersAfter(lines: string[], headerIdx: number): number[] {
  const nums: number[] = [];
  if (headerIdx < 0) return nums;
  let i = headerIdx + 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") break;
    if (!/^[-+.\d]/.test(t)) break;
    for (const tok of t.split(/\s+/)) nums.push(Number(tok));
  }
  return nums;
}

function reshape(flat: number[], rows: number, cols: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    out.push(flat.slice(r * cols, r * cols + cols));
  }
  return out;
}

function stageRe(prefix: string, s: number): RegExp {
  return new RegExp(`${prefix} FOR STAGE:\\s*${s}\\b`);
}

export function parseOutEcho(text: string): OutEcho {
  const lines = text.split(/\r?\n/);
  const title = (lines[0] ?? "").trim();
  const nStages = Number(/NUMBER OF STAGES:\s*(\d+)/.exec(text)![1]);
  const unitsLine = /^UNITS:\s*(.*)$/m.exec(text)![1];
  const units: Units = /SI/.test(unitsLine) ? "si" : "english";
  const aeroLine = /^AERO DATA:\s*(.*)$/m.exec(text)![1];
  const aeroType: AeroType = /^\s*CL/.test(aeroLine) ? "clcd" : "cnca";

  const stages: OutStage[] = [];
  for (let s = 1; s <= nStages; s++) {
    const aoa = numbersAfter(lines, findIdx(lines, stageRe("ANGLE OF ATTACK TABLE", s)));
    const mach = numbersAfter(lines, findIdx(lines, new RegExp(`^MACH TABLE FOR STAGE:\\s*${s}\\b`)));
    const rows = mach.length;
    const cols = aoa.length;
    const cnFlat = numbersAfter(lines, findIdx(lines, stageRe("^(?:NORMAL FORCE|LIFT) COEF DATA", s)));
    const caFlat = numbersAfter(lines, findIdx(lines, stageRe("^(?:AXIAL FORCE|DRAG) COEF DATA", s)));
    const cpFlat = numbersAfter(lines, findIdx(lines, stageRe("^CENTER OF PRESSURE DATA.*", s)));
    const dcaOff = numbersAfter(
      lines,
      findIdx(lines, stageRe("^POWER-OFF DELTA (?:AXIAL FORCE|DRAG) COEF DATA", s)),
    );
    const weight = numbersAfter(lines, findIdx(lines, stageRe("^WEIGHT TABLE.*", s)));
    const cg = numbersAfter(lines, findIdx(lines, stageRe("^X-CG DATA.*", s)));
    const inertia = numbersAfter(lines, findIdx(lines, stageRe("^PITCH INERTIA DATA.*", s)));
    stages.push({
      aoa,
      mach,
      cn: reshape(cnFlat, rows, cols),
      ca: reshape(caFlat, rows, cols),
      cp: reshape(cpFlat, rows, cols),
      dcaOff,
      weight,
      cg,
      inertia,
    });
  }

  const echo: OutEcho = {
    title,
    nStages,
    units,
    aeroType,
    stages,
    trajectory: { time: [], angle: [], bank: [] },
  };

  const noseM = /NOSE RADIUS[^:]*:\s*([-\d.]+)\s+(?:FEET|METERS)/.exec(text);
  if (noseM) echo.noseRadius = Number(noseM[1]);

  const histValIdx = findIdx(lines, /^(?:THRUST|CHAMBER PRESSURE)\s*\(/);
  if (histValIdx >= 0) {
    const histTimeIdx = findBefore(lines, /^TIME \(SEC\):/, histValIdx);
    echo.history = {
      time: numbersAfter(lines, histTimeIdx),
      value: numbersAfter(lines, histValIdx),
    };
  }

  const angleIdx = findIdx(lines, /^(?:ANGLE OF ATTACK|PITCH ATTITUDE) \(DEG\):/);
  const trajTimeIdx = findBefore(lines, /^TIME \(SEC\):/, angleIdx);
  const bankIdx = findIdx(lines, /^BANK ANGLE \(ROLL ANGLE\) \(DEG\):/);
  echo.trajectory = {
    time: numbersAfter(lines, trajTimeIdx),
    angle: numbersAfter(lines, angleIdx),
    bank: numbersAfter(lines, bankIdx),
  };

  return echo;
}
