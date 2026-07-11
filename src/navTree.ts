// Navigation tree: page catalog + per-node completion status.

import { fields, type FieldDef, type WhenCondition } from "./metadata";
import type { InputFile, Issue, Stage } from "./InputFile";
import { pageMeta, pageWhenVisible, resolvePageCopy, type PageRun } from "./pages";

export type NodeStatus = "complete" | "incomplete" | "error";

export interface NavLeaf {
  kind: "leaf";
  id: string;
  page: number;
  stage?: number;
  label: string;
  status: NodeStatus;
}

export interface NavBranch {
  kind: "branch";
  id: string;
  label: string;
  status: NodeStatus;
  children: NavNode[];
}

export type NavNode = NavLeaf | NavBranch;

const AERO_PAGES = [3, 4, 5, 6, 7, 8] as const;
const STAGE_ENGINE_PAGE = 10;
/** Per-stage pages whose grids/vectors are keyed by page-3 Mach/AoA breakpoints. */
const AERO_BREAKPOINT_DEPENDENT_PAGES = new Set([4, 5, 6]);
const AERO_BREAKPOINT_FIELDS = new Set(["aoa", "mach", "n_aoa", "n_mach"]);

function stageEngineType(stage: Stage): 0 | 1 | 2 {
  if (stage.engine.kind === "none") return 0;
  if (stage.engine.kind === "chamberPressure") return 1;
  return 2;
}

function evalWhen(when: WhenCondition, file: InputFile, stage?: number): boolean {
  if (when.aggregate) {
    if (when.field === "engine_type") {
      return file.stages.some((s) => {
        const t = stageEngineType(s);
        return compare(t, when.op, when.value);
      });
    }
    return true;
  }
  if (stage === undefined) return true;
  const st = file.stages[stage - 1];
  if (!st) return false;
  if (when.field === "engine_type") {
    return compare(stageEngineType(st), when.op, when.value);
  }
  return true;
}

function compare(actual: number, op: WhenCondition["op"], expected: number): boolean {
  switch (op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    default:
      return false;
  }
}

export function fieldVisible(file: InputFile, def: FieldDef, stage?: number): boolean {
  if (!def.when) return true;
  return evalWhen(def.when, file, def.perStage ? stage : undefined);
}

function fieldsOnPage(page: number, stage?: number): FieldDef[] {
  return fields.filter((f) => {
    if (f.page !== page) return false;
    if (f.perStage && stage === undefined) return false;
    if (!f.perStage && stage !== undefined) return false;
    return true;
  });
}

function issueApplies(issue: Issue, page: number, stage?: number): boolean {
  const def = fields.find((f) => f.id === issue.fieldId);
  if (!def || def.page !== page) return false;
  if (def.perStage) {
    if (stage === undefined) return false;
    return issue.stage === stage;
  }
  return issue.stage === undefined;
}

function isIncompleteIssue(issue: Issue): boolean {
  const msg = issue.message;
  return msg.endsWith(" is required") || msg.includes("must be unique");
}

function statusFromIssues(issues: Issue[]): NodeStatus {
  if (issues.length === 0) return "complete";
  return issues.every(isIncompleteIssue) ? "incomplete" : "error";
}

function aggregateStatus(children: NavNode[]): NodeStatus {
  if (children.some((c) => c.status === "error")) return "error";
  if (children.some((c) => c.status === "incomplete")) return "incomplete";
  return "complete";
}

function aeroBreakpointIssues(issues: Issue[], stage: number): Issue[] {
  return issues.filter(
    (i) => i.stage === stage && AERO_BREAKPOINT_FIELDS.has(i.fieldId),
  );
}

function leafStatus(file: InputFile, page: number, stage: number | undefined, issues: Issue[]): NodeStatus {
  const when = pageMeta(page)?.when;
  if (!pageWhenVisible(when, file)) return "complete";

  const pageFields = fieldsOnPage(page, stage).filter((f) => fieldVisible(file, f, stage));
  if (pageFields.length === 0) return "complete";

  const scoped = issues.filter((i) => issueApplies(i, page, stage));
  if (stage !== undefined && AERO_BREAKPOINT_DEPENDENT_PAGES.has(page)) {
    scoped.push(...aeroBreakpointIssues(issues, stage));
  }
  return statusFromIssues(scoped);
}

function leafLabel(page: number, file: InputFile): string {
  const copy = resolvePageCopy(page, file);
  const base = copy?.title || pageMeta(page)?.title || `Page ${page}`;
  return base;
}

function stageBranch(file: InputFile, stage: number, issues: Issue[]): NavBranch {
  const children: NavLeaf[] = [];

  for (const page of AERO_PAGES) {
    children.push({
      kind: "leaf",
      id: `p${page}-s${stage}`,
      page,
      stage,
      label: leafLabel(page, file),
      status: leafStatus(file, page, stage, issues),
    });
  }

  children.push({
    kind: "leaf",
    id: `p${STAGE_ENGINE_PAGE}-s${stage}`,
    page: STAGE_ENGINE_PAGE,
    stage,
    label: leafLabel(STAGE_ENGINE_PAGE, file),
    status: leafStatus(file, STAGE_ENGINE_PAGE, stage, issues),
  });

  return {
    kind: "branch",
    id: `stage-${stage}`,
    label: `Stage ${stage}`,
    status: aggregateStatus(children),
    children,
  };
}

function fixedLeaf(file: InputFile, page: number, issues: Issue[]): NavLeaf | null {
  const when = pageMeta(page)?.when;
  if (!pageWhenVisible(when, file)) return null;
  return {
    kind: "leaf",
    id: `p${page}`,
    page,
    label: leafLabel(page, file),
    status: leafStatus(file, page, undefined, issues),
  };
}

/** Build the left-nav tree for the current file. */
export function buildNavTree(file: InputFile, issues: Issue[]): NavNode[] {
  const nodes: NavNode[] = [];

  const p1 = fixedLeaf(file, 1, issues);
  const p2 = fixedLeaf(file, 2, issues);
  if (p1) nodes.push(p1);
  if (p2) nodes.push(p2);

  const nStages = file.stages.length;
  if (nStages > 0) {
    nodes.push(...Array.from({ length: nStages }, (_, i) => stageBranch(file, i + 1, issues)));
  }

  const p9 = fixedLeaf(file, 9, issues);
  if (p9) nodes.push(p9);

  const p11 = fixedLeaf(file, 11, issues);
  if (p11) nodes.push(p11);

  const p12 = fixedLeaf(file, 12, issues);
  if (p12) nodes.push(p12);

  return nodes;
}

export function findNavNode(nodes: NavNode[], id: string): NavLeaf | undefined {
  for (const n of nodes) {
    if (n.kind === "leaf" && n.id === id) return n;
    if (n.kind === "branch") {
      const hit = findNavNode(n.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function firstLeaf(nodes: NavNode[]): NavLeaf | undefined {
  for (const n of nodes) {
    if (n.kind === "leaf") return n;
    if (n.kind === "branch") {
      const hit = firstLeaf(n.children);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function runForPage(page: number): PageRun | undefined {
  return pageMeta(page)?.run;
}
