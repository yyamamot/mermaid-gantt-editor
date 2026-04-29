import { applyLosslessTextPatch, emitNormalizedGantt } from "./emitter";
import { parseGanttLossless } from "./parser";
import { projectGanttSemantic } from "./projection";
import { createDiagnosticSummary, resolveGanttDocument } from "./resolver";
import { RangeMapper } from "./range";
import type {
  AdvancedSourceItem,
  ConversionDiagnostic,
  DiagnosticSummaryItem,
  DocumentItem,
  DateMetaSlice,
  DurationMetaSlice,
  EditorAction,
  EditorActionResult,
  EditorSelection,
  EditorState,
  GanttDocument,
  IdMetaSlice,
  ProjectionIssue,
  Range,
  SemanticDocument,
  SemanticSettings,
  SemanticTask,
  TagMetaSlice,
  TaskMetaSlice,
  TaskGridFilter,
  TaskGridRow,
  TaskGridSort,
  TaskStmt,
  TextSlice
} from "./types";

const EDITABLE_TASK_FIELDS: TaskGridRow["editableFields"] = [
  "label",
  "id",
  "start",
  "end",
  "duration",
  "dependencies",
  "until",
  "tags",
  "clickHref"
];
const EDITABLE_TASK_TAGS = new Set(["active", "done", "crit", "milestone", "vert"]);
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DURATION_PATTERN = /^\d+(?:\.\d+)?(?:millisecond|second|minute|hour|day|week|month|year|ms|s|m|h|d|w|M|y)s?$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createEditorState(
  document: GanttDocument,
  selected: EditorSelection = { kind: "document" },
  gridView?: { sort?: TaskGridSort; filter?: TaskGridFilter }
): EditorState {
  const semantic = projectGanttSemantic(document);
  const resolved = resolveGanttDocument(document);
  const previewBlockedByTopAxis = semantic.settings.topAxis === true;
  const diagnostics = [
    ...createEditorDiagnostics(document, createDiagnosticSummary(document), semantic.projectionIssues),
    ...(previewBlockedByTopAxis ? createTopAxisPreviewDiagnostics(document) : [])
  ];
  const rows = createTaskGridRows(document, semantic, diagnostics, semantic.projectionIssues);
  const viewOrder = computeTaskGridViewOrder(rows, gridView?.sort, gridView?.filter);
  const normalized = emitNormalizedGantt(semantic);

  return {
    mode: semantic.projectionIssues.some((issue) => issue.severity === "error") ? "fallback" : "structured",
    documentId: document.nodeId,
    source: document.source,
    semantic,
    resolved,
    selected,
    grid: {
      rows,
      viewOrder,
      ...(gridView?.sort ? { sort: gridView.sort } : {}),
      ...(gridView?.filter ? { filter: gridView.filter } : {}),
      isViewOnlyOrdering: Boolean(gridView?.sort || gridView?.filter)
    },
    advancedSourceItems: createAdvancedSourceItems(document, semantic.projectionIssues),
    diagnostics,
    projectionIssues: semantic.projectionIssues,
    ...(normalized.diagnostics.length === 0 && !previewBlockedByTopAxis ? { previewSource: normalized.source } : {})
  };
}

function createTopAxisPreviewDiagnostics(document: GanttDocument): DiagnosticSummaryItem[] {
  const item = findSettingItem(document, "topAxis");
  if (!item) {
    return [];
  }
  return [{
    code: "TOP_AXIS_PREVIEW_UNSUPPORTED",
    stage: "projection",
    severity: "warning",
    messageKey: "diagnostics.topAxisPreviewUnsupported",
    summary: "topAxis is retained in source, but Mermaid 11.14.0 preview fails with this statement.",
    primaryRange: item.range,
    primaryRaw: item.raw.trim(),
    suggestedActions: [{
      kind: "fallback",
      labelKey: "diagnostics.action.reviewSource"
    }]
  }];
}

function createEditorDiagnostics(
  document: GanttDocument,
  diagnostics: DiagnosticSummaryItem[],
  projectionIssues: ProjectionIssue[]
): DiagnosticSummaryItem[] {
  const existing = new Set(diagnostics.map((diagnostic) => {
    return `${diagnostic.stage}:${diagnostic.code}:${diagnostic.primaryRange.start.offset}`;
  }));
  const projectionDiagnostics = projectionIssues
    .filter((issue) => !issue.reasonCode.startsWith("parse-"))
    .map((issue): DiagnosticSummaryItem => {
      const code = issue.reasonCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      return {
        code,
        stage: issue.stage,
        severity: issue.severity,
        messageKey: `diagnostics.${toCamelCase(code)}`,
        summary: issue.instruction.summary || issue.message,
        primaryRange: issue.range,
        primaryRaw: document.source.slice(issue.range.start.offset, issue.range.end.offset),
        suggestedActions: issue.instruction.suggestedActions.map((action) => ({
          kind: action.kind,
          labelKey: action.kind === "fallback"
            ? "diagnostics.action.reviewSource"
            : `diagnostics.action.${toCamelCase(code)}`,
          ...(action.kind === "quick-fix" && action.replacement ? { replacement: action.replacement } : {})
        }))
      };
    })
    .filter((diagnostic) => {
      const key = `${diagnostic.stage}:${diagnostic.code}:${diagnostic.primaryRange.start.offset}`;
      if (existing.has(key)) {
        return false;
      }
      existing.add(key);
      return true;
    });
  return [...diagnostics, ...projectionDiagnostics];
}

export function applyEditorAction(state: EditorState, action: EditorAction): EditorActionResult {
  switch (action.type) {
    case "select-document":
      return selectionResult(state, { kind: "document" });
    case "select-section":
      return selectionResult(state, { kind: "section", sectionId: action.sectionId });
    case "select-task":
      return selectionResult(state, { kind: "task", nodeId: action.nodeId });
    case "select-advanced-source-item":
      return selectionResult(state, { kind: "advanced-source-item", nodeId: action.nodeId });
    case "select-diagnostic":
      return selectionResult(state, { kind: "diagnostic", code: action.code, primaryRange: action.primaryRange });
    case "update-grid-view":
      return {
        state: {
          ...state,
          grid: {
            ...state.grid,
            viewOrder: computeTaskGridViewOrder(state.grid.rows, action.sort, action.filter),
            ...(action.sort ? { sort: action.sort } : { sort: undefined }),
            ...(action.filter ? { filter: action.filter } : { filter: undefined }),
            isViewOnlyOrdering: Boolean(action.sort || action.filter)
          }
        },
        sourceChanged: false,
        diagnostics: []
      };
    case "update-setting":
      return updateSetting(state, action.key, action.value);
    case "update-section-label":
      return updateSectionLabel(state, action.sectionId, action.label);
    case "update-task-label":
      return updateTaskLabel(state, action.nodeId, action.label);
    case "update-task-id":
      return updateTaskId(state, action.nodeId, action.id, action.dependencyPatchPolicy);
    case "update-task-schedule":
      return updateTaskSchedule(state, action.nodeId, action);
    case "update-task-dependencies":
      return updateTaskDependencies(state, action.nodeId, action.refs);
    case "update-task-until":
      return updateTaskUntil(state, action.nodeId, action.ref);
    case "update-task-tags":
      return updateTaskTags(state, action.nodeId, action.tags);
    case "update-task-click-href":
      return updateTaskClickHref(state, action.nodeId, action.href);
    case "add-section":
      return addSection(state, action.afterSectionId);
    case "add-task":
      return addTask(state, {
        sectionId: action.sectionId,
        afterNodeId: action.afterNodeId,
        beforeNodeId: action.beforeNodeId,
        position: action.position
      });
    case "duplicate-task":
      return duplicateTask(state, action.nodeId);
    case "delete-task":
      return deleteTask(state, action.nodeId);
    case "delete-section":
      return deleteSection(state, action.sectionId);
    case "move-task":
      return moveTask(state, action.nodeId, action.direction);
    case "move-task-to-section":
      return moveTaskToSection(state, action.nodeId, action.sectionId);
    case "move-section":
      return moveSection(state, action.sectionId, action.direction);
    case "replace-source":
      return sourceUpdateResult(action.source, { kind: "document" }, action.source !== state.source);
    case "enter-fallback":
      return {
        state: { ...state, mode: "fallback" },
        sourceChanged: false,
        diagnostics: []
      };
    case "apply-diagnostic-action":
      return applyDiagnosticAction(state, action.code, action.primaryRange, action.actionIndex);
  }
}

