import { describe, expect, it } from "vitest";
import {
  createMarkdownGanttBlockContext,
  parseGanttLossless,
  RangeMapper,
  splitSourceLines,
  type Range
} from "../../src/core";

describe("RangeMapper", () => {
  it("maps LF offsets to UTF-16 1-based positions", () => {
    const mapper = new RangeMapper("a\nbc\n");
    expect(mapper.positionAtOffset(0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(mapper.positionAtOffset(2)).toEqual({ offset: 2, line: 2, column: 1 });
    expect(mapper.rangeFromOffsets(2, 4)).toEqual({
      start: { offset: 2, line: 2, column: 1 },
      end: { offset: 4, line: 2, column: 3 }
    });
  });

  it("keeps CRLF as two UTF-16 code units", () => {
    const mapper = new RangeMapper("a\r\nbc");
    expect(mapper.positionAtOffset(3)).toEqual({ offset: 3, line: 2, column: 1 });
    expect(splitSourceLines("a\r\nbc")).toEqual([
      {
        raw: "a\r\n",
        content: "a",
        startOffset: 0,
        line: 1,
        indentLength: 0,
        lineEnding: "\r\n"
      },
      {
        raw: "bc",
        content: "bc",
        startOffset: 3,
        line: 2,
        indentLength: 0,
        lineEnding: ""
      }
    ]);
  });

  it("uses UTF-16 columns for Japanese and surrogate pairs", () => {
    const source = "実装🚀\n";
    const mapper = new RangeMapper(source);
    expect(mapper.rangeFromOffsets(0, "実装🚀".length)).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 4, line: 1, column: 5 }
    });
  });

  it("supports EOF without trailing newline and zero-length ranges", () => {
    const mapper = new RangeMapper("abc");
    expect(mapper.positionAtOffset(3)).toEqual({ offset: 3, line: 1, column: 4 });
    expect(mapper.rangeFromOffsets(1, 1)).toEqual({
      start: { offset: 1, line: 1, column: 2 },
      end: { offset: 1, line: 1, column: 2 }
    });
  });
});

describe("MarkdownGanttBlockContext", () => {
  it("keeps the AST block-relative and maps ranges at wrapper boundary", () => {
    const documentSource = "before\n```mermaid\ngantt\nTask : 3d\n```\n";
    const blockStart = documentSource.indexOf("gantt");
    const documentMapper = new RangeMapper(documentSource);
    const blockContentRange: Range = documentMapper.rangeFromOffsets(
      blockStart,
      documentSource.indexOf("```\n", blockStart)
    );
    const gantt = parseGanttLossless("gantt\nTask : 3d\n");
    const context = createMarkdownGanttBlockContext({
      blockId: "block-1",
      blockContentRange,
      gantt
    });
    const task = gantt.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (!task || task.kind !== "TaskStmt") {
      return;
    }

    const documentRange = context.toDocumentRange(task.label.range);
    expect(documentRange.start.offset).toBe(blockStart + task.label.range.start.offset);
    expect(documentRange.start.line).toBe(4);
    expect(documentRange.start.column).toBe(1);
    expect(context.toBlockRange(documentRange)).toEqual(task.label.range);
    expect(context.gantt.items[1]?.range.start.offset).toBe(6);
  });
});
