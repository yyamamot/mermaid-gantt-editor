import { describe, expect, it } from "vitest";
import { parseGanttLossless } from "../../src/core";

describe("parseGanttLossless", () => {
  it("parses a minimal gantt document", () => {
    const document = parseGanttLossless("gantt\n");
    expect(document.items).toHaveLength(1);
    expect(document.items[0]?.kind).toBe("DiagramKeyword");
    if (document.items[0]?.kind === "DiagramKeyword") {
      expect(document.items[0].keywordRaw).toBe("gantt");
      expect(document.items[0].targetDiagram).toBe(true);
    }
  });

  it("keeps non-target diagram keywords losslessly", () => {
    const document = parseGanttLossless("flowchart TD\nA --> B\n");
    expect(document.items[0]?.kind).toBe("DiagramKeyword");
    if (document.items[0]?.kind === "DiagramKeyword") {
      expect(document.items[0].targetDiagram).toBe(false);
    }
    expect(document.errors.some((error) => error.code === "NON_TARGET_DIAGRAM")).toBe(true);
  });

  it("parses click with multiple ids", () => {
    const source = "gantt\nTask A : a1, 2026-01-01, 3d\nTask B : a2, 2026-01-02, 3d\nclick a1,a2 href \"https://example.com\"\n";
    const document = parseGanttLossless(source);
    const click = document.items.find((item) => item.kind === "ClickStmt");
    expect(click?.kind).toBe("ClickStmt");
    if (click?.kind === "ClickStmt") {
      expect(click.targetIds.map((item) => item.raw)).toEqual(["a1", "a2"]);
      expect(click.clauses[0]?.kind).toBe("ClickHrefClause");
    }
  });

  it("recovers malformed accDescription alias as unknown statement", () => {
    const source = "gantt\naccDescription: Alias text\n";
    const document = parseGanttLossless(source);
    const node = document.items[1];
    expect(node?.kind).toBe("UnknownStatement");
  });

  it("recovers unclosed accDescr block without dropping later task", () => {
    const source = "gantt\naccDescr {\nLine one\nsection Phase 1\nTask A : 2026-01-01, 3d\n";
    const document = parseGanttLossless(source);
    expect(document.items.some((item) => item.kind === "UnknownStatement")).toBe(true);
    expect(document.items.some((item) => item.kind === "SectionStmt")).toBe(true);
    expect(document.items.some((item) => item.kind === "TaskStmt")).toBe(true);
  });

  it("uses UTF-16 ranges for Japanese labels with surrogate pairs", () => {
    const source = "gantt\n実装🚀 : 3d\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind === "TaskStmt") {
      expect(task.label.raw).toBe("実装🚀");
      expect(task.label.range.start.column).toBe(1);
      expect(task.label.range.end.column).toBe(5);
      expect(source.slice(task.label.range.start.offset, task.label.range.end.offset)).toBe("実装🚀");
    }
  });

  it("preserves HTML break marker as raw task label text", () => {
    const source = "gantt\nTask A<br>続き : 3d\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind === "TaskStmt") {
      expect(task.label.raw).toBe("Task A<br>続き");
      expect(source.slice(task.label.range.start.offset, task.label.range.end.offset)).toBe("Task A<br>続き");
    }
  });

  it("preserves escaped newline marker as raw task label text", () => {
    const source = "gantt\nTask A\\n続き : 3d\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind === "TaskStmt") {
      expect(task.label.raw).toBe("Task A\\n続き");
      expect(source.slice(task.label.range.start.offset, task.label.range.end.offset)).toBe("Task A\\n続き");
    }
  });

  it("treats a physical newline as a statement boundary rather than a task label newline", () => {
    const source = "gantt\nTask A\n続き : 3d\n";
    const document = parseGanttLossless(source);
    expect(document.items[1]?.kind).toBe("UnknownStatement");
    expect(document.items[2]?.kind).toBe("TaskStmt");
    if (document.items[2]?.kind === "TaskStmt") {
      expect(document.items[2].label.raw).toBe("続き");
    }
  });

  it("keeps task metadata separators, empty fields, and after refs losslessly", () => {
    const source = "gantt\nTask B : after a1 b2, , 2d,\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }

    const after = task.metaItems.find((item) => item.kind === "AfterMetaSlice");
    expect(after?.kind).toBe("AfterMetaSlice");
    if (after?.kind === "AfterMetaSlice") {
      expect(after.refs.map((ref) => ref.raw)).toEqual(["a1", "b2"]);
      expect(after.refsRaw).toEqual(["a1", "b2"]);
      expect(source.slice(after.refs[1].range.start.offset, after.refs[1].range.end.offset)).toBe("b2");
    }

    expect(task.metaParts.map((part) => part.raw)).toEqual([
      "after a1 b2",
      ", ",
      "",
      ", ",
      "2d",
      ","
    ]);
  });

  it("parses DD-MM-YYYY task dates as date metadata", () => {
    const source = "gantt\ndateFormat DD-MM-YYYY\nTask A : t1, 25-04-2026, 2d\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }

    expect(task.metaItems.map((item) => item.kind)).toEqual([
      "IdMetaSlice",
      "DateMetaSlice",
      "DurationMetaSlice"
    ]);
    expect(task.metaItems[1]?.raw).toBe("25-04-2026");
  });

  it("assigns comma-adjacent metadata whitespace to separator parts", () => {
    const source = "gantt\nTask : a1  ,  after b1,   until c1\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }

    expect(task.metaParts.map((part) => part.raw)).toEqual([
      "a1",
      "  ,  ",
      "after b1",
      ",   ",
      "until c1"
    ]);
    const separators = task.metaParts.filter((part) => part.kind === "TaskMetaSeparator");
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(source.slice(separator.range.start.offset, separator.range.end.offset)).toBe(separator.raw);
      expect(separator.raw).toContain(",");
    }
  });

  it("allows multiple leading task tags without extra metadata errors", () => {
    const source = "gantt\nTask : done, crit, milestone, a1, 2026-01-01, 0d\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }
    expect(task.metaItems.slice(0, 3).map((item) => item.kind)).toEqual([
      "TagMetaSlice",
      "TagMetaSlice",
      "TagMetaSlice"
    ]);
    expect(task.metaItems.slice(0, 3).map((item) => item.raw)).toEqual([
      "done",
      "crit",
      "milestone"
    ]);
    expect(task.errors.some((error) => error.code === "EXTRA_TASK_METADATA")).toBe(false);
  });

  it("emits exact click call clauses with and without args", () => {
    const source = "gantt\nTask A : a1, 3d\nclick a1 call show()\nclick a1 call showDetails(a1)\n";
    const document = parseGanttLossless(source);
    const clicks = document.items.filter((item) => item.kind === "ClickStmt");
    expect(clicks).toHaveLength(2);
    const [noArgs, withArgs] = clicks;
    if (noArgs?.kind === "ClickStmt" && noArgs.clauses[0]?.kind === "ClickCallClause") {
      expect(noArgs.clauses[0].callbackRaw).toBe("show");
      expect(noArgs.clauses[0].argsRaw).toBe("");
    }
    if (withArgs?.kind === "ClickStmt" && withArgs.clauses[0]?.kind === "ClickCallClause") {
      expect(withArgs.clauses[0].callbackRaw).toBe("showDetails");
      expect(withArgs.clauses[0].argsRaw).toBe("a1");
    }
  });

  it("keeps unclosed frontmatter as a localized unknown block", () => {
    const source = "---\ntitle: Broken\ngantt\nTask : 3d\n";
    const document = parseGanttLossless(source);
    expect(document.items).toHaveLength(1);
    expect(document.items[0]?.kind).toBe("UnknownBlock");
    expect(document.items[0]?.errors.some((error) => error.code === "UNCLOSED_FRONTMATTER")).toBe(true);
    expect(document.items[0]?.raw).toBe(source);
  });

  it("keeps unclosed directive as a localized unknown block", () => {
    const source = "%%{init: { \"theme\": \"forest\" }\ngantt\nTask : 3d\n";
    const document = parseGanttLossless(source);
    expect(document.items).toHaveLength(1);
    expect(document.items[0]?.kind).toBe("UnknownBlock");
    expect(document.items[0]?.errors.some((error) => error.code === "UNCLOSED_DIRECTIVE")).toBe(true);
    expect(document.items[0]?.raw).toBe(source);
  });

  it("keeps invalid task metadata as raw metadata", () => {
    const source = "gantt\nTask : 3dX\n";
    const document = parseGanttLossless(source);
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }
    expect(task.metaItems[0]?.kind).toBe("RawMetaSlice");
    expect(task.metaItems[0]?.raw).toBe("3dX");
    expect(task.metaItems[0]?.errors.some((error) => error.code === "INVALID_DURATION_TOKEN")).toBe(true);
  });

  it("accepts long-form duration units used by the UI helpers", () => {
    const document = parseGanttLossless("gantt\nTask : 1month\n");
    const task = document.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind !== "TaskStmt") {
      return;
    }
    expect(task.metaItems[0]?.kind).toBe("DurationMetaSlice");
    expect(task.errors).toEqual([]);
  });
});
