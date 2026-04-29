import { projectGanttSemantic } from "./projection";
import type {
  DateMetaSlice,
  DiagnosticSummaryItem,
  DocumentItem,
  GanttDocument,
  IdMetaSlice,
  ParseError,
  Range,
  ResolvedDiagnostic,
  ResolvedDocument,
  ResolvedTask,
  SemanticDocument,
  SemanticTask,
  TaskMetaSlice,
  TaskStmt,
  TextSlice
} from "./types";

interface TaskResolutionContext {
  task: TaskStmt;
  semanticTask: SemanticTask;
  idSlices: IdMetaSlice[];
  dateSlices: DateMetaSlice[];
  dependencyRefs: TextSlice[];
}

export function resolveGanttDocument(document: GanttDocument): ResolvedDocument {
  const semantic = projectGanttSemantic(document);
  const contexts = createTaskContexts(document, semantic);
  const taskKeysByMermaidId = createTaskKeyMap(contexts);
  const tasks = contexts.map((context) => createResolvedTask(context, taskKeysByMermaidId));
  const diagnostics = collectResolutionDiagnostics(document, semantic, contexts);

  return {
    kind: "ResolvedDocument",
    semantic,
    diagnostics,
    tasks
  };
}

export function createDiagnosticSummary(document: GanttDocument): DiagnosticSummaryItem[] {
  const resolved = resolveGanttDocument(document);
  return resolved.diagnostics.map((diagnostic) => {
    const primaryRange = diagnostic.instruction.primaryRange;
    const relatedRanges = diagnostic.instruction.relatedRanges?.map((range) => ({
      ...range,
      raw: document.source.slice(range.start.offset, range.end.offset)
    }));
    return {
      code: diagnostic.code,
      stage: diagnostic.stage,
      severity: diagnostic.severity,
      messageKey: messageKeyForCode(diagnostic.code),
      summary: diagnostic.instruction.summary,
      primaryRange,
      primaryRaw: document.source.slice(primaryRange.start.offset, primaryRange.end.offset),
      suggestedActions: summarizeSuggestedActions(diagnostic, document),
      ...(relatedRanges && relatedRanges.length > 0 ? { relatedRanges } : {})
    };
  });
}

function summarizeSuggestedActions(
  diagnostic: ResolvedDiagnostic,
  document: GanttDocument
): DiagnosticSummaryItem["suggestedActions"] {
  const actions: DiagnosticSummaryItem["suggestedActions"] = diagnostic.instruction.suggestedActions.map((action) => ({
    kind: action.kind,
    labelKey: actionLabelKeyForCode(diagnostic.code),
    labelText: action.label,
    ...(action.kind === "quick-fix" && action.labelText ? { labelText: action.labelText } : {}),
    ...(action.kind === "quick-fix" && action.replacement ? { replacement: action.replacement } : {})
  }));
  return [...actions, ...quickFixesForDiagnostic(diagnostic, document)];
}

