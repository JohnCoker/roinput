// On-screen field labels, which vary with units, aero type, launch mode, and engine model.
// Type-only imports keep this usable from InputFile validation without an import cycle.

import type { FieldDef } from "./metadata";
import type { InputFile } from "./InputFile";

export function displayLabelLines(file: InputFile, def: FieldDef): string[] | null {
  const fromNose =
    file.units === "english" ? "inches from nose tip" : "meters from nose tip";
  switch (def.id) {
    case "tvc_gimbal":
      return ["Thrust Vectoring Gimbal Location", `(${fromNose})`];
    case "tvc_percent":
      return [
        "Percent of Thrust for Pitch Thrust Vectoring",
        "Enter 1.0 for 100%, 0.5 for 50%",
      ];
    case "tvc_maxangle":
      return ["Maximum Thrust Vector Angle (deg)", ""];
    default:
      return null;
  }
}

export function displayLabel(file: InputFile, def: FieldDef): string {
  const labelLines = displayLabelLines(file, def);
  if (labelLines) {
    return labelLines.filter((line) => line.length > 0).join(" ");
  }
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
  if (def.id === "initial_altitude") {
    return file.units === "english"
      ? "Initial Altitude (ft) - Above Sea Level"
      : "Initial Altitude (m) - Above Sea Level";
  }
  if (def.id === "initial_bank") {
    return "Initial Bank Angle (Roll Angle) (deg)";
  }
  if (def.id === "printout_rate") {
    return "Printout Output Rate (every x sec)";
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

/** The on-screen label without its trailing units, for use in messages. */
export function displayName(file: InputFile, def: FieldDef): string {
  const label = displayLabelLines(file, def)?.[0] ?? displayLabel(file, def);
  return label.replace(/\s*(?:–\s*)?\([^()]*\)$/, "");
}
