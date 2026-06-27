// Typed model + reader/writer for the RASOrbit .dat input file.
//
// The record sequence and fixed-column format are documented in metadata/SCHEMA.md;
// this file implements that sequence in hand-written code. metadata/fields.csv (via
// src/metadata.ts) supplies the validation bounds so they live in one place.
//
// Design notes:
// - The reader is lenient about intra-line spacing and trailing padding but honors
//   line boundaries (RASOrbit issues one READ per record, matrices one row per line).
// - On a structural problem (a count out of range, a short matrix row, an early EOF)
//   it stops, keeps the good prefix, and reports the failure in a LoadReport rather
//   than guessing past a desync (there is no reliable resync; see SCHEMA).
// - The writer is canonical: fixed 10-column slots, I2 ints, floats with >= 4 decimals
//   (more only when needed to preserve precision, fewer only to fit the slot). A
//   re-saved good file therefore normalizes but does not byte-match the hand-edited
//   original; round-trips are compared on parsed values.

import { field } from "./metadata";

export type Units = "si" | "english";
export type AeroType = "clcd" | "cnca";
export type LaunchMode = "conventional" | "vertical";
export type NozzleType = "conical" | "bell";
export type TrajControl = "pitchBank" | "aoaBank";

export interface ChamberPressureEngine {
  kind: "chamberPressure";
  throatArea: number;
  nozzleExpansionRatio: number;
  nozzleDivergenceHalfAngle: number;
  burnTime: number;
  refThrust: number;
  refSpecificImpulse: number;
  refChamberPressure: number;
  refAtmPressure: number;
  ratioSpecificHeats: number;
  thrustCoeffRatio: number;
  nozzleType: NozzleType;
  negativeThrust: boolean;
}

export interface ThrustHistoryEngine {
  kind: "thrustHistory";
  burnTime: number;
  nozzleExitArea: number;
  refAtmPressure: number;
  negativeThrust: boolean;
}

export type StageEngine =
  | { kind: "none" }
  | ChamberPressureEngine
  | ThrustHistoryEngine;

export interface Stage {
  // Pages 3-8 (aerodynamic data). Counts are implied by array lengths.
  aoa: number[];
  mach: number[];
  cn: number[][]; // [mach][aoa]
  ca: number[][];
  cp: number[][];
  dcaOff: number[]; // length = mach.length
  weight: number[];
  cg: number[];
  inertia: number[];
  tvcGimbal: number | null;
  tvcPercent: number | null;
  tvcMaxAngle: number | null;
  // Page 10 (stage / engine data).
  startTime: number | null;
  refArea: number | null;
  initialWeight: number | null;
  burnoutWeight: number | null;
  engine: StageEngine;
}

export interface Launch {
  mode: LaunchMode;
  azimuth: number | null;
  noseHeatingModel: boolean;
  noseRadius: number | null;
  initialAltitude: number | null;
  initialVelocity: number | null;
  geodeticLatitude: number | null;
  longitude: number | null;
  initialPitch: number | null;
  initialHeadingAzimuth: number | null;
  initialBank: number | null;
  initialAoa: number | null;
  integrationTimeStep: number | null;
  totalTime: number | null;
  printoutRate: number | null;
}

export interface EngineHistory {
  time: number[];
  value: number[];
}

export interface Trajectory {
  control: TrajControl;
  time: number[];
  angle: number[];
  bank: number[];
}

export interface LoadIssue {
  message: string;
  /** 1-based file line where the trouble was detected, if known. */
  line?: number;
}

/** Immutable diagnostics from parsing. `ok` is true when nothing structural broke. */
export interface LoadReport {
  ok: boolean;
  issues: LoadIssue[];
}

export interface Issue {
  fieldId: string;
  /** 1-based stage number, when the field is per-stage. */
  stage?: number;
  /** 0-based position within a vector/matrix. */
  index?: number;
  severity: "error" | "warning";
  message: string;
}

/** Base for any problem detected while reading the file. Carries the 1-based file
 * line where it was found, when known. */
class ParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/** A stream desync (bad count, short row, early EOF): meaning shifts for everything
 * after it, so parsing must stop and quarantine the rest. */
class StructuralError extends ParseError {
  constructor(message: string, line?: number) {
    super(message, line);
    this.name = "StructuralError";
  }
}

/** A localized bad value: a malformed number or an out-of-range display enum code.
 * The line's token count is still correct, so this does NOT desync the stream. It
 * aborts today (one try/catch), but is typed distinctly so these can later be
 * collected and parsing continued without a resync. */
class FieldValueError extends ParseError {
  constructor(message: string, line?: number) {
    super(message, line);
    this.name = "FieldValueError";
  }
}

// ---- choice <-> code mappings -------------------------------------------------

function unitsFrom(code: number, line: number): Units {
  if (code === 0) return "si";
  if (code === 1) return "english";
  throw new FieldValueError(`Invalid units code ${code} (expected 0 or 1)`, line);
}
function unitsCode(u: Units): number {
  return u === "si" ? 0 : 1;
}

function aeroFrom(code: number, line: number): AeroType {
  if (code === 0) return "clcd";
  if (code === 1) return "cnca";
  throw new FieldValueError(`Invalid aero-data code ${code} (expected 0 or 1)`, line);
}
function aeroCode(a: AeroType): number {
  return a === "clcd" ? 0 : 1;
}

function launchModeFrom(code: number, line: number): LaunchMode {
  if (code === 0) return "conventional";
  if (code === 1) return "vertical";
  throw new FieldValueError(`Invalid launch-mode code ${code} (expected 0 or 1)`, line);
}
function launchModeCode(m: LaunchMode): number {
  return m === "conventional" ? 0 : 1;
}

function nozzleFrom(code: number, line: number): NozzleType {
  if (code === 1) return "conical";
  if (code === 2) return "bell";
  throw new FieldValueError(`Invalid nozzle-type code ${code} (expected 1 or 2)`, line);
}
function nozzleCode(n: NozzleType): number {
  return n === "conical" ? 1 : 2;
}

function trajFrom(code: number, line: number): TrajControl {
  if (code === 0) return "pitchBank";
  if (code === 1) return "aoaBank";
  throw new FieldValueError(
    `Invalid trajectory-control code ${code} (expected 0 or 1)`,
    line,
  );
}
function trajCode(t: TrajControl): number {
  return t === "pitchBank" ? 0 : 1;
}

function boolFrom(code: number, line: number, label: string): boolean {
  if (code === 0) return false;
  if (code === 1) return true;
  throw new FieldValueError(`Invalid ${label} code ${code} (expected 0 or 1)`, line);
}
function boolCode(b: boolean): number {
  return b ? 1 : 0;
}

// ---- write-format helpers -----------------------------------------------------

const SLOT = 10;
// Cap a float at 9 chars so its left-justified value always leaves >= 1 space in the
// 10-column slot. RASOrbit reads fixed columns, but our lenient reader splits on
// whitespace, so two full-width values (e.g. "45000.0000" + "793.8256") must not abut.
const FLOAT_WIDTH = SLOT - 1;

/**
 * Format a float for a 10-column slot: a decimal point is always present, with at
 * least 4 decimals (padded), more only if needed to represent the value exactly,
 * and fewer only when 4 would overflow the slot (e.g. large engine thrusts).
 */
export function formatFloat(x: number): string {
  let need = SLOT;
  for (let d = 0; d <= SLOT; d++) {
    if (Number(x.toFixed(d)) === x) {
      need = d;
      break;
    }
  }
  let dp = Math.max(4, need);
  let s = x.toFixed(dp);
  while (s.length > FLOAT_WIDTH && dp > 1) {
    dp--;
    s = x.toFixed(dp);
  }
  return s;
}

function floatCell(x: number): string {
  return formatFloat(x).padEnd(SLOT);
}
function intCell(x: number): string {
  return String(x).padStart(2).padEnd(SLOT);
}
function line(cells: string[]): string {
  return cells.join("").replace(/\s+$/, "");
}
function emitVector(out: string[], values: number[]): void {
  for (let i = 0; i < values.length; i += 8) {
    out.push(line(values.slice(i, i + 8).map(floatCell)));
  }
}

