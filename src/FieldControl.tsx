import { Fragment, useEffect, useRef, useState } from "react";
import {
  Field,
  Input,
  Radio,
  RadioGroup,
  Text,
  tokens,
} from "@fluentui/react-components";
import type { InputProps } from "@fluentui/react-components";
import type { FieldDef } from "./metadata";
import type { InputFile, Issue } from "./InputFile";
import {
  choiceOptions,
  displayLabel,
  fieldHidden,
  fieldReadOnly,
  formatScalarValue,
  readMatrix,
  readScalar,
  readVector,
  writeMatrixElement,
  writeScalar,
  writeVectorElement,
} from "./fieldBinding";

const VECTOR_COLS = 8;

const radioGroupStyle = {
  display: "flex" as const,
  flexWrap: "wrap" as const,
  columnGap: tokens.spacingHorizontalXL,
  rowGap: tokens.spacingVerticalM,
};

const spreadsheetTableWrapStyle = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto" as const,
};

const spreadsheetTableStyle = {
  borderCollapse: "collapse" as const,
  tableLayout: "fixed" as const,
  width: "100%",
  fontSize: tokens.fontSizeBase300,
};

const spreadsheetCellOverflow = {
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
  whiteSpace: "nowrap" as const,
  minWidth: 0,
};

const spreadsheetRowHeaderCellStyle = {
  textAlign: "left" as const,
  padding: tokens.spacingHorizontalXS,
  border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  whiteSpace: "nowrap" as const,
  width: "0",
};

const spreadsheetHeaderCellStyle = {
  textAlign: "left" as const,
  padding: tokens.spacingHorizontalXS,
  fontWeight: tokens.fontWeightSemibold,
  border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  ...spreadsheetCellOverflow,
};

const spreadsheetCornerCellStyle = {
  ...spreadsheetRowHeaderCellStyle,
  fontWeight: tokens.fontWeightSemibold,
};

const spreadsheetBodyCellStyle = {
  padding: 0,
  border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  ...spreadsheetCellOverflow,
};

const spreadsheetLabelCellStyle = {
  ...spreadsheetRowHeaderCellStyle,
};

const spreadsheetInputStyle = {
  width: "100%",
  minWidth: 0,
  border: "none",
  borderRadius: 0,
  boxShadow: "none",
};

const spreadsheetInputProps = {
  style: spreadsheetInputStyle,
  input: {
    style: {
      textAlign: "left" as const,
      paddingInline: tokens.spacingHorizontalXS,
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    },
  },
};

function vectorRowChunks(length: number, cols = VECTOR_COLS): number[][] {
  if (length === 0) return [];
  if (length <= cols) return [Array.from({ length }, (_, i) => i)];
  const rows: number[][] = [];
  for (let i = 0; i < length; i += cols) {
    const end = Math.min(i + cols, length);
    rows.push(Array.from({ length: end - i }, (_, j) => i + j));
  }
  return rows;
}

function machColumnLabels(
  file: InputFile,
  def: FieldDef,
  stage?: number,
): number[] | null {
  if (stage === undefined) return null;
  if (def.id === "mach") return null;
  if (def.count?.rows !== "n_mach" || def.count.cols !== undefined) return null;
  return readVector(file, "mach", stage);
}

function issuesForField(
  issues: Issue[],
  id: string,
  stage?: number,
  index?: number,
): Issue[] {
  return issues.filter(
    (i) =>
      i.fieldId === id &&
      (stage === undefined ? i.stage === undefined : i.stage === stage) &&
      (index === undefined || i.index === index),
  );
}

function fieldError(issues: Issue[]): string | undefined {
  const err = issues.find((i) => i.severity === "error");
  return err?.message;
}

function fieldValidation(issues: Issue[]): {
  message?: string;
  state: "none" | "error" | "warning";
} {
  if (issues.length === 0) return { state: "none" };
  const message = fieldError(issues);
  const softOnly = issues.every(
    (i) =>
      i.message.endsWith(" is required") || i.message.includes("must be unique"),
  );
  return { message, state: softOnly ? "warning" : "error" };
}

const fieldShellStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  alignSelf: "start" as const,
};

const columnInputStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box" as const,
};

type EditableNumericInputProps = Omit<
  InputProps,
  "value" | "onChange" | "defaultValue"
