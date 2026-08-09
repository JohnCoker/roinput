/** Why a validation issue was raised — drives outline and field hint styling. */
export type IssueKind = "missing" | "placeholder" | "invalid";

export type OutlineStatus = "complete" | "incomplete" | "error";

export type FieldValidationState = "none" | "warning" | "error";

/** Work still to do (empty, unset, or template placeholders). */
export function isWorkInProgressKind(kind: IssueKind): boolean {
  return kind === "missing" || kind === "placeholder";
}

export function outlineStatusFromIssues(
  issues: { kind: IssueKind }[],
): OutlineStatus {
  if (issues.length === 0) return "complete";
  if (issues.some((i) => i.kind === "invalid")) return "error";
  return "incomplete";
}

/** Fields that show inline "required" hints; others rely on nav outline for missing. */
const INLINE_MISSING_FIELD_IDS = new Set(["title"]);

export function fieldValidationFromIssues(
  issues: { kind: IssueKind; message: string }[],
  fieldId?: string,
): {
  message?: string;
  state: FieldValidationState;
} {
  const visible =
    fieldId && INLINE_MISSING_FIELD_IDS.has(fieldId)
      ? issues
      : issues.filter((i) => i.kind !== "missing");
  if (visible.length === 0) return { state: "none" };
  const invalid = visible.find((i) => i.kind === "invalid");
  if (invalid) return { message: invalid.message, state: "error" };
  const softer = visible.find((i) => isWorkInProgressKind(i.kind));
  if (softer) return { message: softer.message, state: "warning" };
  return { state: "none" };
}