// ---- line-aware reader --------------------------------------------------------

class Reader {
  private readonly lines: string[];
  private idx = 0;

  constructor(text: string) {
    // Strip the legacy DOS end-of-file marker (Ctrl-Z, 0x1A) that these files carry.
    this.lines = text.replace(/\x1a/g, "").split(/\r?\n/);
  }

  /** First file line as the title (surrounding whitespace trimmed). */
  takeTitle(): string {
    const l = this.lines[this.idx] ?? "";
    this.idx++;
    return l.trim();
  }

  private skipBlank(): void {
    while (this.idx < this.lines.length && this.lines[this.idx].trim() === "") {
      this.idx++;
    }
  }

  atEnd(): boolean {
    this.skipBlank();
    return this.idx >= this.lines.length;
  }

  currentLineNo(): number {
    return this.idx + 1;
  }

  private nextTokens(): { tokens: string[]; lineNo: number } {
    this.skipBlank();
    if (this.idx >= this.lines.length) {
      throw new StructuralError(
        "Unexpected end of file while reading values",
        this.lines.length,
      );
    }
    const lineNo = this.idx + 1;
    const tokens = this.lines[this.idx].trim().split(/\s+/).filter(Boolean);
    this.idx++;
    return { tokens, lineNo };
  }

  /** Parse a numeric token, refusing non-finite junk so corruption never slips through. */
  private num(tok: string, lineNo: number): number {
    const v = Number(tok);
    if (!Number.isFinite(v)) {
      throw new FieldValueError(`Malformed number, found "${tok}"`, lineNo);
    }
    return v;
  }

  /** Read one integer count and range-check it against its field definition. */
  count(id: string): number {
    const def = field(id);
    const { tokens, lineNo } = this.nextTokens();
    return this.toCount(tokens[0], def.label, def.min, def.max, lineNo);
  }

  private toCount(
    tok: string | undefined,
    label: string,
    min: number | undefined,
    max: number | undefined,
    lineNo: number,
  ): number {
    if (tok === undefined) {
      throw new StructuralError(`Expected a value for ${label}`, lineNo);
    }
    const v = Number(tok);
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      throw new StructuralError(
        `Expected an integer for ${label}, found "${tok}"`,
        lineNo,
      );
    }
    if (min !== undefined && v < min) {
      throw new StructuralError(
        `${label} is ${v}, below the minimum of ${min} (likely a misaligned value)`,
        lineNo,
      );
    }
    if (max !== undefined && v > max) {
      throw new StructuralError(
        `${label} is ${v}, above the maximum of ${max} (likely a misaligned value)`,
        lineNo,
      );
    }
    return v;
  }

  /** Read a scalar group occupying one line; returns the first `n` numeric tokens. */
  group(n: number): { values: number[]; lineNo: number } {
    const { tokens, lineNo } = this.nextTokens();
    if (tokens.length < n) {
      throw new StructuralError(
        `Expected ${n} values on one line, found ${tokens.length}`,
        lineNo,
      );
    }
    return { values: tokens.slice(0, n).map((t) => this.num(t, lineNo)), lineNo };
  }

  /** Read a vector of `n` floats, accumulating across whole lines. */
  vector(n: number): number[] {
    const out: number[] = [];
    while (out.length < n) {
      const { tokens, lineNo } = this.nextTokens();
      for (const t of tokens) out.push(this.num(t, lineNo));
    }
    return out.slice(0, n);
  }

  /** Read a matrix of `rows` lines, taking the first `cols` values from each. */
  matrix(rows: number, cols: number): number[][] {
    const out: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const { tokens, lineNo } = this.nextTokens();
      if (tokens.length < cols) {
        throw new StructuralError(
          `Aero table row ${r + 1} has ${tokens.length} values, expected ${cols}`,
          lineNo,
        );
      }
      out.push(tokens.slice(0, cols).map((t) => this.num(t, lineNo)));
    }
    return out;
  }
}

