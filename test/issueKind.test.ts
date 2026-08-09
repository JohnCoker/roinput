import { describe, expect, it } from "vitest";
import {
  fieldValidationFromIssues,
  outlineStatusFromIssues,
} from "../src/issueKind";
import type { IssueKind } from "../src/issueKind";

function issue(kind: IssueKind, message = "msg") {
  return { kind, message };
}

describe("outlineStatusFromIssues", () => {
  it("maps kinds to complete, incomplete, and error", () => {
    expect(outlineStatusFromIssues([])).toBe("complete");
    expect(outlineStatusFromIssues([issue("missing")])).toBe("incomplete");
    expect(outlineStatusFromIssues([issue("placeholder")])).toBe("incomplete");
    expect(outlineStatusFromIssues([issue("missing"), issue("placeholder")])).toBe(
      "incomplete",
    );
    expect(outlineStatusFromIssues([issue("missing"), issue("invalid")])).toBe("error");
    expect(outlineStatusFromIssues([issue("invalid")])).toBe("error");
  });
});

describe("fieldValidationFromIssues", () => {
  it("shows invalid issues as field errors and placeholder as warnings", () => {
    expect(fieldValidationFromIssues([])).toEqual({ state: "none" });
    expect(fieldValidationFromIssues([issue("missing", "Launch Azimuth is required")])).toEqual({
      state: "none",
    });
    expect(
      fieldValidationFromIssues([issue("missing", "Title is required")], "title"),
    ).toEqual({
      message: "Title is required",
      state: "warning",
    });
    expect(
      fieldValidationFromIssues([issue("placeholder", "Angles of Attack values must be unique")]),
    ).toEqual({
      message: "Angles of Attack values must be unique",
      state: "warning",
    });
    expect(
      fieldValidationFromIssues([
        issue("missing", "Launch Azimuth is required"),
        issue("invalid", "Integration time step must not be zero"),
      ]),
    ).toEqual({
      message: "Integration time step must not be zero",
      state: "error",
    });
  });
});
