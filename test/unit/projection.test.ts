import { describe, expect, it } from "vitest";
import {
  parseGanttLossless,
  projectGanttSemantic
} from "../../src/core";

describe("projectGanttSemantic", () => {
  it("projects settings, explicit sections, and task fields", () => {
    const document = parseGanttLossless([
      "gantt",
      "title Product Plan",
      "dateFormat YYYY-MM-DD",
      "axisFormat %Y-%m-%d",
      "tickInterval 1week",
      "topAxis",
      "inclusiveEndDates",
      "includes 2026-01-01",
      "excludes weekends",
      "weekday monday",
      "weekend friday",
      "todayMarker stroke:#f00",
      "section Phase 1",
      "Task A : done, crit, milestone, a1, 2026-01-01, 0d",
      "Task B : after a1, 2d"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);

    expect(semantic.settings).toMatchObject({
      title: "Product Plan",
      dateFormat: "YYYY-MM-DD",
      axisFormat: "%Y-%m-%d",
      tickInterval: "1week",
      topAxis: true,
      inclusiveEndDates: true,
      includes: ["2026-01-01"],
      excludes: ["weekends"],
      weekday: "monday",
      weekend: "friday",
      todayMarker: "stroke:#f00"
    });
    expect(semantic.sections).toHaveLength(1);
    expect(semantic.sections[0]).toMatchObject({
      id: "section-0",
      label: "Phase 1",
      sourceLabelRaw: "Phase 1",
      displayLabel: "Phase 1",
      previewLabelPolicy: "truncate-with-tooltip"
    });
    expect(semantic.sections[0]?.tasks).toHaveLength(2);
    expect(semantic.sections[0]?.tasks[0]).toMatchObject({
      id: "a1",
      label: "Task A",
      sourceLabelRaw: "Task A",
      displayLabel: "Task A",
      tags: ["done", "crit", "milestone"],
      start: "2026-01-01",
      duration: "0d",
      milestone: true
    });
    expect(semantic.sections[0]?.tasks[1]).toMatchObject({
      label: "Task B",
      after: ["a1"],
      duration: "2d"
    });
    expect(semantic.projectionIssues).toEqual([]);
  });

  it("creates a stable default section for tasks before the first explicit section", () => {
    const document = parseGanttLossless([
      "gantt",
      "Orphan : 1d",
      "section Phase 1",
      "Task A : 2d"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);

    expect(semantic.sections.map((section) => section.id)).toEqual(["__default__", "section-0"]);
    expect(semantic.sections[0]).toMatchObject({
      implicit: true,
      label: "",
      taskNodeIds: [semantic.sections[0]?.tasks[0]?.nodeId]
    });
    expect(semantic.sections[0]?.tasks[0]).toMatchObject({ label: "Orphan", duration: "1d" });
    expect(semantic.sections[1]?.tasks[0]).toMatchObject({ label: "Task A", duration: "2d" });
  });

  it("reports unsupported lossless nodes as projection issues", () => {
    const document = parseGanttLossless([
      "%%{init: { \"theme\": \"forest\" }}%%",
      "gantt",
      "Task A : 3d",
      "click a1 call show()"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);

    expect(semantic.sections[0]?.tasks[0]).toMatchObject({ label: "Task A", duration: "3d" });
    expect(semantic.projectionIssues.map((issue) => issue.reasonCode)).toEqual([
      "unsupported-DirectiveBlock",
      "unsupported-ClickStmt"
    ]);
    for (const issue of semantic.projectionIssues) {
      expect(issue).toMatchObject({
        severity: "warning",
        stage: "projection",
        instruction: {
          primaryRange: issue.range,
          suggestedActions: [{ kind: "fallback" }]
        }
      });
    }
  });

  it("reports raw task metadata as a projection issue", () => {
    const document = parseGanttLossless("gantt\nTask : 3dX\n");
    const semantic = projectGanttSemantic(document);
    expect(semantic.sections[0]?.tasks[0]).toMatchObject({ label: "Task" });
    expect(semantic.projectionIssues.map((issue) => issue.reasonCode)).toEqual([
      "parse-INVALID_DURATION_TOKEN",
      "raw-task-metadata"
    ]);
  });

  it("projects start/end dates and until metadata", () => {
    const document = parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-01-01, 2026-01-03",
      "Task B : until a1"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);
    expect(semantic.sections[0]?.tasks[0]).toMatchObject({
      id: "a1",
      start: "2026-01-01",
      end: "2026-01-03"
    });
    expect(semantic.sections[0]?.tasks[1]).toMatchObject({
      label: "Task B",
      until: "a1"
    });
    expect(semantic.projectionIssues).toEqual([]);
  });

  it("projects DD-MM-YYYY task dates without duplicate ID issues", () => {
    const document = parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : t1, 25-04-2026, 2d"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);

    expect(semantic.sections[0]?.tasks[0]).toMatchObject({
      id: "t1",
      start: "25-04-2026",
      duration: "2d"
    });
    expect(semantic.projectionIssues).toEqual([]);
  });

  it("reports duplicate semantic task metadata", () => {
    const document = parseGanttLossless([
      "gantt",
      "Task A : a1, a2, 2026-01-01, 2026-01-02, 2026-01-03, 1d, 2d"
    ].join("\n") + "\n");
    const semantic = projectGanttSemantic(document);
    expect(semantic.sections[0]?.tasks[0]).toMatchObject({
      id: "a1",
      start: "2026-01-01",
      end: "2026-01-02",
      duration: "1d"
    });
    expect(semantic.projectionIssues.map((issue) => issue.reasonCode)).toEqual([
      "parse-EXTRA_TASK_METADATA",
      "duplicate-task-id-metadata",
      "extra-date-metadata",
      "duplicate-duration-metadata"
    ]);
  });
});
