import type { FieldDef } from "./metadata";
import type { ChoiceOption } from "./metadata";
import {
  InputFile,
  formatFloat,
  type Stage,
  type StageEngine,
} from "./InputFile";

function defaultStage(): Stage {
  const aoaLen = 3;
  const machLen = 2;
  const weightLen = 2;
  const row = (n: number) => Array(n).fill(0) as number[];
  const matrix = (rows: number, cols: number) =>
    Array.from({ length: rows }, () => row(cols));
  return {
    aoa: row(aoaLen),
    mach: row(machLen),
    cn: matrix(machLen, aoaLen),
    ca: matrix(machLen, aoaLen),
    cp: matrix(machLen, aoaLen),
    dcaOff: row(machLen),
    weight: row(weightLen),
    cg: row(weightLen),
    inertia: row(weightLen),
    tvcGimbal: 0,
    tvcPercent: 0,
    tvcMaxAngle: 0,
    startTime: 0,
    refArea: 0,
    initialWeight: 0,
    burnoutWeight: 0,
    engine: { kind: "none" },
  };
}

function defaultChamberEngine(): StageEngine {
  return {
    kind: "chamberPressure",
    throatArea: 0,
    nozzleExpansionRatio: 0,
    nozzleDivergenceHalfAngle: 0,
    burnTime: 0,
    refThrust: 0,
    refSpecificImpulse: 0,
    refChamberPressure: 0,
    refAtmPressure: 0,
    ratioSpecificHeats: 0,
    thrustCoeffRatio: 0,
    nozzleType: "conical",
    negativeThrust: false,
  };
}

function defaultThrustEngine(): StageEngine {
  return {
    kind: "thrustHistory",
    burnTime: 0,
    nozzleExitArea: 0,
    refAtmPressure: 0,
    negativeThrust: false,
  };
}

function cloneStage(s: Stage): Stage {
  return {
    aoa: [...s.aoa],
    mach: [...s.mach],
    cn: s.cn.map((row) => [...row]),
    ca: s.ca.map((row) => [...row]),
    cp: s.cp.map((row) => [...row]),
    dcaOff: [...s.dcaOff],
    weight: [...s.weight],
    cg: [...s.cg],
    inertia: [...s.inertia],
    tvcGimbal: s.tvcGimbal,
    tvcPercent: s.tvcPercent,
    tvcMaxAngle: s.tvcMaxAngle,
    startTime: s.startTime,
    refArea: s.refArea,
    initialWeight: s.initialWeight,
    burnoutWeight: s.burnoutWeight,
    engine:
      s.engine.kind === "none"
        ? { kind: "none" }
        : s.engine.kind === "chamberPressure"
          ? { ...s.engine }
          : { ...s.engine },
  };
}

export function cloneInputFile(file: InputFile): InputFile {
  const next = new InputFile();
  next.title = file.title;
  next.units = file.units;
  next.aeroType = file.aeroType;
  next.launch = { ...file.launch };
  next.trajectory = {
    control: file.trajectory.control,
    time: [...file.trajectory.time],
    angle: [...file.trajectory.angle],
    bank: [...file.trajectory.bank],
  };
  if (file.engineHistory) {
    next.engineHistory = {
      time: [...file.engineHistory.time],
      value: [...file.engineHistory.value],
    };
  }
  next.stages = file.stages.map(cloneStage);
  next.trimmedStages = file.trimmedStages.map(cloneStage);
  return next;
}

/** Default stage with minimum valid dimensions and zeroed scalars. */
export function createDefaultStage(): Stage {
  return cloneStage(defaultStage());
}

function resizeArray(arr: number[], n: number, fill = 0): number[] {
  if (n === arr.length) return arr;
  if (n < arr.length) return arr.slice(0, n);
  return [...arr, ...Array(n - arr.length).fill(fill)];
}

function resizeMatrix(rows: number[][], rowCount: number, colCount: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const prev = rows[r] ?? [];
    out.push(resizeArray(prev, colCount, 0));
  }
  return out;
}

function stageAt(file: InputFile, stage: number): Stage {
  const s = file.stages[stage - 1];
  if (!s) throw new Error(`Stage ${stage} does not exist`);
  return s;
}

function setNStages(file: InputFile, n: number): void {
  while (file.stages.length > n) {
    const removed = file.stages.pop();
    if (removed) file.trimmedStages.push(cloneStage(removed));
  }
  while (file.stages.length < n) {
    const restored = file.trimmedStages.pop();
    file.stages.push(restored ? cloneStage(restored) : defaultStage());
  }
}

