import { Fragment, useEffect, useRef, useState } from "react";
import {
  Field,
  Input,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { InputProps } from "@fluentui/react-components";
import type { FieldDef } from "./metadata";
import type { InputFile, Issue } from "./InputFile";
import {
  choiceOptions,
  displayLabel,
  displayLabelLines,
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

const useStyles = makeStyles({
  tableWrap: {
    width: "100%",
    maxWidth: "100%",
  },
  table: {
    borderCollapse: "collapse",
    tableLayout: "fixed",
    width: "100%",
    fontSize: tokens.fontSizeBase300,
  },
  headerCell: {
    textAlign: "left",
    padding: tokens.spacingHorizontalXS,
    fontWeight: tokens.fontWeightSemibold,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: "nowrap",
  },
  headerCellClip: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "8rem",
  },
  rowHeaderCell: {
    textAlign: "left",
    padding: tokens.spacingHorizontalXS,
    fontWeight: tokens.fontWeightSemibold,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    whiteSpace: "nowrap",
  },
  bodyCell: {
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    minWidth: 0,
  },
  cellInput: {
    width: "100%",
    minWidth: 0,
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
  },
  cellInputField: {
    textAlign: "left",
    paddingInline: tokens.spacingHorizontalXS,
    fontWeight: tokens.fontWeightRegular,
  },
  fieldShell: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  choiceControlOnly: {
    width: "fit-content",
    maxWidth: "100%",
  },
  engineTypeRadioGroup: {
    rowGap: tokens.spacingVerticalM,
  },
  columnInput: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  fieldLabelLine: {
    display: "block",
    lineHeight: tokens.lineHeightBase300,
  },
});

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
  className,
  input,
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
      className={className}
      value={editing ? draft : value}
      input={input}
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

function FieldLabel({ file, def }: { file: InputFile; def: FieldDef }) {
  const styles = useStyles();
  const lines = displayLabelLines(file, def);
  if (lines) {
    return (
      <>
        {lines.map((line, index) => (
          <Text
            key={index}
            block
            size={300}
            weight="semibold"
            className={styles.fieldLabelLine}
          >
            {line.length > 0 ? line : "\u00A0"}
          </Text>
        ))}
      </>
    );
  }
  return (
    <Text block size={300} weight="semibold" wrap>
      {displayLabel(file, def)}
    </Text>
  );
}

function fieldShellProps(
  file: InputFile,
  def: FieldDef,
  validationState: "none" | "error" | "warning",
  validationMessage?: string,
  showLabel = true,
) {
  return {
    label: showLabel ? <FieldLabel file={file} def={def} /> : undefined,
    className: undefined,
    validationState,
    validationMessage,
  };
}

export function FieldControlLabel({ file, def }: { file: InputFile; def: FieldDef }) {
  return <FieldLabel file={file} def={def} />;
}

export type FieldControlPart = "full" | "label" | "control";

interface ScalarControlProps {
  def: FieldDef;
  file: InputFile;
  stage?: number;
  issues: Issue[];
  onUpdate: (mutate: (f: InputFile) => void) => void;
  part?: FieldControlPart;
}

function ScalarControl({
  def,
  file,
  stage,
  issues,
  onUpdate,
  part = "full",
}: ScalarControlProps) {
  const styles = useStyles();
  const errs = issuesForField(issues, def.id, stage);
  const { message: validationMessage, state: validationState } = fieldValidation(errs);

  if (fieldHidden(file, def)) return null;

  if (part === "label") {
    return <FieldLabel file={file} def={def} />;
  }

  const showLabel = part === "full";
  const options = choiceOptions(file, def);
  if (def.type === "choice" && options) {
    const raw = readScalar(file, def.id, stage);
    const value = raw === null ? "" : String(raw);
    const radioGroup = (
      <RadioGroup
        className={def.id === "engine_type" ? styles.engineTypeRadioGroup : undefined}
        layout="vertical"
        value={value}
        onChange={(_, data) => {
          onUpdate((f) => writeScalar(f, def.id, Number(data.value), stage));
        }}
      >
        {options.map((opt) => (
          <Radio key={opt.value} value={String(opt.value)} label={opt.label} />
        ))}
      </RadioGroup>
    );

    if (part === "control") {
      return (
        <div className={styles.choiceControlOnly}>
          {radioGroup}
          {validationMessage ? (
            <Text
              size={200}
              style={{
                marginTop: tokens.spacingVerticalXXS,
                color:
                  validationState === "error"
                    ? tokens.colorPaletteRedForeground1
                    : tokens.colorNeutralForeground3,
              }}
            >
              {validationMessage}
            </Text>
          ) : null}
        </div>
      );
    }

    return (
      <Field
        {...fieldShellProps(file, def, validationState, validationMessage, showLabel)}
        className={styles.fieldShell}
      >
        {radioGroup}
      </Field>
    );
  }

  if (def.type === "text") {
    return (
      <Field
        {...fieldShellProps(file, def, validationState, validationMessage, showLabel)}
        className={styles.fieldShell}
      >
        <Input
          className={styles.columnInput}
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

  const numericInput = (
    <EditableNumericInput
      className={styles.columnInput}
      value={display}
      readOnly={readOnly}
      inputMode={def.type === "int" ? "numeric" : "decimal"}
      onCommit={(raw) => {
        if (readOnly) return;
        onUpdate((f) => writeScalar(f, def.id, raw, stage));
      }}
    />
  );

  if (part === "control") {
    return numericInput;
  }

  return (
    <Field
      {...fieldShellProps(file, def, validationState, validationMessage, showLabel)}
      className={styles.fieldShell}
    >
      {numericInput}
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
  const styles = useStyles();
  const values = readVector(file, def.id, stage);
  const fieldIssues = issuesForField(issues, def.id, stage);
  const { message: validationMessage, state: validationState } = fieldValidation(fieldIssues);
  const machLabels = machColumnLabels(file, def, stage);
  const label = displayLabel(file, def);
  const chunkCols = def.id === "mach" ? Math.max(values.length, 1) : VECTOR_COLS;
  const rows = vectorRowChunks(values.length, chunkCols);

  if (machLabels !== null && machLabels.length === 0) {
    return (
      <Field
        {...fieldShellProps(file, def, validationState, validationMessage)}
        className={styles.fieldShell}
      >
        <Text block style={{ color: tokens.colorNeutralForeground3 }}>
          Set Mach numbers on the aerodynamic data page first.
        </Text>
      </Field>
    );
  }

  return (
    <Field
      {...fieldShellProps(file, def, validationState, validationMessage)}
      className={styles.fieldShell}
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            {rows.map((indices) => (
              <Fragment key={indices[0]}>
                {machLabels !== null ? (
                  <tr>
                    {indices.map((index) => (
                      <th
                        key={index}
                        className={styles.headerCell}
                        title={formatScalarValue(machLabels[index], def)}
                      >
                        {formatScalarValue(machLabels[index], def)}
                      </th>
                    ))}
                  </tr>
                ) : null}
                <tr>
                  {indices.map((index) => (
                    <td key={index} className={styles.bodyCell}>
                      <EditableNumericInput
                        className={styles.cellInput}
                        input={{ className: styles.cellInputField }}
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
  const styles = useStyles();
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
    <Field
      {...fieldShellProps(file, def, validationState, validationMessage)}
      className={styles.fieldShell}
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.rowHeaderCell} rowSpan={2}>
                Mach Number
              </th>
              <th className={styles.headerCell} colSpan={aoa.length}>
                Angle of Attack (deg)
              </th>
            </tr>
            <tr>
              {aoa.map((a, ci) => (
                <th
                  key={ci}
                  className={mergeClasses(styles.headerCell, styles.headerCellClip)}
                  title={formatScalarValue(a, def)}
                >
                  {formatScalarValue(a, def)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td
                  className={styles.rowHeaderCell}
                  title={formatScalarValue(mach[ri] ?? ri, def)}
                >
                  {formatScalarValue(mach[ri] ?? ri, def)}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci} className={styles.bodyCell}>
                    <EditableNumericInput
                      className={styles.cellInput}
                      input={{ className: styles.cellInputField }}
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
  part?: FieldControlPart;
}

export function FieldControl({ part = "full", ...props }: FieldControlProps) {
  const { def } = props;
  if (def.kind === "matrix") {
    if (props.stage === undefined) return null;
    return <MatrixControl {...props} stage={props.stage} />;
  }
  if (def.kind === "vector") {
    return <VectorControl {...props} />;
  }
  return <ScalarControl {...props} part={part} />;
}
