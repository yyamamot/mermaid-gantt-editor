import type {
  GanttDocument,
  MarkdownGanttBlockContext,
  Position,
  Range
} from "./types";

export interface SourceLine {
  raw: string;
  content: string;
  startOffset: number;
  line: number;
  indentLength: number;
  lineEnding: string;
}

export class RangeMapper {
  private readonly lineStarts: number[];

  constructor(source: string) {
    this.lineStarts = computeLineStarts(source);
  }

  positionAtOffset(offset: number): Position {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (this.lineStarts[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const lineIndex = Math.max(0, high);
    return {
      offset,
      line: lineIndex + 1,
      column: offset - this.lineStarts[lineIndex] + 1
    };
  }

  rangeFromOffsets(startOffset: number, endOffset: number): Range {
    return {
      start: this.positionAtOffset(startOffset),
      end: this.positionAtOffset(endOffset)
    };
  }

  rangeFromLine(line: SourceLine): Range {
    return this.rangeFromOffsets(line.startOffset, line.startOffset + line.raw.length);
  }

  rangeFromColumns(line: SourceLine, startColumnIndex: number, endColumnIndex: number): Range {
    return this.rangeFromOffsets(
      line.startOffset + startColumnIndex,
      line.startOffset + endColumnIndex
    );
  }
}

export function splitSourceLines(source: string): SourceLine[] {
  const result: SourceLine[] = [];
  const lineRegex = /(.*?)(\r\n|\n|$)/g;
  let match: RegExpExecArray | null;
  let offset = 0;
  let lineNumber = 1;

  while ((match = lineRegex.exec(source)) !== null) {
    const content = match[1] ?? "";
    const lineEnding = match[2] ?? "";
    if (content === "" && lineEnding === "" && offset >= source.length) {
      break;
    }
    const raw = `${content}${lineEnding}`;
    result.push({
      raw,
      content,
      startOffset: offset,
      line: lineNumber,
      indentLength: content.length - content.trimStart().length,
      lineEnding
    });
    offset += raw.length;
    lineNumber += 1;
    if (lineEnding === "" && offset >= source.length) {
      break;
    }
  }

  if (result.length === 0) {
    result.push({
      raw: "",
      content: "",
      startOffset: 0,
      line: 1,
      indentLength: 0,
      lineEnding: ""
    });
  }

  return result;
}

export function createMarkdownGanttBlockContext(input: {
  blockId: string;
  blockContentRange: Range;
  gantt: GanttDocument;
  documentUri?: string;
}): MarkdownGanttBlockContext {
  const { blockContentRange } = input;
  return {
    kind: "MarkdownGanttBlockContext",
    blockId: input.blockId,
    documentUri: input.documentUri,
    blockContentRange,
    gantt: input.gantt,
    toDocumentRange(range: Range): Range {
      return {
        start: toDocumentPosition(range.start, blockContentRange.start),
        end: toDocumentPosition(range.end, blockContentRange.start)
      };
    },
    toBlockRange(range: Range): Range {
      return {
        start: toBlockPosition(range.start, blockContentRange.start),
        end: toBlockPosition(range.end, blockContentRange.start)
      };
    }
  };
}

function computeLineStarts(source: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}

function toDocumentPosition(position: Position, blockStart: Position): Position {
  return {
    offset: blockStart.offset + position.offset,
    line: blockStart.line + position.line - 1,
    column: position.line === 1
      ? blockStart.column + position.column - 1
      : position.column
  };
}

function toBlockPosition(position: Position, blockStart: Position): Position {
  const line = position.line - blockStart.line + 1;
  return {
    offset: position.offset - blockStart.offset,
    line,
    column: line === 1
      ? position.column - blockStart.column + 1
      : position.column
  };
}