function applyDiagnosticAction(
  state: EditorState,
  code: string,
  primaryRange: Range,
  actionIndex: number
): EditorActionResult {
  const diagnostic = state.diagnostics.find((candidate) => {
    return candidate.code === code &&
      candidate.primaryRange.start.offset === primaryRange.start.offset &&
      candidate.primaryRange.end.offset === primaryRange.end.offset;
  });
  if (!diagnostic) {
    return actionBlocked(state, "EDITOR_DIAGNOSTIC_NOT_FOUND", `No diagnostic '${code}' exists at the requested source range.`);
  }

  const diagnosticAction = diagnostic.suggestedActions[actionIndex];
  if (!diagnosticAction) {
    return actionBlocked(state, "EDITOR_DIAGNOSTIC_ACTION_NOT_FOUND", `No diagnostic action exists at index ${actionIndex}.`);
  }

  if (diagnosticAction.kind === "fallback") {
    return {
      state: {
        ...state,
        mode: "fallback",
        selected: { kind: "diagnostic", code: diagnostic.code, primaryRange: diagnostic.primaryRange }
      },
      sourceChanged: false,
      diagnostics: []
    };
  }

  if (diagnosticAction.kind === "quick-fix") {
    if (!diagnosticAction.replacement) {
      return actionBlocked(state, "EDITOR_DIAGNOSTIC_QUICK_FIX_UNAVAILABLE", `Diagnostic quick fix '${code}' does not provide a replacement.`);
    }
    const document = parseGanttLossless(state.source);
    const result = applyLosslessTextPatch(document, diagnosticAction.replacement);
    if (result.diagnostics.length > 0) {
      return { state, sourceChanged: false, diagnostics: result.diagnostics };
    }
    return sourceUpdateResult(
      result.source,
      { kind: "diagnostic", code: diagnostic.code, primaryRange: diagnosticAction.replacement.range },
      result.source !== state.source
    );
  }

  return selectionResult(state, { kind: "diagnostic", code: diagnostic.code, primaryRange: diagnostic.primaryRange });
}

export function createTaskGridRows(
  document: GanttDocument,
  semantic: SemanticDocument,
  diagnostics = createDiagnosticSummary(document),
  projectionIssues = semantic.projectionIssues
): TaskGridRow[] {
  const tasksByNodeId = new Map<string, SemanticTask>();
  const emptySectionByNodeId = new Map<string, SemanticDocument["sections"][number]>();
  const sectionByTaskNodeId = new Map<string, { sectionId: string; sectionLabel: string }>();
  const clickHrefByTaskId = taskClickHrefById(document);
  for (const section of semantic.sections) {
    if (section.sourceNodeId && section.tasks.length === 0) {
      emptySectionByNodeId.set(section.sourceNodeId, section);
    }
    for (const task of section.tasks) {
      tasksByNodeId.set(task.nodeId, task);
      sectionByTaskNodeId.set(task.nodeId, {
        sectionId: section.id,
        sectionLabel: section.label
      });
    }
  }

  let sourceOrder = 0;
  return document.items
    .flatMap((item): TaskGridRow[] => {
      if (item.kind === "SectionStmt") {
        const section = emptySectionByNodeId.get(item.nodeId);
        if (!section) {
          return [];
        }
        const rowDiagnostics = diagnostics.filter((diagnostic) => rangeContains(item.range, diagnostic.primaryRange));
        const rowProjectionIssues = projectionIssues.filter((issue) => rangeContains(item.range, issue.range));
        sourceOrder += 1;
        return [{
          kind: "section",
          rowId: `section-row:${item.nodeId}`,
          nodeId: item.nodeId,
          sourceOrder,
          sectionId: section.id,
          sectionLabel: section.label,
          label: section.label,
          dependencies: [],
          tags: [],
          sourceLabelRaw: section.sourceLabelRaw,
          displayLabel: section.displayLabel,
          previewLabelPolicy: section.previewLabelPolicy,
          diagnostics: rowDiagnostics,
          projectionIssues: rowProjectionIssues,
          editableFields: []
        }];
      }
      if (item.kind !== "TaskStmt") {
        return [];
      }
      const task = tasksByNodeId.get(item.nodeId) ?? createFallbackSemanticTask(item);
      const section = sectionByTaskNodeId.get(item.nodeId) ?? { sectionId: "__default__", sectionLabel: "" };
      const rowDiagnostics = diagnostics.filter((diagnostic) => rangeContains(item.range, diagnostic.primaryRange));
      const rowProjectionIssues = projectionIssues.filter((issue) => rangeContains(item.range, issue.range));
      const editableFields = rowProjectionIssues.some((issue) => issue.severity === "error")
        ? []
        : EDITABLE_TASK_FIELDS;
      sourceOrder += 1;
      return [{
        kind: "task",
        rowId: `row:${item.nodeId}`,
        nodeId: item.nodeId,
        sourceOrder,
        sectionId: section.sectionId,
        sectionLabel: section.sectionLabel,
        label: task.label,
        ...(task.id ? { id: task.id } : {}),
        ...(task.start ? { start: task.start } : {}),
        ...(task.end ? { end: task.end } : {}),
        ...(task.duration ? { duration: task.duration } : {}),
        dependencies: task.after ?? [],
        ...(task.until ? { until: task.until } : {}),
        tags: task.tags,
        ...(task.id && clickHrefByTaskId.has(task.id) ? { clickHref: clickHrefByTaskId.get(task.id) } : {}),
        ...(task.milestone !== undefined ? { milestone: task.milestone } : {}),
        sourceLabelRaw: task.sourceLabelRaw,
        displayLabel: task.displayLabel,
        previewLabelPolicy: task.previewLabelPolicy,
        diagnostics: rowDiagnostics,
        projectionIssues: rowProjectionIssues,
        editableFields
      }];
    });
}

function selectionResult(state: EditorState, selected: EditorSelection): EditorActionResult {
  return {
    state: {
      ...state,
      selected
    },
    sourceChanged: false,
    diagnostics: []
  };
}

function updateTaskLabel(state: EditorState, nodeId: string, label: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const result = applyLosslessTextPatch(document, {
    range: task.label.range,
    text: label
  });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }

  return sourceUpdateResult(result.source, { kind: "task", nodeId }, result.source !== state.source);
}

function updateSetting(
  state: EditorState,
  key: keyof SemanticSettings,
  value: string | boolean | string[] | undefined
): EditorActionResult {
  const settingDiagnostic = validateScalarSettingInput(key, value);
  if (settingDiagnostic) {
    return actionBlocked(state, settingDiagnostic.code, settingDiagnostic.message);
  }

  if (Array.isArray(value)) {
    return updateArraySetting(state, key, value);
  }

  const document = parseGanttLossless(state.source);
  const existing = findSettingItem(document, key);
  if (existing) {
    if (typeof value === "boolean") {
      if (value) {
        return { state, sourceChanged: false, diagnostics: [] };
      }
      const result = applyLosslessTextPatch(document, { range: existing.range, text: "" });
      if (result.diagnostics.length > 0) {
        return { state, sourceChanged: false, diagnostics: result.diagnostics };
      }
      return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
    }
    if (value === undefined) {
      const result = applyLosslessTextPatch(document, { range: existing.range, text: "" });
      if (result.diagnostics.length > 0) {
        return { state, sourceChanged: false, diagnostics: result.diagnostics };
      }
      return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
    }
    if (!("valueRaw" in existing)) {
      return actionBlocked(state, "EDITOR_SETTING_VALUE_NOT_EDITABLE", `${existing.kind} does not have an editable value.`);
    }
    const valueRange = valueRangeWithinItem(existing, existing.valueRaw);
    const result = applyLosslessTextPatch(document, { range: valueRange, text: String(value) });
    if (result.diagnostics.length > 0) {
      return { state, sourceChanged: false, diagnostics: result.diagnostics };
    }
    return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
  }

  if (value === undefined || value === false) {
    return { state, sourceChanged: false, diagnostics: [] };
  }

  const statement = formatSettingStatement(key, value);
  if (!statement) {
    return actionBlocked(state, "EDITOR_SETTING_NOT_SUPPORTED", `Setting '${String(key)}' is not supported by the editor action layer.`);
  }
  const insertOffset = insertionOffsetAfterDiagramKeyword(document);
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(insertOffset, insertOffset);
  const separator = insertOffset > 0 && document.source[insertOffset - 1] !== "\n" ? "\n" : "";
  const result = applyLosslessTextPatch(document, { range: insertRange, text: `${separator}${statement}\n` });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }
  return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
}

function updateArraySetting(
  state: EditorState,
  key: keyof SemanticSettings,
  values: string[]
): EditorActionResult {
  if (key !== "includes" && key !== "excludes") {
    return actionBlocked(state, "EDITOR_SETTING_ARRAY_NOT_SUPPORTED", `Setting '${String(key)}' does not support array values.`);
  }

  const document = parseGanttLossless(state.source);
  const existing = findSettingItems(document, key);
  const normalizedValues = values.map((value) => value.trim()).filter(Boolean);
  const statements = normalizedValues.map((value) => formatSettingStatement(key, value)).filter(Boolean);

  if (existing.length === 0) {
    if (statements.length === 0) {
      return { state, sourceChanged: false, diagnostics: [] };
    }
    const insertOffset = insertionOffsetAfterDiagramKeyword(document);
    const insertRange = new RangeMapper(document.source).rangeFromOffsets(insertOffset, insertOffset);
    const separator = insertOffset > 0 && document.source[insertOffset - 1] !== "\n" ? "\n" : "";
    const text = `${separator}${statements.join("\n")}\n`;
    const result = applyLosslessTextPatch(document, { range: insertRange, text });
    if (result.diagnostics.length > 0) {
      return { state, sourceChanged: false, diagnostics: result.diagnostics };
    }
    return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
  }

  const patches = existing.map((item, index) => ({
    range: item.range,
    text: index === 0 && statements.length > 0 ? `${statements.join("\n")}\n` : ""
  }));
  const diagnostic = validatePatchRanges(document, patches.map((patch) => patch.range));
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, patches);
  return sourceUpdateResult(source, { kind: "document" }, source !== state.source);
}