function quickFixesForDiagnostic(
  diagnostic: ResolvedDiagnostic,
  document: GanttDocument
): DiagnosticSummaryItem["suggestedActions"] {
  const primaryRange = diagnostic.instruction.primaryRange;
  const primaryRaw = document.source.slice(primaryRange.start.offset, primaryRange.end.offset);
  if (diagnostic.code === "INVALID_TICK_INTERVAL") {
    return [{
      kind: "quick-fix",
      labelKey: "diagnostics.action.useOneWeekTickInterval",
      replacement: {
        range: primaryRange,
        text: "1week"
      }
    }];
  }
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(primaryRaw);
  if (diagnostic.code === "DATE_FORMAT_MISMATCH" && dateMatch) {
    const replacement = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    return [{
      kind: "quick-fix",
      labelKey: "diagnostics.action.convertDateToConfiguredFormat",
      replacement: {
        range: primaryRange,
        text: replacement
      }
    }];
  }
  if (diagnostic.code === "DUPLICATE_TASK_ID" && primaryRaw.length > 0) {
    const replacement = nextUniqueTaskId(primaryRaw, existingTaskIds(document));
    return [{
      kind: "quick-fix",
      labelKey: "diagnostics.action.renameDuplicateTaskId",
      replacement: {
        range: primaryRange,
        text: replacement
      }
    }];
  }
  if (diagnostic.code === "KEYWORD_LIKE_TASK_LABEL" && primaryRaw.length > 0) {
    const replacement = `Task ${primaryRaw}`;
    return [{
      kind: "quick-fix",
      labelKey: "diagnostics.action.prefixKeywordLikeLabel",
      replacement: {
        range: primaryRange,
        text: replacement
      }
    }];
  }
  if (
    diagnostic.code === "HOST_VERSION_SENSITIVE_SYNTAX" &&
    primaryRaw === "displayMode: compact" &&
    rangeOwnerKind(document, primaryRange) === "FrontmatterBlock"
  ) {
    return [{
      kind: "quick-fix",
      labelKey: "diagnostics.action.commentOutCompactDisplayMode",
      labelText: "Comment out compact display mode",
      replacement: {
        range: primaryRange,
        text: "# displayMode: compact"
      }
    }];
  }
  if (diagnostic.code === "UNDEFINED_DEPENDENCY") {
    return existingTaskIdsExcludingOwner(document, primaryRange)
      .filter((id) => id !== primaryRaw)
      .slice(0, 8)
      .map((id) => ({
        kind: "quick-fix",
        labelKey: "diagnostics.action.useExistingTaskId",
        labelText: `Use dependency ${id}`,
        replacement: {
          range: primaryRange,
          text: id
        }
      }));
  }
  return [];
}

function existingTaskIdsExcludingOwner(document: GanttDocument, range: Range): string[] {
  const owner = document.items.find((item): item is TaskStmt => {
    return item.kind === "TaskStmt" &&
      item.range.start.offset <= range.start.offset &&
      item.range.end.offset >= range.end.offset;
  });
  const ownerIds = new Set(owner?.metaItems
    .filter((item): item is IdMetaSlice => item.kind === "IdMetaSlice")
    .map((item) => item.valueRaw) ?? []);
  return existingTaskIds(document).filter((id) => !ownerIds.has(id));
}

function rangeOwnerKind(document: GanttDocument, range: Range): DocumentItem["kind"] | undefined {
  return document.items.find((item) => {
    return item.range.start.offset <= range.start.offset &&
      item.range.end.offset >= range.end.offset;
  })?.kind;
}