function setNAoa(file: InputFile, stage: number, n: number): void {
  const s = stageAt(file, stage);
  s.aoa = resizeArray(s.aoa, n, 0);
  const cols = n;
  s.cn = resizeMatrix(s.cn, s.mach.length, cols);
  s.ca = resizeMatrix(s.ca, s.mach.length, cols);
  s.cp = resizeMatrix(s.cp, s.mach.length, cols);
}

function setNMach(file: InputFile, stage: number, n: number): void {
  const s = stageAt(file, stage);
  s.mach = resizeArray(s.mach, n, 0);
  const rows = n;
  const cols = s.aoa.length;
  s.cn = resizeMatrix(s.cn, rows, cols);
  s.ca = resizeMatrix(s.ca, rows, cols);
  s.cp = resizeMatrix(s.cp, rows, cols);
  s.dcaOff = resizeArray(s.dcaOff, n, 0);
}

function setNWeight(file: InputFile, stage: number, n: number): void {
  const s = stageAt(file, stage);
  s.weight = resizeArray(s.weight, n, 0);
  s.cg = resizeArray(s.cg, n, 0);
  s.inertia = resizeArray(s.inertia, n, 0);
}

function ensureEngineHistory(file: InputFile, n: number): void {
  if (!file.engineHistory) {
    file.engineHistory = { time: Array(n).fill(0), value: Array(n).fill(0) };
    return;
  }
  file.engineHistory.time = resizeArray(file.engineHistory.time, n, 0);
  file.engineHistory.value = resizeArray(file.engineHistory.value, n, 0);
}

function setNTraj(file: InputFile, n: number): void {
  file.trajectory.time = resizeArray(file.trajectory.time, n, 0);
  file.trajectory.angle = resizeArray(file.trajectory.angle, n, 0);
  file.trajectory.bank = resizeArray(file.trajectory.bank, n, 0);
}

function setEngineType(file: InputFile, stage: number, t: 0 | 1 | 2): void {
  const s = stageAt(file, stage);
  if (t === 0) s.engine = { kind: "none" };
  else if (t === 1) s.engine = defaultChamberEngine();
  else s.engine = defaultThrustEngine();
  if (file.powered && !file.engineHistory) {
    ensureEngineHistory(file, 2);
  }
}

/** Mirror launch azimuth and apply vertical-launch autofills. */
export function applyDerivedValues(file: InputFile): void {
  if (file.launch.azimuth !== null) {
    file.launch.initialHeadingAzimuth = file.launch.azimuth;
  }
  if (file.launch.mode === "vertical") {
    file.launch.initialPitch = 90;
    file.launch.initialBank = 0;
    file.launch.initialAoa = 0;
  }
}