function updateSectionLabel(state: EditorState, sectionId: string, label: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const section = semantic.sections.find((candidate) => candidate.id === sectionId);
  if (!section?.sourceNodeId) {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No editable section exists for sectionId '${sectionId}'.`);
  }
  const item = document.items.find((candidate) => candidate.nodeId === section.sourceNodeId);
  if (!item || item.kind !== "SectionStmt") {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No lossless section node exists for sectionId '${sectionId}'.`);
  }
  if (label.trim() === "") {
    return actionBlocked(
      state,
      "EDITOR_SECTION_LABEL_REQUIRED",
      "Section label cannot be empty.",
      item.range
    );
  }
  const range = valueRangeWithinItem(item, item.labelRaw);
  const result = applyLosslessTextPatch(document, { range, text: label });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }
  return sourceUpdateResult(result.source, { kind: "section", sectionId }, result.source !== state.source);
}

function validateScalarSettingInput(
  key: keyof SemanticSettings,
  value: string | boolean | string[] | undefined
): { code: string; message: string } | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  if (key === "tickInterval" && !DURATION_PATTERN.test(value.trim())) {
    return {
      code: "EDITOR_INVALID_TICK_INTERVAL",
      message: "Use a numeric tickInterval such as 1day, 1week, or 1month."
    };
  }
  return undefined;
}

function updateTaskId(
  state: EditorState,
  nodeId: string,
  id: string,
  dependencyPatchPolicy: "none" | "confirm"
): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const idMeta = task.metaItems.find((item): item is IdMetaSlice => item.kind === "IdMetaSlice");
  const oldId = idMeta?.valueRaw;
  const normalizedId = id.trim();
  if (!idMeta && normalizedId === "") {
    return { state, sourceChanged: false, diagnostics: [] };
  }
  if (!idMeta && !canAppendNonTagTaskMeta(task)) {
    return actionBlocked(
      state,
      "EDITOR_TASK_METADATA_LIMIT",
      "Cannot add task ID metadata because this task already has the maximum supported Mermaid task metadata fields.",
      task.range
    );
  }
  if (idMeta && normalizedId === "") {
    const references = collectTaskExternalReferences(document, task);
    if (references.length > 0) {
      return actionBlocked(
        state,
        "EDITOR_TASK_ID_REFERENCED",
        "Task ID is referenced by dependency or click source. Remove references before clearing the ID.",
        idMeta.range
      );
    }
    const patch = createRemoveTaskMetaItemPatch(task, idMeta);
    if (!patch) {
      return { state, sourceChanged: false, diagnostics: [] };
    }
    const diagnostic = validatePatchRanges(document, [patch.range]);
    if (diagnostic) {
      return { state, sourceChanged: false, diagnostics: [diagnostic] };
    }
    const source = applyDescendingPatches(document.source, [patch]);
    return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
  }

  if (!TASK_ID_PATTERN.test(normalizedId)) {
    return actionBlocked(
      state,
      "EDITOR_INVALID_TASK_ID",
      "Task ID can only contain letters, numbers, underscores, and hyphens.",
      idMeta?.range ?? task.range
    );
  }

  const currentTaskIds = new Set(oldId ? [oldId] : []);
  if (oldId !== normalizedId && existingTaskIdsExcluding(document, currentTaskIds).includes(normalizedId)) {
    return actionBlocked(
      state,
      "EDITOR_DUPLICATE_TASK_ID",
      "Task ID must be unique before write-back.",
      idMeta?.range ?? task.range
    );
  }

  const patches = [{
    range: idMeta?.range ?? {
      start: task.colon.range.end,
      end: task.colon.range.end
    },
    text: idMeta ? normalizedId : task.metaItems.length > 0 ? ` ${normalizedId},` : ` ${normalizedId}`
  }];

  if (dependencyPatchPolicy === "confirm" && oldId && oldId !== normalizedId) {
    patches.push(...collectDependencyRefPatches(document, oldId, normalizedId));
    patches.push(...collectClickTargetPatches(document, oldId, normalizedId));
  }

  const diagnostic = validatePatchRanges(document, patches.map((patch) => patch.range));
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, patches);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function updateTaskSchedule(
  state: EditorState,
  nodeId: string,
  patch: { start?: string; end?: string; duration?: string }
): EditorActionResult {
  if (patch.end !== undefined && patch.duration !== undefined) {
    return actionBlocked(
      state,
      "EDITOR_CONFLICTING_SCHEDULE_PATCH",
      "Update either task end or duration, not both in one action."
    );
  }

  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const dateItems = task.metaItems.filter((item): item is DateMetaSlice => item.kind === "DateMetaSlice");
  const duration = task.metaItems.find((item): item is DurationMetaSlice => item.kind === "DurationMetaSlice");
  const dependencyAnchors = task.metaItems.filter((item) => item.kind === "AfterMetaSlice" || item.kind === "UntilMetaSlice");
  const patches: Array<{ range: Range; text: string }> = [];

  const durationText = patch.duration?.trim();
  if (durationText && !DURATION_PATTERN.test(durationText)) {
    return actionBlocked(
      state,
      "EDITOR_INVALID_DURATION",
      "Use a valid duration such as 3d, 2w, or 1month.",
      duration?.range ?? task.range
    );
  }
  const nextStart = patch.start !== undefined ? patch.start.trim() : dateItems[0]?.valueRaw;
  const nextEnd = patch.end !== undefined ? patch.end.trim() : dateItems[1]?.valueRaw;
  if (
    patch.duration === undefined &&
    nextStart &&
    nextEnd &&
    ISO_DATE_PATTERN.test(nextStart) &&
    ISO_DATE_PATTERN.test(nextEnd) &&
    nextEnd < nextStart
  ) {
    return actionBlocked(
      state,
      "EDITOR_TASK_END_BEFORE_START",
      "Task end date cannot be before the start date.",
      dateItems[1]?.range ?? dateItems[0]?.range ?? task.range
    );
  }

  if (patch.start !== undefined) {
    const text = patch.start.trim();
    if (text === "") {
      patches.push(...createRemoveStartDatePatches(task, dateItems));
    } else if (dateItems[0]) {
      patches.push({ range: dateItems[0].range, text });
    } else if (dependencyAnchors.length > 0) {
      patches.push({ range: dependencyAnchors[0]!.range, text });
      patches.push(...dependencyAnchors.slice(1).flatMap((item) => {
        const removePatch = createRemoveTaskMetaItemPatch(task, item);
        return removePatch ? [removePatch] : [];
      }));
    } else if (canAppendNonTagTaskMeta(task)) {
      patches.push(createAppendMetaPatch(task, text));
    } else {
      return actionBlocked(
        state,
        "EDITOR_TASK_METADATA_LIMIT",
        "Cannot add start metadata because this task already has the maximum supported Mermaid task metadata fields.",
        task.range
      );
    }
  }
  if (patch.end !== undefined) {
    const text = patch.end.trim();
    if (text === "") {
      const removePatch = dateItems[1] ? createRemoveTaskMetaItemPatch(task, dateItems[1]) : undefined;
      if (removePatch) {
        patches.push(removePatch);
      }
    } else if (dateItems[1]) {
      patches.push({ range: dateItems[1].range, text });
    } else if (dateItems[0] && duration) {
      patches.push({ range: duration.range, text });
    } else if (dateItems[0] && dependencyAnchors[0]) {
      patches.push({ range: dependencyAnchors[0].range, text });
    } else if (dateItems[0] && canAppendNonTagTaskMeta(task)) {
      patches.push(createAppendMetaPatch(task, text));
    } else if (patch.start?.trim() && duration) {
      patches.push({ range: duration.range, text });
    } else if (patch.start?.trim()) {
      patches.push(createAppendMetaPatch(task, text));
    } else {
      return actionBlocked(
        state,
        "EDITOR_TASK_END_REQUIRES_START",
        "Set a task start before setting an absolute end date.",
        task.range
      );
    }
  }
  if (patch.duration !== undefined) {
    const text = patch.duration.trim();
    if (text === "") {
      const removePatch = duration ? createRemoveTaskMetaItemPatch(task, duration) : undefined;
      if (removePatch) {
        patches.push(removePatch);
      }
    } else if (duration) {
      patches.push({ range: duration.range, text });
    } else if (dateItems[1]) {
      patches.push({ range: dateItems[1].range, text });
    } else if (dateItems[0] && dependencyAnchors[0]) {
      patches.push({ range: dependencyAnchors[0].range, text });
    } else if (patch.start?.trim()) {
      patches.push(createAppendMetaPatch(task, text));
    } else if (!dateItems[0] && dependencyAnchors.length > 1) {
      patches.push({ range: dependencyAnchors[1]!.range, text });
    } else if (canAppendNonTagTaskMeta(task)) {
      patches.push(createAppendMetaPatch(task, text));
    } else {
      return actionBlocked(
        state,
        "EDITOR_TASK_METADATA_LIMIT",
        "Cannot add duration metadata because this task already has the maximum supported Mermaid task metadata fields.",
        task.range
      );
    }
  }

  const coalescedPatches = coalesceSameInsertionPatches(patches);
  const diagnostic = validatePatchRanges(document, coalescedPatches.map((item) => item.range));
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, coalescedPatches);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function updateTaskDependencies(state: EditorState, nodeId: string, refs: string[]): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }
  if (refs.length === 0) {
    const patch = createRemoveAfterMetaPatch(task);
    if (!patch) {
      return { state, sourceChanged: false, diagnostics: [] };
    }
    const diagnostic = validatePatchRanges(document, [patch.range]);
    if (diagnostic) {
      return { state, sourceChanged: false, diagnostics: [diagnostic] };
    }
    const source = applyDescendingPatches(document.source, [patch]);
    return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
  }

  const after = task.metaItems.find((item) => item.kind === "AfterMetaSlice");
  if (!after && !canAppendNonTagTaskMeta(task)) {
    return actionBlocked(
      state,
      "EDITOR_TASK_METADATA_LIMIT",
      "Cannot add dependency metadata because this task already has the maximum supported Mermaid task metadata fields.",
      task.range
    );
  }
  const text = `after ${refs.join(" ")}`;
  const patch = after
    ? { range: after.range, text }
    : createAppendMetaPatch(task, text);
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }
  const source = applyDescendingPatches(document.source, [patch]);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function updateTaskUntil(state: EditorState, nodeId: string, ref: string | undefined): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }
  if (!ref) {
    const patch = createRemoveTaskMetaPatch(task, "UntilMetaSlice");
    if (!patch) {
      return { state, sourceChanged: false, diagnostics: [] };
    }
    const diagnostic = validatePatchRanges(document, [patch.range]);
    if (diagnostic) {
      return { state, sourceChanged: false, diagnostics: [diagnostic] };
    }
    const source = applyDescendingPatches(document.source, [patch]);
    return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
  }

  const until = task.metaItems.find((item) => item.kind === "UntilMetaSlice");
  if (!until && !canAppendNonTagTaskMeta(task)) {
    return actionBlocked(
      state,
      "EDITOR_TASK_METADATA_LIMIT",
      "Cannot add until metadata because this task already has the maximum supported Mermaid task metadata fields.",
      task.range
    );
  }
  const text = `until ${ref}`;
  const patch = until
    ? { range: until.range, text }
    : createAppendMetaPatch(task, text);
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }
  const source = applyDescendingPatches(document.source, [patch]);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function updateTaskTags(state: EditorState, nodeId: string, tags: string[]): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const normalizedTags = uniqueKnownTaskTags(tags);
  const patch = createUpdateTaskTagsPatch(task, normalizedTags);
  if (!patch) {
    return { state, sourceChanged: false, diagnostics: [] };
  }
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }
  const source = applyDescendingPatches(document.source, [patch]);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function updateTaskClickHref(state: EditorState, nodeId: string, href: string | undefined): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }
  const taskId = task.metaItems.find((item): item is IdMetaSlice => item.kind === "IdMetaSlice")?.valueRaw;
  if (!taskId) {
    return actionBlocked(state, "EDITOR_TASK_CLICK_REQUIRES_ID", "Task needs an ID before a click href can be edited.");
  }

  const normalizedHref = href?.trim();
  const click = findClickHrefForTaskId(document, taskId);
  if (!normalizedHref) {
    if (!click) {
      return { state, sourceChanged: false, diagnostics: [] };
    }
    const patch = createRemoveClickTargetPatch(document, click.item, click.target);
    const result = applyLosslessTextPatch(document, patch);
    if (result.diagnostics.length > 0) {
      return { state, sourceChanged: false, diagnostics: result.diagnostics };
    }
    return sourceUpdateResult(result.source, { kind: "task", nodeId }, result.source !== state.source);
  }

  const safeHref = normalizedHref.replace(/"/g, "%22");
  if (click && click.item.targetIds.length === 1) {
    const patch = {
      range: taskMetaValueRange(click.clause.range, click.clause.raw, click.clause.hrefRaw),
      text: safeHref
    };
    const diagnostic = validatePatchRanges(document, [patch.range]);
    if (diagnostic) {
      return { state, sourceChanged: false, diagnostics: [diagnostic] };
    }
    const source = applyDescendingPatches(document.source, [patch]);
    return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
  }

  const removePatch = click ? createRemoveClickTargetPatch(document, click.item, click.target) : undefined;
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(task.range.end.offset, task.range.end.offset);
  const prefix = task.range.end.offset > 0 && document.source[task.range.end.offset - 1] !== "\n" ? "\n" : "";
  const insertPatch = {
    range: insertRange,
    text: `${prefix}click ${taskId} href "${safeHref}"\n`
  };
  const patches = removePatch ? [insertPatch, removePatch] : [insertPatch];
  const diagnostic = validatePatchRanges(document, patches.map((patch) => patch.range));
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }
  const source = applyDescendingPatches(document.source, patches);
  return sourceUpdateResult(source, { kind: "task", nodeId }, source !== state.source);
}

