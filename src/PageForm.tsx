import { useMemo } from "react";
import { Divider, tokens } from "@fluentui/react-components";
import { fields, type FieldDef } from "./metadata";
import type { InputFile, Issue } from "./InputFile";
import { fieldVisible, type NavLeaf } from "./navTree";
import { fieldHidden } from "./fieldBinding";
import { FieldControl } from "./FieldControl";

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

export function PageForm({ file, selection, issues, onUpdate }: PageFormProps) {
  const groups = useMemo(() => {
    const pageFields = fields.filter((f) => {
      if (f.page !== selection.page) return false;
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
      }}
    >
      {groups.map((groupFields, gi) => (
        <div key={gi}>
          {gi > 0 ? <Divider style={{ marginBottom: tokens.spacingVerticalM }} /> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM }}>
            {clusterRows(groupFields).map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${FORM_COLS}, minmax(0, 1fr))`,
                  columnGap: tokens.spacingHorizontalL,
                  alignItems: "start",
                }}
              >
                {row.map((def) => (
                  <div
                    key={def.id}
                    style={{
                      gridColumn: formGridColumn(def),
                      width: "100%",
                      minWidth: 0,
                      maxWidth: "100%",
                      alignSelf: "start",
                      overflow: "hidden",
                    }}
                  >
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
