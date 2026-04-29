import { describe, expect, it } from "vitest";
import {
  createEditorState,
  createPreviewScheduleDragPatch,
  createPreviewScheduleDragPatchFromPixels,
  createPreviewScheduleEditModel,
  createPreviewScheduleResizePatch,
  createPreviewScheduleResizePatchFromPixels,
  parseGanttLossless,
  parsePreviewDateLiteral,
  previewSchedulePixelDeltaToDays,
  formatPreviewDateLiteral
} from "../../src/core";

describe("preview schedule editing", () => {
  it("parses and formats the supported dateFormat token subset", () => {
    expect(parsePreviewDateLiteral("2026-05-04", "YYYY-MM-DD")).toBe("2026-05-04");
    expect(parsePreviewDateLiteral("04-05-26", "DD-MM-YY")).toBe("2026-05-04");
    expect(formatPreviewDateLiteral("2026-05-04", "DD-MM-YYYY")).toBe("04-05-2026");
    expect(parsePreviewDateLiteral("2026-02-31", "YYYY-MM-DD")).toBeUndefined();
    expect(formatPreviewDateLiteral("2026-05-04", "MM/DD")).toBeUndefined();
  });

  it("classifies direct date tasks as draggable and dependency anchors as unsupported", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Duration Task : a1, 2026-05-04, 3d",
      "Range Task : b1, 2026-05-10, 2026-05-12",
      "Dependency Task : c1, after a1, 1d",
      "Blocked Task : d1, 2026-05-14, 2d, until a1",
      ""
    ].join("\n")));

    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);

    expect(model.draggableTaskCount).toBe(2);
    expect(model.unsupportedTaskCount).toBe(2);
    expect(model.tasks.map((task) => [task.label, task.kind, task.editable])).toEqual([
      ["Duration Task", "start-duration", true],
      ["Range Task", "start-end", true],
      ["Dependency Task", "unsupported", false],
      ["Blocked Task", "unsupported", false]
    ]);
    expect(model.tasks[0]?.leftPercent).toBeGreaterThan(0);
    expect(model.tasks[0]?.widthPercent).toBeGreaterThan(0);
  });

  it("allows milestone and single-date tasks to move without resize span editing", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Milestone Task : milestone, m1, 2026-05-04, 0d",
      ""
    ].join("\n")));

    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);
    const milestone = model.tasks[0];

    expect(milestone).toMatchObject({
      label: "Milestone Task",
      kind: "milestone",
      editable: true,
      durationDays: 0,
      startIso: "2026-05-04",
      endIso: "2026-05-05"
    });
    expect(createPreviewScheduleDragPatch(model, milestone?.nodeId ?? "", 2)).toMatchObject({
      start: "2026-05-06",
      dayDelta: 2
    });
    expect(createPreviewScheduleResizePatch(model, milestone?.nodeId ?? "", "right", 1)).toBeUndefined();
  });

  it("adds edit timeline padding and supports an explicit viewport", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-05-04, 3d",
      "Task B : b1, 2026-05-10, 2026-05-12",
      ""
    ].join("\n")));

    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);

    expect(model.domainStartIso).toBe("2026-04-17");
    expect(model.domainEndIso).toBe("2026-05-29");
    expect(model.totalDays).toBe(42);
    expect(model.defaultDomainStartIso).toBe(model.domainStartIso);
    expect(model.defaultDomainEndIso).toBe(model.domainEndIso);

    const viewport = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat, {
      domainStartIso: "2026-06-01",
      domainEndIso: "2026-07-13"
    });

    expect(viewport.domainStartIso).toBe("2026-06-01");
    expect(viewport.domainEndIso).toBe("2026-07-13");
    expect(viewport.defaultDomainStartIso).toBe("2026-04-17");
    expect(viewport.defaultDomainEndIso).toBe("2026-05-29");
  });

  it("uses document dateFormat while building patches", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : a1, 04-05-2026, 2d",
      "Task B : b1, 06-05-2026, 08-05-2026",
      ""
    ].join("\n")));
    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);
    const first = model.tasks[0];
    const second = model.tasks[1];

    expect(first).toMatchObject({ editable: true, startIso: "2026-05-04" });
    expect(createPreviewScheduleDragPatch(model, first?.nodeId ?? "", 2)).toEqual({
      nodeId: first?.nodeId,
      start: "06-05-2026",
      dayDelta: 2
    });
    expect(createPreviewScheduleDragPatchFromPixels(model, first?.nodeId ?? "", 48, 1000)).toEqual({
      nodeId: first?.nodeId,
      start: "06-05-2026",
      dayDelta: 2
    });
    expect(createPreviewScheduleDragPatch(model, second?.nodeId ?? "", -1)).toEqual({
      nodeId: second?.nodeId,
      start: "05-05-2026",
      end: "07-05-2026",
      dayDelta: -1
    });
  });

  it("snaps pixel movement to day deltas", () => {
    expect(previewSchedulePixelDeltaToDays(52, 100, { totalDays: 10 })).toBe(5);
    expect(previewSchedulePixelDeltaToDays(-16, 100, { totalDays: 10 })).toBe(-2);
    expect(previewSchedulePixelDeltaToDays(30, 1000, { totalDays: 10 })).toBe(1);
    expect(previewSchedulePixelDeltaToDays(-30, 1000, { totalDays: 10 })).toBe(-1);
    expect(previewSchedulePixelDeltaToDays(4, 1000, { totalDays: 10 })).toBe(0);
    expect(previewSchedulePixelDeltaToDays(10, 0, { totalDays: 10 })).toBe(0);
  });

  it("builds resize patches for direct date tasks", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-05-04, 3d",
      "Task B : b1, 2026-05-10, 2026-05-12",
      "Task C : c1, 2026-05-20, 2w",
      ""
    ].join("\n")));
    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);
    const taskA = model.tasks[0];
    const taskB = model.tasks[1];
    const taskC = model.tasks[2];

    expect(createPreviewScheduleResizePatch(model, taskA?.nodeId ?? "", "right", 2)).toEqual({
      nodeId: taskA?.nodeId,
      edge: "right",
      duration: "5d",
      dayDelta: 2
    });
    expect(createPreviewScheduleResizePatch(model, taskA?.nodeId ?? "", "left", -1)).toEqual({
      nodeId: taskA?.nodeId,
      edge: "left",
      start: "2026-05-03",
      duration: "4d",
      dayDelta: -1
    });
    expect(createPreviewScheduleResizePatch(model, taskB?.nodeId ?? "", "right", 1)).toEqual({
      nodeId: taskB?.nodeId,
      edge: "right",
      end: "2026-05-13",
      dayDelta: 1
    });
    expect(createPreviewScheduleResizePatch(model, taskB?.nodeId ?? "", "left", 1)).toEqual({
      nodeId: taskB?.nodeId,
      edge: "left",
      start: "2026-05-11",
      dayDelta: 1
    });
    expect(createPreviewScheduleResizePatch(model, taskA?.nodeId ?? "", "right", -3)).toBeUndefined();
    expect(createPreviewScheduleResizePatch(model, taskB?.nodeId ?? "", "left", 2)).toBeUndefined();
    expect(createPreviewScheduleResizePatch(model, taskC?.nodeId ?? "", "right", 14)).toEqual({
      nodeId: taskC?.nodeId,
      edge: "right",
      duration: "4w",
      dayDelta: 14
    });
    expect(createPreviewScheduleResizePatchFromPixels(model, taskA?.nodeId ?? "", "right", 34, 1000)).toMatchObject({
      edge: "right",
      duration: "5d"
    });
  });
});