export function displayLabel(file: InputFile, def: FieldDef): string {
  if (def.id === "initial_heading_azimuth") {
    return file.launch.mode === "conventional"
      ? "Initial Heading"
      : "Initial Heading/Azimuth";
  }
  if (def.id === "traj_angle") {
    return file.trajectory.control === "aoaBank"
      ? "Angle of Attack (deg)"
      : "Pitch Attitude (deg)";
  }
  if (def.id === "traj_time") {
    return "Time (sec)";
  }
  if (def.id === "traj_bank") {
    return "Bank Angle (Roll Angle) (deg)";
  }
  if (def.id === "history_time") {
    return "Time (sec)";
  }
  if (def.id === "n_history") {
    const powered = file.stages.find((s) => s.engine.kind !== "none");
    if (powered?.engine.kind === "thrustHistory") {
      return "Number of Thrust Time History Points";
    }
    if (powered?.engine.kind === "chamberPressure") {
      return "Number of Chamber Pressure Time History Points";
    }
  }
  if (def.id === "history_value") {
    const powered = file.stages.find((s) => s.engine.kind !== "none");
    if (powered?.engine.kind === "thrustHistory") {
      return file.units === "english" ? "Thrust (lbs)" : "Thrust (newtons)";
    }
    if (powered?.engine.kind === "chamberPressure") {
      return file.units === "english"
        ? "Chamber Pressure (psi)"
        : "Chamber Pressure (MPa)";
    }
  }
  if (def.id === "tvc_percent") {
    return "Percent of Thrust for Pitch Thrust Vectoring Enter 1.0 for 100%, 0.5 for 50%";
  }
  if (def.id === "tvc_maxangle") {
    return "Maximum Thrust Vector Angle (deg)";
  }
  if (def.id === "initial_altitude") {
    return file.units === "english"
      ? "Initial Altitude (ft) - Above Sea Level"
      : "Initial Altitude (m) - Above Sea Level";
  }
  if (def.id === "initial_bank") {
    return "Initial Bank Angle (Roll Angle) (deg)";
  }
  if (def.id === "printout_rate") {
    return "Printout/Excel Spreadsheet Output Rate (every x sec)";
  }
  if (def.id === "integration_time_step" || def.id === "total_time") {
    return `${def.label} (sec)`;
  }
  if (
    def.id === "geodetic_latitude" ||
    def.id === "longitude" ||
    def.id === "initial_pitch" ||
    def.id === "initial_aoa"
  ) {
    return `${def.label} (deg)`;
  }
  if (def.id === "launch_azimuth") {
    return file.launch.mode === "conventional"
      ? "Initial Heading (deg)"
      : "Launch Azimuth (deg)";
  }

  const fromNose = file.units === "english" ? "inches from nose tip" : "meters from nose tip";
  if (def.id === "cp") {
    const base =
      file.aeroType === "clcd"
        ? "Center of Pressure (CP)"
        : def.label;
    return `${base} – (${fromNose})`;
  }
  if (def.id === "cg") {
    return `Center of Gravity (CG) – (${fromNose})`;
  }
  if (def.id === "tvc_gimbal") {
    return `Thrust Vectoring Gimbal Location (${fromNose})`;
  }

  if (file.units === "english") {
    switch (def.id) {
      case "weight":
        return "Weight (lbs)";
      case "inertia":
        return "Pitch Inertia (slug-ft²)";
      case "initial_velocity":
        return `${def.label} (ft/sec)`;
      case "nose_radius":
        return `${def.label} (ft)`;
      case "stage_start_time":
      case "chp_burn_time":
      case "tth_burn_time":
        return `${def.label} (sec)`;
      case "aero_ref_area":
      case "throat_area":
      case "nozzle_exit_area":
        return `${def.label} (ft²)`;
      case "stage_initial_weight":
      case "stage_burnout_weight":
      case "ref_thrust":
        return `${def.label} (lbs)`;
      case "ref_specific_impulse":
        return `${def.label} (sec)`;
      case "ref_chamber_pressure":
      case "ref_atm_pressure":
      case "tth_ref_atm_pressure":
        return `${def.label} (psi)`;
      case "nozzle_expansion_ratio":
      case "ratio_specific_heats":
      case "thrust_coeff_ratio":
        return `${def.label} (n.d.)`;
      case "nozzle_divergence_half_angle":
        return `${def.label} (deg)`;
      default:
        break;
    }
  } else {
    switch (def.id) {
      case "weight":
        return "Weight (kg)";
      case "inertia":
        return "Pitch Inertia (kg-m²)";
      case "initial_velocity":
        return `${def.label} (m/sec)`;
      case "nose_radius":
        return `${def.label} (m)`;
      case "stage_start_time":
      case "chp_burn_time":
      case "tth_burn_time":
        return `${def.label} (sec)`;
      case "aero_ref_area":
      case "throat_area":
      case "nozzle_exit_area":
        return `${def.label} (m²)`;
      case "stage_initial_weight":
      case "stage_burnout_weight":
        return `${def.label} (kg)`;
      case "ref_thrust":
        return `${def.label} (newtons)`;
      case "ref_specific_impulse":
        return `${def.label} (sec)`;
      case "ref_chamber_pressure":
      case "ref_atm_pressure":
      case "tth_ref_atm_pressure":
        return `${def.label} (MPa)`;
      case "nozzle_expansion_ratio":
      case "ratio_specific_heats":
      case "thrust_coeff_ratio":
        return `${def.label} (n.d.)`;
      case "nozzle_divergence_half_angle":
        return `${def.label} (deg)`;
      default:
        break;
    }
  }

  if (file.aeroType === "clcd") {
    if (def.id === "cn") return "Lift Coefficient (CL)";
    if (def.id === "ca") return "Drag Coefficient (CD)";
    if (def.id === "dca_off") return "Power-Off Delta Drag Coefficient";
  }
  return def.label;
}

