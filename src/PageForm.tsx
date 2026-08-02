import { Fragment, useMemo, type CSSProperties } from "react";
import { Divider, tokens } from "@fluentui/react-components";
import { fields, type FieldDef } from "./metadata";
import type { InputFile, Issue } from "./InputFile";
import { fieldVisible, type NavLeaf } from "./navTree";
import { fieldHidden } from "./fieldBinding";
import { FieldControl } from "./FieldControl";
import type { PageId } from "./pages";

interface PageFormProps {
  file: InputFile;
  selection: NavLeaf;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

const FORM_COLS = 4;

function formGridColumn(def: FieldDef): string | undefined {
  if (def.kind === "matrix" || def.kind === "vector" || def.type === "text") {
    return "1 / -1";
  }
  return undefined;
}

function clusterRows(defs: FieldDef[]): FieldDef[][] {
  const rows: FieldDef[][] = [];
  let current: FieldDef[] = [];

  const pushCurrent = () => {
    if (current.length > 0) {
      rows.push(current);
      current = [];
    }
  };

  for (const f of defs) {
    if (f.sameLine && current.length > 0) {
      if (current.length >= FORM_COLS) {
        rows.push(current);
        current = [f];
      } else {
        current.push(f);
      }
    } else {
      pushCurrent();
      current = [f];
    }
  }
  pushCurrent();
  return rows;
}

function fieldSpacingStyle(pageId: PageId, def: FieldDef): CSSProperties | undefined {
  if (pageId === "launch_setup" && def.id === "integration_time_step") {
    return { marginTop: tokens.spacingVerticalL };
  }
  if (pageId === "stage_data" && def.id === "engine_type") {
    return {
      marginTop: tokens.spacingVerticalL,
      marginBottom: tokens.spacingVerticalL,
    };
  }
  if (
    pageId === "stage_data" &&
    (def.id === "throat_area" || def.id === "tth_burn_time")
  ) {
    return { marginTop: tokens.spacingVerticalL };
  }
  if (
    pageId === "engine_time_history" &&
    (def.id === "history_time" || def.id === "history_value")
  ) {
    return { marginTop: tokens.spacingVerticalL };
  }
  return undefined;
}

function alignedRowSpacingStyle(pageId: PageId, row: FieldDef[]): CSSProperties | undefined {
  if (
    pageId === "stage_data" &&
    row.some((def) => def.id === "throat_area" || def.id === "tth_burn_time")
  ) {
    return { marginTop: tokens.spacingVerticalL };
  }
  if (
    pageId === "engine_time_history" &&
    row.some((def) => def.id === "history_time" || def.id === "history_value")
  ) {
    return { marginTop: tokens.spacingVerticalL };
  }
  return undefined;
}

function rowUsesAlignedLayout(pageId: PageId, row: FieldDef[]): boolean {
  if (pageId === "configuration") return false;
  if (row.some((def) => def.id === "traj_control" || def.id === "engine_type")) return false;
  if (row.length < 2) return false;
  if (!row.every((def) => def.kind === "scalar" && def.type !== "text")) return false;
  if (pageId === "stage_data") return true;
  return row.every((def) => def.type !== "choice");
}

function rowLayoutStyle(pageId: PageId, row: FieldDef[]): CSSProperties {
  if (pageId === "configuration" && row.length <= 3) {
    return {
      display: "grid",
      gridTemplateColumns: "repeat(3, max-content)",
      columnGap: tokens.spacingHorizontalL,
      rowGap: tokens.spacingVerticalM,
      alignItems: "start",
    };
  }
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${FORM_COLS}, minmax(0, 1fr))`,
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    alignItems: "start",
  };
}

function fieldItemStyle(pageId: PageId, def: FieldDef): CSSProperties {
  const gridColumn = formGridColumn(def);

  return {
    gridColumn,
    flex: pageId === "configuration" ? "0 0 auto" : undefined,
    minWidth: 0,
    width: gridColumn ? "100%" : undefined,
    maxWidth: gridColumn ? "100%" : undefined,
    alignSelf: "start",
    ...fieldSpacingStyle(pageId, def),
  };
}

const labelCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  minWidth: 0,
};

const controlCellStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
};

interface AlignedFieldRowProps {
  row: FieldDef[];
  pageId: PageId;
  file: InputFile;
  stage?: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

function AlignedFieldRow({
  row,
  pageId,
  file,
  stage,
  issues,
  onUpdate,
}: AlignedFieldRowProps) {
  const visible = row.filter((def) => !fieldHidden(file, def));
  if (visible.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
        gridTemplateRows: "auto auto",
        columnGap: tokens.spacingHorizontalL,
        rowGap: tokens.spacingVerticalXS,
        width: "100%",
        minWidth: 0,
        ...alignedRowSpacingStyle(pageId, row),
      }}
    >
      {visible.map((def, column) => {
        const col = column + 1;
        return (
          <Fragment key={def.id}>
            <div style={{ gridColumn: col, gridRow: 1, ...labelCellStyle }}>
              <FieldControl
                def={def}
                file={file}
                stage={stage}
                issues={issues}
                onUpdate={onUpdate}
                part="label"
              />
            </div>
            <div
              style={{
                gridColumn: col,
                gridRow: 2,
                ...controlCellStyle,
                alignSelf: "start",
              }}
            >
              <FieldControl
                def={def}
                file={file}
                stage={stage}
                issues={issues}
                onUpdate={onUpdate}
                part="control"
              />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function PageForm({ file, selection, issues, onUpdate }: PageFormProps) {
  const groups = useMemo(() => {
    const pageFields = fields.filter((f) => {
      if (f.pageId !== selection.pageId) return false;
      if (f.perStage && selection.stage === undefined) return false;
      if (!f.perStage && selection.stage !== undefined) return false;
      if (!fieldVisible(file, f, selection.stage)) return false;
      if (fieldHidden(file, f)) return false;
      return true;
    });

    const byGroup: FieldDef[][] = [];
    let current = "";
    for (const f of pageFields) {
      const g = f.group || "";
      if (byGroup.length === 0 || g !== current) {
        byGroup.push([]);
        current = g;
      }
      byGroup[byGroup.length - 1].push(f);
    }
    return byGroup;
  }, [file, selection]);

  if (groups.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalL,
        marginBottom: tokens.spacingVerticalL,
        minWidth: 0,
        width: "100%",
      }}
    >
      {groups.map((groupFields, gi) => (
        <div key={gi}>
          {gi > 0 ? <Divider style={{ marginBottom: tokens.spacingVerticalM }} /> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
            {clusterRows(groupFields).map((row, ri) =>
              rowUsesAlignedLayout(selection.pageId, row) ? (
                <AlignedFieldRow
                  key={ri}
                  row={row}
                  pageId={selection.pageId}
                  file={file}
                  stage={selection.stage}
                  issues={issues}
                  onUpdate={onUpdate}
                />
              ) : (
                <div key={ri} style={rowLayoutStyle(selection.pageId, row)}>
                  {row.map((def) => (
                    <div key={def.id} style={fieldItemStyle(selection.pageId, def)}>
                      <FieldControl
                        def={def}
                        file={file}
                        stage={selection.stage}
                        issues={issues}
                        onUpdate={onUpdate}
                      />
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
