import type {
  ConversionDiagnostic,
  EmitResult,
  GanttDocument,
  LosslessTextPatch,
  ProjectionIssue,
  Range,
  SemanticDocument,
  SemanticSettings,
  SemanticTask
} from "./types";
import { RangeMapper } from "./range";

export function emitNormalizedGantt(semantic: SemanticDocument): EmitResult {
  if (semantic.projectionIssues.length > 0) {
    return {
      mode: "normalized-emit",
      source: "",
      changed: false,
      diagnostics: semantic.projectionIssues.map(toNormalizedEmitDiagnostic)
    };
  }

  const lines = ["gantt"];
  appendSettings(lines, semantic.settings);

  for (const section of semantic.sections) {
    if (!section.implicit) {
      lines.push(`section ${section.label}`);
    }
    for (const task of section.tasks) {
      lines.push(formatTask(task));
    }
  }

  return {
    mode: "normalized-emit",
    source: `${lines.join("\n")}\n`,
    changed: true,
    diagnostics: []
  };
}

export function applyLosslessTextPatch(
  document: GanttDocument,
  patch: LosslessTextPatch
): EmitResult {
  const rangeDiagnostic = validatePatchRange(document, patch.range);
  if (rangeDiagnostic) {
    return {
      mode: "lossless-write-back",
      source: document.source,
      changed: false,
      diagnostics: [rangeDiagnostic]
    };
  }

  const source = `${document.source.slice(0, patch.range.start.offset)}${patch.text}${document.source.slice(patch.range.end.offset)}`;
  return {
    mode: "lossless-write-back",
    source,
    changed: source !== document.source,
    diagnostics: []
  };
}

export function replaceNodeRaw(
  document: GanttDocument,
  nodeId: string,
  text: string
): EmitResult {
  const item = document.items.find((candidate) => candidate.nodeId === nodeId);
  if (!item) {
    return {
      mode: "lossless-write-back",
      source: document.source,
      changed: false,
      diagnostics: [
        createWriteBackDiagnostic(
          "LOSSLESS_NODE_NOT_FOUND",
          `No lossless AST node exists for nodeId '${nodeId}'.`,
          zeroRange()
        )
      ]
    };
  }

  return applyLosslessTextPatch(document, { range: item.range, text });
}

function appendSettings(lines: string[], settings: SemanticSettings): void {
  if (settings.title !== undefined) {
    lines.push(`title ${settings.title}`);
  }
  if (settings.accTitle !== undefined) {
    lines.push(`accTitle: ${settings.accTitle}`);
  }
  if (settings.accDescr !== undefined) {
    lines.push(`accDescr: ${settings.accDescr}`);
  }
  if (settings.dateFormat !== undefined) {
    lines.push(`dateFormat ${settings.dateFormat}`);
  }
  if (settings.axisFormat !== undefined) {
    lines.push(`axisFormat ${settings.axisFormat}`);
  }
  if (settings.tickInterval !== undefined) {
    lines.push(`tickInterval ${settings.tickInterval}`);
  }
  if (settings.topAxis === true) {
    lines.push("topAxis");
  }
  if (settings.inclusiveEndDates === true) {
    lines.push("inclusiveEndDates");
  }
  for (const value of settings.includes ?? []) {
    lines.push(`includes ${value}`);
  }
  for (const value of settings.excludes ?? []) {
    lines.push(`excludes ${value}`);
  }
  if (settings.weekday !== undefined) {
    lines.push(`weekday ${settings.weekday}`);
  }
  if (settings.weekend !== undefined) {
    lines.push(`weekend ${settings.weekend}`);
  }
  if (settings.todayMarker !== undefined) {
    lines.push(`todayMarker ${settings.todayMarker}`);
  }
}

function formatTask(task: SemanticTask): string {
  const metadata = [
    ...task.tags,
    task.id,
    task.after && task.after.length > 0 ? `after ${task.after.join(" ")}` : undefined,
    task.start,
    task.end,
    task.duration,
    task.until !== undefined ? `until ${task.until}` : undefined
  ].filter((value): value is string => value !== undefined && value !== "");

  return metadata.length > 0
    ? `${task.label} : ${metadata.join(", ")}`
    : `${task.label} :`;
}

function validatePatchRange(
  document: GanttDocument,
  range: Range
): ConversionDiagnostic | undefined {
  if (
    range.start.offset < 0 ||
    range.end.offset < range.start.offset ||
    range.end.offset > document.source.length
  ) {
    return createWriteBackDiagnostic(
      "INVALID_LOSSLESS_PATCH_RANGE",
      "Lossless write-back patch range is outside the document source.",
      safeDiagnosticRange(document)
    );
  }

  const mapper = new RangeMapper(document.source);
  if (
    !positionsEqual(range.start, mapper.positionAtOffset(range.start.offset)) ||
    !positionsEqual(range.end, mapper.positionAtOffset(range.end.offset))
  ) {
    return createWriteBackDiagnostic(
      "INVALID_LOSSLESS_PATCH_POSITION",
      "Lossless write-back patch range offsets do not match line/column positions.",
      safeDiagnosticRange(document)
    );
  }

  return undefined;
}

function toNormalizedEmitDiagnostic(issue: ProjectionIssue): ConversionDiagnostic {
  return {
    severity: issue.severity,
    code: `NORMALIZED_EMIT_BLOCKED_${issue.reasonCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
    message: `Normalized emit is blocked because semantic projection reported: ${issue.message}`,
    stage: "normalized-emit",
    instruction: {
      summary: "Resolve the projection issue before emitting normalized Mermaid source.",
      detail: issue.message,
      primaryRange: issue.range,
      relatedRanges: [issue.instruction.primaryRange],
      suggestedActions: [
        {
          kind: "fallback",
          label: "Use lossless write-back for this edit instead of normalized emit."
        },
        ...issue.instruction.suggestedActions
      ]
    }
  };
}

function createWriteBackDiagnostic(
  code: string,
  message: string,
  range: Range
): ConversionDiagnostic {
  return {
    severity: "error",
    code,
    message,
    stage: "lossless-write-back",
    instruction: {
      summary: message,
      primaryRange: range,
      suggestedActions: [
        {
          kind: "manual-edit",
          label: "Re-parse the latest source and retry the write-back operation."
        }
      ]
    }
  };
}

function safeDiagnosticRange(document: GanttDocument): Range {
  const mapper = new RangeMapper(document.source);
  return mapper.rangeFromOffsets(0, 0);
}

function zeroRange(): Range {
  return {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 0, line: 1, column: 1 }
  };
}

function positionsEqual(
  left: { offset: number; line: number; column: number },
  right: { offset: number; line: number; column: number }
): boolean {
  return left.offset === right.offset &&
    left.line === right.line &&
    left.column === right.column;
}