/** Long or comma-containing choice labels (radio: splits options on `,`). */
export function choiceOptions(
  _file: InputFile,
  def: FieldDef,
): ChoiceOption[] | undefined {
  if (def.id === "engine_type") {
    return [
      { label: "No Rocket Engine, Glider or Coasting Rocket", value: 0 },
      { label: "Model Using Chamber Pressure and Nozzle Geometry", value: 1 },
      {
        label:
          "Thrust Time History Model – Thrust Variation with Altitude Using Nozzle Exit Area",
        value: 2,
      },
    ];
  }
  if (def.id === "traj_control") {
    return [
      { label: "Pitch Attitude and Bank Angle (Roll Angle)", value: 0 },
      { label: "Angle of Attack and Bank Angle (Roll Angle)", value: 1 },
    ];
  }
  if (def.id === "nose_heating_model") {
    return [
      { label: "Yes", value: 1 },
      { label: "No", value: 0 },
    ];
  }
  return def.options;
}

export function fieldHidden(file: InputFile, def: FieldDef): boolean {
  if (def.id === "nose_radius" && !file.launch.noseHeatingModel) return true;
  // Derived mirror of launch_azimuth; launch_azimuth carries the editable value.
  if (def.id === "initial_heading_azimuth") return true;
  return false;
}

export function fieldReadOnly(def: FieldDef): boolean {
  return def.id === "initial_heading_azimuth";
}

function engineTypeOf(stage: Stage): 0 | 1 | 2 {
  if (stage.engine.kind === "none") return 0;
  if (stage.engine.kind === "chamberPressure") return 1;
  return 2;
}

export function readScalar(
  file: InputFile,
  id: string,
  stage?: number,
): string | number | boolean | null {
  switch (id) {
    case "title":
      return file.title;
    case "n_stages":
      return file.stages.length;
    case "units":
      return file.units === "english" ? 1 : 0;
    case "aero_type":
      return file.aeroType === "clcd" ? 0 : 1;
    case "launch_mode":
      return file.launch.mode === "vertical" ? 1 : 0;
    case "launch_azimuth":
      return file.launch.azimuth;
    case "nose_heating_model":
      return file.launch.noseHeatingModel ? 1 : 0;
    case "nose_radius":
      return file.launch.noseRadius;
    case "initial_altitude":
      return file.launch.initialAltitude;
    case "initial_velocity":
      return file.launch.initialVelocity;
    case "geodetic_latitude":
      return file.launch.geodeticLatitude;
    case "longitude":
      return file.launch.longitude;
    case "initial_pitch":
      return file.launch.initialPitch;
    case "initial_heading_azimuth":
      return file.launch.azimuth;
    case "initial_bank":
      return file.launch.initialBank;
    case "initial_aoa":
      return file.launch.initialAoa;
    case "integration_time_step":
      return file.launch.integrationTimeStep;
    case "total_time":
      return file.launch.totalTime;
    case "printout_rate":
      return file.launch.printoutRate;
    case "traj_control":
      return file.trajectory.control === "aoaBank" ? 1 : 0;
    case "n_traj":
      return file.trajectory.time.length;
    case "n_history":
      return file.engineHistory?.time.length ?? 0;
    default:
      break;
  }

  if (stage === undefined) return null;
  const s = stageAt(file, stage);

  switch (id) {
    case "n_aoa":
      return s.aoa.length;
    case "n_mach":
      return s.mach.length;
    case "n_weight":
      return s.weight.length;
    case "tvc_gimbal":
      return s.tvcGimbal;
    case "tvc_percent":
      return s.tvcPercent;
    case "tvc_maxangle":
      return s.tvcMaxAngle;
    case "stage_start_time":
      return s.startTime;
    case "aero_ref_area":
      return s.refArea;
    case "stage_initial_weight":
      return s.initialWeight;
    case "stage_burnout_weight":
      return s.burnoutWeight;
    case "engine_type":
      return engineTypeOf(s);
    default:
      break;
  }

  if (s.engine.kind === "chamberPressure") {
    const e = s.engine;
    const map: Record<string, number | boolean> = {
      throat_area: e.throatArea,
      nozzle_expansion_ratio: e.nozzleExpansionRatio,
      nozzle_divergence_half_angle: e.nozzleDivergenceHalfAngle,
      chp_burn_time: e.burnTime,
      ref_thrust: e.refThrust,
      ref_specific_impulse: e.refSpecificImpulse,
      ref_chamber_pressure: e.refChamberPressure,
      ref_atm_pressure: e.refAtmPressure,
      ratio_specific_heats: e.ratioSpecificHeats,
      thrust_coeff_ratio: e.thrustCoeffRatio,
      nozzle_type: e.nozzleType === "bell" ? 2 : 1,
      negative_thrust: e.negativeThrust ? 1 : 0,
    };
    if (id in map) return map[id];
  }
  if (s.engine.kind === "thrustHistory") {
    const e = s.engine;
    const map: Record<string, number | boolean> = {
      tth_burn_time: e.burnTime,
      nozzle_exit_area: e.nozzleExitArea,
      tth_ref_atm_pressure: e.refAtmPressure,
      tth_negative_thrust: e.negativeThrust ? 1 : 0,
    };
    if (id in map) return map[id];
  }

  return null;
}

