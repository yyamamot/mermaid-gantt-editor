import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEditorAction,
  createEditorState,
  parseGanttLossless
} from "../../src/core";

describe("createEditorState", () => {
  it("creates Task Grid rows in source order with diagnostics and advanced source items", () => {
    const state = createEditorState(parseGanttLossless([
      "%%{init: { \"theme\": \"forest\" }}%%",
      "gantt",
      "section Planning",
      "Task B : b1, after missing, 2d",
      "%% keep source comment",
      "Task A : a1, 2026-01-01, 3d",
      "click a1 href \"https://example.com\""
    ].join("\n") + "\n"));

    expect(state.mode).toBe("structured");
    expect(state.grid.rows.map((row) => row.label)).toEqual(["Task B", "Task A"]);
    expect(state.grid.viewOrder).toEqual(state.grid.rows.map((row) => row.nodeId));
    expect(state.grid.rows[0]).toMatchObject({
      sectionLabel: "Planning",
      id: "b1",
      duration: "2d",
      dependencies: ["missing"]
    });
    expect(state.grid.rows[0]?.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UNDEFINED_DEPENDENCY");
    expect(state.advancedSourceItems.map((item) => item.kind)).toEqual([
      "DirectiveBlock",
      "CommentLine",
      "ClickStmt"
    ]);
    expect(state.previewSource).toBeUndefined();
  });

  it("creates visible rows for empty explicit sections", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Backlog",
      "section Build",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));

    expect(state.grid.rows.map((row) => ({
      kind: row.kind,
      sectionLabel: row.sectionLabel,
      label: row.label
    }))).toEqual([
      { kind: "section", sectionLabel: "Backlog", label: "Backlog" },
      { kind: "task", sectionLabel: "Build", label: "Task A" }
    ]);
    expect(state.grid.viewOrder).toEqual(state.grid.rows.map((row) => row.nodeId));
  });

  it("blocks preview for topAxis while preserving structured editing", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "topAxis",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));

    expect(state.mode).toBe("structured");
    expect(state.previewSource).toBeUndefined();
    expect(state.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "TOP_AXIS_PREVIEW_UNSUPPORTED",
        severity: "warning",
        primaryRaw: "topAxis"
      })
    ]));
  });

  it("keeps preview source available for DD-MM-YYYY task dates", () => {
    const source = [
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : t1, 25-04-2026, 2d"
    ].join("\n") + "\n";
    const state = createEditorState(parseGanttLossless(source));

    expect(state.mode).toBe("structured");
    expect(state.previewSource).toBe(source);
    expect(state.grid.rows[0]).toMatchObject({
      id: "t1",
      start: "25-04-2026",
      duration: "2d"
    });
    expect(state.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  });

  it("keeps grid sort and filter view-only without changing source", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section A",
      "Beta : b1, 1d",
      "Alpha : a1, 1d"
    ].join("\n") + "\n"));

    const result = applyEditorAction(state, {
      type: "update-grid-view",
      sort: { field: "label", direction: "asc" }
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.state.grid.isViewOnlyOrdering).toBe(true);
    expect(result.state.grid.viewOrder).toEqual([
      state.grid.rows[1]?.nodeId,
      state.grid.rows[0]?.nodeId
    ]);
  });
});