function emptyStage(): Stage {
  return {
    aoa: [],
    mach: [],
    cn: [],
    ca: [],
    cp: [],
    dcaOff: [],
    weight: [],
    cg: [],
    inertia: [],
    tvcGimbal: null,
    tvcPercent: null,
    tvcMaxAngle: null,
    startTime: null,
    refArea: null,
    initialWeight: null,
    burnoutWeight: null,
    engine: { kind: "none" },
  };
}

export class InputFile {
  title = "";
  units: Units = "english";
  aeroType: AeroType = "cnca";
  stages: Stage[] = [];
  launch: Launch = {
    mode: "conventional",
    azimuth: null,
    noseHeatingModel: false,
    noseRadius: null,
    initialAltitude: null,
    initialVelocity: null,
    geodeticLatitude: null,
    longitude: null,
    initialPitch: null,
    initialHeadingAzimuth: null,
    initialBank: null,
    initialAoa: null,
    integrationTimeStep: null,
    totalTime: null,
    printoutRate: null,
  };
  engineHistory?: EngineHistory;
  trajectory: Trajectory = { control: "aoaBank", time: [], angle: [], bank: [] };

  /** True when any stage is powered (gates the page-11 engine history). */
  get powered(): boolean {
    return this.stages.some((s) => s.engine.kind !== "none");
  }

  // ---- parsing ----------------------------------------------------------------

  static parse(text: string): { file: InputFile; report: LoadReport } {
    const file = new InputFile();
    const reader = new Reader(text);
    const issues: LoadIssue[] = [];
    try {
      file.title = reader.takeTitle();
      const header = reader.group(3);
      const nStages = file.applyHeader(header.values, header.lineNo);

      for (let s = 0; s < nStages; s++) {
        file.stages.push(parseAero(reader));
      }
      file.parsePage9(reader);
      for (let s = 0; s < nStages; s++) {
        parseStageEngine(reader, file.stages[s]);
      }
      if (file.powered) {
        file.parsePage11(reader);
      }
      file.parsePage12(reader);

      if (!reader.atEnd()) {
        issues.push({
          message: "Unexpected extra data after the end of the file",
          line: reader.currentLineNo(),
        });
      }
    } catch (e) {
      if (e instanceof ParseError) {
        issues.push({ message: e.message, line: e.line });
      } else {
        throw e;
      }
    }
    return { file, report: { ok: issues.length === 0, issues } };
  }

  private applyHeader(values: number[], lineNo: number): number {
    const nStages = this.toHeaderCount(values[0], lineNo);
    this.units = unitsFrom(values[1], lineNo);
    this.aeroType = aeroFrom(values[2], lineNo);
    return nStages;
  }

  private toHeaderCount(v: number, lineNo: number): number {
    const def = field("n_stages");
    if (!Number.isInteger(v) || v < (def.min ?? 1) || v > (def.max ?? 99)) {
      throw new StructuralError(
        `Number of stages is ${v}, outside ${def.min}-${def.max}`,
        lineNo,
      );
    }
    return v;
  }

  private parsePage9(reader: Reader): void {
    const launch = reader.group(4);
    this.launch.mode = launchModeFrom(launch.values[0], launch.lineNo);
    this.launch.azimuth = launch.values[1];
    this.launch.noseHeatingModel = boolFrom(
      launch.values[2],
      launch.lineNo,
      "nose-heating-model",
    );
    this.launch.noseRadius = launch.values[3];

    const ic = reader.group(8).values;
    this.launch.initialAltitude = ic[0];
    this.launch.initialVelocity = ic[1];
    this.launch.geodeticLatitude = ic[2];
    this.launch.longitude = ic[3];
    this.launch.initialPitch = ic[4];
    this.launch.initialHeadingAzimuth = ic[5];
    this.launch.initialBank = ic[6];
    this.launch.initialAoa = ic[7];

    const integ = reader.group(3).values;
    this.launch.integrationTimeStep = integ[0];
    this.launch.totalTime = integ[1];
    this.launch.printoutRate = integ[2];
  }