export function readVector(
  file: InputFile,
  id: string,
  stage?: number,
): number[] {
  if (stage !== undefined) {
    const s = stageAt(file, stage);
    switch (id) {
      case "aoa":
        return s.aoa;
      case "mach":
        return s.mach;
      case "dca_off":
        return s.dcaOff;
      case "weight":
        return s.weight;
      case "cg":
        return s.cg;
      case "inertia":
        return s.inertia;
      default:
        break;
    }
  }
  switch (id) {
    case "history_time":
      return file.engineHistory?.time ?? [];
    case "history_value":
      return file.engineHistory?.value ?? [];
    case "traj_time":
      return file.trajectory.time;
    case "traj_angle":
      return file.trajectory.angle;
    case "traj_bank":
      return file.trajectory.bank;
    default:
      return [];
  }
}

export function readMatrix(
  file: InputFile,
  id: string,
  stage: number,
): number[][] {
  const s = stageAt(file, stage);
  switch (id) {
    case "cn":
      return s.cn;
    case "ca":
      return s.ca;
    case "cp":
      return s.cp;
    default:
      return [];
  }
}

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function writeScalar(
  file: InputFile,
  id: string,
  raw: string | number | boolean,
  stage?: number,
): void {
  if (id === "title") {
    file.title = String(raw);
    return;
  }

  const num =
    typeof raw === "number"
      ? raw
      : typeof raw === "boolean"
        ? raw
          ? 1
          : 0
        : parseNumber(String(raw));

  switch (id) {
    case "n_stages":
      if (num !== null && Number.isInteger(num)) setNStages(file, num);
      return;
    case "units":
      file.units = num === 0 ? "si" : "english";
      return;
    case "aero_type":
      file.aeroType = num === 0 ? "clcd" : "cnca";
      return;
    case "launch_mode":
      file.launch.mode = num === 1 ? "vertical" : "conventional";
      applyDerivedValues(file);
      return;
    case "launch_azimuth":
      file.launch.azimuth = num;
      applyDerivedValues(file);
      return;
    case "nose_heating_model":
      file.launch.noseHeatingModel = num === 1;
      if (!file.launch.noseHeatingModel) file.launch.noseRadius = 0;
      return;
    case "nose_radius":
      file.launch.noseRadius = num;
      return;
    case "initial_altitude":
      file.launch.initialAltitude = num;
      return;
    case "initial_velocity":
      file.launch.initialVelocity = num;
      return;
    case "geodetic_latitude":
      file.launch.geodeticLatitude = num;
      return;
    case "longitude":
      file.launch.longitude = num;
      return;
    case "initial_pitch":
      file.launch.initialPitch = num;
      return;
    case "initial_bank":
      file.launch.initialBank = num;
      return;
    case "initial_aoa":
      file.launch.initialAoa = num;
      return;
    case "integration_time_step":
      file.launch.integrationTimeStep = num;
      return;
    case "total_time":
      file.launch.totalTime = num;
      return;
    case "printout_rate":
      file.launch.printoutRate = num;
      return;
    case "traj_control":
      file.trajectory.control = num === 1 ? "aoaBank" : "pitchBank";
      return;
    case "n_traj":
      if (num !== null && Number.isInteger(num)) setNTraj(file, num);
      return;
    case "n_history":
      if (num !== null && Number.isInteger(num)) ensureEngineHistory(file, num);
      return;
    default:
      break;
  }

  if (stage === undefined) return;
  const s = stageAt(file, stage);

  switch (id) {
    case "n_aoa":
      if (num !== null && Number.isInteger(num)) setNAoa(file, stage, num);
      return;
    case "n_mach":
      if (num !== null && Number.isInteger(num)) setNMach(file, stage, num);
      return;
    case "n_weight":
      if (num !== null && Number.isInteger(num)) setNWeight(file, stage, num);
      return;
    case "tvc_gimbal":
      s.tvcGimbal = num;
      return;
    case "tvc_percent":
      s.tvcPercent = num;
      return;
    case "tvc_maxangle":
      s.tvcMaxAngle = num;
      return;
    case "stage_start_time":
      s.startTime = num;
      return;
    case "aero_ref_area":
      s.refArea = num;
      return;
    case "stage_initial_weight":
      s.initialWeight = num;
      return;
    case "stage_burnout_weight":
      s.burnoutWeight = num;
      return;
    case "engine_type":
      if (num === 0 || num === 1 || num === 2) setEngineType(file, stage, num);
      return;
    default:
      break;
  }

  if (s.engine.kind === "chamberPressure") {
    const e = s.engine;
    const set = (n: number | null) => (n === null ? 0 : n);
    switch (id) {
      case "throat_area":
        e.throatArea = set(num);
        return;
      case "nozzle_expansion_ratio":
        e.nozzleExpansionRatio = set(num);
        return;
      case "nozzle_divergence_half_angle":
        e.nozzleDivergenceHalfAngle = set(num);
        return;
      case "chp_burn_time":
        e.burnTime = set(num);
        return;
      case "ref_thrust":
        e.refThrust = set(num);
        return;
      case "ref_specific_impulse":
        e.refSpecificImpulse = set(num);
        return;
      case "ref_chamber_pressure":
        e.refChamberPressure = set(num);
        return;
      case "ref_atm_pressure":
        e.refAtmPressure = set(num);
        return;
      case "ratio_specific_heats":
        e.ratioSpecificHeats = set(num);
        return;
      case "thrust_coeff_ratio":
        e.thrustCoeffRatio = set(num);
        return;
      case "nozzle_type":
        e.nozzleType = num === 2 ? "bell" : "conical";
        return;
      case "negative_thrust":
        e.negativeThrust = num === 1;
        return;
      default:
        break;
    }
  }
  if (s.engine.kind === "thrustHistory") {
    const e = s.engine;
    const set = (n: number | null) => (n === null ? 0 : n);
    switch (id) {
      case "tth_burn_time":
        e.burnTime = set(num);
        return;
      case "nozzle_exit_area":
        e.nozzleExitArea = set(num);
        return;
      case "tth_ref_atm_pressure":
        e.refAtmPressure = set(num);
        return;
      case "tth_negative_thrust":
        e.negativeThrust = num === 1;
        return;
      default:
        break;
    }
  }
}

