import { splitSourceLines } from "./range";
import { parseGanttLossless } from "./parser";
import type {
  DocumentItem,
  GanttDocument,
  TaskMetaPart,
  TaskStmt
} from "./types";

export interface GanttFormatOptions {
  enabled?: boolean;
  indentMode?: "official";
  indentSize?: number;
  alignTaskColon?: boolean;
  blankLineBetweenSections?: boolean;
}

export interface GanttFormatDiagnostic {
  code: string;
  message: string;
}

export interface GanttFormatResult {
  source: string;
  changed: boolean;
  diagnostics: GanttFormatDiagnostic[];
}

interface ResolvedGanttFormatOptions {
  enabled: boolean;
  indentMode: "official";
  indentSize: number;
  alignTaskColon: boolean;
  blankLineBetweenSections: boolean;
}

const DEFAULT_FORMAT_OPTIONS: ResolvedGanttFormatOptions = {
  enabled: true,
  indentMode: "official",
  indentSize: 4,
  alignTaskColon: true,
  blankLineBetweenSections: true
};

export function formatGanttSource(source: string, options: GanttFormatOptions = {}): GanttFormatResult {
  const resolved = resolveFormatOptions(options);
  if (!resolved.enabled) {
    return {
      source,
      changed: false,
      diagnostics: [{
        code: "FORMAT_DISABLED",
        message: "Mermaid Gantt formatting is disabled."
      }]
    };
  }

  const document = parseGanttLossless(source);
  if (!document.items.some((item) => item.kind === "DiagramKeyword" && item.targetDiagram)) {
    return {
      source,
      changed: false,
      diagnostics: [{
        code: "FORMAT_NOT_GANTT",
        message: "The source does not contain a Mermaid Gantt diagram."
      }]
    };
  }

  const lineEnding = dominantLineEnding(source);
  const trailingNewline = source.endsWith("\n") || source.endsWith("\r\n");
  const indent = " ".repeat(resolved.indentSize);
  const taskLabelWidth = resolved.alignTaskColon ? maxSafeTaskLabelWidth(document) : 0;
  const diagnostics: GanttFormatDiagnostic[] = [];
  const lines: string[] = [];

  for (const item of document.items) {
    if (item.kind === "BlankLine") {
      pushBlankLine(lines);
      continue;
    }
    if (item.kind === "SectionStmt" && resolved.blankLineBetweenSections) {
      ensureBlankLineBeforeSection(lines);
    }
    if (item.kind === "TaskStmt" && !isSafeTaskForFormatting(item)) {
      diagnostics.push({
        code: "FORMAT_UNSAFE_TASK_PRESERVED",
        message: "A task row was left unchanged because its metadata could not be formatted safely."
      });
    }
    lines.push(...formatDocumentItem(item, indent, taskLabelWidth, resolved));
  }

  trimTrailingBlankLines(lines);
  const formatted = `${lines.join(lineEnding)}${trailingNewline ? lineEnding : ""}`;
  return {
    source: formatted,
    changed: formatted !== source,
    diagnostics
  };
}

function resolveFormatOptions(options: GanttFormatOptions): ResolvedGanttFormatOptions {
  return {
    enabled: options.enabled ?? DEFAULT_FORMAT_OPTIONS.enabled,
    indentMode: "official",
    indentSize: normalizeIndentSize(options.indentSize),
    alignTaskColon: options.alignTaskColon ?? DEFAULT_FORMAT_OPTIONS.alignTaskColon,
    blankLineBetweenSections: options.blankLineBetweenSections ?? DEFAULT_FORMAT_OPTIONS.blankLineBetweenSections
  };
}

function normalizeIndentSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_FORMAT_OPTIONS.indentSize;
  }
  return Math.max(0, Math.min(12, Math.trunc(value)));
}

function formatDocumentItem(
  item: DocumentItem,
  indent: string,
  taskLabelWidth: number,
  options: ResolvedGanttFormatOptions
): string[] {
  switch (item.kind) {
    case "DiagramKeyword":
      return [item.raw.trim()];
    case "TitleStmt":
    case "DateFormatStmt":
    case "AxisFormatStmt":
    case "TickIntervalStmt":
    case "IncludesStmt":
    case "ExcludesStmt":
    case "WeekdayStmt":
    case "WeekendStmt":
    case "TodayMarkerStmt":
    case "AccTitleStmt":
    case "AccDescrLineStmt":
    case "TopAxisStmt":
    case "InclusiveEndDatesStmt":
    case "VertStmt":
    case "ClickStmt":
      return [`${indent}${item.raw.trim()}`];
    case "SectionStmt":
      return [`${indent}section ${item.labelRaw}`];
    case "TaskStmt":
      return [formatTaskStatement(item, indent, taskLabelWidth, options)];
    case "FrontmatterBlock":
    case "DirectiveBlock":
    case "AccDescrBlockStmt":
    case "CommentLine":
    case "UnknownBlock":
    case "UnknownStatement":
      return rawContentLines(item.raw);
    case "BlankLine":
      return [""];
  }
}

function formatTaskStatement(
  task: TaskStmt,
  indent: string,
  taskLabelWidth: number,
  options: ResolvedGanttFormatOptions
): string {
  if (!isSafeTaskForFormatting(task)) {
    return task.raw.replace(/\r?\n$/, "");
  }
  const label = task.label.raw;
  const paddedLabel = options.alignTaskColon && taskLabelWidth > label.length
    ? label.padEnd(taskLabelWidth, " ")
    : label;
  const metadata = task.raw.slice(task.colon.range.end.offset - task.range.start.offset).trim();
  return metadata.length > 0
    ? `${indent}${paddedLabel} :${metadata}`
    : `${indent}${paddedLabel} :`;
}

function isSafeTaskForFormatting(task: TaskStmt): boolean {
  return task.errors.length === 0 &&
    task.metaItems.every((item) => item.kind !== "RawMetaSlice" && item.errors.length === 0) &&
    task.metaParts.every((part: TaskMetaPart) => {
      return "errors" in part ? part.errors.length === 0 : true;
    });
}

function maxSafeTaskLabelWidth(document: GanttDocument): number {
  return document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt" && isSafeTaskForFormatting(item))
    .reduce((max, task) => Math.max(max, task.label.raw.length), 0);
}

function dominantLineEnding(source: string): string {
  const crlf = source.match(/\r\n/g)?.length ?? 0;
  const lf = (source.match(/\n/g)?.length ?? 0) - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

function rawContentLines(raw: string): string[] {
  return splitSourceLines(raw).map((line) => line.content);
}

function pushBlankLine(lines: string[]): void {
  if (lines.length === 0 || lines[lines.length - 1] === "") {
    return;
  }
  lines.push("");
}

function ensureBlankLineBeforeSection(lines: string[]): void {
  trimTrailingBlankLines(lines);
  if (lines.length > 0) {
    lines.push("");
  }
}

function trimTrailingBlankLines(lines: string[]): void {
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
}