  private parsePage11(reader: Reader): void {
    const n = reader.count("n_history");
    this.engineHistory = {
      time: reader.vector(n),
      value: reader.vector(n),
    };
  }

  private parsePage12(reader: Reader): void {
    const head = reader.group(2);
    const n = this.toTrajCount(head.values[0], head.lineNo);
    this.trajectory.control = trajFrom(head.values[1], head.lineNo);
    this.trajectory.time = reader.vector(n);
    this.trajectory.angle = reader.vector(n);
    this.trajectory.bank = reader.vector(n);
  }

  private toTrajCount(v: number, lineNo: number): number {
    const def = field("n_traj");
    if (!Number.isInteger(v) || v < (def.min ?? 2) || v > (def.max ?? 40)) {
      throw new StructuralError(
        `Number of trajectory points is ${v}, outside ${def.min}-${def.max}`,
        lineNo,
      );
    }
    return v;
  }

  // ---- serialization ----------------------------------------------------------

  serialize(): string {
    const out: string[] = [];
    out.push(this.title);
    out.push(
      line([
        intCell(this.stages.length),
        intCell(unitsCode(this.units)),
        intCell(aeroCode(this.aeroType)),
      ]),
    );
    for (const stage of this.stages) serializeAero(out, stage);
    this.serializePage9(out);
    for (const stage of this.stages) serializeStageEngine(out, stage);
    if (this.powered && this.engineHistory) {
      out.push(line([intCell(this.engineHistory.time.length)]));
      emitVector(out, this.engineHistory.time);
      emitVector(out, this.engineHistory.value);
    }
    out.push(
      line([
        intCell(this.trajectory.time.length),
        intCell(trajCode(this.trajectory.control)),
      ]),
    );
    emitVector(out, this.trajectory.time);
    emitVector(out, this.trajectory.angle);
    emitVector(out, this.trajectory.bank);
    // RASOrbit is a Windows program: emit CRLF line endings and the trailing DOS
    // end-of-file marker (Ctrl-Z, 0x1A) that every known-good input file carries.
    return out.map((l) => l + "\r\n").join("") + "\x1a";
  }

  private serializePage9(out: string[]): void {
    const l = this.launch;
    out.push(
      line([
        intCell(launchModeCode(l.mode)),
        floatCell(req(l.azimuth, "launch_azimuth")),
        intCell(boolCode(l.noseHeatingModel)),
        floatCell(req(l.noseRadius, "nose_radius")),
      ]),
    );
    out.push(
      line([
        floatCell(req(l.initialAltitude, "initial_altitude")),
        floatCell(req(l.initialVelocity, "initial_velocity")),
        floatCell(req(l.geodeticLatitude, "geodetic_latitude")),
        floatCell(req(l.longitude, "longitude")),
        floatCell(req(l.initialPitch, "initial_pitch")),
        floatCell(req(l.initialHeadingAzimuth, "initial_heading_azimuth")),
        floatCell(req(l.initialBank, "initial_bank")),
        floatCell(req(l.initialAoa, "initial_aoa")),
      ]),
    );
    out.push(
      line([
        floatCell(req(l.integrationTimeStep, "integration_time_step")),
        floatCell(req(l.totalTime, "total_time")),
        floatCell(req(l.printoutRate, "printout_rate")),
      ]),
    );
  }

  // ---- validation -------------------------------------------------------------

