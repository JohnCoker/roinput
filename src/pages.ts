// Page metadata from metadata/pages.csv — nav labels and page copy.

import pagesRaw from "../metadata/pages.csv?raw";
import type { AeroType, InputFile, LaunchMode, TrajControl } from "./InputFile";
import { parseCsv } from "./csv";

export type PageKind = "fixed" | "per_stage";
export type PageRun = "aero" | "stage_engine";

export interface PageRow {
  page: number;
  kind: PageKind;
  run?: PageRun;
  when?: string;
  branch: string;
  title: string;
  heading: string;
  footing: string;
}

export interface ResolvedPageCopy {
  page: number;
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

function loadPages(): PageRow[] {
  const rows = parseCsv(pagesRaw);
  const header = rows[0];
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`pages.csv missing column "${name}"`);
    return i;
  };
  const cPage = idx("page");
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
    return {
      page: Number(r[cPage]),
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

/** Distinct page numbers that have metadata, in ascending order. */
export const pageNumbers: number[] = [
  ...new Set(pageRows.map((r) => r.page)),
].sort((a, b) => a - b);

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

function rowsForPage(page: number): PageRow[] {
  return pageRows.filter((r) => r.page === page);
}

/** Best title/heading/footing for a page, merging default + branch rows. */
export function resolvePageCopy(page: number, file: InputFile): ResolvedPageCopy | null {
  const rows = rowsForPage(page);
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

  return { page, title, heading, footing };
}

export function pageMeta(page: number): PageRow | undefined {
  return pageRows.find((r) => r.page === page && r.branch === "default");
}
