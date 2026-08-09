// Navigation tree: page catalog + per-node completion status.

import { fields, type FieldDef, type WhenCondition } from "./metadata";
import type { InputFile, Issue, Stage } from "./InputFile";
import { outlineStatusFromIssues } from "./issueKind";
import {
  AERO_BREAKPOINT_DEPENDENT_PAGE_IDS,
  AERO_PAGE_IDS,
  FIXED_ROOT_PAGE_IDS,
  FIXED_TAIL_PAGE_IDS,
  navLeafId,
  pageMeta,
  pageWhenVisible,
  resolvePageCopy,
  STAGE_ENGINE_PAGE_ID,
  type PageId,
  type PageRun,
} from "./pages";

export type NodeStatus = "complete" | "incomplete" | "error";

export interface NavLeaf {
  kind: "leaf";
  id: string;
  pageId: PageId;
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

function fieldsOnPage(pageId: PageId, stage?: number): FieldDef[] {
  return fields.filter((f) => {
    if (f.pageId !== pageId) return false;
    if (f.perStage && stage === undefined) return false;
    if (!f.perStage && stage !== undefined) return false;
    return true;
  });
}

function issueApplies(issue: Issue, pageId: PageId, stage?: number): boolean {
  const def = fields.find((f) => f.id === issue.fieldId);
  if (!def || def.pageId !== pageId) return false;
  if (def.perStage) {
    if (stage === undefined) return false;
    return issue.stage === stage;
  }
  return issue.stage === undefined;
}

function statusFromIssues(issues: Issue[]): NodeStatus {
  return outlineStatusFromIssues(issues);
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

function leafStatus(
  file: InputFile,
  pageId: PageId,
  stage: number | undefined,
  issues: Issue[],
): NodeStatus {
  const when = pageMeta(pageId)?.when;
  if (!pageWhenVisible(when, file)) return "complete";

  const pageFields = fieldsOnPage(pageId, stage).filter((f) => fieldVisible(file, f, stage));
  if (pageFields.length === 0) return "complete";

  const scoped = issues.filter((i) => issueApplies(i, pageId, stage));
  if (stage !== undefined && AERO_BREAKPOINT_DEPENDENT_PAGE_IDS.has(pageId)) {
    scoped.push(...aeroBreakpointIssues(issues, stage));
  }
  return statusFromIssues(scoped);
}

function leafLabel(pageId: PageId, file: InputFile): string {
  const copy = resolvePageCopy(pageId, file);
  const base = copy?.title || pageMeta(pageId)?.title || pageId;
  return base;
}

function stageBranch(file: InputFile, stage: number, issues: Issue[]): NavBranch {
  const children: NavLeaf[] = [];

  for (const pageId of AERO_PAGE_IDS) {
    children.push({
      kind: "leaf",
      id: navLeafId(pageId, stage),
      pageId,
      stage,
      label: leafLabel(pageId, file),
      status: leafStatus(file, pageId, stage, issues),
    });
  }

  children.push({
    kind: "leaf",
    id: navLeafId(STAGE_ENGINE_PAGE_ID, stage),
    pageId: STAGE_ENGINE_PAGE_ID,
    stage,
    label: leafLabel(STAGE_ENGINE_PAGE_ID, file),
    status: leafStatus(file, STAGE_ENGINE_PAGE_ID, stage, issues),
  });

  return {
    kind: "branch",
    id: `stage-${stage}`,
    label: `Stage ${stage}`,
    status: aggregateStatus(children),
    children,
  };
}

function fixedLeaf(file: InputFile, pageId: PageId, issues: Issue[]): NavLeaf | null {
  const when = pageMeta(pageId)?.when;
  if (!pageWhenVisible(when, file)) return null;
  return {
    kind: "leaf",
    id: navLeafId(pageId),
    pageId,
    label: leafLabel(pageId, file),
    status: leafStatus(file, pageId, undefined, issues),
  };
}

/** Build the left-nav tree for the current file. */
export function buildNavTree(file: InputFile, issues: Issue[]): NavNode[] {
  const nodes: NavNode[] = [];

  for (const pageId of FIXED_ROOT_PAGE_IDS) {
    const leaf = fixedLeaf(file, pageId, issues);
    if (leaf) nodes.push(leaf);
  }

  const nStages = file.stages.length;
  if (nStages > 0) {
    nodes.push(...Array.from({ length: nStages }, (_, i) => stageBranch(file, i + 1, issues)));
  }

  for (const pageId of FIXED_TAIL_PAGE_IDS) {
    const leaf = fixedLeaf(file, pageId, issues);
    if (leaf) nodes.push(leaf);
  }

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

export function runForPage(pageId: PageId): PageRun | undefined {
  return pageMeta(pageId)?.run;
}