function nextUniqueTaskId(baseId: string, existingIds: string[]): string {
  const used = new Set(existingIds);
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseId}-${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${baseId}-renamed`;
}

function existingTaskIds(document: GanttDocument): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of document.items) {
    if (item.kind !== "TaskStmt") {
      continue;
    }
    for (const meta of item.metaItems) {
      if (meta.kind === "IdMetaSlice" && meta.valueRaw.length > 0 && !seen.has(meta.valueRaw)) {
        ids.push(meta.valueRaw);
        seen.add(meta.valueRaw);
      }
    }
  }
  return ids;
}

function createTaskContexts(document: GanttDocument, semantic: SemanticDocument): TaskResolutionContext[] {
  const semanticTasks = new Map<string, SemanticTask>();
  for (const section of semantic.sections) {
    for (const task of section.tasks) {
      semanticTasks.set(task.nodeId, task);
    }
  }

  return document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt")
    .map((task) => ({
      task,
      semanticTask: semanticTasks.get(task.nodeId) ?? createFallbackSemanticTask(task),
      idSlices: task.metaItems.filter((item): item is IdMetaSlice => item.kind === "IdMetaSlice"),
      dateSlices: task.metaItems.filter((item): item is DateMetaSlice => item.kind === "DateMetaSlice"),
      dependencyRefs: task.metaItems.flatMap((item) => {
        if (item.kind === "AfterMetaSlice") {
          return item.refs;
        }
        if (item.kind === "UntilMetaSlice" && item.refRaw.length > 0) {
          const refStart = item.raw.indexOf(item.refRaw);
          return [{
            raw: item.refRaw,
            range: {
              start: {
                offset: item.range.start.offset + refStart,
                line: item.range.start.line,
                column: item.range.start.column + refStart
              },
              end: {
                offset: item.range.start.offset + refStart + item.refRaw.length,
                line: item.range.start.line,
                column: item.range.start.column + refStart + item.refRaw.length
              }
            }
          }];
        }
        return [];
      })
    }));
}

function createResolvedTask(context: TaskResolutionContext, taskKeysByMermaidId: Map<string, string>): ResolvedTask {
  const task = context.semanticTask;
  return {
    key: `task:${task.nodeId}`,
    nodeId: task.nodeId,
    ...(task.id ? { mermaidId: task.id } : {}),
    label: task.label,
    ...(task.start ? { normalizedStart: task.start } : {}),
    ...(task.end ? { normalizedEnd: task.end } : {}),
    dependencyKeys: context.dependencyRefs
      .map((ref) => taskKeysByMermaidId.get(ref.raw))
      .filter((key): key is string => key !== undefined)
  };
}

function createTaskKeyMap(contexts: TaskResolutionContext[]): Map<string, string> {
  const taskKeysByMermaidId = new Map<string, string>();
  for (const context of contexts) {
    const id = context.semanticTask.id;
    if (id && !taskKeysByMermaidId.has(id)) {
      taskKeysByMermaidId.set(id, `task:${context.semanticTask.nodeId}`);
    }
  }
  return taskKeysByMermaidId;
}

function collectResolutionDiagnostics(
  document: GanttDocument,
  semantic: SemanticDocument,
  contexts: TaskResolutionContext[]
): ResolvedDiagnostic[] {
  return [
    ...collectParseDiagnostics(document),
    ...collectHostVersionDiagnostics(document),
    ...collectDateFormatDiagnostics(document, semantic, contexts),
    ...collectIncludeExcludeConflictDiagnostics(document),
    ...collectDuplicateIdDiagnostics(contexts),
    ...collectUndefinedDependencyDiagnostics(contexts),
    ...collectDependencyGraphDiagnostics(contexts),
    ...collectKeywordLikeStatementDiagnostics(document),
    ...collectKeywordLikeLabelDiagnostics(contexts),
    ...collectLongLabelDiagnostics(contexts)
  ];
}

function collectKeywordLikeStatementDiagnostics(document: GanttDocument): ResolvedDiagnostic[] {
  return document.items.flatMap((item) => {
    if (item.kind !== "SectionStmt") {
      return [];
    }
    if (!/^section\s*:/.test(item.raw)) {
      return [];
    }
    return [createResolvedDiagnostic(
      "KEYWORD_LIKE_TASK_LABEL",
      "warning",
      "Task label looks like a Mermaid keyword.",
      rangeWithinItem(item, 0, "section".length),
      "Rename this task label to avoid Mermaid syntax confusion."
    )];
  });
}

function collectParseDiagnostics(document: GanttDocument): ResolvedDiagnostic[] {
  const diagnostics = [
    ...document.errors.map((error) => diagnosticFromParseError(error)),
    ...document.items.flatMap((item) => collectNestedParseErrors(item).map((error) => diagnosticFromParseError(error)))
  ];
  return dedupeDiagnostics(diagnostics);
}

function collectNestedParseErrors(value: unknown): ParseError[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const errors = "errors" in value && Array.isArray(value.errors)
    ? value.errors.filter(isParseError)
    : [];

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      errors.push(...child.flatMap((entry) => collectNestedParseErrors(entry)));
      continue;
    }
    errors.push(...collectNestedParseErrors(child));
  }

  return errors;
}

function isParseError(value: unknown): value is ParseError {
  return Boolean(
    value &&
    typeof value === "object" &&
    "code" in value &&
    "stage" in value &&
    value.stage === "parse"
  );
}

function collectHostVersionDiagnostics(document: GanttDocument): ResolvedDiagnostic[] {
  return document.items.flatMap((item) => {
    if (item.kind !== "FrontmatterBlock" && item.kind !== "UnknownBlock") {
      return [];
    }
    const marker = "displayMode: compact";
    const index = item.raw.indexOf(marker);
    if (index < 0) {
      return [];
    }
    const range = rangeWithinItem(item, index, marker.length);
    return [createResolvedDiagnostic(
      "HOST_VERSION_SENSITIVE_SYNTAX",
      "warning",
      "displayMode compact can depend on the Mermaid host version.",
      range,
      "Review Mermaid host version compatibility."
    )];
  });
}

function collectDateFormatDiagnostics(
  document: GanttDocument,
  semantic: SemanticDocument,
  contexts: TaskResolutionContext[]
): ResolvedDiagnostic[] {
  const dateFormat = semantic.settings.dateFormat;
  if (!dateFormat) {
    return [];
  }

  const diagnostics: ResolvedDiagnostic[] = [];
  for (const context of contexts) {
    for (const date of context.dateSlices) {
      if (dateFormat === "DD-MM-YYYY" && /^\d{4}-\d{2}-\d{2}$/.test(date.valueRaw)) {
        diagnostics.push(createResolvedDiagnostic(
          "DATE_FORMAT_MISMATCH",
          "error",
          "Task date does not match dateFormat.",
          date.range,
          "Align task dates with dateFormat."
        ));
      }
      if (dateFormat === "YYYY-MM-DD" && /^\d{2}-\d{2}-\d{4}$/.test(date.valueRaw)) {
        diagnostics.push(createResolvedDiagnostic(
          "DATE_FORMAT_MISMATCH",
          "error",
          "Task date does not match dateFormat.",
          date.range,
          "Align task dates with dateFormat."
        ));
      }
    }
  }

  return diagnostics;
}

function collectIncludeExcludeConflictDiagnostics(document: GanttDocument): ResolvedDiagnostic[] {
  const includedValues = new Map<string, Range>();
  for (const item of document.items) {
    if (item.kind !== "IncludesStmt") {
      continue;
    }
    const normalized = item.valueRaw.trim().toLowerCase();
    if (normalized.length > 0 && !includedValues.has(normalized)) {
      includedValues.set(normalized, valueRangeOfItem(item));
    }
  }

  const diagnostics: ResolvedDiagnostic[] = [];
  for (const item of document.items) {
    if (item.kind !== "ExcludesStmt") {
      continue;
    }
    const normalized = item.valueRaw.trim().toLowerCase();
    const includeRange = includedValues.get(normalized);
    if (!includeRange) {
      continue;
    }
    diagnostics.push(createResolvedDiagnostic(
      "INCLUDE_EXCLUDE_CONFLICT",
      "warning",
      "The same value is included and excluded.",
      valueRangeOfItem(item),
      "Remove the value from either includes or excludes.",
      [includeRange]
    ));
  }
  return diagnostics;
}

function collectDuplicateIdDiagnostics(contexts: TaskResolutionContext[]): ResolvedDiagnostic[] {
  const firstById = new Map<string, IdMetaSlice>();
  const diagnostics: ResolvedDiagnostic[] = [];
  for (const context of contexts) {
    for (const id of context.idSlices) {
      const first = firstById.get(id.valueRaw);
      if (!first) {
        firstById.set(id.valueRaw, id);
        continue;
      }
      diagnostics.push(createResolvedDiagnostic(
        "DUPLICATE_TASK_ID",
        "error",
        "Task ID is duplicated.",
        id.range,
        "Rename this task ID.",
        [first.range]
      ));
    }
  }
  return diagnostics;
}

function collectUndefinedDependencyDiagnostics(contexts: TaskResolutionContext[]): ResolvedDiagnostic[] {
  const ids = new Set(contexts.flatMap((context) => context.idSlices.map((id) => id.valueRaw)));
  const diagnostics: ResolvedDiagnostic[] = [];
  for (const context of contexts) {
    for (const ref of context.dependencyRefs) {
      if (!ids.has(ref.raw)) {
        diagnostics.push(createResolvedDiagnostic(
          "UNDEFINED_DEPENDENCY",
          "error",
          "Dependency target is not defined.",
          ref.range,
          "Choose an existing task ID."
        ));
      }
    }
  }
  return diagnostics;
}

function collectDependencyGraphDiagnostics(contexts: TaskResolutionContext[]): ResolvedDiagnostic[] {
  const contextById = new Map<string, TaskResolutionContext>();
  for (const context of contexts) {
    for (const id of context.idSlices) {
      if (!contextById.has(id.valueRaw)) {
        contextById.set(id.valueRaw, context);
      }
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const context of contexts) {
    const targets = context.dependencyRefs
      .map((ref) => contextById.get(ref.raw)?.task.nodeId)
      .filter((nodeId): nodeId is string => nodeId !== undefined);
    adjacency.set(context.task.nodeId, targets);
  }

  const diagnostics: ResolvedDiagnostic[] = [];
  for (const context of contexts) {
    const ownerIds = new Set(context.idSlices.map((id) => id.valueRaw));
    for (const ref of context.dependencyRefs) {
      const target = contextById.get(ref.raw);
      if (!target) {
        continue;
      }
      if (ownerIds.has(ref.raw)) {
        diagnostics.push(createResolvedDiagnostic(
          "SELF_DEPENDENCY",
          "error",
          "Task cannot depend on itself.",
          ref.range,
          "Choose a different dependency target."
        ));
        continue;
      }
      if (hasDependencyPath(target.task.nodeId, context.task.nodeId, adjacency, new Set())) {
        diagnostics.push(createResolvedDiagnostic(
          "CIRCULAR_DEPENDENCY",
          "error",
          "Dependency creates a cycle.",
          ref.range,
          "Remove or change one dependency in the cycle.",
          [target.task.label.range]
        ));
      }
    }
  }
  return diagnostics;
}

function hasDependencyPath(
  currentNodeId: string,
  targetNodeId: string,
  adjacency: Map<string, string[]>,
  visited: Set<string>
): boolean {
  if (currentNodeId === targetNodeId) {
    return true;
  }
  if (visited.has(currentNodeId)) {
    return false;
  }
  visited.add(currentNodeId);
  return (adjacency.get(currentNodeId) ?? []).some((nextNodeId) => {
    return hasDependencyPath(nextNodeId, targetNodeId, adjacency, visited);
  });
}

function collectKeywordLikeLabelDiagnostics(contexts: TaskResolutionContext[]): ResolvedDiagnostic[] {
  const keywords = new Set(["gantt", "section", "click", "vert", "title", "dateFormat", "axisFormat", "tickInterval"]);
  return contexts
    .filter(({ task }) => keywords.has(task.label.raw))
    .map(({ task }) => createResolvedDiagnostic(
      "KEYWORD_LIKE_TASK_LABEL",
      "warning",
      "Task label looks like a Mermaid keyword.",
      task.label.range,
      "Rename this task label to avoid Mermaid syntax confusion."
    ));
}

function collectLongLabelDiagnostics(contexts: TaskResolutionContext[]): ResolvedDiagnostic[] {
  return contexts
    .filter(({ task }) => task.label.raw.length >= 30 && /[^\x00-\x7F]/.test(task.label.raw))
    .map(({ task }) => createResolvedDiagnostic(
      "LONG_LABEL_READABILITY",
      "info",
      "Long label may be hard to read in Mermaid preview.",
      task.label.range,
      "Review preview label readability."
    ));
}

function createResolvedDiagnostic(
  code: string,
  severity: ResolvedDiagnostic["severity"],
  message: string,
  primaryRange: Range,
  actionLabel: string,
  relatedRanges?: Range[]
): ResolvedDiagnostic {
  return {
    code,
    severity,
    message,
    stage: "resolution",
    instruction: {
      summary: message,
      primaryRange,
      ...(relatedRanges && relatedRanges.length > 0 ? { relatedRanges } : {}),
      suggestedActions: [{
        kind: "manual-edit",
        label: actionLabel
      }]
    }
  };
}

function diagnosticFromParseError(error: ParseError): ResolvedDiagnostic {
  return {
    code: error.code,
    severity: error.severity,
    message: error.message,
    stage: error.stage,
    instruction: error.instruction
  };
}

function dedupeDiagnostics(diagnostics: ResolvedDiagnostic[]): ResolvedDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const range = diagnostic.instruction.primaryRange;
    const key = `${diagnostic.stage}:${diagnostic.code}:${range.start.offset}:${range.end.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function rangeWithinItem(item: DocumentItem, startInRaw: number, length: number): Range {
  const before = item.raw.slice(0, startInRaw);
  const startOffset = item.range.start.offset + startInRaw;
  const lines = before.split("\n");
  const lineDelta = lines.length - 1;
  const startLine = item.range.start.line + lineDelta;
  const startColumn = lineDelta === 0
    ? item.range.start.column + startInRaw
    : lines[lines.length - 1].length + 1;
  return {
    start: {
      offset: startOffset,
      line: startLine,
      column: startColumn
    },
    end: {
      offset: startOffset + length,
      line: startLine,
      column: startColumn + length
    }
  };
}

function contentRangeOfItem(item: DocumentItem): Range {
  const contentLength = item.raw.endsWith("\r\n")
    ? item.raw.length - 2
    : item.raw.endsWith("\n")
      ? item.raw.length - 1
      : item.raw.length;
  return rangeWithinItem(item, 0, contentLength);
}

function valueRangeOfItem(item: DocumentItem): Range {
  if ("valueRaw" in item && typeof item.valueRaw === "string") {
    const start = item.raw.indexOf(item.valueRaw);
    if (start >= 0) {
      return rangeWithinItem(item, start, item.valueRaw.length);
    }
  }
  return contentRangeOfItem(item);
}

function createFallbackSemanticTask(task: TaskStmt): SemanticTask {
  return {
    nodeId: task.nodeId,
    label: task.label.raw,
    sourceLabelRaw: task.label.raw,
    displayLabel: task.label.raw,
    previewLabelPolicy: "truncate-with-tooltip",
    tags: []
  };
}

function messageKeyForCode(code: string): string {
  const map: Record<string, string> = {
    DATE_FORMAT_MISMATCH: "diagnostics.dateFormatMismatch",
    DUPLICATE_TASK_ID: "diagnostics.duplicateTaskId",
    CIRCULAR_DEPENDENCY: "diagnostics.circularDependency",
    HOST_VERSION_SENSITIVE_SYNTAX: "diagnostics.hostVersionSensitiveSyntax",
    INCLUDE_EXCLUDE_CONFLICT: "diagnostics.includeExcludeConflict",
    INVALID_TICK_INTERVAL: "diagnostics.invalidTickInterval",
    KEYWORD_LIKE_TASK_LABEL: "diagnostics.keywordLikeTaskLabel",
    LONG_LABEL_READABILITY: "diagnostics.longLabelReadability",
    SELF_DEPENDENCY: "diagnostics.selfDependency",
    UNDEFINED_DEPENDENCY: "diagnostics.undefinedDependency"
  };
  return map[code] ?? `diagnostics.${toCamelCase(code)}`;
}

function actionLabelKeyForCode(code: string): string {
  const map: Record<string, string> = {
    DATE_FORMAT_MISMATCH: "diagnostics.action.alignDateFormat",
    DUPLICATE_TASK_ID: "diagnostics.action.renameTaskId",
    CIRCULAR_DEPENDENCY: "diagnostics.action.changeDependency",
    HOST_VERSION_SENSITIVE_SYNTAX: "diagnostics.action.checkMermaidHostVersion",
    INCLUDE_EXCLUDE_CONFLICT: "diagnostics.action.reviewIncludeExclude",
    INVALID_TICK_INTERVAL: "diagnostics.action.useValidTickInterval",
    KEYWORD_LIKE_TASK_LABEL: "diagnostics.action.renameKeywordLikeLabel",
    LONG_LABEL_READABILITY: "diagnostics.action.reviewPreviewLabel",
    SELF_DEPENDENCY: "diagnostics.action.changeDependency",
    UNDEFINED_DEPENDENCY: "diagnostics.action.chooseExistingTaskId"
  };
  return map[code] ?? "diagnostics.action.reviewSource";
}

function toCamelCase(code: string): string {
  return code.toLowerCase().replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}
