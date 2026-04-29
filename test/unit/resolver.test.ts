import { describe, expect, it } from "vitest";
import {
  createDiagnosticSummary,
  parseGanttLossless,
  resolveGanttDocument
} from "../../src/core";

describe("resolveGanttDocument", () => {
  it("creates resolved tasks in TaskStmt source order", () => {
    const resolved = resolveGanttDocument(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-01-01, 3d",
      "section Phase 1",
      "Task B : b1, after a1, 2d"
    ].join("\n") + "\n"));

    expect(resolved.tasks.map((task) => task.mermaidId)).toEqual(["a1", "b1"]);
    expect(resolved.tasks.map((task) => task.key)).toEqual(
      resolved.tasks.map((task) => `task:${task.nodeId}`)
    );
    expect(resolved.tasks[0]).toMatchObject({
      label: "Task A",
      normalizedStart: "2026-01-01",
      dependencyKeys: []
    });
    expect(resolved.tasks[1]?.dependencyKeys).toEqual([resolved.tasks[0]?.key]);
  });

  it("reports duplicate IDs and undefined dependencies", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : t1, 2026-01-01, 3d",
      "Task B : t1, after missing, 3d"
    ].join("\n") + "\n"));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "DUPLICATE_TASK_ID",
      "UNDEFINED_DEPENDENCY"
    ]);
    expect(diagnostics[0]?.relatedRanges?.[0]?.raw).toBe("t1");
    expect(diagnostics[1]?.primaryRaw).toBe("missing");
  });

  it("suggests existing non-owner task IDs for undefined dependency fixes", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after missing, 3d"
    ].join("\n") + "\n"));

    const undefinedDependency = diagnostics.find((diagnostic) => diagnostic.code === "UNDEFINED_DEPENDENCY");

    expect(undefinedDependency?.suggestedActions).toContainEqual(expect.objectContaining({
      kind: "quick-fix",
      labelText: "Use dependency a1",
      replacement: expect.objectContaining({
        text: "a1"
      })
    }));
  });

  it("uses the next available suffix for duplicate ID quick fixes", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : t1, 1d",
      "Task B : t1-2, 1d",
      "Task C : t1, 1d"
    ].join("\n") + "\n"));

    const duplicate = diagnostics.find((diagnostic) => diagnostic.code === "DUPLICATE_TASK_ID");

    expect(duplicate?.suggestedActions).toContainEqual(expect.objectContaining({
      kind: "quick-fix",
      replacement: expect.objectContaining({
        text: "t1-3"
      })
    }));
  });

  it("does not suggest the owner task ID for undefined dependency fixes", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : a1, after missing, 1d"
    ].join("\n") + "\n"));

    const undefinedDependency = diagnostics.find((diagnostic) => diagnostic.code === "UNDEFINED_DEPENDENCY");

    expect(undefinedDependency?.suggestedActions).not.toContainEqual(expect.objectContaining({
      kind: "quick-fix",
      replacement: expect.objectContaining({
        text: "a1"
      })
    }));
  });

  it("reports self dependency and circular dependency", () => {
    const selfDiagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : a1, after a1, 1d"
    ].join("\n") + "\n"));
    const circularDiagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "Task A : a1, after b1, 1d",
      "Task B : b1, after a1, 1d"
    ].join("\n") + "\n"));

    expect(selfDiagnostics.map((diagnostic) => diagnostic.code)).toContain("SELF_DEPENDENCY");
    expect(circularDiagnostics.map((diagnostic) => diagnostic.code)).toContain("CIRCULAR_DEPENDENCY");
  });

  it("reports includes and excludes conflicts", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "includes 2026-05-04",
      "excludes weekends",
      "excludes 2026-05-04",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));

    const conflict = diagnostics.find((diagnostic) => diagnostic.code === "INCLUDE_EXCLUDE_CONFLICT");

    expect(conflict?.primaryRaw).toBe("2026-05-04");
    expect(conflict?.relatedRanges?.[0]?.raw).toBe("2026-05-04");
  });

  it("reports date format mismatch and label readability diagnostics", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "これは非常に長い日本語のタスク名でプレビュー上の可読性確認が必要です : 2026-01-01, 3d"
    ].join("\n") + "\n"));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "DATE_FORMAT_MISMATCH",
      "LONG_LABEL_READABILITY"
    ]);
  });

  it("does not report duplicate ID metadata for DD-MM-YYYY task dates", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : t1, 25-04-2026, 2d"
    ].join("\n") + "\n"));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  });

  it("carries document-level parse errors into diagnostics", () => {
    const diagnostics = createDiagnosticSummary(parseGanttLossless("flowchart TD\nA --> B\n"));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("NON_TARGET_DIAGRAM");
    const nonTarget = diagnostics.find((diagnostic) => diagnostic.code === "NON_TARGET_DIAGRAM");
    expect(nonTarget).toMatchObject({
      stage: "parse",
      severity: "error",
      primaryRaw: "flowchart TD\n",
      suggestedActions: [{ kind: "manual-edit" }]
    });
  });
});