describe("applyEditorAction", () => {
  it("selects grid rows and diagnostics without changing source", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const selected = applyEditorAction(state, { type: "select-task", nodeId: taskNodeId });

    expect(selected.sourceChanged).toBe(false);
    expect(selected.state.selected).toEqual({ kind: "task", nodeId: taskNodeId });
  });

  it("applies manual diagnostic actions by selecting the diagnostic range", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask B : b1, after missing, 2d\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "UNDEFINED_DEPENDENCY");
    expect(diagnostic).toBeDefined();

    const result = applyEditorAction(state, {
      type: "apply-diagnostic-action",
      code: diagnostic?.code ?? "",
      primaryRange: diagnostic?.primaryRange ?? state.grid.rows[0]!.diagnostics[0]!.primaryRange,
      actionIndex: 0
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.state.selected).toEqual({
      kind: "diagnostic",
      code: "UNDEFINED_DEPENDENCY",
      primaryRange: diagnostic?.primaryRange
    });
  });

  it("applies diagnostic quick-fix replacements when the action carries a patch", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const row = state.grid.rows[0]!;
    const primaryRange = {
      start: { offset: 6, line: 2, column: 1 },
      end: { offset: 12, line: 2, column: 7 }
    };
    const stateWithQuickFix = {
      ...state,
      diagnostics: [{
        code: "TEST_RENAME_LABEL",
        stage: "resolution" as const,
        severity: "warning" as const,
        messageKey: "diagnostics.testRenameLabel",
        primaryRange,
        primaryRaw: "Task A",
        suggestedActions: [{
          kind: "quick-fix" as const,
          labelKey: "diagnostics.action.testRenameLabel",
          replacement: {
            range: primaryRange,
            text: "Task B"
          }
        }]
      }],
      grid: {
        ...state.grid,
        rows: [{
          ...row,
          diagnostics: []
        }]
      }
    };

    const result = applyEditorAction(stateWithQuickFix, {
      type: "apply-diagnostic-action",
      code: "TEST_RENAME_LABEL",
      primaryRange,
      actionIndex: 0
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\nTask B : a1, 1d\n");
  });

  it("applies resolver-provided date format quick fixes", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : 2026-01-01, 3d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "DATE_FORMAT_MISMATCH");
    expect(diagnostic?.suggestedActions[1]?.kind).toBe("quick-fix");

    const result = applyEditorAction(state, {
      type: "apply-diagnostic-action",
      code: diagnostic?.code ?? "",
      primaryRange: diagnostic?.primaryRange ?? state.grid.rows[0]!.diagnostics[0]!.primaryRange,
      actionIndex: 1
    });

    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : 01-01-2026, 3d",
      ""
    ].join("\n"));
  });

  it("applies resolver-provided duplicate ID quick fixes", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : t1, 2026-01-01, 3d",
      "Task B : t1, 2026-01-02, 3d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "DUPLICATE_TASK_ID");
    expect(diagnostic?.suggestedActions[1]?.kind).toBe("quick-fix");

    const result = applyEditorAction(state, {
      type: "apply-diagnostic-action",
      code: diagnostic?.code ?? "",
      primaryRange: diagnostic?.primaryRange ?? state.grid.rows[1]!.diagnostics[0]!.primaryRange,
      actionIndex: 1
    });

    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : t1, 2026-01-01, 3d",
      "Task B : t1-2, 2026-01-02, 3d",
      ""
    ].join("\n"));
  });

  it("applies resolver-provided dependency target quick fixes", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after missing, 2d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "UNDEFINED_DEPENDENCY");
    const actionIndex = diagnostic?.suggestedActions.findIndex((action) => {
      return action.kind === "quick-fix" && action.replacement?.text === "a1";
    }) ?? -1;
    expect(actionIndex).toBeGreaterThanOrEqual(0);

    const result = applyEditorAction(state, {
      type: "apply-diagnostic-action",
      code: diagnostic?.code ?? "",
      primaryRange: diagnostic?.primaryRange ?? state.grid.rows[1]!.diagnostics[0]!.primaryRange,
      actionIndex
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1, 2d",
      ""
    ].join("\n"));
  });

  it("applies resolver-provided host compatibility quick fixes", () => {
    const state = createEditorState(parseGanttLossless([
      "---",
      "config:",
      "  gantt:",
      "    displayMode: compact",
      "---",
      "gantt",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "HOST_VERSION_SENSITIVE_SYNTAX");
    const actionIndex = diagnostic?.suggestedActions.findIndex((action) => {
      return action.kind === "quick-fix" && action.replacement?.text === "# displayMode: compact";
    }) ?? -1;
    expect(actionIndex).toBeGreaterThanOrEqual(0);

    const result = applyEditorAction(state, {
      type: "apply-diagnostic-action",
      code: diagnostic?.code ?? "",
      primaryRange: diagnostic?.primaryRange ?? state.diagnostics[0]!.primaryRange,
      actionIndex
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "---",
      "config:",
      "  gantt:",
      "    # displayMode: compact",
      "---",
      "gantt",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
  });

  it("replaces raw source for fallback editing", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "replace-source",
      source: "gantt\nTask B : b1, 2d\n"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\nTask B : b1, 2d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      label: "Task B",
      id: "b1",
      duration: "2d"
    });
  });

  it("replaces fallback raw source and returns to structured mode", () => {
    const source = readFileSync(join(process.cwd(), "fixtures/product/fallback-invalid-metadata/source.mmd"), "utf8");
    const state = createEditorState(parseGanttLossless(source));
    expect(state.mode).toBe("fallback");

    const result = applyEditorAction(state, {
      type: "replace-source",
      source: "gantt\nTask B : b1, 2d\n"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\nTask B : b1, 2d\n");
    expect(result.state.mode).toBe("structured");
    expect(result.state.grid.rows[0]).toMatchObject({
      label: "Task B",
      id: "b1",
      duration: "2d"
    });
  });

  it("updates a task label through exact lossless write-back", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-label",
      nodeId: taskNodeId,
      label: "設計レビュー"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\n設計レビュー : a1, 1d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      nodeId: taskNodeId,
      label: "設計レビュー"
    });
  });

  it("renames a task ID and confirmed dependency references", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1, 2d",
      "Task C : c1, until a1"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: taskNodeId,
      id: "design",
      dependencyPatchPolicy: "confirm"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : design, 1d",
      "Task B : b1, after design, 2d",
      "Task C : c1, until design",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.dependencies)).toEqual([
      [],
      ["design"],
      []
    ]);
    expect(result.state.grid.rows[2]?.until).toBe("design");
  });

  it("adds a missing task ID without rewriting other metadata", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : 2026-01-01, 1d\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: taskNodeId,
      id: "a1",
      dependencyPatchPolicy: "none"
    });

    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 1d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      id: "a1",
      start: "2026-01-01",
      duration: "1d"
    });
  });

  it("blocks adding a missing task ID when task metadata has no free slot", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : 2026-01-01, 1d, after b1\nTask B : b1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      id: "a1",
      dependencyPatchPolicy: "none"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics[0]?.code).toBe("EDITOR_TASK_METADATA_LIMIT");
  });

  it("blocks invalid and duplicate task IDs before they become invalid source", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, 1d",
      ""
    ].join("\n")));
    const invalid = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      id: "bad id",
      dependencyPatchPolicy: "none"
    });
    const duplicate = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: state.grid.rows[1]?.nodeId ?? "",
      id: "a1",
      dependencyPatchPolicy: "none"
    });

    expect(invalid.sourceChanged).toBe(false);
    expect(invalid.state.source).toBe(state.source);
    expect(invalid.diagnostics[0]?.code).toBe("EDITOR_INVALID_TASK_ID");
    expect(duplicate.sourceChanged).toBe(false);
    expect(duplicate.state.source).toBe(state.source);
    expect(duplicate.diagnostics[0]?.code).toBe("EDITOR_DUPLICATE_TASK_ID");
  });

  it("renames a task ID and confirmed click targets", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com\"",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "update-task-id",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      id: "renamed",
      dependencyPatchPolicy: "confirm"
    });

    expect(result.state.source).toBe([
      "gantt",
      "Task A : renamed, 1d",
      "click renamed href \"https://example.com\"",
      ""
    ].join("\n"));
  });

  it("updates document settings and section labels through source patches", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "title Old",
      "section Planning",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));

    const titleUpdated = applyEditorAction(state, {
      type: "update-setting",
      key: "title",
      value: "New Roadmap"
    });
    const sectionUpdated = applyEditorAction(titleUpdated.state, {
      type: "update-section-label",
      sectionId: "section-0",
      label: "設計"
    });

    expect(sectionUpdated.state.source).toBe([
      "gantt",
      "title New Roadmap",
      "section 設計",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(sectionUpdated.state.semantic?.settings.title).toBe("New Roadmap");
    expect(sectionUpdated.state.grid.rows[0]?.sectionLabel).toBe("設計");
  });

  it("blocks empty section labels before they become invalid source", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "update-section-label",
      sectionId: state.grid.rows[0]?.sectionId ?? "",
      label: ""
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics[0]?.code).toBe("EDITOR_SECTION_LABEL_REQUIRED");
  });

  it("adds missing settings after the diagram keyword", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-setting",
      key: "dateFormat",
      value: "YYYY-MM-DD"
    });

    expect(result.state.source).toBe("gantt\ndateFormat YYYY-MM-DD\nTask A : a1, 1d\n");
    expect(result.state.semantic?.settings.dateFormat).toBe("YYYY-MM-DD");
  });

  it("blocks invalid tickInterval before it becomes invalid source", () => {
    const state = createEditorState(parseGanttLossless("gantt\ntickInterval 1week\nTask A : a1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-setting",
      key: "tickInterval",
      value: "bad value"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics[0]?.code).toBe("EDITOR_INVALID_TICK_INTERVAL");
  });

  it("updates accessibility title and description settings", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "accTitle: Old title",
      "Task A : a1, 1d",
      ""
    ].join("\n")));
    const titleUpdated = applyEditorAction(state, {
      type: "update-setting",
      key: "accTitle",
      value: "Release roadmap"
    });
    const descrUpdated = applyEditorAction(titleUpdated.state, {
      type: "update-setting",
      key: "accDescr",
      value: "Roadmap from design to validation"
    });

    expect(descrUpdated.state.source).toBe([
      "gantt",
      "accDescr: Roadmap from design to validation",
      "accTitle: Release roadmap",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(descrUpdated.state.semantic?.settings.accTitle).toBe("Release roadmap");
    expect(descrUpdated.state.semantic?.settings.accDescr).toBe("Roadmap from design to validation");
    expect(descrUpdated.state.advancedSourceItems.map((item) => item.kind)).not.toContain("AccTitleStmt");
    expect(descrUpdated.state.advancedSourceItems.map((item) => item.kind)).not.toContain("AccDescrLineStmt");
  });

  it("updates weekday and weekend settings through source patches", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "weekday monday",
      "weekend friday",
      "Task A : a1, 1d",
      ""
    ].join("\n")));

    const weekdayUpdated = applyEditorAction(state, {
      type: "update-setting",
      key: "weekday",
      value: "sunday"
    });
    const weekendUpdated = applyEditorAction(weekdayUpdated.state, {
      type: "update-setting",
      key: "weekend",
      value: "saturday"
    });

    expect(weekendUpdated.state.source).toBe([
      "gantt",
      "weekday sunday",
      "weekend saturday",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(weekendUpdated.state.semantic?.settings.weekday).toBe("sunday");
    expect(weekendUpdated.state.semantic?.settings.weekend).toBe("saturday");
  });

  it("updates array-valued includes and excludes settings through source patches", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "includes weekdays",
      "%% keep comment",
      "excludes weekends",
      "includes 2026-05-01",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));

    const includesUpdated = applyEditorAction(state, {
      type: "update-setting",
      key: "includes",
      value: ["weekdays", "2026-05-02"]
    });
    const excludesUpdated = applyEditorAction(includesUpdated.state, {
      type: "update-setting",
      key: "excludes",
      value: []
    });

    expect(excludesUpdated.state.source).toBe([
      "gantt",
      "includes weekdays",
      "includes 2026-05-02",
      "%% keep comment",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(excludesUpdated.state.semantic?.settings.includes).toEqual(["weekdays", "2026-05-02"]);
    expect(excludesUpdated.state.semantic?.settings.excludes).toBeUndefined();
  });

  it("adds missing includes settings after the diagram keyword", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-setting",
      key: "includes",
      value: ["weekdays", "2026-05-02"]
    });

    expect(result.state.source).toBe("gantt\nincludes weekdays\nincludes 2026-05-02\nTask A : a1, 1d\n");
    expect(result.state.semantic?.settings.includes).toEqual(["weekdays", "2026-05-02"]);
  });

  it("updates task schedule and dependencies without reordering source", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-01-01, 1d",
      "Task B : b1, 2d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const scheduleUpdated = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: taskNodeId,
      duration: "3d"
    });
    const dependencyUpdated = applyEditorAction(scheduleUpdated.state, {
      type: "update-task-dependencies",
      nodeId: taskNodeId,
      refs: ["a1"]
    });

    expect(dependencyUpdated.state.source).toBe([
      "gantt",
      "Task A : a1, 2026-01-01, 1d",
      "Task B : b1, 3d, after a1",
      ""
    ].join("\n"));
    expect(dependencyUpdated.state.grid.rows[1]).toMatchObject({
      duration: "3d",
      dependencies: ["a1"]
    });
  });

  it("blocks dependency append when task metadata has no free slot", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 2026-01-01, 1d",
      "Task B : b1, 2026-01-02, 2d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-dependencies",
      nodeId: taskNodeId,
      refs: ["a1"]
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.state.mode).toBe("structured");
    expect(result.diagnostics[0]?.code).toBe("EDITOR_TASK_METADATA_LIMIT");
  });

  it("blocks until append when task metadata has no free slot", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 2026-01-01, 1d",
      "Task B : b1, 2026-01-02, 2d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-until",
      nodeId: taskNodeId,
      ref: "a1"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.state.mode).toBe("structured");
    expect(result.diagnostics[0]?.code).toBe("EDITOR_TASK_METADATA_LIMIT");
  });

  it("clears dependency metadata with separator-aware removal", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1, 2d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-dependencies",
      nodeId: taskNodeId,
      refs: []
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows[1]?.dependencies).toEqual([]);
  });

  it("updates and clears until dependency metadata with separator-aware patches", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const untilUpdated = applyEditorAction(state, {
      type: "update-task-until",
      nodeId: taskNodeId,
      ref: "a1"
    });
    const untilCleared = applyEditorAction(untilUpdated.state, {
      type: "update-task-until",
      nodeId: taskNodeId
    });

    expect(untilUpdated.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1, until a1",
      ""
    ].join("\n"));
    expect(untilUpdated.state.grid.rows[1]?.until).toBe("a1");
    expect(untilCleared.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1",
      ""
    ].join("\n"));
    expect(untilCleared.state.grid.rows[1]?.until).toBeUndefined();
  });

  it("updates and clears leading task tags without moving remaining metadata", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : done, crit, a1, 1d",
      ""
    ].join("\n")));

    const updated = applyEditorAction(state, {
      type: "update-task-tags",
      nodeId: state.grid.rows[0]!.nodeId,
      tags: ["active", "milestone", "unknown", "active"]
    });
    const cleared = applyEditorAction(updated.state, {
      type: "update-task-tags",
      nodeId: updated.state.grid.rows[0]!.nodeId,
      tags: []
    });

    expect(updated.state.source).toBe("gantt\nTask A : active, milestone, a1, 1d\n");
    expect(updated.state.grid.rows[0]?.tags).toEqual(["active", "milestone"]);
    expect(cleared.state.source).toBe("gantt\nTask A : a1, 1d\n");
    expect(cleared.state.grid.rows[0]?.tags).toEqual([]);
  });

  it("deletes an unreferenced task with exact source removal", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      "Task C : c1, 3d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[1]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "delete-task",
      nodeId: taskNodeId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task C : c1, 3d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["a1", "c1"]);
  });

  it("deletes an empty explicit section with exact source removal", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Backlog",
      "section Build",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const sectionId = state.grid.rows[0]?.sectionId ?? "";
    const result = applyEditorAction(state, {
      type: "delete-section",
      sectionId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Build",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Build"]);
  });

  it("deletes a section with its task block when no remaining source references it", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "title Plan",
      "section Planning",
      "Task A : a1, 1d",
      "%% planning-only note",
      "Task B : b1, after a1, 2d",
      "click a1 href \"https://example.com\"",
      "section Build",
      "Task C : c1, 3d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, {
      type: "delete-section",
      sectionId: state.grid.rows[0]?.sectionId ?? ""
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "title Plan",
      "section Build",
      "Task C : c1, 3d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Build"]);
  });

  it("blocks deleting a section with tasks referenced by remaining source", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section Build",
      "Task B : b1, after a1, 2d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, {
      type: "delete-section",
      sectionId: state.grid.rows[0]?.sectionId ?? ""
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics).toEqual([]);
    expect(result.state.selected.kind).toBe("diagnostic");
    expect(result.state.diagnostics[0]).toMatchObject({
      code: "EDITOR_SECTION_DELETE_REFERENCED",
      primaryRaw: "a1"
    });
    expect(result.state.diagnostics[0]?.suggestedActions).toContainEqual(expect.objectContaining({
      kind: "quick-fix",
      labelText: "Remove reference a1"
    }));
  });

  it("moves an explicit section down by swapping source blocks", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "title Plan",
      "section Planning",
      "Task A : a1, 1d",
      "%% planning note",
      "Task B : b1, 2d",
      "section Build",
      "Task C : c1, 3d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-section",
      sectionId: state.grid.rows[0]?.sectionId ?? "",
      direction: "down"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "title Plan",
      "section Build",
      "Task C : c1, 3d",
      "section Planning",
      "Task A : a1, 1d",
      "%% planning note",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Build", "Planning", "Planning"]);
  });

  it("moves an explicit section up by swapping source blocks", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section Build",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-section",
      sectionId: state.grid.rows[1]?.sectionId ?? "",
      direction: "up"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Build",
      "Task B : b1, 2d",
      "section Planning",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Build", "Planning"]);
  });

  it("blocks moving an explicit section beyond document section bounds", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-section",
      sectionId: state.grid.rows[0]?.sectionId ?? "",
      direction: "up"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["EDITOR_SECTION_MOVE_OUT_OF_BOUNDS"]);
  });

  it("moves a task down within the same section by swapping task source ranges", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      "section Build",
      "Task C : c1, 3d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      direction: "down"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task B : b1, 2d",
      "Task A : a1, 1d",
      "section Build",
      "Task C : c1, 3d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["b1", "a1", "c1"]);
    expect(result.state.selected.kind).toBe("task");
  });

  it("moves a task up within the same section", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task",
      nodeId: state.grid.rows[1]?.nodeId ?? "",
      direction: "up"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task B : b1, 2d",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["b1", "a1"]);
  });

  it("blocks moving a task across a section boundary", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section Build",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      direction: "down"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["EDITOR_TASK_MOVE_OUT_OF_BOUNDS"]);
  });

  it("moves only task rows while leaving comments and blank lines in place", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "%% planning note",
      "",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task",
      nodeId: state.grid.rows[1]?.nodeId ?? "",
      direction: "up"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task B : b1, 2d",
      "%% planning note",
      "",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
  });

  it("moves a task to another section while preserving task id references", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, after a1, 2d",
      "section Build",
      "Task C : c1, 3d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task-to-section",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      sectionId: state.grid.rows[2]?.sectionId ?? ""
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task B : b1, after a1, 2d",
      "section Build",
      "Task C : c1, 3d",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => `${row.sectionLabel}:${row.id}`)).toEqual([
      "Planning:b1",
      "Build:c1",
      "Build:a1"
    ]);
  });

  it("moves a task to an empty section without moving comments or blank lines", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Backlog",
      "section Planning",
      "Task A : a1, 1d",
      "%% planning note",
      "",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task-to-section",
      nodeId: state.grid.rows[1]?.nodeId ?? "",
      sectionId: state.grid.rows[0]?.sectionId ?? ""
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Backlog",
      "Task A : a1, 1d",
      "section Planning",
      "%% planning note",
      "",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
  });

  it("blocks moving a task to the same section", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "move-task-to-section",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      sectionId: state.grid.rows[0]?.sectionId ?? ""
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["EDITOR_TASK_MOVE_SAME_SECTION"]);
  });

  it("adds a task at the end of the selected task section", () => {
    const initial = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section Build",
      "Task B : b1, 2d"
    ].join("\n") + "\n"));
    const state = {
      ...initial,
      selected: { kind: "task" as const, nodeId: initial.grid.rows[0]?.nodeId ?? "" }
    };
    const result = applyEditorAction(state, { type: "add-task" });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "New task : task1, 1d",
      "section Build",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.selected.kind).toBe("task");
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["a1", "task1", "b1"]);
  });

  it("adds a task directly below a source task", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      "Task C : c1, 3d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, {
      type: "add-task",
      afterNodeId: state.grid.rows[0]?.nodeId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "New task : task1, 1d",
      "Task B : b1, 2d",
      "Task C : c1, 3d",
      ""
    ].join("\n"));
    expect(result.state.selected.kind).toBe("task");
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["a1", "task1", "b1", "c1"]);
  });

  it("adds a task directly above a source task", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "add-task",
      beforeNodeId: state.grid.rows[1]?.nodeId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "New task : task1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["a1", "task1", "b1"]);
  });

  it("adds a task at the top of a non-empty section", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "add-task",
      sectionId: state.grid.rows[0]?.sectionId,
      position: "section-start"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "New task : task1, 1d",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["task1", "a1", "b1"]);
  });

  it("adds a task inside an empty explicit section", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Backlog",
      "section Build",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, {
      type: "add-task",
      sectionId: state.grid.rows[0]?.sectionId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Backlog",
      "New task : task1, 1d",
      "section Build",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Backlog", "Build"]);
    expect(result.state.grid.rows[0]).toMatchObject({
      kind: "task",
      id: "task1",
      sectionLabel: "Backlog"
    });
  });

  it("generates a non-conflicting task ID when adding a task", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : task1, 1d",
      "Task B : task2, 2d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, { type: "add-task" });

    expect(result.state.source).toBe([
      "gantt",
      "Task A : task1, 1d",
      "Task B : task2, 2d",
      "New task : task3, 1d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["task1", "task2", "task3"]);
  });

  it("adds a section at the document end", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, { type: "add-section" });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section New section",
      ""
    ].join("\n"));
    expect(result.state.selected.kind).toBe("section");
    expect(result.state.grid.rows.at(-1)).toMatchObject({
      kind: "section",
      sectionLabel: "New section",
      label: "New section"
    });
  });

  it("generates a non-conflicting section label when adding a section", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section New section",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, { type: "add-section" });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section New section",
      "Task A : a1, 1d",
      "section New section 2",
      ""
    ].join("\n"));
    expect(result.state.selected.kind).toBe("section");
  });

  it("adds a section below a source section block", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section Build",
      "Task B : b1, 2d",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "add-section",
      afterSectionId: state.grid.rows[0]?.sectionId
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "section Planning",
      "Task A : a1, 1d",
      "section New section",
      "section Build",
      "Task B : b1, 2d",
      ""
    ].join("\n"));
    expect(result.state.grid.rows.map((row) => row.sectionLabel)).toEqual(["Planning", "New section", "Build"]);
  });

  it("adds the first task after the diagram keyword", () => {
    const state = createEditorState(parseGanttLossless("gantt\n"));
    const result = applyEditorAction(state, { type: "add-task" });

    expect(result.state.source).toBe("gantt\nNew task : task1, 1d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      label: "New task",
      id: "task1",
      duration: "1d"
    });
  });

  it("duplicates a task below the source task with a generated ID", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-01-01, 2d",
      "Task B : b1, after a1, 1d"
    ].join("\n") + "\n"));
    const result = applyEditorAction(state, {
      type: "duplicate-task",
      nodeId: state.grid.rows[0]?.nodeId ?? ""
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : a1, 2026-01-01, 2d",
      "Task A : task1, 2026-01-01, 2d",
      "Task B : b1, after a1, 1d",
      ""
    ].join("\n"));
    expect(result.state.selected.kind).toBe("task");
    expect(result.state.grid.rows.map((row) => row.id)).toEqual(["a1", "task1", "b1"]);
  });

  it("duplicates an idless task by inserting a generated ID before metadata", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : 2d\n"));
    const result = applyEditorAction(state, {
      type: "duplicate-task",
      nodeId: state.grid.rows[0]?.nodeId ?? ""
    });

    expect(result.state.source).toBe("gantt\nTask A : 2d\nTask A : task1, 2d\n");
    expect(result.state.grid.rows.map((row) => row.id)).toEqual([undefined, "task1"]);
  });

  it("blocks deleting a task referenced by dependency metadata", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after a1, 2d"
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "delete-task",
      nodeId: taskNodeId
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics).toEqual([]);
    expect(result.state.selected.kind).toBe("diagnostic");
    expect(result.state.diagnostics[0]).toMatchObject({
      code: "EDITOR_TASK_DELETE_REFERENCED",
      primaryRaw: "a1"
    });
    expect(result.state.diagnostics[0]?.suggestedActions).toContainEqual(expect.objectContaining({
      kind: "quick-fix",
      labelText: "Remove reference a1"
    }));
  });

  it("applies delete repair quick fixes before deleting a referenced task", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, 2d",
      "Task C : c1, after a1, 2d",
      "click a1 href \"https://example.com\""
    ].join("\n") + "\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const blocked = applyEditorAction(state, {
      type: "delete-task",
      nodeId: taskNodeId
    });

    const replaceActionIndex = blocked.state.diagnostics[0]?.suggestedActions.findIndex((action) => {
      return action.kind === "quick-fix" && action.labelText === "Replace reference with b1";
    }) ?? -1;
    expect(replaceActionIndex).toBeGreaterThanOrEqual(0);
    const replaced = applyEditorAction(blocked.state, {
      type: "apply-diagnostic-action",
      code: "EDITOR_TASK_DELETE_REFERENCED",
      primaryRange: blocked.state.diagnostics[0]!.primaryRange,
      actionIndex: replaceActionIndex
    });
    const blockedByClick = applyEditorAction(replaced.state, {
      type: "delete-task",
      nodeId: replaced.state.grid.rows[0]?.nodeId ?? ""
    });
    const clickDiagnostic = blockedByClick.state.diagnostics.find((diagnostic) => diagnostic.primaryRaw === "a1");
    expect(clickDiagnostic).toBeDefined();
    const removeActionIndex = clickDiagnostic?.suggestedActions.findIndex((action) => action.labelText === "Remove reference a1") ?? -1;
    expect(removeActionIndex).toBeGreaterThanOrEqual(0);
    const clickRemoved = applyEditorAction(blockedByClick.state, {
      type: "apply-diagnostic-action",
      code: "EDITOR_TASK_DELETE_REFERENCED",
      primaryRange: clickDiagnostic!.primaryRange,
      actionIndex: removeActionIndex
    });
    const deleted = applyEditorAction(clickRemoved.state, {
      type: "delete-task",
      nodeId: clickRemoved.state.grid.rows[0]?.nodeId ?? ""
    });

    expect(deleted.diagnostics).toEqual([]);
    expect(deleted.sourceChanged).toBe(true);
    expect(deleted.state.source).toBe([
      "gantt",
      "Task B : b1, 2d",
      "Task C : c1, after b1, 2d",
      ""
    ].join("\n"));
  });

  it("coalesces multiple schedule insertions at the same source offset", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1\n"));
    const taskNodeId = state.grid.rows[0]?.nodeId ?? "";
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: taskNodeId,
      start: "2026-01-01",
      duration: "2d"
    });

    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 2d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      start: "2026-01-01",
      duration: "2d"
    });
  });

  it("switches start and duration schedule to start and end when end is set", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-01, 3d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      end: "2026-01-04"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 2026-01-04\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      start: "2026-01-01",
      end: "2026-01-04"
    });
    expect(result.state.grid.rows[0]?.duration).toBeUndefined();
  });

  it("switches dependency-anchored schedule to start and duration when start is set", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, after b1, 3d\nTask B : b1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      start: "2026-01-01"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.mode).toBe("structured");
    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 3d\nTask B : b1, 1d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      start: "2026-01-01",
      duration: "3d",
      dependencies: []
    });
  });

  it("blocks setting an absolute end without a start anchor", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, after b1, 3d\nTask B : b1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      end: "2026-01-04"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.state.source).toBe(state.source);
    expect(result.diagnostics[0]?.code).toBe("EDITOR_TASK_END_REQUIRES_START");
  });

  it("blocks invalid duration and end-before-start schedule values", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-05, 1d\n"));
    const invalidDuration = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      duration: "bad value"
    });
    const endBeforeStart = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      end: "2026-01-04"
    });

    expect(invalidDuration.sourceChanged).toBe(false);
    expect(invalidDuration.state.source).toBe(state.source);
    expect(invalidDuration.diagnostics[0]?.code).toBe("EDITOR_INVALID_DURATION");
    expect(endBeforeStart.sourceChanged).toBe(false);
    expect(endBeforeStart.state.source).toBe(state.source);
    expect(endBeforeStart.diagnostics[0]?.code).toBe("EDITOR_TASK_END_BEFORE_START");
  });

  it("switches start and dependency schedule to start and duration when duration is set", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-01, after b1\nTask B : b1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      duration: "3d"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.mode).toBe("structured");
    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 3d\nTask B : b1, 1d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      start: "2026-01-01",
      duration: "3d",
      dependencies: []
    });
  });

  it("switches start and end schedule to start and duration when duration is set", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-01, 2026-01-04\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      duration: "3d"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe("gantt\nTask A : a1, 2026-01-01, 3d\n");
    expect(result.state.grid.rows[0]).toMatchObject({
      start: "2026-01-01",
      duration: "3d"
    });
    expect(result.state.grid.rows[0]?.end).toBeUndefined();
  });

  it("removes end and duration metadata with separator-aware patches", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-01, 2026-01-04\nTask B : b1, 2026-01-05, 2d\n"));
    const endRemoved = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      end: ""
    });
    const durationRemoved = applyEditorAction(endRemoved.state, {
      type: "update-task-schedule",
      nodeId: endRemoved.state.grid.rows[1]?.nodeId ?? "",
      duration: ""
    });

    expect(endRemoved.state.source).toContain("Task A : a1, 2026-01-01\n");
    expect(durationRemoved.state.source).toBe("gantt\nTask A : a1, 2026-01-01\nTask B : b1, 2026-01-05\n");
  });

  it("removes both start and end when start is cleared from a start/end schedule", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 2026-01-01, 2026-01-04\n"));
    const result = applyEditorAction(state, {
      type: "update-task-schedule",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      start: ""
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.source).toBe("gantt\nTask A : a1\n");
    expect(result.state.grid.rows[0]?.start).toBeUndefined();
    expect(result.state.grid.rows[0]?.end).toBeUndefined();
  });

  it("adds a click href for a task with an ID", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-click-href",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      href: "https://example.com/ticket/123"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceChanged).toBe(true);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com/ticket/123\"",
      ""
    ].join("\n"));
    expect(result.state.grid.rows[0]).toMatchObject({
      clickHref: "https://example.com/ticket/123"
    });
  });

  it("updates and clears an existing click href", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com/old\"",
      ""
    ].join("\n")));
    const updated = applyEditorAction(state, {
      type: "update-task-click-href",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      href: "https://example.com/new"
    });
    const cleared = applyEditorAction(updated.state, {
      type: "update-task-click-href",
      nodeId: updated.state.grid.rows[0]?.nodeId ?? "",
      href: ""
    });

    expect(updated.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com/new\"",
      ""
    ].join("\n"));
    expect(cleared.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      ""
    ].join("\n"));
  });

  it("splits a shared click href when updating one target", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, 1d",
      "click a1,b1 href \"https://example.com/shared\"",
      ""
    ].join("\n")));
    const result = applyEditorAction(state, {
      type: "update-task-click-href",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      href: "https://example.com/a1"
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.state.source).toBe([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com/a1\"",
      "Task B : b1, 1d",
      "click b1 href \"https://example.com/shared\"",
      ""
    ].join("\n"));
  });

  it("blocks adding a click href to an idless task", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : 1d\n"));
    const result = applyEditorAction(state, {
      type: "update-task-click-href",
      nodeId: state.grid.rows[0]?.nodeId ?? "",
      href: "https://example.com"
    });

    expect(result.sourceChanged).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["EDITOR_TASK_CLICK_REQUIRES_ID"]);
  });
});