export function writeVectorElement(
  file: InputFile,
  id: string,
  index: number,
  raw: string,
  stage?: number,
): void {
  const num = parseNumber(raw);
  if (stage !== undefined) {
    const s = stageAt(file, stage);
    const vec = (() => {
      switch (id) {
        case "aoa":
          return s.aoa;
        case "mach":
          return s.mach;
        case "dca_off":
          return s.dcaOff;
        case "weight":
          return s.weight;
        case "cg":
          return s.cg;
        case "inertia":
          return s.inertia;
        default:
          return null;
      }
    })();
    if (vec) {
      vec[index] = num ?? 0;
      return;
    }
  }
  const hist = file.engineHistory;
  if (id === "history_time" && hist) hist.time[index] = num ?? 0;
  if (id === "history_value" && hist) hist.value[index] = num ?? 0;
  if (id === "traj_time") file.trajectory.time[index] = num ?? 0;
  if (id === "traj_angle") file.trajectory.angle[index] = num ?? 0;
  if (id === "traj_bank") file.trajectory.bank[index] = num ?? 0;
}

export function writeMatrixElement(
  file: InputFile,
  id: string,
  row: number,
  col: number,
  raw: string,
  stage: number,
): void {
  const num = parseNumber(raw);
  const s = stageAt(file, stage);
  const mat =
    id === "cn" ? s.cn : id === "ca" ? s.ca : id === "cp" ? s.cp : null;
  if (mat && mat[row]) {
    mat[row][col] = num ?? 0;
  }
}

export function formatScalarValue(
  value: string | number | boolean | null,
  def: FieldDef,
): string {
  if (value === null) return "";
  if (def.type === "text") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (def.type === "int") {
    if (typeof value === "number") return String(Math.trunc(value));
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : String(value);
  }
  if (typeof value === "number") return formatFloat(value);
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? formatFloat(parsed) : String(value);
}
