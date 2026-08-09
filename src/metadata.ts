// Field metadata for the RASOrbit input file, loaded from metadata/fields.csv.
//
// The CSV is the single source of truth for per-field UI bounds, labels, and the
// record sequence (its row order IS the file order). The parser/serializer in
// InputFile.ts mirror that sequence in hand-written code (see metadata/SCHEMA.md);
// this module exposes the bounds/labels so validation and the future form UI can
// share them without duplicating the limits.

import csvRaw from "../metadata/fields.csv?raw";
import type { PageId } from "./pages";
import { PAGE_IDS } from "./pages";
import { parseCsv } from "./csv";

const PAGE_ID_SET = new Set<string>(PAGE_IDS);

function assertPageId(id: string): PageId {
  if (!PAGE_ID_SET.has(id)) {
    throw new Error(`fields.csv unknown page_id "${id}"`);
  }
  return id as PageId;
}

export type Kind = "scalar" | "vector" | "matrix";
export type FieldType = "text" | "int" | "float" | "choice";
export type CompareOp = "==" | "!=" | ">=" | "<=" | ">" | "<";

/** A parsed `when` condition. `aggregate` marks the `any(...)` vehicle-level form. */
export interface WhenCondition {
  raw: string;
  aggregate: boolean;
  field: string;
  op: CompareOp;
  value: number;
}

/** Count reference(s) for vector/matrix records (field ids read earlier). */
export interface CountRef {
  /** vector length id, or matrix row-count id */
  rows?: string;
  /** matrix column-count id */
  cols?: string;
}

export interface ChoiceOption {
  label: string;
  value: number;
  /** Multi-line radio label; `label` remains a single-line fallback for tests and a11y. */
  labelLines?: string[];
}

export interface FieldDef {
  id: string;
  label: string;
  kind: Kind;
  type: FieldType;
  count?: CountRef;
  perStage: boolean;
  when?: WhenCondition;
  /** true when this record shares the previous record's physical line. */
  sameLine: boolean;
  control: string;
  min?: number;
  max?: number;
  step?: number;
  pageId?: PageId;
  group: string;
  validate: string;
  options?: ChoiceOption[];
}

function parseWhen(raw: string): WhenCondition | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let body = trimmed;
  let aggregate = false;
  const agg = /^any\((.*)\)$/.exec(trimmed);
  if (agg) {
    aggregate = true;
    body = agg[1].trim();
  }
  const m = /^([A-Za-z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/.exec(body);
  if (!m) {
    throw new Error(`Unparseable when condition: "${raw}"`);
  }
  return {
    raw: trimmed,
    aggregate,
    field: m[1],
    op: m[2] as CompareOp,
    value: Number(m[3]),
  };
}

function parseCount(kind: Kind, raw: string): CountRef | undefined {
  const trimmed = raw.trim();
  if (kind === "scalar" || !trimmed) return undefined;
  if (kind === "matrix") {
    const parts = trimmed.split(/\s+x\s+/i);
    if (parts.length !== 2) {
      throw new Error(`Unparseable matrix count: "${raw}"`);
    }
    return { rows: parts[0].trim(), cols: parts[1].trim() };
  }
  return { rows: trimmed };
}

function parseOptions(control: string): ChoiceOption[] | undefined {
  const m = /^radio:(.*)$/.exec(control.trim());
  if (!m) return undefined;
  return m[1].split(",").map((pair) => {
    const eq = pair.lastIndexOf("=");
    if (eq < 0) throw new Error(`Unparseable radio option: "${pair}"`);
    return {
      label: pair.slice(0, eq).trim(),
      value: Number(pair.slice(eq + 1).trim()),
    };
  });
}

function num(raw: string): number | undefined {
  const t = raw.trim();
  return t === "" ? undefined : Number(t);
}

function loadFields(): FieldDef[] {
  const rows = parseCsv(csvRaw);
  const header = rows[0];
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`fields.csv missing column "${name}"`);
    return i;
  };
  const cId = idx("id");
  const cLabel = idx("label");
  const cKind = idx("kind");
  const cType = idx("type");
  const cCount = idx("count");
  const cPerStage = idx("per_stage");
  const cWhen = idx("when");
  const cLine = idx("line");
  const cControl = idx("control");
  const cMin = idx("min");
  const cMax = idx("max");
  const cStep = idx("step");
  const cPageId = idx("page_id");
  const cGroup = idx("group");
  const cValidate = idx("validate");

  return rows.slice(1).map((r) => {
    const kind = r[cKind].trim() as Kind;
    const control = r[cControl] ?? "";
    return {
      id: r[cId].trim(),
      label: r[cLabel] ?? "",
      kind,
      type: r[cType].trim() as FieldType,
      count: parseCount(kind, r[cCount] ?? ""),
      perStage: r[cPerStage].trim() === "stage",
      when: parseWhen(r[cWhen] ?? ""),
      sameLine: r[cLine].trim() === "same",
      control,
      min: num(r[cMin] ?? ""),
      max: num(r[cMax] ?? ""),
      step: num(r[cStep] ?? ""),
      pageId: r[cPageId]?.trim() ? assertPageId(r[cPageId].trim()) : undefined,
      group: r[cGroup] ?? "",
      validate: r[cValidate] ?? "",
      options: parseOptions(control),
    };
  });
}

/** All field definitions, in file/record order. */
export const fields: FieldDef[] = loadFields();

/** Lookup a field definition by id. */
export const fieldsById: ReadonlyMap<string, FieldDef> = new Map(
  fields.map((f) => [f.id, f]),
);

export function field(id: string): FieldDef {
  const f = fieldsById.get(id);
  if (!f) throw new Error(`Unknown field id "${id}"`);
  return f;
}