  /** Live, on-demand validation. Returns every problem; empty means save-able. */
  validate(): Issue[] {
    const issues: Issue[] = [];
    const checkNum = (
      id: string,
      v: number | null,
      loc?: { stage?: number; index?: number },
    ): void => {
      const def = field(id);
      if (v === null) {
        issues.push({
          fieldId: id,
          ...loc,
          severity: "error",
          message: `${def.label} is required`,
        });
        return;
      }
      if (def.type === "int" && !Number.isInteger(v)) {
        issues.push({
          fieldId: id,
          ...loc,
          severity: "error",
          message: `${def.label} must be a whole number`,
        });
      }
      if (def.min !== undefined && v < def.min) {
        issues.push({
          fieldId: id,
          ...loc,
          severity: "error",
          message: `${def.label} must be at least ${def.min}`,
        });
      }
      if (def.max !== undefined && v > def.max) {
        issues.push({
          fieldId: id,
          ...loc,
          severity: "error",
          message: `${def.label} must be at most ${def.max}`,
        });
      }
    };
    const checkVec = (id: string, arr: number[], stage?: number): void =>
      arr.forEach((v, index) => checkNum(id, v, { stage, index }));

    this.stages.forEach((stage, si) => {
      const sn = si + 1;
      checkVec("aoa", stage.aoa, sn);
      checkVec("mach", stage.mach, sn);
      stage.cn.forEach((row) => checkVec("cn", row, sn));
      stage.ca.forEach((row) => checkVec("ca", row, sn));
      stage.cp.forEach((row) => checkVec("cp", row, sn));
      checkVec("dca_off", stage.dcaOff, sn);
      checkVec("weight", stage.weight, sn);
      checkVec("cg", stage.cg, sn);
      checkVec("inertia", stage.inertia, sn);
      checkNum("tvc_gimbal", stage.tvcGimbal, { stage: sn });
      checkNum("tvc_percent", stage.tvcPercent, { stage: sn });
      checkNum("tvc_maxangle", stage.tvcMaxAngle, { stage: sn });
      checkNum("stage_start_time", stage.startTime, { stage: sn });
      checkNum("aero_ref_area", stage.refArea, { stage: sn });
      checkNum("stage_initial_weight", stage.initialWeight, { stage: sn });
      checkNum("stage_burnout_weight", stage.burnoutWeight, { stage: sn });
      validateEngine(issues, stage.engine, sn);
    });

    const l = this.launch;
    checkNum("launch_azimuth", l.azimuth);
    checkNum("nose_radius", l.noseRadius);
    checkNum("initial_altitude", l.initialAltitude);
    checkNum("initial_velocity", l.initialVelocity);
    checkNum("geodetic_latitude", l.geodeticLatitude);
    checkNum("longitude", l.longitude);
    checkNum("initial_pitch", l.initialPitch);
    checkNum("initial_heading_azimuth", l.initialHeadingAzimuth);
    checkNum("initial_bank", l.initialBank);
    checkNum("initial_aoa", l.initialAoa);
    checkNum("integration_time_step", l.integrationTimeStep);
    checkNum("total_time", l.totalTime);
    checkNum("printout_rate", l.printoutRate);

    if (this.powered) {
      if (!this.engineHistory) {
        issues.push({
          fieldId: "n_history",
          severity: "error",
          message: "Engine time history is required for a powered vehicle",
        });
      } else {
        checkVec("history_time", this.engineHistory.time);
        checkVec("history_value", this.engineHistory.value);
      }
    }
    checkVec("traj_time", this.trajectory.time);
    checkVec("traj_angle", this.trajectory.angle);
    checkVec("traj_bank", this.trajectory.bank);

    this.crossFieldChecks(issues);
    return issues;
  }