function addSection(state: EditorState, afterSectionId?: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const insertOffset = sectionInsertionOffset(document, semantic, afterSectionId);
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(insertOffset, insertOffset);
  const label = nextGeneratedSectionLabel(semantic);
  const prefix = insertOffset > 0 && document.source[insertOffset - 1] !== "\n" ? "\n" : "";
  const patch = {
    range: insertRange,
    text: `${prefix}section ${label}\n`
  };
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, [patch]);
  const nextDocument = parseGanttLossless(source);
  const nextSemantic = projectGanttSemantic(nextDocument);
  const nextSection = nextSemantic.sections[nextSemantic.sections.length - 1];
  return sourceUpdateResult(
    source,
    nextSection ? { kind: "section", sectionId: nextSection.id } : { kind: "document" },
    source !== state.source
  );
}

function addTask(
  state: EditorState,
  target: { sectionId?: string; afterNodeId?: string; beforeNodeId?: string; position?: "section-start" | "section-end" } = {}
): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const afterTask = target.afterNodeId ? findTask(document, target.afterNodeId) : undefined;
  const beforeTask = target.beforeNodeId ? findTask(document, target.beforeNodeId) : undefined;
  if (target.afterNodeId && !afterTask) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${target.afterNodeId}'.`);
  }
  if (target.beforeNodeId && !beforeTask) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${target.beforeNodeId}'.`);
  }
  const targetSectionId = target.sectionId ?? selectedSectionId(state, semantic);
  const insertOffset = taskInsertionOffset(document, semantic, {
    sectionId: targetSectionId,
    afterTask,
    beforeTask,
    position: target.position
  });
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(insertOffset, insertOffset);
  const taskId = nextGeneratedTaskId(document);
  const prefix = insertOffset > 0 && document.source[insertOffset - 1] !== "\n" ? "\n" : "";
  const patch = {
    range: insertRange,
    text: `${prefix}New task : ${taskId}, 1d\n`
  };
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, [patch]);
  const nextDocument = parseGanttLossless(source);
  const nextTask = findTaskById(nextDocument, taskId);
  return sourceUpdateResult(
    source,
    nextTask ? { kind: "task", nodeId: nextTask.nodeId } : { kind: "document" },
    source !== state.source
  );
}

function duplicateTask(state: EditorState, nodeId: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const taskId = nextGeneratedTaskId(document);
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(task.range.end.offset, task.range.end.offset);
  const patch = {
    range: insertRange,
    text: duplicateTaskRaw(task, taskId)
  };
  const diagnostic = validatePatchRanges(document, [patch.range]);
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, [patch]);
  const nextDocument = parseGanttLossless(source);
  const nextTask = findTaskById(nextDocument, taskId);
  return sourceUpdateResult(
    source,
    nextTask ? { kind: "task", nodeId: nextTask.nodeId } : { kind: "document" },
    source !== state.source
  );
}

function moveTask(state: EditorState, nodeId: string, direction: "up" | "down"): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const section = semantic.sections.find((candidate) => candidate.taskNodeIds.includes(nodeId));
  if (!section) {
    return actionBlocked(state, "EDITOR_TASK_MOVE_SECTION_NOT_FOUND", "Task is not part of a semantic section.");
  }
  const currentIndex = section.taskNodeIds.indexOf(nodeId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const targetNodeId = section.taskNodeIds[targetIndex];
  if (!targetNodeId) {
    return actionBlocked(
      state,
      "EDITOR_TASK_MOVE_OUT_OF_BOUNDS",
      direction === "up" ? "Task is already the first task in this section." : "Task is already the last task in this section."
    );
  }
  const targetTask = findTask(document, targetNodeId);
  if (!targetTask) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${targetNodeId}'.`);
  }

  const firstTask = task.range.start.offset <= targetTask.range.start.offset ? task : targetTask;
  const secondTask = firstTask === task ? targetTask : task;
  const replacementRange = new RangeMapper(document.source).rangeFromOffsets(
    firstTask.range.start.offset,
    secondTask.range.end.offset
  );
  const firstRaw = document.source.slice(firstTask.range.start.offset, firstTask.range.end.offset);
  const secondRaw = document.source.slice(secondTask.range.start.offset, secondTask.range.end.offset);
  const betweenRaw = document.source.slice(firstTask.range.end.offset, secondTask.range.start.offset);
  const result = applyLosslessTextPatch(document, {
    range: replacementRange,
    text: `${secondRaw}${betweenRaw}${firstRaw}`
  });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }

  const movedTaskId = task.metaItems.find((item): item is IdMetaSlice => item.kind === "IdMetaSlice")?.valueRaw;
  const nextDocument = parseGanttLossless(result.source);
  const nextTask = movedTaskId ? findTaskById(nextDocument, movedTaskId) : undefined;
  return sourceUpdateResult(
    result.source,
    nextTask ? { kind: "task", nodeId: nextTask.nodeId } : { kind: "document" },
    result.source !== state.source
  );
}

