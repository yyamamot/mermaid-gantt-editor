import { parseGanttLossless } from "./parser";
import {
  createMarkdownGanttBlockContext,
  RangeMapper,
  splitSourceLines,
  type SourceLine
} from "./range";
import type {
  MarkdownGanttBlockContext,
  Range
} from "./types";

interface FenceOpen {
  marker: "`" | "~";
  length: number;
}

export function findMarkdownGanttBlocks(markdown: string, documentUri?: string): MarkdownGanttBlockContext[] {
  const mapper = new RangeMapper(markdown);
  const lines = splitSourceLines(markdown);
  const blocks: MarkdownGanttBlockContext[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const open = parseMermaidFenceOpen(lines[index]);
    if (!open) {
      continue;
    }

    const contentStartOffset = lines[index].startOffset + lines[index].raw.length;
    let closeLine: SourceLine | undefined;
    let closeIndex = index + 1;
    for (; closeIndex < lines.length; closeIndex += 1) {
      if (isFenceClose(lines[closeIndex], open)) {
        closeLine = lines[closeIndex];
        break;
      }
    }
    if (!closeLine) {
      break;
    }

    const contentEndOffset = closeLine.startOffset;
    const content = markdown.slice(contentStartOffset, contentEndOffset);
    const gantt = parseGanttLossless(content);
    if (gantt.items.some((item) => item.kind === "DiagramKeyword" && item.targetDiagram)) {
      const blockContentRange = mapper.rangeFromOffsets(contentStartOffset, contentEndOffset);
      blocks.push(createMarkdownGanttBlockContext({
        blockId: `markdown-gantt-${blocks.length + 1}`,
        documentUri,
        blockContentRange,
        gantt
      }));
    }

    index = closeIndex;
  }

  return blocks;
}

export function findMarkdownGanttBlockAtOffset(
  markdown: string,
  offset: number,
  documentUri?: string
): MarkdownGanttBlockContext | undefined {
  return findMarkdownGanttBlocks(markdown, documentUri).find((block) => {
    return offset >= block.blockContentRange.start.offset &&
      offset < block.blockContentRange.end.offset;
  });
}

export function replaceMarkdownGanttBlock(
  markdown: string,
  blockContentRange: Range,
  nextBlockSource: string
): string {
  return `${markdown.slice(0, blockContentRange.start.offset)}${nextBlockSource}${markdown.slice(blockContentRange.end.offset)}`;
}

function parseMermaidFenceOpen(line: SourceLine): FenceOpen | undefined {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line.content);
  if (!match) {
    return undefined;
  }
  const fence = match[2] ?? "";
  const info = (match[3] ?? "").trim();
  const language = info.split(/\s+/)[0]?.toLowerCase();
  if (language !== "mermaid") {
    return undefined;
  }
  return {
    marker: fence[0] as "`" | "~",
    length: fence.length
  };
}

function isFenceClose(line: SourceLine, open: FenceOpen): boolean {
  const marker = open.marker === "`" ? "`" : "~";
  const expression = new RegExp(`^ {0,3}${escapeRegExp(marker)}{${open.length},}\\s*$`);
  return expression.test(line.content);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
