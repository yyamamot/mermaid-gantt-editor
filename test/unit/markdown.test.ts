import { describe, expect, it } from "vitest";
import {
  findMarkdownGanttBlockAtOffset,
  findMarkdownGanttBlocks,
  replaceMarkdownGanttBlock
} from "../../src/core";

describe("findMarkdownGanttBlocks", () => {
  it("detects only Mermaid Gantt fenced blocks and keeps ranges document-relative", () => {
    const markdown = [
      "# Plan",
      "",
      "```mermaid",
      "flowchart TD",
      "A --> B",
      "```",
      "",
      "```mermaid",
      "gantt",
      "Task A : a1, 1d",
      "```",
      ""
    ].join("\n");

    const blocks = findMarkdownGanttBlocks(markdown, "file:///plan.md");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.documentUri).toBe("file:///plan.md");
    expect(blocks[0]?.gantt.source).toBe("gantt\nTask A : a1, 1d\n");
    expect(markdown.slice(
      blocks[0]!.blockContentRange.start.offset,
      blocks[0]!.blockContentRange.end.offset
    )).toBe(blocks[0]?.gantt.source);

    const task = blocks[0]?.gantt.items.find((item) => item.kind === "TaskStmt");
    expect(task?.kind).toBe("TaskStmt");
    if (task?.kind === "TaskStmt") {
      const documentRange = blocks[0]?.toDocumentRange(task.label.range);
      expect(documentRange).toBeDefined();
      expect(markdown.slice(documentRange!.start.offset, documentRange!.end.offset)).toBe("Task A");
    }
  });

  it("replaces only the target block content", () => {
    const markdown = [
      "before",
      "```mermaid",
      "gantt",
      "Task A : a1, 1d",
      "```",
      "after",
      ""
    ].join("\n");
    const [block] = findMarkdownGanttBlocks(markdown);
    expect(block).toBeDefined();

    const updated = replaceMarkdownGanttBlock(markdown, block!.blockContentRange, "gantt\nTask B : b1, 2d\n");

    expect(updated).toBe([
      "before",
      "```mermaid",
      "gantt",
      "Task B : b1, 2d",
      "```",
      "after",
      ""
    ].join("\n"));
  });

  it("replaces a selected Gantt block without touching prose, non-Gantt Mermaid, or sibling Gantt blocks", () => {
    const markdown = [
      "# Plan",
      "",
      "Prose before.",
      "",
      "```mermaid",
      "flowchart TD",
      "A --> B",
      "```",
      "",
      "```mermaid",
      "gantt",
      "First : a1, 1d",
      "```",
      "",
      "```mermaid",
      "gantt",
      "Second : b1, 1d",
      "```",
      ""
    ].join("\n");
    const blocks = findMarkdownGanttBlocks(markdown);
    expect(blocks).toHaveLength(2);

    const updated = replaceMarkdownGanttBlock(markdown, blocks[1]!.blockContentRange, "gantt\nUpdated second : b1, 2d\n");

    expect(updated).toContain("Prose before.");
    expect(updated).toContain("flowchart TD\nA --> B");
    expect(updated).toContain("First : a1, 1d");
    expect(updated).toContain("Updated second : b1, 2d");
    expect(updated).not.toContain("Second : b1, 1d");
  });

  it("selects the block containing the cursor offset", () => {
    const markdown = [
      "```mermaid",
      "gantt",
      "First : a1, 1d",
      "```",
      "",
      "```mermaid",
      "gantt",
      "Second : b1, 1d",
      "```",
      ""
    ].join("\n");
    const cursorOffset = markdown.indexOf("Second");

    const block = findMarkdownGanttBlockAtOffset(markdown, cursorOffset);

    expect(block?.gantt.source).toContain("Second");
    expect(block?.gantt.source).not.toContain("First");
  });

  it("supports tilde fences and ignores unclosed fences", () => {
    const markdown = [
      "~~~mermaid",
      "gantt",
      "Task A : a1, 1d",
      "~~~",
      "```mermaid",
      "gantt",
      "Task B : b1, 1d",
      ""
    ].join("\n");

    const blocks = findMarkdownGanttBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.gantt.source).toContain("Task A");
  });
});