function moveTaskToSection(state: EditorState, nodeId: string, sectionId: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const currentSection = semantic.sections.find((candidate) => candidate.taskNodeIds.includes(nodeId));
  if (!currentSection) {
    return actionBlocked(state, "EDITOR_TASK_MOVE_SECTION_NOT_FOUND", "Task is not part of a semantic section.");
  }
  const targetSection = semantic.sections.find((candidate) => candidate.id === sectionId);
  if (!targetSection) {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No semantic section exists for sectionId '${sectionId}'.`);
  }
  if (targetSection.id === currentSection.id) {
    return actionBlocked(state, "EDITOR_TASK_MOVE_SAME_SECTION", "Task is already in the requested section.");
  }

  const insertOffset = taskInsertionOffset(document, semantic, {
    sectionId: targetSection.id,
    position: "section-end"
  });
  const insertRange = new RangeMapper(document.source).rangeFromOffsets(insertOffset, insertOffset);
  const raw = document.source.slice(task.range.start.offset, task.range.end.offset);
  const insertionText = insertOffset < document.source.length && !raw.endsWith("\n")
    ? `${raw}\n`
    : raw;
  const patches = [
    { range: insertRange, text: insertionText },
    { range: task.range, text: "" }
  ];
  const diagnostic = validatePatchRanges(document, patches.map((patch) => patch.range));
  if (diagnostic) {
    return { state, sourceChanged: false, diagnostics: [diagnostic] };
  }

  const source = applyDescendingPatches(document.source, patches);
  const movedTaskId = task.metaItems.find((item): item is IdMetaSlice => item.kind === "IdMetaSlice")?.valueRaw;
  const nextDocument = parseGanttLossless(source);
  const nextTask = movedTaskId ? findTaskById(nextDocument, movedTaskId) : undefined;
  return sourceUpdateResult(
    source,
    nextTask ? { kind: "task", nodeId: nextTask.nodeId } : { kind: "document" },
    source !== state.source
  );
}

function deleteTask(state: EditorState, nodeId: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const task = findTask(document, nodeId);
  if (!task) {
    return actionBlocked(state, "EDITOR_TASK_NOT_FOUND", `No task exists for nodeId '${nodeId}'.`);
  }

  const deletedTaskIds = taskIdsForNodeIds(document, [task.nodeId]);
  const references = collectTaskExternalReferences(document, task);
  if (references.length > 0) {
    return deleteBlockedWithRepairDiagnostics(
      state,
      document,
      "EDITOR_TASK_DELETE_REFERENCED",
      "Task is referenced by dependency or click source. Remove references before deleting the task.",
      references,
      deletedTaskIds
    );
  }

  const result = applyLosslessTextPatch(document, {
    range: task.range,
    text: ""
  });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }

  return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
}

function deleteSection(state: EditorState, sectionId: string): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const section = semantic.sections.find((candidate) => candidate.id === sectionId);
  if (!section || !section.sourceNodeId) {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No editable section exists for sectionId '${sectionId}'.`);
  }
  const item = document.items.find((candidate) => candidate.nodeId === section.sourceNodeId);
  if (!item || item.kind !== "SectionStmt") {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No lossless section node exists for sectionId '${sectionId}'.`);
  }
  const deletionRange = section.tasks.length > 0
    ? sectionBlockRange(document, item)
    : item.range;
  const deletedTaskIds = taskIdsForNodeIds(document, section.taskNodeIds);
  const references = collectSectionExternalReferences(document, section.taskNodeIds, deletionRange);
  if (references.length > 0) {
    return deleteBlockedWithRepairDiagnostics(
      state,
      document,
      "EDITOR_SECTION_DELETE_REFERENCED",
      "Section contains tasks referenced outside the section. Remove references before deleting the section.",
      references,
      deletedTaskIds
    );
  }

  const result = applyLosslessTextPatch(document, {
    range: deletionRange,
    text: ""
  });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }

  return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
}

function moveSection(state: EditorState, sectionId: string, direction: "up" | "down"): EditorActionResult {
  const document = parseGanttLossless(state.source);
  const semantic = projectGanttSemantic(document);
  const section = semantic.sections.find((candidate) => candidate.id === sectionId);
  if (!section?.sourceNodeId) {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No editable section exists for sectionId '${sectionId}'.`);
  }
  const sectionItems = document.items.filter((item) => item.kind === "SectionStmt");
  const currentIndex = sectionItems.findIndex((item) => item.nodeId === section.sourceNodeId);
  if (currentIndex < 0) {
    return actionBlocked(state, "EDITOR_SECTION_NOT_FOUND", `No lossless section node exists for sectionId '${sectionId}'.`);
  }
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const targetItem = sectionItems[targetIndex];
  const currentItem = sectionItems[currentIndex];
  if (!currentItem || !targetItem) {
    return actionBlocked(
      state,
      "EDITOR_SECTION_MOVE_OUT_OF_BOUNDS",
      direction === "up" ? "Section is already the first explicit section." : "Section is already the last explicit section."
    );
  }

  const currentRange = sectionBlockRange(document, currentItem);
  const targetRange = sectionBlockRange(document, targetItem);
  const replacementRange = new RangeMapper(document.source).rangeFromOffsets(
    Math.min(currentRange.start.offset, targetRange.start.offset),
    Math.max(currentRange.end.offset, targetRange.end.offset)
  );
  const currentRaw = document.source.slice(currentRange.start.offset, currentRange.end.offset);
  const targetRaw = document.source.slice(targetRange.start.offset, targetRange.end.offset);
  const replacementText = direction === "up"
    ? `${currentRaw}${targetRaw}`
    : `${targetRaw}${currentRaw}`;
  const result = applyLosslessTextPatch(document, {
    range: replacementRange,
    text: replacementText
  });
  if (result.diagnostics.length > 0) {
    return { state, sourceChanged: false, diagnostics: result.diagnostics };
  }

  return sourceUpdateResult(result.source, { kind: "document" }, result.source !== state.source);
}

function sourceUpdateResult(source: string, selected: EditorSelection, sourceChanged: boolean): EditorActionResult {
  return {
    state: createEditorState(parseGanttLossless(source), selected),
    sourceChanged,
    diagnostics: []
  };
}

function selectedSectionId(state: EditorState, semantic: SemanticDocument): string | undefined {
  const selected = state.selected;
  if (selected.kind === "section") {
    return selected.sectionId;
  }
  if (selected.kind === "task") {
    return state.grid.rows.find((row) => row.nodeId === selected.nodeId)?.sectionId;
  }
  return semantic.sections[semantic.sections.length - 1]?.id;
}

function sectionInsertionOffset(
  document: GanttDocument,
  semantic: SemanticDocument,
  afterSectionId: string | undefined
): number {
  if (afterSectionId) {
    const targetSection = semantic.sections.find((section) => section.id === afterSectionId);
    if (targetSection?.sourceNodeId) {
      const sectionItem = document.items.find((item) => item.nodeId === targetSection.sourceNodeId);
      if (sectionItem) {
        return sectionBlockRange(document, sectionItem).end.offset;
      }
    }
  }

  return document.source.length > 0
    ? document.source.length
    : insertionOffsetAfterDiagramKeyword(document);
}

function taskInsertionOffset(
  document: GanttDocument,
  semantic: SemanticDocument,
  target: {
    sectionId?: string;
    afterTask?: TaskStmt;
    beforeTask?: TaskStmt;
    position?: "section-start" | "section-end";
  }
): number {
  if (target.beforeTask) {
    return target.beforeTask.range.start.offset;
  }
  if (target.afterTask) {
    return target.afterTask.range.end.offset;
  }

  const targetSection = target.sectionId
    ? semantic.sections.find((section) => section.id === target.sectionId)
    : undefined;
  if (targetSection) {
    if (target.position === "section-start") {
      const firstTaskNodeId = targetSection.taskNodeIds[0];
      const firstTask = firstTaskNodeId ? findTask(document, firstTaskNodeId) : undefined;
      if (firstTask) {
        return firstTask.range.start.offset;
      }
    }
    const lastTaskNodeId = targetSection.taskNodeIds[targetSection.taskNodeIds.length - 1];
    const lastTask = lastTaskNodeId ? findTask(document, lastTaskNodeId) : undefined;
    if (lastTask) {
      return lastTask.range.end.offset;
    }
    if (targetSection.sourceNodeId) {
      const sectionItem = document.items.find((item) => item.nodeId === targetSection.sourceNodeId);
      if (sectionItem) {
        return sectionItem.range.end.offset;
      }
    }
  }

  const lastTask = [...document.items]
    .reverse()
    .find((item): item is TaskStmt => item.kind === "TaskStmt");
  if (lastTask) {
    return lastTask.range.end.offset;
  }

  const lastSection = [...document.items]
    .reverse()
    .find((item) => item.kind === "SectionStmt");
  if (lastSection) {
    return lastSection.range.end.offset;
  }

  return insertionOffsetAfterDiagramKeyword(document);
}

