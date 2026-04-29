import { describe, expect, it } from "vitest";
import {
  applyLosslessTextPatch,
  emitNormalizedGantt,
  parseGanttLossless,
  projectGanttSemantic,
  replaceNodeRaw
} from "../../src/core";

describe("emitNormalizedGantt", () => {
  it("emits deterministic settings, sections, and task metadata", () => {
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

    const result = emitNormalizedGantt(projectGanttSemantic(document));

    expect(result).toEqual({
      mode: "normalized-emit",
      changed: true,
      diagnostics: [],
      source: [
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
        "Task B : after a1, 2d",
        ""
      ].join("\n")
    });
  });

  it("keeps default-section tasks before explicit sections", () => {
    const document = parseGanttLossless("gantt\nOrphan : o1, 1d\nsection Phase 1\nTask A : after o1, 2d\n");
    const result = emitNormalizedGantt(projectGanttSemantic(document));

    expect(result.source).toBe("gantt\nOrphan : o1, 1d\nsection Phase 1\nTask A : after o1, 2d\n");
    expect(result.diagnostics).toEqual([]);
  });

  it("does not transform HTML or escaped newline label markers", () => {
    const document = parseGanttLossless("gantt\nTask A<br>続き : 3d\nTask B\\n続き : 2d\n");
    const result = emitNormalizedGantt(projectGanttSemantic(document));

    expect(result.source).toBe("gantt\nTask A<br>続き : 3d\nTask B\\n続き : 2d\n");
    expect(result.diagnostics).toEqual([]);
  });

  it("returns diagnostics instead of normalized source when projection is unsafe", () => {
    const document = parseGanttLossless("gantt\nTask A : 3d\nclick a1 call show()\n");
    const result = emitNormalizedGantt(projectGanttSemantic(document));

    expect(result.mode).toBe("normalized-emit");
    expect(result.source).toBe("");
    expect(result.changed).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "NORMALIZED_EMIT_BLOCKED_UNSUPPORTED_CLICKSTMT",
      stage: "normalized-emit",
      instruction: {
        suggestedActions: expect.arrayContaining([
          expect.objectContaining({ kind: "fallback" })
        ])
      }
    });
  });
});

describe("lossless write-back", () => {
  it("patches an exact child range while preserving untouched source", () => {
    const document = parseGanttLossless("gantt\nTask A : 3d\n");
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }

    const result = applyLosslessTextPatch(document, {
      range: task.label.range,
      text: "Task B"
    });

    expect(result).toEqual({
      mode: "lossless-write-back",
      source: "gantt\nTask B : 3d\n",
      changed: true,
      diagnostics: []
    });
  });

  it("can replace a whole node raw range", () => {
    const document = parseGanttLossless("gantt\nTask A : 3d\n");
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }

    const result = replaceNodeRaw(document, task.nodeId, "Task B : 4d\n");

    expect(result.source).toBe("gantt\nTask B : 4d\n");
    expect(result.changed).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects invalid patch ranges with a write-back diagnostic", () => {
    const document = parseGanttLossless("gantt\nTask A : 3d\n");
    const result = applyLosslessTextPatch(document, {
      range: {
        start: { offset: 8, line: 2, column: 3 },
        end: { offset: 7, line: 2, column: 2 }
      },
      text: "x"
    });

    expect(result.source).toBe(document.source);
    expect(result.changed).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "INVALID_LOSSLESS_PATCH_RANGE",
      stage: "lossless-write-back",
      instruction: {
        suggestedActions: [{ kind: "manual-edit" }]
      }
    });
  });
});
