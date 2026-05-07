import { describe, expect, it } from "vitest";
import { formatGanttSource } from "../../src/core";

describe("formatGanttSource", () => {
  it("uses official four-space indentation and aligns task colons", () => {
    const result = formatGanttSource([
      "gantt",
      "title Product Plan",
      "dateFormat YYYY-MM-DD",
      "section Planning",
      "API design:done, a1, 2026-05-01, 3d",
      "Review:review, after a1, 2d",
      "section Build",
      "Implement:b1, after Review, 5d",
      ""
    ].join("\n"));

    expect(result.diagnostics).toEqual([]);
    expect(result.source).toBe([
      "gantt",
      "    title Product Plan",
      "    dateFormat YYYY-MM-DD",
      "",
      "    section Planning",
      "    API design :done, a1, 2026-05-01, 3d",
      "    Review     :review, after a1, 2d",
      "",
      "    section Build",
      "    Implement  :b1, after Review, 5d",
      ""
    ].join("\n"));
  });

  it("preserves comments, directives, unknown statements, and malformed task metadata", () => {
    const source = [
      "gantt",
      "%% keep comment indentation",
      "%%{init: {\"theme\": \"base\"}}%%",
      "unknown line",
      "Task A : a1, 3dX",
      "Task B: b1, 2d",
      ""
    ].join("\n");
    const result = formatGanttSource(source);

    expect(result.diagnostics).toEqual([{
      code: "FORMAT_UNSAFE_TASK_PRESERVED",
      message: "A task row was left unchanged because its metadata could not be formatted safely."
    }]);
    expect(result.source).toBe([
      "gantt",
      "%% keep comment indentation",
      "%%{init: {\"theme\": \"base\"}}%%",
      "unknown line",
      "Task A : a1, 3dX",
      "    Task B :b1, 2d",
      ""
    ].join("\n"));
  });

  it("preserves CRLF line endings", () => {
    const result = formatGanttSource("gantt\r\nsection A\r\nTask A:a1, 1d\r\n");

    expect(result.source).toBe("gantt\r\n\r\n    section A\r\n    Task A :a1, 1d\r\n");
  });

  it("returns a no-op diagnostic when formatting is disabled", () => {
    const source = "gantt\nTask A:a1, 1d\n";
    const result = formatGanttSource(source, { enabled: false });

    expect(result).toEqual({
      source,
      changed: false,
      diagnostics: [{
        code: "FORMAT_DISABLED",
        message: "Mermaid Gantt formatting is disabled."
      }]
    });
  });
});