  private crossFieldChecks(issues: Issue[]): void {
    const l = this.launch;
    if (
      l.printoutRate !== null &&
      l.integrationTimeStep !== null &&
      l.printoutRate < l.integrationTimeStep
    ) {
      issues.push({
        fieldId: "printout_rate",
        severity: "error",
        message:
          "Printout rate must be at least the integration time step",
      });
    }
    if (l.integrationTimeStep !== null && l.integrationTimeStep === 0) {
      issues.push({
        fieldId: "integration_time_step",
        severity: "error",
        message: "Integration time step must not be zero",
      });
    }
    if (l.printoutRate !== null && l.printoutRate === 0) {
      issues.push({
        fieldId: "printout_rate",
        severity: "error",
        message: "Printout rate must not be zero",
      });
    }
    if (l.totalTime !== null && l.totalTime === 0) {
      issues.push({
        fieldId: "total_time",
        severity: "error",
        message: "Total time must not be zero",
      });
    }
    if (this.engineHistory && this.engineHistory.time[0] !== 0) {
      issues.push({
        fieldId: "history_time",
        index: 0,
        severity: "error",
        message: "The first engine-history time must be 0",
      });
    }
    if (this.trajectory.time[0] !== undefined && this.trajectory.time[0] !== 0) {
      issues.push({
        fieldId: "traj_time",
        index: 0,
        severity: "error",
        message: "The first trajectory time must be 0",
      });
    }

    // Engine model rules: no mixing; only the last stage may be a glider.
    const kinds = this.stages.map((s) => s.engine.kind);
    const powered = kinds.filter((k) => k !== "none");
    const distinct = new Set(powered);
    if (distinct.size > 1) {
      issues.push({
        fieldId: "engine_type",
        severity: "error",
        message:
          "All powered stages must use the same engine model (no mixing of chamber-pressure and thrust-history)",
      });
    }
    kinds.forEach((k, i) => {
      const isLast = i === kinds.length - 1;
      if (k === "none" && this.stages.length > 1 && !isLast) {
        issues.push({
          fieldId: "engine_type",
          stage: i + 1,
          severity: "error",
          message:
            "Only the last stage of a powered vehicle may have no engine",
        });
      }
    });
  }
}

// ---- per-stage / per-page parse helpers --------------------------------------

function parseAero(reader: Reader): Stage {
  const stage = emptyStage();
  const nAoa = reader.count("n_aoa");
  stage.aoa = reader.vector(nAoa);
  const nMach = reader.count("n_mach");
  stage.mach = reader.vector(nMach);
  stage.cn = reader.matrix(nMach, nAoa);
  stage.ca = reader.matrix(nMach, nAoa);
  stage.cp = reader.matrix(nMach, nAoa);
  stage.dcaOff = reader.vector(nMach);
  const nWeight = reader.count("n_weight");
  stage.weight = reader.vector(nWeight);
  stage.cg = reader.vector(nWeight);
  stage.inertia = reader.vector(nWeight);
  const tvc = reader.group(3).values;
  stage.tvcGimbal = tvc[0];
  stage.tvcPercent = tvc[1];
  stage.tvcMaxAngle = tvc[2];
  return stage;
}

function parseStageEngine(reader: Reader, stage: Stage): void {
  const head = reader.group(5);
  stage.startTime = head.values[0];
  stage.refArea = head.values[1];
  stage.initialWeight = head.values[2];
  stage.burnoutWeight = head.values[3];
  const engineType = head.values[4];

  if (engineType === 0) {
    stage.engine = { kind: "none" };
  } else if (engineType === 1) {
    const a = reader.group(8).values;
    const b = reader.group(4);
    stage.engine = {
      kind: "chamberPressure",
      throatArea: a[0],
      nozzleExpansionRatio: a[1],
      nozzleDivergenceHalfAngle: a[2],
      burnTime: a[3],
      refThrust: a[4],
      refSpecificImpulse: a[5],
      refChamberPressure: a[6],
      refAtmPressure: a[7],
      ratioSpecificHeats: b.values[0],
      thrustCoeffRatio: b.values[1],
      nozzleType: nozzleFrom(b.values[2], b.lineNo),
      negativeThrust: boolFrom(b.values[3], b.lineNo, "negative-thrust"),
    };
  } else if (engineType === 2) {
    const a = reader.group(4);
    stage.engine = {
      kind: "thrustHistory",
      burnTime: a.values[0],
      nozzleExitArea: a.values[1],
      refAtmPressure: a.values[2],
      negativeThrust: boolFrom(a.values[3], a.lineNo, "negative-thrust"),
    };
  } else {
    throw new StructuralError(
      `Invalid engine type ${engineType} (expected 0, 1, or 2)`,
      head.lineNo,
    );
  }
}

// ---- per-stage / per-page serialize helpers ----------------------------------