function nextGeneratedTaskId(document: GanttDocument): string {
  const existingIds = new Set(document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt")
    .flatMap((task) => task.metaItems)
    .filter((item): item is IdMetaSlice => item.kind === "IdMetaSlice")
    .map((item) => item.valueRaw));
  let index = 1;
  while (existingIds.has(`task${index}`)) {
    index += 1;
  }
  return `task${index}`;
}

function nextGeneratedSectionLabel(semantic: SemanticDocument): string {
  const existingLabels = new Set(semantic.sections.map((section) => section.label));
  if (!existingLabels.has("New section")) {
    return "New section";
  }
  let index = 2;
  while (existingLabels.has(`New section ${index}`)) {
    index += 1;
  }
  return `New section ${index}`;
}

function findTaskById(document: GanttDocument, id: string): TaskStmt | undefined {
  return document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt")
    .find((task) => task.metaItems.some((item) => item.kind === "IdMetaSlice" && item.valueRaw === id));
}

function duplicateTaskRaw(task: TaskStmt, id: string): string {
  const idMeta = task.metaItems.find((item): item is IdMetaSlice => item.kind === "IdMetaSlice");
  if (idMeta) {
    const start = idMeta.range.start.offset - task.range.start.offset;
    const end = idMeta.range.end.offset - task.range.start.offset;
    return `${task.raw.slice(0, start)}${id}${task.raw.slice(end)}`;
  }

  const firstMeta = task.metaItems[0];
  if (firstMeta) {
    const insertOffset = firstMeta.range.start.offset - task.range.start.offset;
    return `${task.raw.slice(0, insertOffset)}${id}, ${task.raw.slice(insertOffset)}`;
  }

  const insertOffset = task.colon.range.end.offset - task.range.start.offset;
  return `${task.raw.slice(0, insertOffset)} ${id}${task.raw.slice(insertOffset)}`;
}

interface BlockingReference {
  range: Range;
  raw: string;
  removePatch: { range: Range; text: string };
}

function collectTaskExternalReferences(document: GanttDocument, task: TaskStmt): BlockingReference[] {
  const ids = taskIdsForNodeIds(document, [task.nodeId]);
  if (ids.length === 0) {
    return [];
  }

  const idSet = new Set(ids);
  return document.items.flatMap((item) => {
    if (item.kind === "TaskStmt") {
      if (item.nodeId === task.nodeId) {
        return [];
      }
      return item.metaItems.flatMap((meta) => {
        if (meta.kind === "AfterMetaSlice") {
          return meta.refs
            .filter((ref) => idSet.has(ref.raw))
            .map((ref) => ({
              range: ref.range,
              raw: ref.raw,
              removePatch: createRemoveAfterRefPatch(document, item, meta.refs, ref)
            }));
        }
        if (meta.kind === "UntilMetaSlice" && idSet.has(meta.refRaw)) {
          const removePatch = createRemoveTaskMetaPatch(item, "UntilMetaSlice");
          return removePatch
            ? [{
                range: taskMetaValueRange(meta.range, meta.raw, meta.refRaw),
                raw: meta.refRaw,
                removePatch
              }]
            : [];
        }
        return [];
      });
    }
    if (item.kind === "ClickStmt") {
      return item.targetIds
        .filter((targetId) => idSet.has(targetId.raw))
        .map((targetId) => ({
          range: targetId.range,
          raw: targetId.raw,
          removePatch: createRemoveClickTargetPatch(document, item, targetId)
        }));
    }
    return [];
  });
}

function taskIdsForNodeIds(document: GanttDocument, taskNodeIds: string[]): string[] {
  const nodeIds = new Set(taskNodeIds);
  return document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt" && nodeIds.has(item.nodeId))
    .flatMap((task) => task.metaItems)
    .filter((item): item is IdMetaSlice => item.kind === "IdMetaSlice")
    .map((item) => item.valueRaw)
    .filter((id) => id.length > 0);
}

function existingTaskIdsExcluding(document: GanttDocument, excludedIds: Set<string>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of document.items) {
    if (item.kind !== "TaskStmt") {
      continue;
    }
    for (const meta of item.metaItems) {
      if (meta.kind === "IdMetaSlice" && meta.valueRaw.length > 0 && !excludedIds.has(meta.valueRaw) && !seen.has(meta.valueRaw)) {
        seen.add(meta.valueRaw);
        ids.push(meta.valueRaw);
      }
    }
  }
  return ids;
}

function sectionBlockRange(document: GanttDocument, section: DocumentItem): Range {
  const nextSection = document.items.find((item) => {
    return item.kind === "SectionStmt" && item.range.start.offset > section.range.start.offset;
  });
  const endOffset = nextSection?.range.start.offset ?? document.source.length;
  return new RangeMapper(document.source).rangeFromOffsets(section.range.start.offset, endOffset);
}

function collectSectionExternalReferences(
  document: GanttDocument,
  taskNodeIds: string[],
  deletionRange: Range
): BlockingReference[] {
  const deletedTaskNodeIds = new Set(taskNodeIds);
  const deletedTaskIds = new Set(document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt" && deletedTaskNodeIds.has(item.nodeId))
    .flatMap((task) => task.metaItems)
    .filter((item): item is IdMetaSlice => item.kind === "IdMetaSlice")
    .map((item) => item.valueRaw)
    .filter((id) => id.length > 0));
  if (deletedTaskIds.size === 0) {
    return [];
  }

  return document.items.flatMap((item) => {
    if (item.kind === "TaskStmt") {
      return item.metaItems.flatMap((meta) => {
        if (meta.kind === "AfterMetaSlice") {
          return meta.refs
            .filter((ref) => deletedTaskIds.has(ref.raw) && !rangeContains(deletionRange, ref.range))
            .map((ref) => ({
              range: ref.range,
              raw: ref.raw,
              removePatch: createRemoveAfterRefPatch(document, item, meta.refs, ref)
            }));
        }
        if (meta.kind === "UntilMetaSlice" && deletedTaskIds.has(meta.refRaw) && !rangeContains(deletionRange, meta.range)) {
          const removePatch = createRemoveTaskMetaPatch(item, "UntilMetaSlice");
          return removePatch
            ? [{
                range: taskMetaValueRange(meta.range, meta.raw, meta.refRaw),
                raw: meta.refRaw,
                removePatch
              }]
            : [];
        }
        return [];
      });
    }
    if (item.kind === "ClickStmt") {
      return item.targetIds
        .filter((targetId) => deletedTaskIds.has(targetId.raw) && !rangeContains(deletionRange, targetId.range))
        .map((targetId) => ({
          range: targetId.range,
          raw: targetId.raw,
          removePatch: createRemoveClickTargetPatch(document, item, targetId)
        }));
    }
    return [];
  });
}

function createRemoveAfterRefPatch(
  document: GanttDocument,
  task: TaskStmt,
  refs: TextSlice[],
  target: TextSlice
): { range: Range; text: string } {
  if (refs.length <= 1) {
    return createRemoveTaskMetaPatch(task, "AfterMetaSlice") ?? { range: target.range, text: "" };
  }
  const targetIndex = refs.findIndex((ref) => ref.range.start.offset === target.range.start.offset);
  const mapper = new RangeMapper(document.source);
  if (targetIndex <= 0) {
    return {
      range: mapper.rangeFromOffsets(target.range.start.offset, refs[1]!.range.start.offset),
      text: ""
    };
  }
  return {
    range: mapper.rangeFromOffsets(refs[targetIndex - 1]!.range.end.offset, target.range.end.offset),
    text: ""
  };
}

function createRemoveClickTargetPatch(
  document: GanttDocument,
  click: Extract<DocumentItem, { kind: "ClickStmt" }>,
  target: TextSlice
): { range: Range; text: string } {
  if (click.targetIds.length <= 1) {
    return { range: click.range, text: "" };
  }
  const targetIndex = click.targetIds.findIndex((candidate) => candidate.range.start.offset === target.range.start.offset);
  const mapper = new RangeMapper(document.source);
  if (targetIndex <= 0) {
    return {
      range: mapper.rangeFromOffsets(target.range.start.offset, click.targetIds[1]!.range.start.offset),
      text: ""
    };
  }
  return {
    range: mapper.rangeFromOffsets(click.targetIds[targetIndex - 1]!.range.end.offset, target.range.end.offset),
    text: ""
  };
}

function taskClickHrefById(document: GanttDocument): Map<string, string> {
  const links = new Map<string, string>();
  for (const item of document.items) {
    if (item.kind !== "ClickStmt") {
      continue;
    }
    const href = item.clauses.find((clause): clause is Extract<DocumentItem, { kind: "ClickStmt" }>["clauses"][number] & { kind: "ClickHrefClause" } => {
      return clause.kind === "ClickHrefClause" && clause.errors.length === 0;
    });
    if (!href) {
      continue;
    }
    for (const target of item.targetIds) {
      if (!links.has(target.raw)) {
        links.set(target.raw, href.hrefRaw);
      }
    }
  }
  return links;
}