> & {
  value: string;
  onCommit: (raw: string) => void;
};

/** Keep a local draft while focused so empty/partial input is not overwritten immediately. */
function EditableNumericInput({
  value,
  onCommit,
  onFocus,
  onBlur,
  readOnly,
  ...inputProps
}: EditableNumericInputProps) {
  const editingRef = useRef(false);
  const draftRef = useRef(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) {
      draftRef.current = value;
      setDraft(value);
    }
  }, [value, editing]);

  return (
    <Input
      {...inputProps}
      readOnly={readOnly}
      value={editing ? draft : value}
      onFocus={(ev) => {
        if (!readOnly) {
          editingRef.current = true;
          draftRef.current = value;
          setEditing(true);
          setDraft(value);
        }
        onFocus?.(ev);
      }}
      onChange={(_, data) => {
        if (editingRef.current) {
          draftRef.current = data.value;
          setDraft(data.value);
        }
      }}
      onBlur={(ev) => {
        if (editingRef.current) {
          editingRef.current = false;
          setEditing(false);
          onCommit(draftRef.current);
        }
        onBlur?.(ev);
      }}
    />
  );
}

function truncatedFieldText(text: string) {
  return {
    children: text,
    title: text,
    style: {
      display: "block",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
  };
}

function truncatedFieldLabel(file: InputFile, def: FieldDef) {
  return truncatedFieldText(displayLabel(file, def));
}

function fieldProps(
  file: InputFile,
  def: FieldDef,
  validationState: "none" | "error" | "warning",
  validationMessage?: string,
) {
  return {
    label: truncatedFieldLabel(file, def),
    style: fieldShellStyle,
    validationState,
    validationMessage: validationMessage
      ? truncatedFieldText(validationMessage)
      : undefined,
  };
}

interface ScalarControlProps {
  def: FieldDef;
  file: InputFile;
  stage?: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

function ScalarControl({ def, file, stage, issues, onUpdate }: ScalarControlProps) {
  const errs = issuesForField(issues, def.id, stage);
  const { message: validationMessage, state: validationState } = fieldValidation(errs);

  if (fieldHidden(file, def)) return null;

  const options = choiceOptions(file, def);
  if (def.type === "choice" && options) {
    const raw = readScalar(file, def.id, stage);
    const value = raw === null ? "" : String(raw);
    return (
      <Field {...fieldProps(file, def, validationState, validationMessage)}>
        <RadioGroup
          style={radioGroupStyle}
          value={value}
          onChange={(_, data) => {
            onUpdate((f) => writeScalar(f, def.id, Number(data.value), stage));
          }}
        >
          {options.map((opt) => (
            <Radio key={opt.value} value={String(opt.value)} label={opt.label} />
          ))}
        </RadioGroup>
      </Field>
    );
  }

  if (def.type === "text") {
    return (
      <Field {...fieldProps(file, def, validationState, validationMessage)}>
        <Input
          style={columnInputStyle}
          value={file.title}
          maxLength={80}
          onChange={(_, data) => {
            onUpdate((f) => {
              f.title = data.value;
            });
          }}
        />
      </Field>
    );
  }

  const raw = readScalar(file, def.id, stage);
  const display = formatScalarValue(raw, def);
  const readOnly = fieldReadOnly(def);

  return (
    <Field {...fieldProps(file, def, validationState, validationMessage)}>
      <EditableNumericInput
        style={columnInputStyle}
        value={display}
        readOnly={readOnly}
        inputMode={def.type === "int" ? "numeric" : "decimal"}
        onCommit={(raw) => {
          if (readOnly) return;
          onUpdate((f) => writeScalar(f, def.id, raw, stage));
        }}
      />
    </Field>
  );
}

interface VectorControlProps {
  def: FieldDef;
  file: InputFile;
  stage?: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

function VectorControl({ def, file, stage, issues, onUpdate }: VectorControlProps) {
  const values = readVector(file, def.id, stage);
  const fieldIssues = issuesForField(issues, def.id, stage);
  const { message: validationMessage, state: validationState } = fieldValidation(fieldIssues);
  const machLabels = machColumnLabels(file, def, stage);
  const label = displayLabel(file, def);
  // Mach count tops out at 15 — keep on one row. Other vectors wrap at 8 (with headers per band when needed).
  const chunkCols = def.id === "mach" ? Math.max(values.length, 1) : VECTOR_COLS;
  const rows = vectorRowChunks(values.length, chunkCols);

  if (machLabels !== null && machLabels.length === 0) {
    return (
      <Field {...fieldProps(file, def, validationState, validationMessage)}>
        <Text block style={{ color: tokens.colorNeutralForeground3 }}>
          Set Mach numbers on the aerodynamic data page first.
        </Text>
      </Field>
    );
  }

  return (
    <Field {...fieldProps(file, def, validationState, validationMessage)}>
      <div style={spreadsheetTableWrapStyle}>
        <table style={spreadsheetTableStyle}>
          <tbody>
            {rows.map((indices) => (
              <Fragment key={indices[0]}>
                {machLabels !== null ? (
                  <tr>
                    {indices.map((index) => (
                      <th
                        key={index}
                        style={spreadsheetHeaderCellStyle}
                        title={formatScalarValue(machLabels[index], def)}
                      >
                        {formatScalarValue(machLabels[index], def)}
                      </th>
                    ))}
                  </tr>
                ) : null}
                <tr>
                  {indices.map((index) => (
                    <td key={index} style={spreadsheetBodyCellStyle}>
                      <EditableNumericInput
                        {...spreadsheetInputProps}
                        value={formatScalarValue(values[index], def)}
                        inputMode="decimal"
                        title={formatScalarValue(values[index], def)}
                        aria-label={`${label} ${index + 1}`}
                        aria-invalid={
                          fieldValidation(issuesForField(issues, def.id, stage, index))
                            .state !== "none"
                        }
                        onCommit={(raw) => {
                          onUpdate((f) =>
                            writeVectorElement(f, def.id, index, raw, stage),
                          );
                        }}
                      />
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Field>
  );
}

interface MatrixControlProps {
  def: FieldDef;
  file: InputFile;
  stage: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

function MatrixControl({ def, file, stage, issues, onUpdate }: MatrixControlProps) {
  const matrix = readMatrix(file, def.id, stage);
  const mach = readVector(file, "mach", stage);
  const aoa = readVector(file, "aoa", stage);
  const { message: validationMessage, state: validationState } = fieldValidation(
    issuesForField(issues, def.id, stage),
  );

  if (matrix.length === 0 || aoa.length === 0) {
    return (
      <Text block style={{ color: tokens.colorNeutralForeground3 }}>
        Set Mach numbers and angles of attack first.
      </Text>
    );
  }

  return (
    <Field {...fieldProps(file, def, validationState, validationMessage)}>
      <div style={spreadsheetTableWrapStyle}>
        <table style={spreadsheetTableStyle}>
          <thead>
            <tr>
              <th style={spreadsheetCornerCellStyle} aria-hidden="true" />
              {aoa.map((a, ci) => (
                <th key={ci} style={spreadsheetHeaderCellStyle} title={formatScalarValue(a, def)}>
                  {formatScalarValue(a, def)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td
                  style={spreadsheetLabelCellStyle}
                  title={formatScalarValue(mach[ri] ?? ri, def)}
                >
                  {formatScalarValue(mach[ri] ?? ri, def)}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci} style={spreadsheetBodyCellStyle}>
                    <EditableNumericInput
                      {...spreadsheetInputProps}
                      value={formatScalarValue(cell, def)}
                      inputMode="decimal"
                      title={formatScalarValue(cell, def)}
                      aria-label={`${displayLabel(file, def)} row ${ri + 1} col ${ci + 1}`}
                      onCommit={(raw) => {
                        onUpdate((f) =>
                          writeMatrixElement(f, def.id, ri, ci, raw, stage),
                        );
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Field>
  );
}

interface FieldControlProps {
  def: FieldDef;
  file: InputFile;
  stage?: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
}

export function FieldControl(props: FieldControlProps) {
  const { def } = props;
  if (def.kind === "matrix") {
    if (props.stage === undefined) return null;
    return <MatrixControl {...props} stage={props.stage} />;
  }
  if (def.kind === "vector") {
    return <VectorControl {...props} />;
  }
  return <ScalarControl {...props} />;
}