function serializeAero(out: string[], stage: Stage): void {
  out.push(line([intCell(stage.aoa.length)]));
  emitVector(out, stage.aoa);
  out.push(line([intCell(stage.mach.length)]));
  emitVector(out, stage.mach);
  for (const row of stage.cn) out.push(line(row.map(floatCell)));
  for (const row of stage.ca) out.push(line(row.map(floatCell)));
  for (const row of stage.cp) out.push(line(row.map(floatCell)));
  emitVector(out, stage.dcaOff);
  out.push(line([intCell(stage.weight.length)]));
  emitVector(out, stage.weight);
  emitVector(out, stage.cg);
  emitVector(out, stage.inertia);
  out.push(
    line([
      floatCell(req(stage.tvcGimbal, "tvc_gimbal")),
      floatCell(req(stage.tvcPercent, "tvc_percent")),
      floatCell(req(stage.tvcMaxAngle, "tvc_maxangle")),
    ]),
  );
}

function serializeStageEngine(out: string[], stage: Stage): void {
  const engineType =
    stage.engine.kind === "none"
      ? 0
      : stage.engine.kind === "chamberPressure"
        ? 1
        : 2;
  out.push(
    line([
      floatCell(req(stage.startTime, "stage_start_time")),
      floatCell(req(stage.refArea, "aero_ref_area")),
      floatCell(req(stage.initialWeight, "stage_initial_weight")),
      floatCell(req(stage.burnoutWeight, "stage_burnout_weight")),
      intCell(engineType),
    ]),
  );
  if (stage.engine.kind === "chamberPressure") {
    const e = stage.engine;
    out.push(
      line([
        floatCell(e.throatArea),
        floatCell(e.nozzleExpansionRatio),
        floatCell(e.nozzleDivergenceHalfAngle),
        floatCell(e.burnTime),
        floatCell(e.refThrust),
        floatCell(e.refSpecificImpulse),
        floatCell(e.refChamberPressure),
        floatCell(e.refAtmPressure),
      ]),
    );
    out.push(
      line([
        floatCell(e.ratioSpecificHeats),
        floatCell(e.thrustCoeffRatio),
        intCell(nozzleCode(e.nozzleType)),
        intCell(boolCode(e.negativeThrust)),
      ]),
    );
  } else if (stage.engine.kind === "thrustHistory") {
    const e = stage.engine;
    out.push(
      line([
        floatCell(e.burnTime),
        floatCell(e.nozzleExitArea),
        floatCell(e.refAtmPressure),
        intCell(boolCode(e.negativeThrust)),
      ]),
    );
  }
}

function validateEngine(
  issues: Issue[],
  engine: StageEngine,
  stage: number,
): void {
  const check = (id: string, v: number): void => {
    const def = field(id);
    if (def.min !== undefined && v < def.min) {
      issues.push({
        fieldId: id,
        stage,
        severity: "error",
        message: `${def.label} must be at least ${def.min}`,
      });
    }
    if (def.max !== undefined && v > def.max) {
      issues.push({
        fieldId: id,
        stage,
        severity: "error",
        message: `${def.label} must be at most ${def.max}`,
      });
    }
  };
  if (engine.kind === "chamberPressure") {
    check("throat_area", engine.throatArea);
    check("nozzle_expansion_ratio", engine.nozzleExpansionRatio);
    check("nozzle_divergence_half_angle", engine.nozzleDivergenceHalfAngle);
    check("chp_burn_time", engine.burnTime);
    check("ref_thrust", engine.refThrust);
    check("ref_specific_impulse", engine.refSpecificImpulse);
    check("ref_chamber_pressure", engine.refChamberPressure);
    check("ref_atm_pressure", engine.refAtmPressure);
    check("ratio_specific_heats", engine.ratioSpecificHeats);
    check("thrust_coeff_ratio", engine.thrustCoeffRatio);
  } else if (engine.kind === "thrustHistory") {
    check("tth_burn_time", engine.burnTime);
    check("nozzle_exit_area", engine.nozzleExitArea);
    check("tth_ref_atm_pressure", engine.refAtmPressure);
  }
}

function req(v: number | null, id: string): number {
  if (v === null) {
    throw new Error(
      `Cannot serialize: ${field(id).label} is missing. Validate before saving.`,
    );
  }
  return v;
}