function findClickHrefForTaskId(
  document: GanttDocument,
  taskId: string
): { item: Extract<DocumentItem, { kind: "ClickStmt" }>; target: TextSlice; clause: Extract<DocumentItem, { kind: "ClickStmt" }>["clauses"][number] & { kind: "ClickHrefClause" } } | undefined {
  for (const item of document.items) {
    if (item.kind !== "ClickStmt") {
      continue;
    }
    const target = item.targetIds.find((candidate) => candidate.raw === taskId);
    if (!target) {
      continue;
    }
    const clause = item.clauses.find((candidate): candidate is Extract<DocumentItem, { kind: "ClickStmt" }>["clauses"][number] & { kind: "ClickHrefClause" } => {
      return candidate.kind === "ClickHrefClause" && candidate.errors.length === 0;
    });
    if (clause) {
      return { item, target, clause };
    }
  }
  return undefined;
}

function taskMetaValueRange(metaRange: Range, raw: string, value: string): Range {
  const start = raw.indexOf(value);
  if (start < 0) {
    return metaRange;
  }
  return {
    start: {
      offset: metaRange.start.offset + start,
      line: metaRange.start.line,
      column: metaRange.start.column + start
    },
    end: {
      offset: metaRange.start.offset + start + value.length,
      line: metaRange.start.line,
      column: metaRange.start.column + start + value.length
    }
  };
}

function collectDependencyRefPatches(
  document: GanttDocument,
  oldId: string,
  id: string
): Array<{ range: Range; text: string }> {
  return document.items
    .filter((item): item is TaskStmt => item.kind === "TaskStmt")
    .flatMap((task) => task.metaItems.flatMap((meta) => {
      if (meta.kind === "AfterMetaSlice") {
        return meta.refs
          .filter((ref) => ref.raw === oldId)
          .map((ref) => ({ range: ref.range, text: id }));
      }
      if (meta.kind === "UntilMetaSlice" && meta.refRaw === oldId) {
        const start = meta.raw.indexOf(oldId);
        if (start < 0) {
          return [];
        }
        return [{
          range: {
            start: {
              offset: meta.range.start.offset + start,
              line: meta.range.start.line,
              column: meta.range.start.column + start
            },
            end: {
              offset: meta.range.start.offset + start + oldId.length,
              line: meta.range.start.line,
              column: meta.range.start.column + start + oldId.length
            }
          },
          text: id
        }];
      }
      return [];
    }));
}

function collectClickTargetPatches(
  document: GanttDocument,
  oldId: string,
  id: string
): Array<{ range: Range; text: string }> {
  return document.items
    .filter((item): item is Extract<DocumentItem, { kind: "ClickStmt" }> => item.kind === "ClickStmt")
    .flatMap((item) => item.targetIds
      .filter((target) => target.raw === oldId)
      .map((target) => ({ range: target.range, text: id })));
}

function createAppendMetaPatch(task: TaskStmt, text: string): { range: Range; text: string } {
  const lineEnding = task.trailingTrivia.find((trivia) => trivia.kind === "line-ending");
  const insertRange = {
    start: lineEnding?.range.start ?? task.range.end,
    end: lineEnding?.range.start ?? task.range.end
  };
  const prefix = task.metaItems.length > 0 ? ", " : " ";
  return {
    range: {
      start: insertRange.start,
      end: insertRange.end
    },
    text: `${prefix}${text}`
  };
}

function canAppendNonTagTaskMeta(task: TaskStmt): boolean {
  return task.metaItems.filter((item) => item.kind !== "TagMetaSlice").length < 3;
}

function createRemoveAfterMetaPatch(task: TaskStmt): { range: Range; text: string } | undefined {
  return createRemoveTaskMetaPatch(task, "AfterMetaSlice");
}

function createRemoveTaskMetaPatch(
  task: TaskStmt,
  kind: "AfterMetaSlice" | "UntilMetaSlice"
): { range: Range; text: string } | undefined {
  const metaIndex = task.metaParts.findIndex((part) => part.kind === kind);
  if (metaIndex < 0) {
    return undefined;
  }

  const meta = task.metaParts[metaIndex]!;
  const next = task.metaParts[metaIndex + 1];
  if (next?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: meta.range.start,
        end: next.range.end
      },
      text: ""
    };
  }

  const previous = task.metaParts[metaIndex - 1];
  if (previous?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: previous.range.start,
        end: meta.range.end
      },
      text: ""
    };
  }

  return {
    range: meta.range,
    text: ""
  };
}

function createRemoveTaskMetaItemPatch(
  task: TaskStmt,
  meta: TaskMetaSlice
): { range: Range; text: string } | undefined {
  const metaIndex = task.metaParts.findIndex((part) => part.kind !== "TaskMetaSeparator" && part.nodeId === meta.nodeId);
  if (metaIndex < 0) {
    return undefined;
  }

  const current = task.metaParts[metaIndex]!;
  const next = task.metaParts[metaIndex + 1];
  if (next?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: current.range.start,
        end: next.range.end
      },
      text: ""
    };
  }

  const previous = task.metaParts[metaIndex - 1];
  if (previous?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: previous.range.start,
        end: current.range.end
      },
      text: ""
    };
  }

  return {
    range: current.range,
    text: ""
  };
}

function createRemoveStartDatePatches(task: TaskStmt, dateItems: DateMetaSlice[]): Array<{ range: Range; text: string }> {
  const start = dateItems[0];
  if (!start) {
    return [];
  }
  const end = dateItems[1];
  if (end) {
    const patch = createRemoveTaskMetaRangePatch(task, start, end);
    return patch ? [patch] : [];
  }
  const patch = createRemoveTaskMetaItemPatch(task, start);
  return patch ? [patch] : [];
}

function createRemoveTaskMetaRangePatch(
  task: TaskStmt,
  firstMeta: TaskMetaSlice,
  lastMeta: TaskMetaSlice
): { range: Range; text: string } | undefined {
  const firstIndex = task.metaParts.findIndex((part) => part.kind !== "TaskMetaSeparator" && part.nodeId === firstMeta.nodeId);
  const lastIndex = task.metaParts.findIndex((part) => part.kind !== "TaskMetaSeparator" && part.nodeId === lastMeta.nodeId);
  if (firstIndex < 0 || lastIndex < firstIndex) {
    return undefined;
  }

  const previous = task.metaParts[firstIndex - 1];
  if (previous?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: previous.range.start,
        end: task.metaParts[lastIndex]!.range.end
      },
      text: ""
    };
  }

  const next = task.metaParts[lastIndex + 1];
  if (next?.kind === "TaskMetaSeparator") {
    return {
      range: {
        start: task.metaParts[firstIndex]!.range.start,
        end: next.range.end
      },
      text: ""
    };
  }

  return {
    range: {
      start: task.metaParts[firstIndex]!.range.start,
      end: task.metaParts[lastIndex]!.range.end
    },
    text: ""
  };
}

function createUpdateTaskTagsPatch(task: TaskStmt, tags: string[]): { range: Range; text: string } | undefined {
  const leadingTagPartIndexes = collectLeadingTagPartIndexes(task);
  const text = tags.join(", ");
  if (leadingTagPartIndexes.length === 0) {
    if (tags.length === 0) {
      return undefined;
    }
    const firstMeta = task.metaItems[0];
    if (!firstMeta) {
      return createAppendMetaPatch(task, text);
    }
    return {
      range: {
        start: firstMeta.range.start,
        end: firstMeta.range.start
      },
      text: `${text}, `
    };
  }

  const firstTag = task.metaParts[leadingTagPartIndexes[0]!] as TagMetaSlice;
  const lastTagIndex = leadingTagPartIndexes[leadingTagPartIndexes.length - 1]!;
  const lastTag = task.metaParts[lastTagIndex] as TagMetaSlice;
  const next = task.metaParts[lastTagIndex + 1];
  const hasFollowingMetadata = next?.kind === "TaskMetaSeparator" && task.metaParts.slice(lastTagIndex + 2).some((part) => part.kind !== "TaskMetaSeparator");
  const end = hasFollowingMetadata ? next.range.end : lastTag.range.end;
  const replacement = hasFollowingMetadata && tags.length > 0
    ? `${text}, `
    : text;

  return {
    range: {
      start: firstTag.range.start,
      end
    },
    text: replacement
  };
}

function collectLeadingTagPartIndexes(task: TaskStmt): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < task.metaParts.length; index += 1) {
    const part = task.metaParts[index]!;
    if (part.kind === "TaskMetaSeparator") {
      continue;
    }
    if (part.kind !== "TagMetaSlice") {
      break;
    }
    indexes.push(index);
  }
  return indexes;
}

