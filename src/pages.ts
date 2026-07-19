// Page metadata from metadata/pages.csv — nav labels and page copy.

import pagesRaw from "../metadata/pages.csv?raw";
import type { AeroType, InputFile, LaunchMode, TrajControl } from "./InputFile";
import { parseCsv } from "./csv";

export type PageKind = "fixed" | "per_stage";
export type PageRun = "aero" | "stage_engine";

/** Stable page keys — primary identity for nav, field placement, and copy. */
export const PAGE_IDS = [
  "configuration",
  "aero_notes",
  "aero_data",
  "normal_force_coef",
  "axial_force_coef",
  "center_of_pressure",
  "power_off_delta",
  "cg_and_inertia",
  "thrust_vectoring",
  "launch_setup",
  "stage_data",
  "engine_time_history",
  "trajectory_control",
] as const;

export type PageId = (typeof PAGE_IDS)[number];

/** Per-stage aero run pages, in nav order. */
export const AERO_PAGE_IDS = [
  "aero_data",
  "normal_force_coef",
  "axial_force_coef",
  "center_of_pressure",
  "power_off_delta",
  "cg_and_inertia",
  "thrust_vectoring",
] as const satisfies readonly PageId[];

export const STAGE_ENGINE_PAGE_ID = "stage_data" satisfies PageId;

/** Fixed pages before per-stage branches. */
export const FIXED_ROOT_PAGE_IDS = ["configuration", "aero_notes"] as const satisfies readonly PageId[];

/** Fixed pages after per-stage branches. */
export const FIXED_TAIL_PAGE_IDS = [
  "launch_setup",
  "engine_time_history",
  "trajectory_control",
] as const satisfies readonly PageId[];

/** Per-stage pages whose grids/vectors are keyed by Aerodynamic Data Mach/AoA breakpoints. */
export const AERO_BREAKPOINT_DEPENDENT_PAGE_IDS = new Set<PageId>([
  "normal_force_coef",
  "axial_force_coef",
  "center_of_pressure",
  "power_off_delta",
]);

export interface PageRow {
  id: PageId;
  ordinal?: number;
  kind: PageKind;
  run?: PageRun;
  when?: string;
  branch: string;
  title: string;
  heading: string;
  footing: string;
}

export interface ResolvedPageCopy {
  id: PageId;
  title: string;
  heading: string;
  footing: string;
}

interface BranchContext {
  aeroType: AeroType;
  launchMode: LaunchMode;
  engineType: 0 | 1 | 2;
  trajControl: TrajControl;
}

const PAGE_ID_SET = new Set<string>(PAGE_IDS);

function assertPageId(id: string): PageId {
  if (!PAGE_ID_SET.has(id)) {
    throw new Error(`pages.csv unknown page id "${id}"`);
  }
  return id as PageId;
}

function loadPages(): PageRow[] {
  const rows = parseCsv(pagesRaw);
  const header = rows[0];
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`pages.csv missing column "${name}"`);
    return i;
  };
  const cId = idx("id");
  const cOrdinal = header.includes("ordinal") ? idx("ordinal") : -1;
  const cKind = idx("kind");
  const cRun = idx("run");
  const cWhen = idx("when");
  const cBranch = idx("branch");
  const cTitle = idx("title");
  const cHeading = idx("heading");
  const cFooting = idx("footing");

  return rows.slice(1).map((r) => {
    const kind = r[cKind].trim() as PageKind;
    const runRaw = r[cRun]?.trim();
    const ordinalRaw = cOrdinal >= 0 ? r[cOrdinal]?.trim() : "";
    return {
      id: assertPageId(r[cId].trim()),
      ordinal: ordinalRaw ? Number(ordinalRaw) : undefined,
      kind,
      run: runRaw ? (runRaw as PageRun) : undefined,
      when: r[cWhen]?.trim() || undefined,
      branch: r[cBranch].trim() || "default",
      title: r[cTitle] ?? "",
      heading: r[cHeading] ?? "",
      footing: r[cFooting] ?? "",
    };
  });
}

export const pageRows: PageRow[] = loadPages();

function primaryEngineType(file: InputFile): 0 | 1 | 2 {
  const stage = file.stages.find((s) => s.engine.kind !== "none");
  if (!stage) return 0;
  if (stage.engine.kind === "chamberPressure") return 1;
  return 2;
}

function branchContext(file: InputFile): BranchContext {
  return {
    aeroType: file.aeroType,
    launchMode: file.launch.mode,
    engineType: primaryEngineType(file),
    trajControl: file.trajectory.control,
  };
}

function matchBranch(branch: string, ctx: BranchContext): boolean {
  if (branch === "default") return true;
  const m = /^(\w+)=(-?\d+)$/.exec(branch);
  if (!m) return false;
  const [, key, raw] = m;
  const value = Number(raw);
  switch (key) {
    case "aero_type":
      return (ctx.aeroType === "clcd" ? 0 : 1) === value;
    case "launch_mode":
      return (ctx.launchMode === "vertical" ? 1 : 0) === value;
    case "engine_type":
      return ctx.engineType === value;
    case "traj_control":
      return (ctx.trajControl === "pitchBank" ? 0 : 1) === value;
    default:
      return false;
  }
}

export function pageWhenVisible(when: string | undefined, file: InputFile): boolean {
  if (!when) return true;
  if (when === "any(engine_type>0)") return file.powered;
  return true;
}

function rowsForPage(id: PageId): PageRow[] {
  return pageRows.filter((r) => r.id === id);
}

/** Best title/heading/footing for a page, merging default + branch rows. */
export function resolvePageCopy(id: PageId, file: InputFile): ResolvedPageCopy | null {
  const rows = rowsForPage(id);
  if (rows.length === 0) return null;
  const visible = rows.filter((r) => pageWhenVisible(r.when, file));
  if (visible.length === 0) return null;

  const ctx = branchContext(file);
  const specific = visible.filter((r) => r.branch !== "default" && matchBranch(r.branch, ctx));
  const fallback = visible.find((r) => r.branch === "default") ?? visible[0];

  let title = fallback.title;
  let heading = fallback.heading;
  let footing = fallback.footing;

  for (const row of specific) {
    if (row.title) title = row.title;
    if (row.heading) heading = row.heading;
    if (row.footing) footing = row.footing;
  }

  return { id, title, heading, footing };
}

export function pageMeta(id: PageId): PageRow | undefined {
  return pageRows.find((r) => r.id === id && r.branch === "default");
}

export function navLeafId(id: PageId, stage?: number): string {
  return stage === undefined ? id : `${id}-s${stage}`;
}