function uniqueKnownTaskTags(tags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!EDITABLE_TASK_TAGS.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function findSettingItem(document: GanttDocument, key: keyof SemanticSettings): DocumentItem | undefined {
  return findSettingItems(document, key)[0];
}

function findSettingItems(document: GanttDocument, key: keyof SemanticSettings): DocumentItem[] {
  const kindByKey: Partial<Record<keyof SemanticSettings, DocumentItem["kind"]>> = {
    title: "TitleStmt",
    dateFormat: "DateFormatStmt",
    axisFormat: "AxisFormatStmt",
    tickInterval: "TickIntervalStmt",
    includes: "IncludesStmt",
    excludes: "ExcludesStmt",
    topAxis: "TopAxisStmt",
    inclusiveEndDates: "InclusiveEndDatesStmt",
    weekday: "WeekdayStmt",
    weekend: "WeekendStmt",
    todayMarker: "TodayMarkerStmt",
    accTitle: "AccTitleStmt",
    accDescr: "AccDescrLineStmt"
  };
  const kind = kindByKey[key];
  if (!kind) {
    return [];
  }
  return document.items.filter((item) => item.kind === kind);
}

function formatSettingStatement(key: keyof SemanticSettings, value: string | boolean): string | undefined {
  switch (key) {
    case "title":
      return `title ${value}`;
    case "dateFormat":
      return `dateFormat ${value}`;
    case "axisFormat":
      return `axisFormat ${value}`;
    case "tickInterval":
      return `tickInterval ${value}`;
    case "includes":
      return `includes ${value}`;
    case "excludes":
      return `excludes ${value}`;
    case "topAxis":
      return value === true ? "topAxis" : undefined;
    case "inclusiveEndDates":
      return value === true ? "inclusiveEndDates" : undefined;
    case "weekday":
      return `weekday ${value}`;
    case "weekend":
      return `weekend ${value}`;
    case "todayMarker":
      return `todayMarker ${value}`;
    case "accTitle":
      return `accTitle: ${value}`;
    case "accDescr":
      return `accDescr: ${value}`;
    default:
      return undefined;
  }
}

function insertionOffsetAfterDiagramKeyword(document: GanttDocument): number {
  const diagram = document.items.find((item) => item.kind === "DiagramKeyword");
  return diagram?.range.end.offset ?? 0;
}

function valueRangeWithinItem(item: DocumentItem, value: string): Range {
  const index = item.raw.indexOf(value);
  if (index < 0) {
    return item.range;
  }
  return {
    start: {
      offset: item.range.start.offset + index,
      line: item.range.start.line,
      column: item.range.start.column + index
    },
    end: {
      offset: item.range.start.offset + index + value.length,
      line: item.range.start.line,
      column: item.range.start.column + index + value.length
    }
  };
}

function validatePatchRanges(document: GanttDocument, ranges: Range[]): ConversionDiagnostic | undefined {
  const mapper = new RangeMapper(document.source);
  for (const range of ranges) {
    if (
      range.start.offset < 0 ||
      range.end.offset < range.start.offset ||
      range.end.offset > document.source.length ||
      !positionsEqual(range.start, mapper.positionAtOffset(range.start.offset)) ||
      !positionsEqual(range.end, mapper.positionAtOffset(range.end.offset))
    ) {
      return createEditorDiagnostic(
        "EDITOR_INVALID_PATCH_RANGE",
        "Editor action produced an invalid source patch range.",
        mapper.rangeFromOffsets(0, 0)
      );
    }
  }
  return undefined;
}

function applyDescendingPatches(source: string, patches: Array<{ range: Range; text: string }>): string {
  return [...patches]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce((nextSource, patch) => {
      return `${nextSource.slice(0, patch.range.start.offset)}${patch.text}${nextSource.slice(patch.range.end.offset)}`;
    }, source);
}

function coalesceSameInsertionPatches(patches: Array<{ range: Range; text: string }>): Array<{ range: Range; text: string }> {
  const coalesced: Array<{ range: Range; text: string }> = [];
  for (const patch of patches) {
    const previous = coalesced[coalesced.length - 1];
    if (
      previous &&
      previous.range.start.offset === patch.range.start.offset &&
      previous.range.end.offset === patch.range.end.offset &&
      previous.range.start.offset === previous.range.end.offset
    ) {
      const separator = previous.text.trimEnd().endsWith(",") ? " " : ", ";
      const nextText = patch.text.trimStart().replace(/^,\s*/, "");
      previous.text = `${previous.text}${separator}${nextText}`;
      continue;
    }
    coalesced.push({ ...patch });
  }
  return coalesced;
}

function computeTaskGridViewOrder(
  rows: TaskGridRow[],
  sort?: TaskGridSort,
  filter?: TaskGridFilter
): string[] {
  const filteredRows = rows.filter((row) => matchesFilter(row, filter));
  const orderedRows = sort
    ? [...filteredRows].sort((left, right) => compareRows(left, right, sort))
    : filteredRows;
  return orderedRows.map((row) => row.nodeId);
}

function matchesFilter(row: TaskGridRow, filter?: TaskGridFilter): boolean {
  if (!filter) {
    return true;
  }
  if (filter.sectionId && row.sectionId !== filter.sectionId) {
    return false;
  }
  if (filter.severity && !row.diagnostics.some((diagnostic) => diagnostic.severity === filter.severity)) {
    return false;
  }
  if (filter.text) {
    const text = filter.text.toLowerCase();
    return [
      row.sectionLabel,
      row.label,
      row.id,
      row.start,
      row.end,
      row.duration,
      row.until,
      ...row.dependencies,
      ...row.tags
    ].some((value) => value?.toLowerCase().includes(text));
  }
  return true;
}

function compareRows(left: TaskGridRow, right: TaskGridRow, sort: TaskGridSort): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  const leftValue = comparableValue(left, sort.field);
  const rightValue = comparableValue(right, sort.field);
  if (leftValue < rightValue) {
    return -1 * direction;
  }
  if (leftValue > rightValue) {
    return 1 * direction;
  }
  return left.sourceOrder - right.sourceOrder;
}

function comparableValue(row: TaskGridRow, field: TaskGridSort["field"]): string | number {
  if (field === "sourceOrder") {
    return row.sourceOrder;
  }
  if (field === "section") {
    return row.sectionLabel;
  }
  return row[field] ?? "";
}

function createAdvancedSourceItems(
  document: GanttDocument,
  projectionIssues: ProjectionIssue[]
): AdvancedSourceItem[] {
  return document.items
    .filter(isAdvancedSourceItem)
    .map((item) => {
      const reasonCodes = projectionIssues
        .filter((issue) => issue.nodeId === item.nodeId)
        .map((issue) => issue.reasonCode);
      return {
        nodeId: item.nodeId,
        kind: item.kind,
        raw: item.raw,
        range: item.range,
        displayName: displayNameForAdvancedItem(item),
        reasonCodes
      };
    });
}

function isAdvancedSourceItem(item: DocumentItem): boolean {
  return ![
    "DiagramKeyword",
    "TitleStmt",
    "DateFormatStmt",
    "AxisFormatStmt",
    "TickIntervalStmt",
    "TopAxisStmt",
    "InclusiveEndDatesStmt",
    "IncludesStmt",
    "ExcludesStmt",
    "WeekdayStmt",
    "WeekendStmt",
    "TodayMarkerStmt",
    "AccTitleStmt",
    "AccDescrLineStmt",
    "SectionStmt",
    "TaskStmt"
  ].includes(item.kind);
}

function displayNameForAdvancedItem(item: DocumentItem): string {
  switch (item.kind) {
    case "CommentLine":
      return "Comment";
    case "BlankLine":
      return "Blank line";
    case "FrontmatterBlock":
      return "Frontmatter";
    case "DirectiveBlock":
      return "Directive";
    default:
      return item.kind;
  }
}

function findTask(document: GanttDocument, nodeId: string): TaskStmt | undefined {
  return document.items.find((item): item is TaskStmt => item.kind === "TaskStmt" && item.nodeId === nodeId);
}

function rangeContains(outer: Range, inner: Range): boolean {
  return outer.start.offset <= inner.start.offset && inner.end.offset <= outer.end.offset;
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

function deleteBlockedWithRepairDiagnostics(
  state: EditorState,
  document: GanttDocument,
  code: string,
  message: string,
  references: BlockingReference[],
  deletedTaskIds: string[]
): EditorActionResult {
  const replacementCandidates = existingTaskIdsExcluding(document, new Set(deletedTaskIds)).slice(0, 6);
  const diagnostics = references.map((reference): DiagnosticSummaryItem => ({
    code,
    stage: "lossless-write-back",
    severity: "error",
    messageKey: `diagnostics.${toCamelCase(code)}`,
    summary: message,
    primaryRange: reference.range,
    primaryRaw: document.source.slice(reference.range.start.offset, reference.range.end.offset),
    suggestedActions: [
      {
        kind: "quick-fix",
        labelKey: "diagnostics.action.removeBlockingReference",
        labelText: `Remove reference ${reference.raw}`,
        replacement: reference.removePatch
      },
      ...replacementCandidates
        .filter((id) => id !== reference.raw)
        .map((id) => ({
          kind: "quick-fix" as const,
          labelKey: "diagnostics.action.replaceBlockingReference",
          labelText: `Replace reference with ${id}`,
          replacement: {
            range: reference.range,
            text: id
          }
        }))
    ]
  }));
  const firstDiagnostic = diagnostics[0];
  return {
    state: {
      ...state,
      diagnostics: [...diagnostics, ...state.diagnostics],
      ...(firstDiagnostic
        ? { selected: { kind: "diagnostic", code: firstDiagnostic.code, primaryRange: firstDiagnostic.primaryRange } }
        : {})
    },
    sourceChanged: false,
    diagnostics: []
  };
}

function actionBlocked(state: EditorState, code: string, message: string, range = zeroRange()): EditorActionResult {
  return {
    state,
    sourceChanged: false,
    diagnostics: [
      createEditorDiagnostic(code, message, range)
    ]
  };
}

function createEditorDiagnostic(
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
      suggestedActions: [{
        kind: "manual-edit",
        label: "Review the current editor state and retry the action."
      }]
    }
  };
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

function toCamelCase(value: string): string {
  return value.toLowerCase().replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}
