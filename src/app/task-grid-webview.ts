import {
  createPreviewScheduleEditModel,
  type EditorState,
  type PreviewScheduleEditModel,
  type TaskGridField,
  type TaskGridRow
} from "../core";
import { renderEditingMessageHandlers } from "./task-grid-webview-message-handlers";
import { renderPreviewScheduleOverlay } from "./task-grid-webview-preview-edit";
import { renderTestWebviewOperationBlock } from "./task-grid-webview-test-operations";
import { escapeHtml, jsonForScript } from "./task-grid-webview-utils";
import { renderHostBridgeScript } from "./host-adapter";

interface DependencyOption {
  id: string;
  label: string;
  sectionLabel: string;
}

interface SectionOption {
  id: string;
  label: string;
}

const TASK_TAG_OPTIONS = ["active", "done", "crit", "milestone", "vert"];
const DEFAULT_BUNDLED_MERMAID_VERSION = "11.14.0";

type HostCompatibilityProfileId = "mermaid-latest" | "github" | "gitlab" | "obsidian";

interface HostCompatibilityProfileSummary {
  id: HostCompatibilityProfileId;
  label: string;
  runtimeLabel: string;
  status: "ok" | "warning";
  warnings: string[];
}

export interface TaskGridWebviewLabels {
  title: string;
  mode: string;
  taskGrid: string;
  search: string;
  sort: string;
  severity: string;
  allSeverities: string;
  noSort: string;
  details: string;
  layout: string;
  horizontal: string;
  vertical: string;
  previewControls: string;
  previewFit: string;
  previewFill: string;
  previewFitTooltip: string;
  previewFillTooltip: string;
  previewPanTooltip: string;
  previewZoomOut: string;
  previewResetZoom: string;
  previewZoomIn: string;
  previewEdit: string;
  previewEditDone: string;
  previewEditGuidance: string;
  previewEditUnsupported: string;
  previewTimelinePrevious: string;
  previewTimelineNext: string;
  previewTimelineToday: string;
  previewTimelineSelected: string;
  previewTimelineFit: string;
  previewMiniEditor: string;
  previewMiniEditorApply: string;
  previewMiniEditorNoTask: string;
  previewCollapse: string;
  previewExpand: string;
  previewFocus: string;
  previewExitFocus: string;
  diagnostics: string;
  inspector: string;
  documentSettings: string;
  selectedTask: string;
  emptySection: string;
  ganttTitle: string;
  accTitle: string;
  accDescr: string;
  dateFormat: string;
  axisFormat: string;
  tickInterval: string;
  weekday: string;
  weekend: string;
  includes: string;
  includesPlaceholder: string;
  excludes: string;
  excludesPlaceholder: string;
  dateInputHelp: string;
  datePicker: string;
  durationInputHelp: string;
  endReplacesDurationHelp: string;
  durationReplacesEndHelp: string;
  dateInputWarning: string;
  dateRangeWarning: string;
  todayMarker: string;
  topAxis: string;
  inclusiveEndDates: string;
  previewSource: string;
  previewDiagram: string;
  advancedSourceItems: string;
  section: string;
  task: string;
  id: string;
  start: string;
  end: string;
  duration: string;
  dependencies: string;
  until: string;
  dependencySearchPlaceholder: string;
  dependencyNoMatches: string;
  tags: string;
  tagToggle: string;
  actions: string;
  undo: string;
  redo: string;
  addSection: string;
  addSectionBelow: string;
  addTask: string;
  addTaskAbove: string;
  addTaskBelow: string;
  addTaskAtSectionTop: string;
  duplicateTask: string;
  moveTaskUp: string;
  moveTaskDown: string;
  moveTaskToSection: string;
  moveSectionUp: string;
  moveSectionDown: string;
  deleteTask: string;
  deleteTaskConfirm: string;
  deleteSection: string;
  deleteSectionConfirm: string;
  rawSourceEditor: string;
  sourceOrder: string;
  noTaskSelected: string;
  noDiagnostics: string;
  noAdvancedSourceItems: string;
  limitedEditing: string;
  fallbackEditing: string;
  previewBlocked: string;
  previewRenderFailed: string;
  previewBlockedTitle: string;
  previewRenderFailedTitle: string;
  previewOpenDiagnostics: string;
  previewOpenAdvanced: string;
  previewOpenSource: string;
  webviewErrorTitle: string;
  webviewErrorMessage: string;
  webviewErrorOpenDiagnostics: string;
  webviewErrorOpenSource: string;
  webviewErrorDismiss: string;
  taskLabelEditor: string;
  taskLabelEditorHelp: string;
  mermaidRuntime: string;
  mermaidRuntimeBundledVersion: string;
  mermaidRuntimeSecurityLevel: string;
  mermaidRuntimeDeterministic: string;
  hostCompatibility: string;
  hostCompatibilityGuidance: string;
  hostCompatibilityProfileMermaidLatest: string;
  hostCompatibilityProfileGitHub: string;
  hostCompatibilityProfileGitLab: string;
  hostCompatibilityProfileObsidian: string;
  hostCompatibilityWarningCount: string;
  hostCompatibilityRetainedCount: string;
  hostCompatibilityProfileWarnings: string;
  hostCompatibilityNoWarnings: string;
  hostCompatibilityRiskySyntax: string;
  hostCompatibilitySelectedProfile: string;
  hostCompatibilityRuntimeGitHub: string;
  hostCompatibilityRuntimeGitLab: string;
  hostCompatibilityRuntimeObsidian: string;
  hostCompatibilityWarningClickCall: string;
  hostCompatibilityWarningConfig: string;
  hostCompatibilityWarningGitHub: string;
  hostCompatibilityWarningGitLab: string;
  hostCompatibilityWarningObsidian: string;
  diagnosticsStage: string;
  diagnosticsLocation: string;
  diagnosticsReason: string;
  diagnosticsImpact: string;
  diagnosticsAction: string;
  removeBlockingReference: string;
  replaceBlockingReference: string;
  useExistingTaskId: string;
  fallbackImpact: string;
  limitedEditingImpact: string;
  diagnosticImpact: string;
  advancedSourceGuidance: string;
  advancedSourceType: string;
  advancedSourceRange: string;
  advancedSourceEditability: string;
  advancedSourceRawOnly: string;
  advancedSourceReason: string;
  advancedSourceOpenSource: string;
  advancedSourceOpenDiagnostics: string;
  diagnosticMessages?: Record<string, string>;
  diagnosticActionLabels?: Record<string, string>;
}

export interface TaskGridWebviewOptions {
  nonce?: string;
  allowEditing?: boolean;
  mermaidModuleUri?: string;
  mermaidRuntimeVersion?: string;
  hostBridgeScript?: string;
  initialLayout?: "horizontal" | "vertical";
  initialPreviewZoom?: "fit" | "fill" | "0.75" | "1" | "1.25" | "1.5" | "2";
  initialPreviewCollapsed?: boolean;
  initialPreviewFocused?: boolean;
  initialPreviewEditMode?: boolean;
  initialPreviewEditSelectedNodeId?: string;
  initialPreviewEditViewportStartIso?: string;
  initialPreviewEditViewportEndIso?: string;
  initialDetailsOpen?: boolean;
  initialDetailTab?: "settings" | "inspector" | "diagnostics" | "advanced" | "source";
  initialOpenRowActionMenu?: boolean;
  initialOpenDetailsWithRowActionMenu?: boolean;
  initialResponsiveMode?: "narrow";
  enableUiReviewSnapshot?: boolean;
  enableTestWebviewOperations?: boolean;
  testWebviewGeneration?: number;
}

export function renderTaskGridHtml(
  state: EditorState,
  labels: TaskGridWebviewLabels,
  options: TaskGridWebviewOptions = {}
): string {
  const rows = state.grid.viewOrder
    .map((nodeId) => state.grid.rows.find((row) => row.nodeId === nodeId))
    .filter((row): row is TaskGridRow => row !== undefined);
  const taskRows = rows.filter((row) => row.kind === "task");
  const selectedTaskNodeId = state.selected.kind === "task" ? state.selected.nodeId : undefined;
  const selectedRow = selectedTaskNodeId
    ? taskRows.find((row) => row.nodeId === selectedTaskNodeId)
    : taskRows[0];
  const addTaskSectionId = state.selected.kind === "task"
    ? selectedRow?.sectionId
    : state.selected.kind === "section"
      ? state.selected.sectionId
      : undefined;
  const initialOpenRowActionMenuNodeId = options.initialOpenRowActionMenu === true
    ? taskRows.find((row) => row.editableFields.length > 0)?.nodeId ?? rows[0]?.nodeId
    : undefined;
  const dependencyOptions = uniqueDependencyOptions(state.grid.rows);
  const sectionOptions = uniqueSectionOptions(state);
  const mermaidRuntimeVersion = options.mermaidRuntimeVersion ?? DEFAULT_BUNDLED_MERMAID_VERSION;
  const hostCompatibility = summarizeHostCompatibility(state, labels, mermaidRuntimeVersion);
  const previewScheduleEditModel = createPreviewScheduleEditModel(rows, state.semantic?.settings.dateFormat, {
    domainStartIso: options.initialPreviewEditViewportStartIso,
    domainEndIso: options.initialPreviewEditViewportEndIso
  });
  const tickIntervalOptions = ["1day", "1week", "1month"];
  const weekdayOptions = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const weekendOptions = ["friday", "saturday"];

  const nonce = options.nonce ?? "";
  const allowEditing = options.allowEditing === true;
  const enableTestWebviewOperations = allowEditing && options.enableTestWebviewOperations === true;
  const mermaidModuleUri = options.mermaidModuleUri;
  const initialLayout = options.initialLayout === "vertical" ? "vertical" : "horizontal";
  const initialPreviewZoom = normalizeInitialPreviewZoom(options.initialPreviewZoom);
  const initialPreviewCollapsed = options.initialPreviewCollapsed === true;
  const initialPreviewFocused = options.initialPreviewFocused === true && !initialPreviewCollapsed;
  const initialPreviewEditMode = options.initialPreviewEditMode === true;
  const initialPreviewEditSelectedTask = initialPreviewEditMode && options.initialPreviewEditSelectedNodeId
    ? previewScheduleEditModel.tasks.find((task) => task.nodeId === options.initialPreviewEditSelectedNodeId && task.editable)
    : undefined;
  const initialPreviewEditSelectedNodeId = initialPreviewEditSelectedTask?.nodeId;
  const hasActionableDiagnostics = state.diagnostics.some((diagnostic) => diagnostic.severity !== "info");
  const defaultOpenDetails = state.mode === "fallback" || !state.previewSource || hasActionableDiagnostics;
  const shouldOpenDetails = initialOpenRowActionMenuNodeId && options.initialOpenDetailsWithRowActionMenu !== true
    ? false
    : options.initialDetailsOpen ?? defaultOpenDetails;
  const responsiveMode = options.initialResponsiveMode === "narrow" ? "narrow" : "default";
  const localeStress = rows.some((row) => hasNonAsciiText(row.label) || hasNonAsciiText(row.sectionLabel));
  const horizontalOverflowRisk = responsiveMode === "narrow" ||
    rows.some((row) => row.label.length > 28 || row.sectionLabel.length > 24 || row.dependencies.join(" ").length > 24);
  const defaultDetailTab = state.mode === "fallback"
    ? "source"
    : hasActionableDiagnostics
      ? "diagnostics"
      : !state.previewSource
        ? "advanced"
        : "settings";
  const initialDetailTab = options.initialDetailTab ?? defaultDetailTab;
  const rowCount = rows.length;
  const visibleRowCount = rows.length;
  const editableFieldCount = rows.reduce((count, row) => count + (row.editableFields?.length ?? 0), 0);
  const showTagsColumn = taskRows.some((row) => row.tags.length > 0);
  const gridContentColumnSpan = showTagsColumn ? 7 : 6;
  const selfReview = {
    component: "task-grid-webview",
    mode: state.mode,
    layoutDefault: "horizontal",
    layout: initialLayout,
    rowCount,
    visibleRowCount,
    taskRowCount: taskRows.length,
    diagnosticsCount: state.diagnostics.length,
    selectedRow: selectedRow ? {
      kind: selectedRow.kind,
      label: selectedRow.label,
      sectionLabel: selectedRow.sectionLabel
    } : undefined,
    previewAvailable: Boolean(state.previewSource),
    previewBlocked: !state.previewSource,
    previewTheme: "light-canvas",
    mermaidRuntime: {
      type: "bundled",
      version: mermaidRuntimeVersion,
      securityLevel: "strict",
      deterministic: true
    },
    previewPanEnabled: true,
    previewPanGesture: "Space+drag or middle-button drag",
    previewScrollRestored: false,
    previewErrorCard: state.previewSource ? "none" : "blocked",
    webviewErrorBoundary: true,
    webviewErrorVisible: false,
    previewEditMode: initialPreviewEditMode,
    previewEditOverlayAriaHidden: !initialPreviewEditMode,
    previewMiniEditor: true,
    previewMiniEditorOpen: Boolean(initialPreviewEditSelectedNodeId),
    previewTimelineStart: previewScheduleEditModel.domainStartIso,
    previewTimelineEnd: previewScheduleEditModel.domainEndIso,
    previewTimelineDays: previewScheduleEditModel.totalDays,
    previewDateAxis: true,
    previewDragGuide: true,
    previewKeyboardNudge: true,
    previewKeyboardResize: true,
    previewSelectedTaskVisible: false,
    previewViewportAction: "initial",
    previewTimelineSticky: initialPreviewFocused,
    draggableTaskCount: previewScheduleEditModel.draggableTaskCount,
    unsupportedTaskCount: previewScheduleEditModel.unsupportedTaskCount,
    previewInitialCollapsed: initialPreviewCollapsed,
    previewCollapsed: initialPreviewCollapsed,
    previewInitialFocused: initialPreviewFocused,
    previewFocused: initialPreviewFocused,
    responsiveMode,
    localeStress,
    horizontalOverflowRisk,
    detailsInitialTab: initialDetailTab,
    detailsTab: initialDetailTab,
    detailsInitialOpen: shouldOpenDetails,
    detailsOpen: shouldOpenDetails,
    keyboardReview: true,
    detailsFocusManaged: true,
    activeMenuKeyboardNavigable: true,
    pickerKeyboardNavigable: true,
    escapePriority: [
      "preview-drag",
      "preview-mini-editor",
      "row-action-menu",
      "details-drawer"
    ],
    isViewOnlyOrdering: state.grid.isViewOnlyOrdering,
    activeMenu: initialOpenRowActionMenuNodeId ? "row-action-menu" : "none",
    dependencyPickerCount: dependencyOptions.length,
    hostCompatibility: {
      selectedProfile: "mermaid-latest",
      warningCount: hostCompatibility.warningCount,
      retainedSourceItemCount: hostCompatibility.retainedSourceItemCount,
      profiles: hostCompatibility.profiles.map((profile) => ({
        id: profile.id,
        status: profile.status,
        warningCount: profile.warnings.length
      }))
    },
    editableControls: {
      editableFieldCount,
      richLabelEditor: allowStructuredEditing() && selectedRow?.kind === "task",
      structuredEditing: allowStructuredEditing()
    },
    disabledControls: {
      fallback: state.mode === "fallback",
      previewBlocked: !state.previewSource,
      viewOnlyOrdering: state.grid.isViewOnlyOrdering
    },
    fallbackReason: state.mode === "fallback" ? "projection-failure" : undefined,
    limitedEditingReason: state.mode !== "fallback" && !state.previewSource ? "preview-source-blocked" : undefined,
    reviewFocus: [
      "grid-preview-balance",
      "preview-focus-toggle",
      "preview-axis-density",
      "details-drawer-placement",
      "task-grid-column-overflow",
      "responsive-japanese-layout",
      "popup-viewport-clamp",
      "keyboard-accessibility",
      "focus-restore",
      "menu-keyboard-navigation",
      "structured-action-visibility",
      "popup-anchor-distance"
    ]
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(labels.title)}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #101820);
      --panel: var(--vscode-sideBar-background, #16232d);
      --panel-2: var(--vscode-editorWidget-background, #1d2d38);
      --text: var(--vscode-foreground, #e8f1f5);
      --muted: var(--vscode-descriptionForeground, #95aab5);
      --accent: var(--vscode-focusBorder, #42c6b5);
      --border: var(--vscode-panel-border, #29414d);
      --error: var(--vscode-errorForeground, #ff7b72);
      --warn: var(--vscode-editorWarning-foreground, #f2cc60);
      --info: var(--vscode-editorInfo-foreground, #79c0ff);
      --input-bg: var(--vscode-input-background, #0d151b);
      --input-fg: var(--vscode-input-foreground, var(--text));
      --button-bg: var(--vscode-button-background, var(--accent));
      --button-fg: var(--vscode-button-foreground, #101820);
      --button-secondary-bg: var(--vscode-button-secondaryBackground, var(--panel-2));
      --button-secondary-fg: var(--vscode-button-secondaryForeground, var(--text));
      --list-hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
      --table-header-bg: var(--vscode-editorGroupHeader-tabsBackground, var(--panel-2));
      --preview-canvas-bg: #ffffff;
      --preview-canvas-fg: #1b2b34;
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
    }
    body {
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    .shell {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100vh;
      padding: 14px;
      overflow: hidden;
    }
    header, section, aside {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
    }
    header h1 {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }
    .layout-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      flex-wrap: wrap;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel-2);
    }
    .layout-toggle-label {
      padding: 0 5px;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h1, h2 {
      margin: 0;
      font-size: 14px;
      letter-spacing: 0.02em;
    }
    h2 {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.025);
    }
    .badge {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      background: var(--panel-2);
    }
    .workspace {
      min-height: 0;
      flex: 1 1 0;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows:
        minmax(16rem, min(52vh, calc(14rem + var(--task-grid-row-count, 3) * 4.25rem)))
        minmax(24rem, 1fr);
      gap: 12px;
      align-items: stretch;
      overflow: hidden;
    }
    .shell.layout-vertical .workspace {
      grid-template-columns: minmax(36rem, 1fr) minmax(32rem, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .shell.preview-collapsed .workspace {
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .shell.layout-vertical.preview-collapsed .workspace {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: minmax(0, 1fr);
    }
    .shell.preview-focused .workspace,
    .shell.layout-vertical.preview-focused .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }
    .shell.preview-focused .main {
      display: none;
    }
    .shell.layout-vertical .grid.grid-has-tags .col-section { width: 6%; }
    .shell.layout-vertical .grid.grid-has-tags .col-task { width: 11%; }
    .shell.layout-vertical .grid.grid-has-tags .col-id { width: 6%; }
    .shell.layout-vertical .grid.grid-has-tags .col-start,
    .shell.layout-vertical .grid.grid-has-tags .col-end { width: 24%; }
    .shell.layout-vertical .grid.grid-has-tags .col-duration { width: 6%; }
    .shell.layout-vertical .grid.grid-has-tags .col-dependencies { width: 6%; }
    .shell.layout-vertical .grid.grid-has-tags .col-tags { width: 5%; }
    .shell.layout-vertical .grid.grid-has-tags .col-actions { width: 12%; }
    .shell.layout-vertical .grid.grid-no-tags .col-section { width: 10%; }
    .shell.layout-vertical .grid.grid-no-tags .col-task { width: 16%; }
    .shell.layout-vertical .grid.grid-no-tags .col-id { width: 8%; }
    .shell.layout-vertical .grid.grid-no-tags .col-start,
    .shell.layout-vertical .grid.grid-no-tags .col-end { width: 23%; }
    .shell.layout-vertical .grid.grid-no-tags .col-duration { width: 7%; }
    .shell.layout-vertical .grid.grid-no-tags .col-dependencies { width: 6%; }
    .shell.layout-vertical .grid.grid-no-tags .col-actions { width: 7%; }
    .shell.layout-vertical .row-actions {
      padding-inline: 4px 10px;
    }
    .main, .preview-pane, .details-drawer {
      min-height: 0;
      overflow: hidden;
    }
    .main, .preview-pane {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .preview-pane {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.025);
    }
    .section-header h2 {
      min-width: 0;
      padding: 0;
      border-bottom: 0;
      background: transparent;
    }
    .task-grid-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .history-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
    }
    .icon-button {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      background: var(--panel-2);
      cursor: pointer;
    }
    .icon-button:focus {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }
    .icon-button svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
    }
    .primary-button {
      flex: 0 0 auto;
      min-width: 0;
      border: 1px solid var(--button-bg);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--button-fg);
      background: var(--button-bg);
      font: inherit;
      line-height: 1.2;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .secondary-button {
      flex: 0 0 auto;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--button-secondary-fg);
      background: var(--button-secondary-bg);
      font: inherit;
      line-height: 1.2;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .secondary-button:focus {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }
    .primary-button:focus {
      outline: 1px solid var(--text);
      outline-offset: 1px;
    }
    .compact-search {
      width: min(18rem, 42vw);
      min-width: 10rem;
      display: flex;
      align-items: center;
      grid-template-columns: none;
      gap: 8px;
    }
    .compact-search input {
      min-width: 0;
    }
    .section-row td {
      background: rgba(255, 255, 255, 0.018);
    }
    .section-row .empty-section {
      color: var(--muted);
    }
    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.025);
    }
    .preview-header h2 {
      padding: 0;
      border-bottom: 0;
      background: transparent;
    }
    .preview-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }
    .preview-controls {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      flex-wrap: wrap;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel-2);
    }
    .preview-zoom-button {
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 4px 8px;
      color: var(--text);
      background: transparent;
      font: inherit;
      line-height: 1.2;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .preview-zoom-button[aria-pressed="true"] {
      border-color: var(--button-bg);
      color: var(--button-fg);
      background: var(--button-bg);
    }
    .preview-edit-toggle[aria-pressed="true"] {
      border-color: var(--button-bg);
      color: var(--button-fg);
      background: var(--button-bg);
    }
    .preview-focus-toggle[aria-pressed="true"] {
      border-color: var(--button-bg);
      color: var(--button-fg);
      background: var(--button-bg);
    }
    .preview-collapse-toggle svg {
      transition: transform 120ms ease;
    }
    .preview-focus-toggle svg {
      width: 18px;
      height: 18px;
    }
    .shell.preview-collapsed .preview-pane {
      grid-template-rows: auto;
    }
    .shell.preview-collapsed .preview-box,
    .shell.preview-collapsed .preview-controls {
      display: none;
    }
    .shell.preview-collapsed .preview-collapse-toggle svg {
      transform: rotate(180deg);
    }
    .details-drawer {
      position: absolute;
      top: 86px;
      right: 14px;
      bottom: 14px;
      z-index: 20;
      display: none;
      width: clamp(24rem, 34vw, 31rem);
      max-width: calc(100vw - 28px);
      min-width: 0;
      overflow: hidden;
    }
    .shell.details-open .details-drawer {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .details-toggle, .details-close, .detail-tab, .layout-option {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--text);
      background: var(--panel-2);
      font: inherit;
      line-height: 1.2;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .details-toggle[aria-expanded="true"],
    .layout-option[aria-pressed="true"],
    .detail-tab.active {
      border-color: var(--button-bg);
      color: var(--button-fg);
      background: var(--button-bg);
    }
    .layout-option[aria-pressed="false"] {
      border-color: transparent;
    }
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.025);
    }
    .drawer-header h2 {
      padding: 0;
      border-bottom: 0;
      background: transparent;
    }
    .details-close {
      padding: 3px 8px;
    }
    .danger-button {
      justify-self: start;
      display: inline-grid;
      place-items: center;
      width: 1.9rem;
      height: 1.9rem;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0;
      color: var(--muted);
      background: transparent;
      font: inherit;
      cursor: pointer;
    }
    .danger-button:hover,
    .danger-button:focus {
      border-color: color-mix(in srgb, var(--error) 58%, var(--border));
      color: var(--error);
      background: rgba(255, 123, 114, 0.08);
    }
    .danger-button svg {
      width: 1rem;
      height: 1rem;
      stroke: currentColor;
    }
    .row-actions {
      position: sticky;
      right: 0;
      z-index: 2;
      background: color-mix(in srgb, var(--panel) 96%, transparent);
      width: 1%;
      padding-inline: 6px 8px;
      text-align: center;
    }
    .row-actions .row-action-menu-wrap {
      margin-inline: auto;
    }
    .row-action-menu-wrap {
      position: relative;
      display: inline-grid;
      place-items: center;
    }
    .menu-button {
      display: inline-grid;
      place-items: center;
      width: 1.9rem;
      height: 1.9rem;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 0;
      color: var(--muted);
      background: transparent;
      font: inherit;
      cursor: pointer;
    }
    .menu-button:hover,
    .menu-button:focus,
    .row-action-menu-wrap.open .menu-button {
      border-color: var(--border);
      color: var(--text);
      background: var(--list-hover-bg);
    }
    .menu-button svg {
      width: 1rem;
      height: 1rem;
      stroke: currentColor;
    }
    .row-action-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      z-index: 12;
      display: none;
      min-width: 9.5rem;
      max-width: min(18rem, calc(100vw - 24px));
      max-height: min(26rem, calc(100vh - 24px));
      overflow: auto;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
    }
    .row-action-menu-wrap.open .row-action-menu,
    .row-action-menu-wrap:focus-within .row-action-menu {
      display: grid;
      gap: 2px;
    }
    .menu-item {
      width: 100%;
      min-width: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 3px 7px;
      color: var(--text);
      background: transparent;
      font: 11px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      white-space: normal;
      overflow-wrap: anywhere;
      cursor: pointer;
    }
    .menu-item:hover,
    .menu-item:focus {
      border-color: var(--border);
      background: var(--list-hover-bg);
    }
    .menu-item.danger {
      color: var(--error);
    }
    .menu-item.danger:hover,
    .menu-item.danger:focus {
      border-color: color-mix(in srgb, var(--error) 58%, var(--border));
      background: rgba(255, 123, 114, 0.08);
    }
    .detail-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr));
      gap: 6px;
      overflow: visible;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.015);
    }
    .detail-tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.25rem;
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.2;
      text-align: center;
    }
    .detail-panels {
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .detail-panel {
      display: none;
    }
    .detail-panel.active {
      display: block;
    }
    .grid {
      width: 94rem;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .grid.grid-has-tags,
    .grid.grid-no-tags {
      width: 100%;
    }
    .grid .col-section { width: 15rem; }
    .grid .col-task { width: 23rem; }
    .grid .col-id { width: 7rem; }
    .grid .col-start,
    .grid .col-end { width: 10rem; }
    .grid .col-duration,
    .grid .col-tags { width: 8rem; }
    .grid .col-dependencies { width: 10rem; }
    .grid .col-actions { width: 3rem; }
    .grid.grid-has-tags .col-section { width: 12%; }
    .grid.grid-has-tags .col-task { width: 22%; }
    .grid.grid-has-tags .col-id { width: 8%; }
    .grid.grid-has-tags .col-start,
    .grid.grid-has-tags .col-end { width: 14%; }
    .grid.grid-has-tags .col-duration { width: 8%; }
    .grid.grid-has-tags .col-dependencies { width: 9%; }
    .grid.grid-has-tags .col-tags { width: 8%; }
    .grid.grid-has-tags .col-actions { width: 5%; }
    .grid.grid-no-tags .col-section { width: 18%; }
    .grid.grid-no-tags .col-task { width: 19%; }
    .grid.grid-no-tags .col-id { width: 8%; }
    .grid.grid-no-tags .col-start,
    .grid.grid-no-tags .col-end { width: 16%; }
    .grid.grid-no-tags .col-duration { width: 8%; }
    .grid.grid-no-tags .col-dependencies { width: 10%; }
    .grid.grid-no-tags .col-actions { width: 5%; }
    .grid input {
      min-width: 0;
    }
    th, td {
      padding: 5px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      color: var(--muted);
      background: var(--table-header-bg);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    td.section-label,
    td.label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .table-wrap {
      min-width: 0;
      overflow: auto;
      height: 100%;
      overscroll-behavior: contain;
    }
    .diagnostic {
      margin: 10px 12px;
      padding: 10px;
      border: 1px solid var(--border);
      border-left-width: 4px;
      border-radius: 10px;
      background: var(--panel-2);
    }
    .diagnostic.error { border-left-color: var(--error); }
    .diagnostic.warning { border-left-color: var(--warn); }
    .diagnostic.info { border-left-color: var(--info); }
    .diagnostic-facts {
      display: grid;
      gap: 5px;
      margin: 8px 0;
    }
    .diagnostic-facts div {
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr);
      gap: 8px;
    }
    .diagnostic-facts dt {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    .diagnostic-facts dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .action-label {
      margin-top: 8px;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
    }
    .muted { color: var(--muted); }
    code, pre {
      font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    }
    pre {
      margin: 0;
      padding: 12px;
      max-height: 18rem;
      overflow: auto;
      color: var(--input-fg);
      background: var(--input-bg);
    }
    .preview-box {
      position: relative;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
    }
    .mermaid-preview {
      min-height: 100%;
      height: 100%;
      overflow: auto;
      padding: 12px;
      background: var(--preview-canvas-bg);
      color: var(--preview-canvas-fg);
      cursor: grab;
    }
    .mermaid-preview.is-panning {
      cursor: grabbing;
      user-select: none;
    }
    .mermaid-preview.space-pan-ready {
      cursor: grab;
    }
    .preview-status-card {
      display: grid;
      gap: 10px;
      max-width: 42rem;
      margin: 1.5rem auto;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      color: var(--text);
      background: var(--panel);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    }
    .preview-status-card h3 {
      margin: 0;
      font-size: 14px;
    }
    .preview-status-card p {
      margin: 0;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .preview-status-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .preview-status-actions button {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--button-secondary-fg);
      background: var(--button-secondary-bg);
      font: inherit;
      line-height: 1.2;
      cursor: pointer;
    }
    .preview-status-actions button:focus {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }
    .webview-error-boundary {
      position: absolute;
      top: 96px;
      left: 50%;
      z-index: 60;
      display: grid;
      width: min(34rem, calc(100vw - 2rem));
      transform: translateX(-50%);
      gap: 8px;
      border: 1px solid color-mix(in srgb, var(--error) 62%, var(--border));
      border-radius: 10px;
      padding: 12px;
      color: var(--text);
      background: var(--panel);
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.4);
    }
    .webview-error-boundary[hidden] {
      display: none;
    }
    .webview-error-boundary h2 {
      margin: 0;
      padding: 0;
      border: 0;
      color: var(--error);
      background: transparent;
      font-size: 14px;
    }
    .webview-error-boundary p {
      margin: 0;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .webview-error-boundary pre {
      max-height: 7rem;
      margin: 0;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .webview-error-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .webview-error-actions button {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--button-secondary-fg);
      background: var(--button-secondary-bg);
      font: inherit;
      line-height: 1.2;
      cursor: pointer;
    }
    .mermaid-preview svg {
      display: block;
      width: auto;
      max-width: none;
      height: auto;
      margin: 0;
    }
    .mermaid-preview.zoom-fit svg {
      width: auto;
      max-width: 100%;
    }
    .preview-edit-overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: none;
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      gap: 10px;
      padding: 14px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
    }
    .shell.preview-editing .preview-edit-overlay {
      display: grid;
      pointer-events: auto;
      opacity: 1;
    }
    .shell.preview-editing .mermaid-preview {
      opacity: 0.38;
    }
    .preview-edit-status {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      color: #293241;
      font-size: 11px;
      font-weight: 650;
    }
    .preview-edit-axis {
      position: relative;
      min-width: 0;
      height: 1.45rem;
      border: 1px solid rgba(41, 50, 65, 0.14);
      border-radius: 8px;
      color: #293241;
      background: rgba(255, 255, 255, 0.84);
      font-size: 10px;
      font-weight: 700;
      overflow: hidden;
    }
    .preview-edit-axis-tick {
      position: absolute;
      top: 0;
      bottom: 0;
      display: inline-flex;
      align-items: center;
      transform: translateX(-50%);
      white-space: nowrap;
      pointer-events: none;
    }
    .preview-edit-axis-tick::before {
      content: "";
      width: 1px;
      height: 100%;
      margin-right: 4px;
      background: rgba(41, 50, 65, 0.18);
    }
    .preview-edit-axis-cursor {
      position: absolute;
      top: 50%;
      z-index: 2;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(41, 50, 65, 0.2);
      border-radius: 999px;
      padding: 2px 7px;
      color: #ffffff;
      background: rgba(59, 91, 219, 0.92);
      box-shadow: 0 5px 14px rgba(33, 41, 64, 0.18);
      line-height: 1.1;
      white-space: nowrap;
      pointer-events: none;
    }
    .preview-edit-axis-cursor[hidden] {
      display: none;
    }
    .preview-edit-timeline-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      color: #293241;
      font-size: 11px;
      font-weight: 650;
    }
    .shell.preview-focused .preview-edit-timeline-controls {
      position: sticky;
      top: 0;
      z-index: 6;
      margin: -6px -6px 0;
      padding: 6px;
      border: 1px solid rgba(41, 50, 65, 0.16);
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 8px 20px rgba(33, 41, 64, 0.14);
    }
    .preview-edit-timeline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .preview-edit-timeline-button {
      border: 1px solid rgba(41, 50, 65, 0.18);
      border-radius: 7px;
      padding: 3px 8px;
      color: #293241;
      background: rgba(255, 255, 255, 0.88);
      font: inherit;
      cursor: pointer;
    }
    .preview-edit-timeline-button:disabled {
      cursor: default;
      opacity: 0.46;
    }
    .preview-edit-timeline-range {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preview-edit-track {
      position: relative;
      min-height: max(10rem, calc(var(--preview-edit-row-count, 1) * 2.15rem + 2rem));
      border: 1px solid rgba(41, 50, 65, 0.18);
      border-radius: 8px;
      background:
        linear-gradient(90deg, rgba(41, 50, 65, 0.10) 1px, transparent 1px) 0 0 / calc(100% / max(var(--preview-edit-total-days, 1), 1)) 100%,
        rgba(255, 255, 255, 0.78);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55);
      overflow: hidden;
    }
    .preview-edit-guide-line {
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 2;
      width: 2px;
      transform: translateX(-50%);
      background: rgba(59, 91, 219, 0.82);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
      pointer-events: none;
    }
    .preview-edit-guide-line[hidden] {
      display: none;
    }
    .preview-edit-drag-tooltip {
      position: absolute;
      z-index: 3;
      max-width: min(18rem, calc(100% - 16px));
      border: 1px solid rgba(41, 50, 65, 0.18);
      border-radius: 999px;
      padding: 4px 8px;
      color: #293241;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 6px 18px rgba(33, 41, 64, 0.18);
      font-size: 11px;
      font-weight: 750;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
      transform: translateX(-50%);
    }
    .preview-edit-drag-tooltip[hidden] {
      display: none;
    }
    .preview-edit-bar {
      position: absolute;
      top: calc(1rem + var(--preview-edit-row-index, 0) * 2.15rem);
      left: var(--preview-edit-left, 0%);
      width: var(--preview-edit-width, 0%);
      min-width: 1.25rem;
      min-height: 1.25rem;
      border: 1px solid #2b5fca;
      border-radius: 6px;
      padding: 2px 7px;
      color: #ffffff;
      background: #4f6de4;
      font: 650 11px/1.25 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: grab;
      touch-action: none;
      box-shadow: 0 2px 7px rgba(33, 41, 64, 0.22);
    }
    .preview-resize-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0.75rem;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: ew-resize;
      touch-action: none;
    }
    .preview-resize-handle.left {
      left: 0;
    }
    .preview-resize-handle.right {
      right: 0;
    }
    .preview-resize-handle::after {
      content: "";
      position: absolute;
      top: 0.25rem;
      bottom: 0.25rem;
      width: 2px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.78);
    }
    .preview-resize-handle.left::after {
      left: 0.25rem;
    }
    .preview-resize-handle.right::after {
      right: 0.25rem;
    }
    .preview-edit-bar.dragging {
      opacity: 0.8;
      cursor: grabbing;
      outline: 2px solid rgba(20, 121, 255, 0.35);
      outline-offset: 2px;
    }
    .preview-edit-bar.selected {
      outline: 2px solid rgba(255, 171, 64, 0.75);
      outline-offset: 2px;
    }
    .preview-edit-bar.unsupported {
      border-color: rgba(41, 50, 65, 0.28);
      color: #5c6472;
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.72) 5px, rgba(41, 50, 65, 0.12) 5px, rgba(41, 50, 65, 0.12) 10px);
      cursor: not-allowed;
      box-shadow: none;
    }
    .preview-edit-guidance {
      display: inline-flex;
      align-items: center;
      min-height: 1.5rem;
      padding: 3px 7px;
      border-radius: 999px;
      color: #293241;
      background: rgba(255, 255, 255, 0.82);
      font-size: 11px;
      font-weight: 650;
    }
    .preview-mini-editor {
      position: relative;
      display: grid;
      grid-template-columns: minmax(9rem, 1.1fr) repeat(3, minmax(7rem, 1fr)) auto;
      gap: 8px;
      align-items: end;
      padding: 10px;
      border: 1px solid rgba(41, 50, 65, 0.18);
      border-radius: 8px;
      color: #293241;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 8px 20px rgba(33, 41, 64, 0.16);
    }
    .preview-mini-editor[hidden] {
      display: none;
    }
    .preview-mini-title {
      min-width: 0;
      font-size: 12px;
      font-weight: 700;
    }
    .preview-mini-title span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preview-mini-editor label {
      display: grid;
      gap: 4px;
      min-width: 0;
      color: #5c6472;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .preview-mini-value {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      min-height: 30px;
      border: 1px solid rgba(41, 50, 65, 0.22);
      border-radius: 7px;
      padding: 4px 7px;
      min-width: 0;
      color: #293241;
      background: #ffffff;
      font-size: 12px;
      text-transform: none;
    }
    .preview-mini-value[data-preview-mini-disabled="true"] {
      color: rgba(41, 50, 65, 0.45);
      background: rgba(41, 50, 65, 0.08);
    }
    .preview-mini-editor button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .preview-mini-editor .date-picker-wrap,
    .preview-mini-editor .date-picker-wrap .icon-button {
      width: 30px;
      height: 30px;
    }
    .preview-mini-duration-options {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .preview-mini-duration-options[data-preview-mini-disabled="true"] {
      display: none;
    }
    .preview-mini-duration-options .option-chip {
      color: #ffffff;
      background: #4f6de4;
    }
    .preview-mini-apply {
      align-self: stretch;
      min-width: 5rem;
      border: 1px solid #2b5fca;
      border-radius: 8px;
      padding: 4px 10px;
      color: #ffffff;
      background: #2b7faa;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .preview-mini-calendar {
      position: absolute;
      top: var(--preview-mini-calendar-top, calc(100% + 6px));
      left: var(--preview-mini-calendar-left, 10px);
      z-index: 6;
      width: min(19.5rem, calc(100% - 20px));
      max-height: min(17rem, calc(100vh - 24px));
      overflow: auto;
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid rgba(41, 50, 65, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 10px 28px rgba(33, 41, 64, 0.24);
    }
    .preview-mini-calendar[hidden] {
      display: none;
    }
    .preview-mini-calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: #293241;
      font-size: 12px;
      font-weight: 700;
    }
    .preview-mini-calendar-header button,
    .preview-mini-calendar-day {
      border: 1px solid rgba(41, 50, 65, 0.16);
      border-radius: 6px;
      color: #293241;
      background: #ffffff;
      font: inherit;
      cursor: pointer;
    }
    .preview-mini-calendar-weekdays,
    .preview-mini-calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 3px;
    }
    .preview-mini-calendar-weekdays span {
      color: #5c6472;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }
    .preview-mini-calendar-day {
      min-height: 1.55rem;
      padding: 3px;
      text-align: center;
      font-size: 11px;
    }
    .preview-mini-calendar-day.selected {
      border-color: #2b5fca;
      color: #ffffff;
      background: #4f6de4;
    }
    .preview-mini-calendar-day.outside {
      opacity: 0.35;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .chip {
      padding: 2px 6px;
      border-radius: 999px;
      color: var(--button-fg);
      background: var(--button-bg);
      font-size: 11px;
      font-weight: 650;
    }
    .compatibility-panel {
      display: grid;
      gap: 7px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.015);
    }
    .compatibility-panel h3 {
      margin: 0;
      font-size: 12px;
    }
    .compatibility-panel p {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .compatibility-runtime,
    .compatibility-profile-card {
      display: grid;
      gap: 5px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel-2) 72%, transparent);
    }
    .compatibility-runtime dl,
    .compatibility-profile-card dl {
      display: grid;
      grid-template-columns: minmax(7rem, auto) minmax(0, 1fr);
      gap: 4px 8px;
      margin: 0;
      font-size: 11px;
    }
    .compatibility-runtime dt,
    .compatibility-profile-card dt {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .compatibility-runtime dd,
    .compatibility-profile-card dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .compatibility-profiles {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .compatibility-profile {
      appearance: none;
      padding: 2px 7px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--text);
      background: var(--panel-2);
      font-size: 11px;
      cursor: pointer;
    }
    .compatibility-profile.active,
    .compatibility-profile[aria-pressed="true"] {
      border-color: var(--accent);
      background: var(--button-bg);
      color: var(--button-fg);
    }
    .compatibility-profile-card[hidden] {
      display: none;
    }
    .compatibility-profile-card ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding-left: 16px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
    button.chip {
      border: 0;
      cursor: pointer;
      font: inherit;
    }
    .tag-toggle-group {
      margin-top: 6px;
    }
    button.chip.tag-toggle {
      border: 1px solid var(--border);
      color: var(--text);
      background: var(--panel);
    }
    button.chip.tag-toggle[aria-pressed="true"] {
      border-color: var(--button-bg);
      color: var(--button-fg);
      background: var(--button-bg);
    }
    .advanced {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .advanced p {
      margin: 6px 0;
      color: var(--muted);
    }
    .advanced-source-facts {
      display: grid;
      gap: 6px;
      margin: 8px 0;
    }
    .advanced-source-facts div {
      display: grid;
      grid-template-columns: minmax(6rem, auto) minmax(0, 1fr);
      gap: 8px;
    }
    .advanced-source-facts dt {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .advanced-source-facts dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .advanced-source-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .advanced-source-actions button {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 5px 9px;
      color: var(--button-secondary-fg);
      background: var(--button-secondary-bg);
      font: inherit;
      line-height: 1.2;
      cursor: pointer;
    }
    .banner {
      border: 1px solid color-mix(in srgb, var(--warn) 60%, var(--border));
      border-radius: 12px;
      padding: 9px 12px;
      color: var(--warn);
      background: rgba(242, 204, 96, 0.08);
    }
    .banner.fallback {
      border-color: color-mix(in srgb, var(--error) 62%, var(--border));
      color: var(--error);
      background: rgba(255, 123, 114, 0.08);
    }
    tr.selected {
      background: rgba(66, 198, 181, 0.1);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    tr[data-node-id] {
      cursor: pointer;
    }
    .inspector {
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.015);
    }
    .inspector .wide {
      grid-column: 1 / -1;
    }
    .rich-label-editor textarea {
      min-height: 5.4rem;
      resize: vertical;
      line-height: 1.45;
      letter-spacing: 0;
      text-transform: none;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .field-block {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .details-drawer label,
    .details-drawer .field-block,
    .details-drawer .date-field,
    .details-drawer .dependency-picker,
    .details-drawer .inline-options {
      min-width: 0;
    }
    .details-drawer input,
    .details-drawer select,
    .details-drawer textarea {
      min-width: 0;
    }
    .date-field {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 34px;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .date-field input[data-field] {
      min-width: 0;
    }
    .date-picker-wrap {
      position: relative;
      width: 34px;
      height: 34px;
    }
    .date-picker-wrap .icon-button {
      width: 34px;
      height: 34px;
    }
    .native-date-picker {
      position: absolute;
      inset: 0;
      width: 34px;
      height: 34px;
      opacity: 0;
      cursor: pointer;
    }
    input {
      width: 100%;
      min-width: 7rem;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 4px 7px;
      color: var(--input-fg);
      background: var(--input-bg);
      font: inherit;
      line-height: 1.2;
    }
    select {
      width: 100%;
      min-width: 7rem;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 4px 7px;
      color: var(--input-fg);
      background: var(--input-bg);
      font: inherit;
      line-height: 1.2;
    }
    .inline-options {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .dependency-picker {
      display: grid;
      gap: 5px;
    }
    .dependency-search {
      min-width: 100%;
    }
    .option-chip {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 7px;
      color: var(--text);
      background: var(--panel-2);
      font: 11px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      text-transform: none;
      cursor: pointer;
    }
    .dependency-option {
      max-width: 100%;
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .dependency-option .option-id {
      font-weight: 700;
    }
    .dependency-option .option-label {
      max-width: 13rem;
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dependency-option .option-section {
      max-width: 9rem;
      min-width: 0;
      overflow: hidden;
      color: var(--muted);
      opacity: 0.78;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .option-chip:hover,
    .option-chip:focus {
      border-color: var(--accent);
      outline: none;
    }
    .dependency-empty {
      color: var(--muted);
      font-size: 10px;
      letter-spacing: 0;
      text-transform: none;
    }
    input.field-error {
      border-color: color-mix(in srgb, var(--error) 62%, var(--border));
    }
    .field-helper,
    .field-warning {
      font-size: 10px;
      line-height: 1.35;
      letter-spacing: 0;
      text-transform: none;
    }
    .field-helper {
      color: var(--muted);
    }
    .field-warning {
      color: var(--error);
    }
    textarea.raw-source,
    textarea.setting-list {
      width: 100%;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 8px;
      color: var(--input-fg);
      background: var(--input-bg);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    textarea.raw-source {
      min-height: 9rem;
    }
    textarea.setting-list {
      min-height: 3.1rem;
    }
    input:focus,
    select:focus,
    textarea:focus {
      outline: 1px solid var(--accent);
      border-color: var(--accent);
    }
    input[type="checkbox"] {
      width: auto;
      min-width: 0;
      accent-color: var(--accent);
    }
    .checkbox-label {
      align-content: start;
      grid-template-columns: auto 1fr;
      align-items: center;
      color: var(--text);
      text-transform: none;
      letter-spacing: 0;
    }
    .secondary-controls {
      padding: 12px;
      display: grid;
      gap: 10px;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.015);
    }
    @media (max-width: 1180px) {
      .preview-mini-editor {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .preview-mini-title,
      .preview-mini-apply {
        grid-column: 1 / -1;
      }
    }
    .shell.responsive-narrow {
      width: min(46rem, 100%);
      height: auto;
      min-height: 100vh;
      margin: 0 auto;
      overflow: visible;
    }
    .shell.responsive-narrow .workspace,
    .shell.responsive-narrow.details-open .workspace,
    .shell.responsive-narrow.layout-vertical .workspace,
    .shell.responsive-narrow.layout-vertical.preview-collapsed .workspace {
      min-height: 0;
      overflow: visible;
      grid-template-columns: 1fr;
      grid-template-rows: minmax(22rem, auto) minmax(24rem, auto);
    }
    .shell.responsive-narrow header,
    .shell.responsive-narrow .section-header,
    .shell.responsive-narrow .task-grid-toolbar,
    .shell.responsive-narrow .compact-search,
    .shell.responsive-narrow .preview-header,
    .shell.responsive-narrow .preview-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .shell.responsive-narrow header h1,
    .shell.responsive-narrow .preview-header h2 {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .shell.responsive-narrow .compact-search {
      width: 100%;
    }
    .shell.responsive-narrow .header-actions,
    .shell.responsive-narrow .layout-toggle,
    .shell.responsive-narrow .preview-controls {
      flex-wrap: wrap;
    }
    .shell.responsive-narrow td.label {
      max-width: 16rem;
    }
    .shell.responsive-narrow .grid th,
    .shell.responsive-narrow .grid td {
      padding-inline: 6px;
    }
    .shell.responsive-narrow .grid.grid-has-tags .col-section { width: 8%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-task { width: 14%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-id { width: 7%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-start,
    .shell.responsive-narrow .grid.grid-has-tags .col-end { width: 21%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-duration { width: 7%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-dependencies { width: 8%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-tags { width: 6%; }
    .shell.responsive-narrow .grid.grid-has-tags .col-actions { width: 8%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-section { width: 12%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-task { width: 18%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-id { width: 8%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-start,
    .shell.responsive-narrow .grid.grid-no-tags .col-end { width: 20%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-duration { width: 8%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-dependencies { width: 7%; }
    .shell.responsive-narrow .grid.grid-no-tags .col-actions { width: 7%; }
    .shell.responsive-narrow .row-actions {
      padding-inline: 4px 10px;
    }
    .shell.responsive-narrow .dependency-option {
      white-space: normal;
    }
    .shell.responsive-narrow .dependency-option .option-label,
    .shell.responsive-narrow .dependency-option .option-section {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .shell.responsive-narrow .row-action-menu {
      max-width: min(14rem, calc(100vw - 2rem));
      max-height: min(16rem, calc(100vh - 10rem));
      overscroll-behavior: contain;
    }
    .shell.responsive-narrow .menu-item {
      padding: 2px 6px;
      line-height: 1.1;
    }
    .shell.responsive-narrow .preview-mini-editor {
      grid-template-columns: 1fr;
    }
    .shell.responsive-narrow .preview-pane {
      max-height: 24rem;
    }
    .shell.responsive-narrow .preview-mini-title,
    .shell.responsive-narrow .preview-mini-apply {
      grid-column: auto;
    }
    .shell.responsive-narrow .details-drawer {
      position: fixed;
      top: 5rem;
      right: 0.75rem;
      bottom: 0.75rem;
      left: auto;
      z-index: 30;
      width: min(22rem, calc(100vw - 1.5rem));
      max-width: calc(100vw - 1.5rem);
    }
    .shell.responsive-narrow.details-open .details-drawer {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .shell.responsive-narrow .drawer-header {
      padding: 8px 10px;
    }
    .shell.responsive-narrow .detail-tabs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 5px;
    }
    .shell.responsive-narrow .detail-tab {
      min-height: 1.75rem;
      padding: 3px 5px;
      font-size: 0;
    }
    .shell.responsive-narrow .detail-tab::after {
      content: attr(data-detail-tab);
      font-size: 0.92rem;
      text-transform: capitalize;
    }
    .shell.responsive-narrow .inspector {
      padding: 10px;
      gap: 8px;
    }
    .shell.responsive-narrow .rich-label-editor textarea {
      min-height: 4.6rem;
    }
    .shell.responsive-narrow .rich-label-editor .field-helper {
      display: none;
    }
    .shell.responsive-narrow .field-helper,
    .shell.responsive-narrow .field-warning {
      font-size: 9.5px;
      line-height: 1.3;
    }
    @media (max-width: 920px) {
      .shell {
        height: auto;
        min-height: 100vh;
        overflow: visible;
      }
      body {
        overflow: auto;
      }
      .workspace,
      .shell.details-open .workspace {
        min-height: 0;
        overflow: visible;
        grid-template-columns: 1fr;
        grid-template-rows: minmax(24rem, auto) minmax(24rem, auto);
      }
      .section-header {
        align-items: stretch;
        flex-direction: column;
      }
      .task-grid-toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .compact-search {
        width: 100%;
        align-items: stretch;
        flex-direction: column;
      }
      header {
        align-items: stretch;
        flex-direction: column;
      }
      header h1 {
        white-space: normal;
      }
      .header-actions {
        flex-wrap: wrap;
      }
      .details-drawer {
        position: fixed;
        top: 5rem;
        right: 0.75rem;
        bottom: 0.75rem;
        left: 0.75rem;
        z-index: 30;
        width: auto;
        max-width: none;
      }
      .shell.details-open .details-drawer {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
      }
      .detail-panels {
        max-height: none;
      }
    }
  </style>
</head>
<body>
  <div class="shell layout-${initialLayout}${responsiveMode === "narrow" ? " responsive-narrow" : ""}${shouldOpenDetails ? " details-open" : ""}${initialPreviewCollapsed ? " preview-collapsed" : ""}${initialPreviewFocused ? " preview-focused" : ""}${initialPreviewEditMode ? " preview-editing" : ""}" data-review-id="shell" data-initial-detail-tab="${escapeHtml(initialDetailTab)}" data-default-layout="${initialLayout}" data-default-preview-collapsed="${initialPreviewCollapsed ? "true" : "false"}" data-default-preview-focused="${initialPreviewFocused ? "true" : "false"}" data-mermaid-runtime="bundled" data-mermaid-runtime-version="${escapeHtml(mermaidRuntimeVersion)}" data-mermaid-security-level="strict">
    <header data-review-id="app-header">
      <h1>${escapeHtml(labels.title)}</h1>
      <div class="header-actions">
        <div class="layout-toggle" aria-label="${escapeHtml(labels.layout)}">
          <span class="layout-toggle-label">${escapeHtml(labels.layout)}</span>
          <button class="layout-option" type="button" data-layout-option="horizontal" aria-pressed="${initialLayout === "horizontal" ? "true" : "false"}">${escapeHtml(labels.horizontal)}</button>
          <button class="layout-option" type="button" data-layout-option="vertical" aria-pressed="${initialLayout === "vertical" ? "true" : "false"}">${escapeHtml(labels.vertical)}</button>
        </div>
        <button id="details-toggle" class="details-toggle" type="button" aria-controls="details-drawer" aria-expanded="${shouldOpenDetails ? "true" : "false"}">${escapeHtml(labels.details)}</button>
        <span class="badge">${escapeHtml(labels.mode)}: ${escapeHtml(state.mode)}</span>
      </div>
    </header>
    ${renderEditingBanner()}
    <div class="workspace" data-review-id="workspace" style="--task-grid-row-count: ${escapeHtml(String(Math.max(rowCount, 1)))}" data-row-count="${escapeHtml(String(rowCount))}">
      <section class="main" data-review-id="task-grid">
        <div class="section-header">
          <h2>${escapeHtml(labels.taskGrid)}</h2>
          <div class="task-grid-toolbar" data-review-id="task-grid-toolbar">
            ${renderHistoryControls()}
            ${renderAddSectionButton()}
            ${renderAddTaskButton(addTaskSectionId)}
            <label class="compact-search">${escapeHtml(labels.search)}
              <input data-action="update-grid-filter-text" value="${escapeHtml(state.grid.filter?.text ?? "")}">
            </label>
          </div>
        </div>
        <div class="table-wrap" data-review-id="task-grid-table-wrap">
          <table class="grid ${showTagsColumn ? "grid-has-tags" : "grid-no-tags"}" data-review-id="task-grid-table">
            <colgroup>
              <col class="col-section">
              <col class="col-task">
              <col class="col-id">
              <col class="col-start">
              <col class="col-end">
              <col class="col-duration">
              <col class="col-dependencies">
              ${showTagsColumn ? '<col class="col-tags">' : ""}
              <col class="col-actions">
            </colgroup>
            <thead>
              <tr>
                <th>${escapeHtml(labels.section)}</th>
                <th>${escapeHtml(labels.task)}</th>
                <th>${escapeHtml(labels.id)}</th>
                <th>${escapeHtml(labels.start)}</th>
                <th>${escapeHtml(labels.end)}</th>
                <th>${escapeHtml(labels.duration)}</th>
                <th>${escapeHtml(labels.dependencies)}</th>
                ${showTagsColumn ? `<th>${escapeHtml(labels.tags)}</th>` : ""}
                <th>${escapeHtml(labels.actions)}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderRow).join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="preview-pane" data-review-id="preview-pane">
        <div class="preview-header">
          <h2>${escapeHtml(labels.previewDiagram)}</h2>
          <div class="preview-actions">
            <div class="preview-controls" data-review-id="preview-controls" aria-label="${escapeHtml(labels.previewControls)}">
              <button class="preview-zoom-button" type="button" data-preview-zoom="fit" aria-pressed="${initialPreviewZoom === "fit" ? "true" : "false"}" aria-label="${escapeHtml(labels.previewFitTooltip)}" title="${escapeHtml(labels.previewFitTooltip)}">${escapeHtml(labels.previewFit)}</button>
              <button class="preview-zoom-button" type="button" data-preview-zoom="fill" aria-pressed="${initialPreviewZoom === "fill" ? "true" : "false"}" aria-label="${escapeHtml(labels.previewFillTooltip)}" title="${escapeHtml(labels.previewFillTooltip)}">${escapeHtml(labels.previewFill)}</button>
              <button class="preview-zoom-button" type="button" data-preview-zoom="out" aria-label="${escapeHtml(labels.previewZoomOut)}">−</button>
              <button class="preview-zoom-button" type="button" data-preview-zoom="reset" aria-pressed="${initialPreviewZoom === "1" ? "true" : "false"}" aria-label="${escapeHtml(labels.previewResetZoom)}">100%</button>
              <button class="preview-zoom-button" type="button" data-preview-zoom="in" aria-label="${escapeHtml(labels.previewZoomIn)}">＋</button>
            </div>
            <button id="preview-edit-toggle" class="preview-zoom-button preview-edit-toggle" data-review-id="preview-edit-toggle" type="button" aria-pressed="${initialPreviewEditMode ? "true" : "false"}" data-edit-label="${escapeHtml(labels.previewEdit)}" data-done-label="${escapeHtml(labels.previewEditDone)}">${escapeHtml(initialPreviewEditMode ? labels.previewEditDone : labels.previewEdit)}</button>
            <button id="preview-focus-toggle" class="icon-button preview-focus-toggle" data-review-id="preview-focus-toggle" type="button" aria-pressed="${initialPreviewFocused ? "true" : "false"}" aria-label="${escapeHtml(initialPreviewFocused ? labels.previewExitFocus : labels.previewFocus)}" title="${escapeHtml(initialPreviewFocused ? labels.previewExitFocus : labels.previewFocus)}" data-focus-label="${escapeHtml(labels.previewFocus)}" data-exit-focus-label="${escapeHtml(labels.previewExitFocus)}">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
            </button>
            <button id="preview-collapse-toggle" class="icon-button preview-collapse-toggle" data-review-id="preview-collapse-toggle" type="button" aria-expanded="${initialPreviewCollapsed ? "false" : "true"}" aria-label="${escapeHtml(initialPreviewCollapsed ? labels.previewExpand : labels.previewCollapse)}" title="${escapeHtml(initialPreviewCollapsed ? labels.previewExpand : labels.previewCollapse)}" data-collapse-label="${escapeHtml(labels.previewCollapse)}" data-expand-label="${escapeHtml(labels.previewExpand)}">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
            </button>
          </div>
        </div>
        <div class="preview-box" data-review-id="preview-box">
          <div id="mermaid-preview" class="mermaid-preview" data-review-id="mermaid-preview" data-default-preview-zoom="${escapeHtml(initialPreviewZoom)}" aria-label="${escapeHtml(labels.previewPanTooltip)}" title="${escapeHtml(labels.previewPanTooltip)}">${state.previewSource ? escapeHtml(labels.previewSource) : renderPreviewStatusCard("blocked", labels.previewBlockedTitle, labels.previewBlocked, labels)}</div>
          ${renderPreviewScheduleOverlay(previewScheduleEditModel, labels, { initialEditMode: initialPreviewEditMode })}
        </div>
      </section>
      <aside id="details-drawer" class="details-drawer" data-review-id="details-drawer" role="complementary" aria-label="${escapeHtml(labels.details)}">
        <div class="drawer-header">
          <h2>${escapeHtml(labels.details)}</h2>
          <button id="details-close" class="details-close" type="button" aria-label="${escapeHtml(labels.details)}">×</button>
        </div>
        <div class="detail-tabs" data-review-id="detail-tabs" role="tablist" aria-label="${escapeHtml(labels.details)}">
          <button class="detail-tab" type="button" role="tab" aria-selected="${initialDetailTab === "settings" ? "true" : "false"}" tabindex="${initialDetailTab === "settings" ? "0" : "-1"}" aria-controls="detail-panel-settings" id="detail-tab-settings" data-review-id="detail-tab-settings" data-detail-tab="settings">${escapeHtml(labels.documentSettings)}</button>
          <button class="detail-tab" type="button" role="tab" aria-selected="${initialDetailTab === "inspector" ? "true" : "false"}" tabindex="${initialDetailTab === "inspector" ? "0" : "-1"}" aria-controls="detail-panel-inspector" id="detail-tab-inspector" data-review-id="detail-tab-inspector" data-detail-tab="inspector">${escapeHtml(labels.inspector)}</button>
          <button class="detail-tab" type="button" role="tab" aria-selected="${initialDetailTab === "diagnostics" ? "true" : "false"}" tabindex="${initialDetailTab === "diagnostics" ? "0" : "-1"}" aria-controls="detail-panel-diagnostics" id="detail-tab-diagnostics" data-review-id="detail-tab-diagnostics" data-detail-tab="diagnostics">${escapeHtml(labels.diagnostics)}</button>
          <button class="detail-tab" type="button" role="tab" aria-selected="${initialDetailTab === "advanced" ? "true" : "false"}" tabindex="${initialDetailTab === "advanced" ? "0" : "-1"}" aria-controls="detail-panel-advanced" id="detail-tab-advanced" data-review-id="detail-tab-advanced" data-detail-tab="advanced">${escapeHtml(labels.advancedSourceItems)}</button>
          <button class="detail-tab" type="button" role="tab" aria-selected="${initialDetailTab === "source" ? "true" : "false"}" tabindex="${initialDetailTab === "source" ? "0" : "-1"}" aria-controls="detail-panel-source" id="detail-tab-source" data-review-id="detail-tab-source" data-detail-tab="source">${escapeHtml(state.previewSource ? labels.previewSource : labels.rawSourceEditor)}</button>
        </div>
        <div class="detail-panels">
          <div class="detail-panel" data-detail-panel="settings" id="detail-panel-settings" role="tabpanel" aria-labelledby="detail-tab-settings"${initialDetailTab === "settings" ? "" : " hidden"}>
            <h2>${escapeHtml(labels.documentSettings)}</h2>
            ${renderSettingsEditor()}
          </div>
          <div class="detail-panel" data-detail-panel="inspector" id="detail-panel-inspector" role="tabpanel" aria-labelledby="detail-tab-inspector"${initialDetailTab === "inspector" ? "" : " hidden"}>
            <h2>${escapeHtml(labels.inspector)}</h2>
            ${renderInspector(selectedRow)}
          </div>
          <div class="detail-panel" data-detail-panel="diagnostics" id="detail-panel-diagnostics" role="tabpanel" aria-labelledby="detail-tab-diagnostics"${initialDetailTab === "diagnostics" ? "" : " hidden"}>
            <h2>${escapeHtml(labels.diagnostics)}</h2>
            <div class="secondary-controls">
              <label>${escapeHtml(labels.severity)}
                ${renderSeveritySelect()}
              </label>
            </div>
            ${renderHostCompatibilityProfiles()}
            ${renderDiagnostics()}
          </div>
          <div class="detail-panel" data-detail-panel="advanced" id="detail-panel-advanced" role="tabpanel" aria-labelledby="detail-tab-advanced"${initialDetailTab === "advanced" ? "" : " hidden"}>
            <h2>${escapeHtml(labels.advancedSourceItems)}</h2>
            ${renderAdvancedSourceItems()}
          </div>
          <div class="detail-panel" data-detail-panel="source" id="detail-panel-source" role="tabpanel" aria-labelledby="detail-tab-source"${initialDetailTab === "source" ? "" : " hidden"}>
            <h2>${escapeHtml(state.previewSource ? labels.previewSource : labels.rawSourceEditor)}</h2>
            ${state.previewSource
              ? `<pre>${escapeHtml(state.previewSource)}</pre>`
              : `<textarea class="raw-source" data-action="replace-source">${escapeHtml(state.source)}</textarea>`}
          </div>
        </div>
      </aside>
      <div id="webview-error-boundary" class="webview-error-boundary" data-review-id="webview-error-boundary" role="alert" hidden>
        <h2>${escapeHtml(labels.webviewErrorTitle)}</h2>
        <p>${escapeHtml(labels.webviewErrorMessage)}</p>
        <pre id="webview-error-summary"></pre>
        <div class="webview-error-actions">
          <button type="button" data-webview-error-tab="diagnostics">${escapeHtml(labels.webviewErrorOpenDiagnostics)}</button>
          <button type="button" data-webview-error-tab="source">${escapeHtml(labels.webviewErrorOpenSource)}</button>
          <button type="button" data-action="dismiss-webview-error">${escapeHtml(labels.webviewErrorDismiss)}</button>
        </div>
      </div>
    </div>
  </div>
  <script type="application/json" id="llm-ui-self-review">${escapeHtml(JSON.stringify(selfReview))}</script>
  ${renderScript(nonce, allowEditing, mermaidModuleUri, state.previewSource, {
    renderFailed: labels.previewRenderFailed,
    renderFailedTitle: labels.previewRenderFailedTitle,
    openDiagnostics: labels.previewOpenDiagnostics,
    openAdvanced: labels.previewOpenAdvanced,
    openSource: labels.previewOpenSource,
    webviewErrorTitle: labels.webviewErrorTitle,
    webviewErrorMessage: labels.webviewErrorMessage,
    webviewErrorOpenDiagnostics: labels.webviewErrorOpenDiagnostics,
    webviewErrorOpenSource: labels.webviewErrorOpenSource,
    webviewErrorDismiss: labels.webviewErrorDismiss
  }, mermaidRuntimeVersion, shouldOpenDetails, initialDetailTab, options.initialDetailTab !== undefined, options.initialOpenDetailsWithRowActionMenu === true, options.enableUiReviewSnapshot === true, enableTestWebviewOperations, options.testWebviewGeneration, previewScheduleEditModel, initialPreviewEditMode, initialPreviewEditSelectedNodeId, options.hostBridgeScript)}
</body>
</html>`;

  function renderDiagnostics(): string {
    if (state.diagnostics.length === 0) {
      return `<div class="diagnostic info">${escapeHtml(labels.noDiagnostics)}</div>`;
    }
    return state.diagnostics.map((diagnostic) => `<div class="diagnostic ${escapeHtml(diagnostic.severity)}" data-diagnostic-code="${escapeHtml(diagnostic.code)}" data-start-offset="${escapeHtml(String(diagnostic.primaryRange.start.offset))}">
      <strong>${escapeHtml(diagnostic.code)}</strong>
      <dl class="diagnostic-facts">
        <div><dt>${escapeHtml(labels.diagnosticsStage)}</dt><dd>${escapeHtml(diagnostic.stage)}</dd></div>
        <div><dt>${escapeHtml(labels.diagnosticsLocation)}</dt><dd>${escapeHtml(formatRange(diagnostic.primaryRange))}</dd></div>
        <div><dt>${escapeHtml(labels.diagnosticsReason)}</dt><dd>${escapeHtml(renderDiagnosticMessage(diagnostic))}</dd></div>
        <div><dt>${escapeHtml(labels.diagnosticsImpact)}</dt><dd>${escapeHtml(impactForDiagnostic(diagnostic.severity))}</dd></div>
      </dl>
      <code>${escapeHtml(diagnostic.primaryRaw)}</code>
      <div class="action-label">${escapeHtml(labels.diagnosticsAction)}</div>
      <div class="chips">${diagnostic.suggestedActions.map((action, actionIndex) => `<button class="chip" data-action="apply-diagnostic-action" data-diagnostic-code="${escapeHtml(diagnostic.code)}" data-start-offset="${escapeHtml(String(diagnostic.primaryRange.start.offset))}" data-action-index="${escapeHtml(String(actionIndex))}">${escapeHtml(renderDiagnosticActionLabel(diagnostic, action))}</button>`).join("")}</div>
    </div>`).join("");
  }

  function renderHostCompatibilityProfiles(): string {
    const profiles = hostCompatibility.profiles;
    return `<section class="compatibility-panel" data-review-id="host-compatibility-profile">
      <h3>${escapeHtml(labels.hostCompatibility)}</h3>
      <p>${escapeHtml(labels.hostCompatibilityGuidance)}</p>
      <div class="compatibility-runtime" data-review-id="mermaid-runtime-profile">
        <dl>
          <dt>${escapeHtml(labels.mermaidRuntime)}</dt><dd>${escapeHtml(labels.mermaidRuntimeBundledVersion.replace("{0}", mermaidRuntimeVersion))}</dd>
          <dt>${escapeHtml(labels.mermaidRuntimeSecurityLevel)}</dt><dd>strict</dd>
          <dt>${escapeHtml(labels.hostCompatibilitySelectedProfile)}</dt><dd data-host-profile-active-label>${escapeHtml(profiles[0]?.label ?? labels.hostCompatibilityProfileMermaidLatest)}</dd>
        </dl>
        <p>${escapeHtml(labels.mermaidRuntimeDeterministic)}</p>
      </div>
      <div class="compatibility-profiles" role="group" aria-label="${escapeHtml(labels.hostCompatibilitySelectedProfile)}">${profiles.map((profile, index) => `<button type="button" class="compatibility-profile${index === 0 ? " active" : ""}" data-host-profile="${escapeHtml(profile.id)}" data-host-profile-option="${escapeHtml(profile.id)}" aria-pressed="${index === 0 ? "true" : "false"}">${escapeHtml(profile.label)}</button>`).join("")}</div>
      ${profiles.map((profile, index) => `<div class="compatibility-profile-card" data-host-profile-card="${escapeHtml(profile.id)}" data-review-id="host-compatibility-${escapeHtml(profile.id)}"${index === 0 ? "" : " hidden"}>
        <dl>
          <dt>${escapeHtml(labels.hostCompatibilitySelectedProfile)}</dt><dd>${escapeHtml(profile.label)}</dd>
          <dt>${escapeHtml(labels.mermaidRuntime)}</dt><dd>${escapeHtml(profile.runtimeLabel)}</dd>
          <dt>${escapeHtml(labels.hostCompatibilityRiskySyntax)}</dt><dd>${escapeHtml(String(profile.warnings.length))}</dd>
        </dl>
        ${profile.warnings.length > 0
          ? `<div><strong>${escapeHtml(labels.hostCompatibilityProfileWarnings)}</strong><ul>${profile.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>`
          : `<p>${escapeHtml(labels.hostCompatibilityNoWarnings)}</p>`}
      </div>`).join("")}
      <div class="chips">
        <span class="chip">${escapeHtml(labels.hostCompatibilityWarningCount.replace("{0}", String(hostCompatibility.warningCount)))}</span>
        <span class="chip">${escapeHtml(labels.hostCompatibilityRetainedCount.replace("{0}", String(hostCompatibility.retainedSourceItemCount)))}</span>
      </div>
    </section>`;
  }

  function renderDiagnosticActionLabel(
    diagnostic: EditorState["diagnostics"][number],
    action: EditorState["diagnostics"][number]["suggestedActions"][number]
  ): string {
    if (action.labelKey === "diagnostics.action.removeBlockingReference") {
      return labels.removeBlockingReference.replace("{0}", diagnostic.primaryRaw);
    }
    if (action.labelKey === "diagnostics.action.replaceBlockingReference" && action.replacement?.text) {
      return labels.replaceBlockingReference.replace("{0}", action.replacement.text);
    }
    if (action.labelKey === "diagnostics.action.useExistingTaskId" && action.replacement?.text) {
      return labels.useExistingTaskId.replace("{0}", action.replacement.text);
    }
    return labels.diagnosticActionLabels?.[action.labelKey] ?? action.labelText ?? action.labelKey;
  }

  function renderDiagnosticMessage(diagnostic: EditorState["diagnostics"][number]): string {
    return labels.diagnosticMessages?.[diagnostic.messageKey] ?? diagnostic.summary ?? diagnostic.messageKey;
  }

  function renderAdvancedSourceItems(): string {
    if (state.advancedSourceItems.length === 0) {
      return `<div class="advanced"><div class="muted">${escapeHtml(labels.noAdvancedSourceItems)}</div></div>`;
    }
    return state.advancedSourceItems.map((item) => `<div class="advanced">
      <strong>${escapeHtml(item.displayName)}</strong>
      <p>${escapeHtml(labels.advancedSourceGuidance)}</p>
      <dl class="advanced-source-facts">
        <div><dt>${escapeHtml(labels.advancedSourceType)}</dt><dd>${escapeHtml(item.kind)}</dd></div>
        <div><dt>${escapeHtml(labels.advancedSourceRange)}</dt><dd>${escapeHtml(formatRange(item.range))}</dd></div>
        <div><dt>${escapeHtml(labels.advancedSourceEditability)}</dt><dd>${escapeHtml(labels.advancedSourceRawOnly)}</dd></div>
        <div><dt>${escapeHtml(labels.advancedSourceReason)}</dt><dd>${escapeHtml(item.reasonCodes.join(", ") || "-")}</dd></div>
      </dl>
      <div class="advanced-source-actions">
        <button type="button" data-preview-detail-tab="source">${escapeHtml(labels.advancedSourceOpenSource)}</button>
        <button type="button" data-preview-detail-tab="diagnostics">${escapeHtml(labels.advancedSourceOpenDiagnostics)}</button>
      </div>
      <code>${escapeHtml(item.raw.trim() || "(blank)")}</code>
    </div>`).join("");
  }

  function renderRow(row: TaskGridRow): string {
    if (row.kind === "section") {
      return renderSectionRow(row);
    }
    const selected = state.selected.kind === "task" && state.selected.nodeId === row.nodeId ? " selected" : "";
    const sectionLabel = row.sectionLabel || "(default)";
    return `<tr class="${selected.trim()}" data-node-id="${escapeHtml(row.nodeId)}" data-source-order="${escapeHtml(String(row.sourceOrder))}">
      <td class="section-label" title="${escapeHtml(sectionLabel)}">${escapeHtml(sectionLabel)}</td>
      <td class="label" title="${escapeHtml(row.sourceLabelRaw)}">${renderEditable(row, "update-task-label", "label", row.displayLabel)}</td>
      <td>${renderEditable(row, "update-task-id", "id", row.id ?? "")}</td>
      <td>${renderEditable(row, "update-task-start", "start", row.start ?? "")}</td>
      <td>${renderEditable(row, "update-task-end", "end", row.end ?? "")}</td>
      <td>${renderEditable(row, "update-task-duration", "duration", row.duration ?? "")}</td>
      <td>${renderEditable(row, "update-task-dependencies", "dependencies", row.dependencies.join(" "), row.id)}</td>
      ${showTagsColumn ? `<td><span class="chips">${row.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</span></td>` : ""}
      <td class="row-actions">${renderTaskActionMenu(row)}</td>
    </tr>`;
  }

  function renderSectionRow(row: TaskGridRow): string {
    const selected = state.selected.kind === "section" && state.selected.sectionId === row.sectionId ? " selected" : "";
    return `<tr class="section-row ${selected.trim()}" data-section-id="${escapeHtml(row.sectionId)}" data-source-order="${escapeHtml(String(row.sourceOrder))}">
      <td>${renderSectionEditable(row)}</td>
      <td class="empty-section" colspan="${escapeHtml(String(gridContentColumnSpan))}">${escapeHtml(labels.emptySection)}</td>
      <td class="row-actions">${renderSectionActionMenu(row)}</td>
    </tr>`;
  }

  function renderInspector(row: TaskGridRow | undefined): string {
    if (!row) {
      return `<div class="diagnostic info">${escapeHtml(labels.noTaskSelected)}</div>`;
    }
    return `<div class="inspector">
      <label class="wide rich-label-editor">${escapeHtml(labels.taskLabelEditor)}
        ${renderTaskLabelTextarea(row)}
        <span class="field-helper">${escapeHtml(labels.taskLabelEditorHelp)}</span>
      </label>
      <label>${escapeHtml(labels.section)}
        ${renderSectionEditable(row)}
      </label>
      <label>${escapeHtml(labels.sourceOrder)}
        <input value="${escapeHtml(String(row.sourceOrder))}" disabled>
      </label>
      <label>${escapeHtml(labels.id)}
        ${renderEditable(row, "update-task-id", "id", row.id ?? "")}
      </label>
      <label>${escapeHtml(labels.start)}
        ${renderEditable(row, "update-task-start", "start", row.start ?? "", undefined, false, true)}
      </label>
      <label>${escapeHtml(labels.end)}
        ${renderEditable(row, "update-task-end", "end", row.end ?? "", undefined, false, true)}
      </label>
      <label>${escapeHtml(labels.duration)}
        ${renderEditable(row, "update-task-duration", "duration", row.duration ?? "", undefined, false, true)}
      </label>
      <div class="wide field-block"><span>${escapeHtml(labels.tags)}</span>
        ${renderEditable(row, "update-task-tags", "tags", row.tags.join(" "))}
        ${renderTaskTagToggles(row)}
      </div>
      <label class="wide">${escapeHtml(labels.dependencies)}
        ${renderEditable(row, "update-task-dependencies", "dependencies", row.dependencies.join(" "), row.id, true)}
      </label>
      <label class="wide">${escapeHtml(labels.until)}
        ${renderEditable(row, "update-task-until", "until", row.until ?? "", row.id, true)}
      </label>
      ${renderDeleteTaskButton(row, "wide")}
    </div>`;
  }

  function renderTaskLabelTextarea(row: TaskGridRow): string {
    const value = row.sourceLabelRaw || row.displayLabel;
    if (!allowStructuredEditing() || !row.editableFields.includes("label")) {
      return `<textarea disabled>${escapeHtml(value)}</textarea>`;
    }
    return `<textarea data-action="update-task-label" data-node-id="${escapeHtml(row.nodeId)}" data-field="label">${escapeHtml(value)}</textarea>`;
  }

  function renderSettingsEditor(): string {
    const settings = state.semantic?.settings;
    return `<div class="inspector">
      <label class="wide">${escapeHtml(labels.ganttTitle)}
        ${renderSettingEditable("title", settings?.title ?? "")}
      </label>
      <label>${escapeHtml(labels.accTitle)}
        ${renderSettingEditable("accTitle", settings?.accTitle ?? "")}
      </label>
      <label>${escapeHtml(labels.accDescr)}
        ${renderSettingEditable("accDescr", settings?.accDescr ?? "")}
      </label>
      <label>${escapeHtml(labels.dateFormat)}
        ${renderSettingEditable("dateFormat", settings?.dateFormat ?? "")}
      </label>
      <label>${escapeHtml(labels.axisFormat)}
        ${renderSettingEditable("axisFormat", settings?.axisFormat ?? "")}
      </label>
      <label>${escapeHtml(labels.tickInterval)}
        ${renderSettingEditable("tickInterval", settings?.tickInterval ?? "", tickIntervalOptions)}
      </label>
      <label>${escapeHtml(labels.weekday)}
        ${renderSettingSelect("weekday", settings?.weekday ?? "", weekdayOptions)}
      </label>
      <label>${escapeHtml(labels.weekend)}
        ${renderSettingSelect("weekend", settings?.weekend ?? "", weekendOptions)}
      </label>
      <label class="wide">${escapeHtml(labels.includes)}
        ${renderArraySettingEditable("includes", settings?.includes ?? [], labels.includesPlaceholder)}
      </label>
      <label class="wide">${escapeHtml(labels.excludes)}
        ${renderArraySettingEditable("excludes", settings?.excludes ?? [], labels.excludesPlaceholder)}
      </label>
      <label class="wide">${escapeHtml(labels.sort)}
        ${renderSortSelect()}
      </label>
      <label>${escapeHtml(labels.todayMarker)}
        ${renderSettingEditable("todayMarker", settings?.todayMarker ?? "")}
      </label>
      <label class="checkbox-label">
        ${renderBooleanSettingEditable("inclusiveEndDates", settings?.inclusiveEndDates === true)}
        <span>${escapeHtml(labels.inclusiveEndDates)}</span>
      </label>
    </div>`;
  }

  function renderSettingEditable(key: string, value: string, options: string[] = []): string {
    const optionButtons = renderInlineOptionButtons(options, {
      targetAction: "update-setting",
      settingKey: key,
      mode: "replace"
    });
    const placeholder = placeholderForSetting(key);
    const placeholderAttribute = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : "";
    if (!allowStructuredEditing()) {
      return `<input value="${escapeHtml(value)}"${placeholderAttribute} disabled>${optionButtons}`;
    }
    return `<input data-action="update-setting" data-setting-key="${escapeHtml(key)}" value="${escapeHtml(value)}"${placeholderAttribute}>${optionButtons}`;
  }

  function placeholderForSetting(key: string): string {
    if (key === "axisFormat") {
      return "%Y-%m-%d";
    }
    if (key === "tickInterval") {
      return "1week";
    }
    if (key === "todayMarker") {
      return "stroke-width:2px,stroke:#f00";
    }
    return "";
  }

  function renderSettingSelect(key: string, value: string, options: string[]): string {
    const renderedOptions = [
      `<option value=""></option>`,
      ...options.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`)
    ].join("");
    if (!allowStructuredEditing()) {
      return `<select disabled>${renderedOptions}</select>`;
    }
    return `<select data-action="update-setting" data-setting-key="${escapeHtml(key)}">${renderedOptions}</select>`;
  }

  function renderBooleanSettingEditable(key: string, checked: boolean): string {
    const checkedAttribute = checked ? " checked" : "";
    if (!allowStructuredEditing()) {
      return `<input type="checkbox"${checkedAttribute} disabled>`;
    }
    return `<input type="checkbox" data-action="update-setting" data-setting-key="${escapeHtml(key)}"${checkedAttribute}>`;
  }

  function renderArraySettingEditable(key: string, values: string[], placeholder: string): string {
    const value = values.join("\n");
    const placeholderAttribute = ` placeholder="${escapeHtml(placeholder)}"`;
    if (!allowStructuredEditing()) {
      return `<textarea class="setting-list"${placeholderAttribute} disabled>${escapeHtml(value)}</textarea>`;
    }
    return `<textarea class="setting-list" data-action="update-setting" data-setting-key="${escapeHtml(key)}"${placeholderAttribute}>${escapeHtml(value)}</textarea>`;
  }

  function renderInlineOptionButtons(
    options: string[],
    target: { targetAction: string; settingKey?: string; nodeId?: string; mode: "replace" | "append-unique" }
  ): string {
    if (options.length === 0 || !allowStructuredEditing()) {
      return "";
    }
    const settingAttribute = target.settingKey ? ` data-setting-key="${escapeHtml(target.settingKey)}"` : "";
    const nodeAttribute = target.nodeId ? ` data-node-id="${escapeHtml(target.nodeId)}"` : "";
    return `<div class="inline-options">${options.map((option) => `<button class="option-chip" type="button" data-action="apply-input-option" data-target-action="${escapeHtml(target.targetAction)}"${settingAttribute}${nodeAttribute} data-option-mode="${escapeHtml(target.mode)}" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")}</div>`;
  }

  function renderDependencyOptionButtons(
    options: DependencyOption[],
    target: { targetAction: string; nodeId: string; mode: "replace" | "append-unique" }
  ): string {
    if (options.length === 0 || !allowStructuredEditing()) {
      return "";
    }
    const nodeAttribute = ` data-node-id="${escapeHtml(target.nodeId)}"`;
    const pickerId = `dependency-picker-${target.targetAction}-${target.nodeId}`;
    const optionButtons = options.map((option, optionIndex) => {
      const title = `${option.id} - ${option.label}${option.sectionLabel ? ` (${option.sectionLabel})` : ""}`;
      const section = option.sectionLabel ? `<span class="option-section">(${escapeHtml(option.sectionLabel)})</span>` : "";
      const searchText = `${option.id} ${option.label} ${option.sectionLabel}`.toLowerCase();
      return `<button id="${escapeHtml(`${pickerId}-option-${optionIndex}`)}" class="option-chip dependency-option" type="button" role="option" tabindex="-1" title="${escapeHtml(title)}" data-action="apply-input-option" data-target-action="${escapeHtml(target.targetAction)}"${nodeAttribute} data-option-mode="${escapeHtml(target.mode)}" data-value="${escapeHtml(option.id)}" data-search="${escapeHtml(searchText)}"><span class="option-id">${escapeHtml(option.id)}</span><span class="option-label">${escapeHtml(option.label)}</span>${section}</button>`;
    }).join("");
    return `<div id="${escapeHtml(pickerId)}" class="dependency-picker" data-review-id="${escapeHtml(pickerId)}">
      <input class="dependency-search" data-review-id="dependency-search-${escapeHtml(target.targetAction)}-${escapeHtml(target.nodeId)}" type="search" placeholder="${escapeHtml(labels.dependencySearchPlaceholder)}" aria-label="${escapeHtml(labels.dependencySearchPlaceholder)}" aria-controls="${escapeHtml(`${pickerId}-options`)}" aria-activedescendant="">
      <div id="${escapeHtml(`${pickerId}-options`)}" class="inline-options" role="listbox">${optionButtons}</div>
      <div class="dependency-empty" data-dependency-empty hidden>${escapeHtml(labels.dependencyNoMatches)}</div>
    </div>`;
  }

  function renderTaskTagToggles(row: TaskGridRow): string {
    if (!allowStructuredEditing() || !row.editableFields.includes("tags")) {
      return "";
    }
    const currentTags = row.tags.join(" ");
    const buttons = TASK_TAG_OPTIONS.map((tag) => {
      const pressed = row.tags.includes(tag);
      const title = labels.tagToggle.replace("{0}", tag);
      return `<button class="chip tag-toggle" type="button" data-action="toggle-task-tag" data-node-id="${escapeHtml(row.nodeId)}" data-tag="${escapeHtml(tag)}" aria-pressed="${pressed ? "true" : "false"}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${escapeHtml(tag)}</button>`;
    }).join("");
    return `<div class="chips tag-toggle-group" data-current-tags="${escapeHtml(currentTags)}">${buttons}</div>`;
  }

  function renderEditable(
    row: TaskGridRow,
    action: string,
    field: TaskGridField,
    value: string,
    excludeTaskId?: string,
    showOptions = false,
    showHelper = false
  ): string {
    if (!allowStructuredEditing() || !row.editableFields.includes(field)) {
      return field === "id" ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
    }
    const selectableDependencyOptions = excludeTaskId
      ? dependencyOptions.filter((option) => option.id !== excludeTaskId)
      : dependencyOptions;
    const optionButtons = showOptions && canShowDependencyOptions(row, field)
      ? renderDependencyOptionButtons(selectableDependencyOptions, {
        targetAction: action,
        nodeId: row.nodeId,
        mode: field === "dependencies" ? "append-unique" : "replace"
      })
      : showHelper && field === "duration"
      ? renderInlineOptionButtons(["1d", "1w", "1month"], {
        targetAction: action,
        nodeId: row.nodeId,
        mode: "replace"
      })
      : "";
    const placeholder = placeholderForField(field);
    const helper = showHelper ? helperForField(row, field) : "";
    const warning = fieldWarning(row, field, value);
    const title = titleForField(field, placeholder, warning);
    const classAttribute = warning ? ` class="field-error"` : "";
    const invalidAttribute = warning ? ` aria-invalid="true"` : "";
    const placeholderAttribute = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : "";
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const describedBy = showHelper && (helper || warning) ? ` aria-describedby="${escapeHtml(`${row.nodeId}-${field}-help`)}"` : "";
    const input = `<input${classAttribute} data-action="${escapeHtml(action)}" data-node-id="${escapeHtml(row.nodeId)}" data-field="${escapeHtml(field)}" value="${escapeHtml(value)}"${placeholderAttribute}${titleAttribute}${invalidAttribute}${describedBy}>`;
    const editor = field === "start" || field === "end"
      ? `<span class="date-field">${input}${renderDatePickerControl(row, action, field, value)}</span>`
      : input;
    return `${editor}${renderFieldMessages(row, field, helper, warning)}${optionButtons}`;
  }

  function renderDatePickerControl(row: TaskGridRow, action: string, field: TaskGridField, value: string): string {
    const isoValue = dateLiteralToIso(value, state.semantic?.settings.dateFormat);
    const dateValueAttribute = isoValue ? ` value="${escapeHtml(isoValue)}"` : "";
    const dateFormatAttribute = ` data-date-format="${escapeHtml(state.semantic?.settings.dateFormat?.trim() || "YYYY-MM-DD")}"`;
    return `<span class="date-picker-wrap">
      <button class="icon-button date-picker-button" type="button" data-action="open-date-picker" data-target-action="${escapeHtml(action)}" data-node-id="${escapeHtml(row.nodeId)}" data-field="${escapeHtml(field)}"${dateFormatAttribute} aria-label="${escapeHtml(labels.datePicker)}" title="${escapeHtml(labels.datePicker)}">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path></svg>
      </button>
      <input class="native-date-picker" type="date" tabindex="-1" aria-label="${escapeHtml(labels.datePicker)}" title="${escapeHtml(labels.datePicker)}" data-action="pick-date" data-target-action="${escapeHtml(action)}" data-node-id="${escapeHtml(row.nodeId)}" data-field="${escapeHtml(field)}"${dateFormatAttribute}${dateValueAttribute}>
    </span>`;
  }

  function placeholderForField(field: TaskGridField): string {
    if (field === "start" || field === "end") {
      return exampleForDateFormat(state.semantic?.settings.dateFormat);
    }
    if (field === "duration") {
      return "3d";
    }
    if (field === "dependencies") {
      return "id1 id2";
    }
    if (field === "until") {
      return "id1";
    }
    return "";
  }

  function helperForField(row: TaskGridRow, field: TaskGridField): string {
    if (field === "start" || field === "end") {
      const dateHelp = labels.dateInputHelp.replace("{0}", exampleForDateFormat(state.semantic?.settings.dateFormat));
      if (field === "end" && row.duration) {
        return `${dateHelp} ${labels.endReplacesDurationHelp}`;
      }
      return dateHelp;
    }
    if (field === "duration") {
      if (row.end) {
        return `${labels.durationInputHelp} ${labels.durationReplacesEndHelp}`;
      }
      return labels.durationInputHelp;
    }
    return "";
  }

  function renderFieldMessages(row: TaskGridRow, field: TaskGridField, helper: string, warning: string): string {
    if (!helper && !warning) {
      return "";
    }
    const id = `${row.nodeId}-${field}-help`;
    return `<div id="${escapeHtml(id)}">${warning ? `<div class="field-warning">${escapeHtml(warning)}</div>` : ""}${helper ? `<div class="field-helper">${escapeHtml(helper)}</div>` : ""}</div>`;
  }

  function canShowDependencyOptions(row: TaskGridRow, field: TaskGridField): boolean {
    if (field === "dependencies") {
      return row.dependencies.length > 0 || taskMetadataSlotCount(row) < 3;
    }
    if (field === "until") {
      return Boolean(row.until) || taskMetadataSlotCount(row) < 3;
    }
    return false;
  }

  function taskMetadataSlotCount(row: TaskGridRow): number {
    return [
      row.id,
      row.start,
      row.end,
      row.duration,
      row.dependencies.length > 0 ? row.dependencies.join(" ") : undefined,
      row.until
    ].filter((value) => value !== undefined && value !== "").length;
  }

  function titleForField(field: TaskGridField, placeholder: string, warning: string): string {
    if (warning) {
      return warning;
    }
    if (field === "start" || field === "end") {
      return labels.dateInputHelp.replace("{0}", placeholder);
    }
    if (field === "duration") {
      return labels.durationInputHelp;
    }
    return "";
  }

  function fieldWarning(row: TaskGridRow, field: TaskGridField, value: string): string {
    if (dateFieldHasMismatch(row, field, value)) {
      return labels.dateInputWarning;
    }
    if (field === "end" && dateLiteralIsBefore(row.end, row.start)) {
      return labels.dateRangeWarning;
    }
    return "";
  }

  function dateFieldHasMismatch(row: TaskGridRow, field: TaskGridField, value: string): boolean {
    if ((field !== "start" && field !== "end") || value.trim() === "") {
      return false;
    }
    return row.diagnostics.some((diagnostic) => {
      return diagnostic.code === "DATE_FORMAT_MISMATCH" && diagnostic.primaryRaw === value;
    });
  }

  function dateLiteralIsBefore(left: string | undefined, right: string | undefined): boolean {
    if (!left || !right || !/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right)) {
      return false;
    }
    return left < right;
  }

  function exampleForDateFormat(format: string | undefined): string {
    const source = format?.trim() || "YYYY-MM-DD";
    return source
      .replace(/YYYY/g, "2026")
      .replace(/YY/g, "26")
      .replace(/MM/g, "05")
      .replace(/DD/g, "04");
  }

  function dateLiteralToIso(value: string, format: string | undefined): string | undefined {
    const source = value.trim();
    const pattern = format?.trim() || "YYYY-MM-DD";
    const tokens = [...pattern.matchAll(/YYYY|YY|MM|DD/g)];
    if (source === "" || tokens.length === 0) {
      return undefined;
    }
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexSource = escaped
      .replace(/YYYY/g, "(\\d{4})")
      .replace(/YY/g, "(\\d{2})")
      .replace(/MM/g, "(\\d{2})")
      .replace(/DD/g, "(\\d{2})");
    const match = new RegExp(`^${regexSource}$`).exec(source);
    if (!match) {
      return undefined;
    }
    const parts: Record<string, string> = {};
    tokens.forEach((token, index) => {
      parts[token[0]] = match[index + 1] ?? "";
    });
    const year = parts.YYYY || (parts.YY ? `20${parts.YY}` : "");
    if (!year || !parts.MM || !parts.DD) {
      return undefined;
    }
    return `${year}-${parts.MM}-${parts.DD}`;
  }

  function renderSectionEditable(row: TaskGridRow): string {
    const value = row.sectionLabel || "(default)";
    if (!allowStructuredEditing() || row.sectionId === "__default__") {
      return `<input value="${escapeHtml(value)}" disabled>`;
    }
    return `<input data-action="update-section-label" data-section-id="${escapeHtml(row.sectionId)}" value="${escapeHtml(value)}">`;
  }

  function renderDeleteTaskButton(row: TaskGridRow, className = ""): string {
    if (!allowStructuredEditing() || row.editableFields.length === 0) {
      return "";
    }
    const classes = ["danger-button", className].filter(Boolean).join(" ");
    return `<button class="${escapeHtml(classes)}" type="button" data-action="request-delete-task" data-node-id="${escapeHtml(row.nodeId)}" data-confirm-message="${escapeHtml(labels.deleteTaskConfirm)}" aria-label="${escapeHtml(labels.deleteTask)}" title="${escapeHtml(labels.deleteTask)}">${trashIcon()}</button>`;
  }

  function renderTaskActionMenu(row: TaskGridRow): string {
    if (!allowStructuredEditing() || row.editableFields.length === 0) {
      return "";
    }
    const isOpen = row.nodeId === initialOpenRowActionMenuNodeId;
    return `<div class="row-action-menu-wrap${isOpen ? " open" : ""}">
      <button class="menu-button" type="button" data-review-id="row-action-menu-button-${escapeHtml(row.nodeId)}" data-action="toggle-row-action-menu" aria-haspopup="menu" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${escapeHtml(labels.actions)}" title="${escapeHtml(labels.actions)}">${moreIcon()}</button>
      <div class="row-action-menu" data-review-id="row-action-menu-${escapeHtml(row.nodeId)}" role="menu">
        <button class="menu-item" type="button" role="menuitem" data-action="add-task" data-node-id="${escapeHtml(row.nodeId)}" data-position="above">${escapeHtml(labels.addTaskAbove)}</button>
        <button class="menu-item" type="button" role="menuitem" data-action="add-task" data-node-id="${escapeHtml(row.nodeId)}">${escapeHtml(labels.addTaskBelow)}</button>
        <button class="menu-item" type="button" role="menuitem" data-action="add-task" data-section-id="${escapeHtml(row.sectionId)}" data-position="section-start">${escapeHtml(labels.addTaskAtSectionTop)}</button>
        <button class="menu-item" type="button" role="menuitem" data-action="duplicate-task" data-node-id="${escapeHtml(row.nodeId)}">${escapeHtml(labels.duplicateTask)}</button>
        ${renderTaskMoveMenuItems(row)}
        ${renderTaskMoveToSectionMenuItems(row)}
        ${renderSectionMoveMenuItems(row.sectionId)}
        ${renderSectionAddMenuItems(row.sectionId)}
        ${row.sectionId === "__default__" ? "" : `<button class="menu-item danger" type="button" role="menuitem" data-action="request-delete-section" data-section-id="${escapeHtml(row.sectionId)}" data-confirm-message="${escapeHtml(labels.deleteSectionConfirm)}">${escapeHtml(labels.deleteSection)}</button>`}
        <button class="menu-item danger" type="button" role="menuitem" data-action="request-delete-task" data-node-id="${escapeHtml(row.nodeId)}" data-confirm-message="${escapeHtml(labels.deleteTaskConfirm)}">${escapeHtml(labels.deleteTask)}</button>
      </div>
    </div>`;
  }

  function renderSectionActionMenu(row: TaskGridRow): string {
    if (!allowStructuredEditing() || row.kind !== "section" || row.sectionId === "__default__") {
      return "";
    }
    const isOpen = row.nodeId === initialOpenRowActionMenuNodeId;
    return `<div class="row-action-menu-wrap${isOpen ? " open" : ""}">
      <button class="menu-button" type="button" data-review-id="row-action-menu-button-${escapeHtml(row.nodeId)}" data-action="toggle-row-action-menu" aria-haspopup="menu" aria-expanded="${isOpen ? "true" : "false"}" aria-label="${escapeHtml(labels.actions)}" title="${escapeHtml(labels.actions)}">${moreIcon()}</button>
      <div class="row-action-menu" data-review-id="row-action-menu-${escapeHtml(row.nodeId)}" role="menu">
        <button class="menu-item" type="button" role="menuitem" data-action="add-task" data-section-id="${escapeHtml(row.sectionId)}" data-position="section-start">${escapeHtml(labels.addTask)}</button>
        ${renderSectionMoveMenuItems(row.sectionId)}
        ${renderSectionAddMenuItems(row.sectionId)}
        <button class="menu-item danger" type="button" role="menuitem" data-action="request-delete-section" data-section-id="${escapeHtml(row.sectionId)}" data-confirm-message="${escapeHtml(labels.deleteSectionConfirm)}">${escapeHtml(labels.deleteSection)}</button>
      </div>
    </div>`;
  }

  function renderTaskMoveMenuItems(row: TaskGridRow): string {
    if (state.grid.isViewOnlyOrdering) {
      return "";
    }
    const nodeAttribute = ` data-node-id="${escapeHtml(row.nodeId)}"`;
    return `<button class="menu-item" type="button" role="menuitem" data-action="move-task"${nodeAttribute} data-direction="up">${escapeHtml(labels.moveTaskUp)}</button>
        <button class="menu-item" type="button" role="menuitem" data-action="move-task"${nodeAttribute} data-direction="down">${escapeHtml(labels.moveTaskDown)}</button>`;
  }

  function renderTaskMoveToSectionMenuItems(row: TaskGridRow): string {
    if (state.grid.isViewOnlyOrdering) {
      return "";
    }
    return sectionOptions
      .filter((section) => section.id !== row.sectionId)
      .map((section) => {
        const label = labels.moveTaskToSection.replace("{0}", section.label);
        return `<button class="menu-item" type="button" role="menuitem" data-action="move-task-to-section" data-node-id="${escapeHtml(row.nodeId)}" data-section-id="${escapeHtml(section.id)}">${escapeHtml(label)}</button>`;
      })
      .join("");
  }

  function renderSectionMoveMenuItems(sectionId: string): string {
    if (sectionId === "__default__" || state.grid.isViewOnlyOrdering) {
      return "";
    }
    const sectionAttribute = ` data-section-id="${escapeHtml(sectionId)}"`;
    return `<button class="menu-item" type="button" role="menuitem" data-action="move-section"${sectionAttribute} data-direction="up">${escapeHtml(labels.moveSectionUp)}</button>
        <button class="menu-item" type="button" role="menuitem" data-action="move-section"${sectionAttribute} data-direction="down">${escapeHtml(labels.moveSectionDown)}</button>`;
  }

  function renderSectionAddMenuItems(sectionId: string): string {
    if (sectionId === "__default__") {
      return "";
    }
    return `<button class="menu-item" type="button" role="menuitem" data-action="add-section" data-section-id="${escapeHtml(sectionId)}">${escapeHtml(labels.addSectionBelow)}</button>`;
  }

  function renderAddTaskButton(sectionId: string | undefined): string {
    if (!allowStructuredEditing()) {
      return "";
    }
    const sectionAttribute = sectionId ? ` data-section-id="${escapeHtml(sectionId)}"` : "";
    return `<button class="primary-button" type="button" data-action="add-task"${sectionAttribute}>${escapeHtml(labels.addTask)}</button>`;
  }

  function renderHistoryControls(): string {
    if (!allowEditing) {
      return "";
    }
    return `<div class="history-controls">
      <button class="icon-button" type="button" data-action="undo" aria-label="${escapeHtml(labels.undo)}" title="${escapeHtml(labels.undo)}">${undoIcon()}</button>
      <button class="icon-button" type="button" data-action="redo" aria-label="${escapeHtml(labels.redo)}" title="${escapeHtml(labels.redo)}">${redoIcon()}</button>
    </div>`;
  }

  function renderAddSectionButton(): string {
    if (!allowStructuredEditing()) {
      return "";
    }
    return `<button class="secondary-button" type="button" data-action="add-section">${escapeHtml(labels.addSection)}</button>`;
  }

  function allowStructuredEditing(): boolean {
    return allowEditing && state.mode === "structured";
  }

  function renderEditingBanner(): string {
    if (state.mode === "fallback") {
      return `<div class="banner fallback">${escapeHtml(labels.fallbackEditing)}</div>`;
    }
    if (!state.previewSource) {
      return `<div class="banner">${escapeHtml(labels.limitedEditing)}</div>`;
    }
    return "";
  }

  function formatRange(range: { start: { line: number; column: number }; end: { line: number; column: number } }): string {
    return range.start.line === range.end.line
      ? `line ${range.start.line}, columns ${range.start.column}-${range.end.column}`
      : `lines ${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
  }

  function impactForDiagnostic(severity: "error" | "warning" | "info"): string {
    if (state.mode === "fallback" || severity === "error") {
      return labels.fallbackImpact;
    }
    if (!state.previewSource) {
      return labels.limitedEditingImpact;
    }
    return labels.diagnosticImpact;
  }

  function renderSortSelect(): string {
    const value = state.grid.sort ? `${state.grid.sort.field}:${state.grid.sort.direction}` : "";
    const options = [
      ["", labels.noSort],
      ["sourceOrder:asc", labels.sourceOrder],
      ["label:asc", `${labels.task} A-Z`],
      ["label:desc", `${labels.task} Z-A`],
      ["section:asc", `${labels.section} A-Z`],
      ["start:asc", `${labels.start} A-Z`],
      ["duration:asc", `${labels.duration} A-Z`]
    ];
    return `<select data-action="update-grid-sort">${options.map(([optionValue, label]) => {
      const selected = optionValue === value ? " selected" : "";
      return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("")}</select>`;
  }

  function renderSeveritySelect(): string {
    const value = state.grid.filter?.severity ?? "";
    const options = [
      ["", labels.allSeverities],
      ["error", "error"],
      ["warning", "warning"],
      ["info", "info"]
    ];
    return `<select data-action="update-grid-filter-severity">${options.map(([optionValue, label]) => {
      const selected = optionValue === value ? " selected" : "";
      return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("")}</select>`;
  }
}

function uniqueDependencyOptions(rows: TaskGridRow[]): DependencyOption[] {
  const seen = new Set<string>();
  const options: DependencyOption[] = [];
  for (const row of rows) {
    if (row.id && !seen.has(row.id)) {
      seen.add(row.id);
      options.push({
        id: row.id,
        label: row.displayLabel || row.label,
        sectionLabel: row.sectionLabel
      });
    }
  }
  return options;
}

function uniqueSectionOptions(state: EditorState): SectionOption[] {
  const seen = new Set<string>();
  const sections = state.semantic?.sections ?? [];
  return sections
    .filter((section) => {
      if (seen.has(section.id)) {
        return false;
      }
      seen.add(section.id);
      return true;
    })
    .map((section) => ({
      id: section.id,
      label: section.label || "(default)"
    }));
}

function trashIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"></path>
    <path d="M8 6V4h8v2"></path>
    <path d="M19 6l-1 14H6L5 6"></path>
    <path d="M10 11v5"></path>
    <path d="M14 11v5"></path>
  </svg>`;
}

function moreIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="12" cy="5" r="1"></circle>
    <circle cx="12" cy="19" r="1"></circle>
  </svg>`;
}

function undoIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 14 4 9l5-5"></path>
    <path d="M4 9h10a6 6 0 1 1 0 12h-2"></path>
  </svg>`;
}

function redoIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15 14 5-5-5-5"></path>
    <path d="M20 9H10a6 6 0 1 0 0 12h2"></path>
  </svg>`;
}

function summarizeHostCompatibility(state: EditorState, labels: TaskGridWebviewLabels, mermaidRuntimeVersion: string): {
  warningCount: number;
  retainedSourceItemCount: number;
  profiles: HostCompatibilityProfileSummary[];
} {
  const hostSensitiveDiagnostics = state.diagnostics.filter((diagnostic) => diagnostic.code === "HOST_VERSION_SENSITIVE_SYNTAX");
  const topAxisDiagnostics = state.diagnostics.filter((diagnostic) => diagnostic.code === "TOP_AXIS_PREVIEW_UNSUPPORTED");
  const retainedSourceItems = state.advancedSourceItems.filter((item) => {
    return item.kind === "ClickStmt" ||
      item.kind === "FrontmatterBlock" ||
      item.kind === "DirectiveBlock";
  });
  const retainedClickItems = retainedSourceItems.filter((item) => item.kind === "ClickStmt");
  const retainedConfigItems = retainedSourceItems.filter((item) => item.kind === "FrontmatterBlock" || item.kind === "DirectiveBlock");
  const genericWarnings = [
    ...hostSensitiveDiagnostics.map((diagnostic) => diagnostic.summary ?? diagnostic.messageKey),
    ...topAxisDiagnostics.map((diagnostic) => diagnostic.summary ?? diagnostic.messageKey)
  ];
  const profileWarnings = (profileId: HostCompatibilityProfileId): string[] => {
    const warnings = [...genericWarnings];
    if (profileId !== "mermaid-latest" && retainedClickItems.length > 0) {
      warnings.push(labels.hostCompatibilityWarningClickCall);
    }
    if (profileId !== "mermaid-latest" && retainedConfigItems.length > 0) {
      warnings.push(labels.hostCompatibilityWarningConfig);
    }
    if (profileId === "gitlab") {
      warnings.push(labels.hostCompatibilityWarningGitLab);
    }
    if (profileId === "github") {
      warnings.push(labels.hostCompatibilityWarningGitHub);
    }
    if (profileId === "obsidian") {
      warnings.push(labels.hostCompatibilityWarningObsidian);
    }
    return Array.from(new Set(warnings));
  };
  const profiles: Array<{ id: HostCompatibilityProfileId; label: string; runtimeLabel: string }> = [
    {
      id: "mermaid-latest",
      label: labels.hostCompatibilityProfileMermaidLatest,
      runtimeLabel: labels.mermaidRuntimeBundledVersion.replace("{0}", mermaidRuntimeVersion)
    },
    { id: "github", label: labels.hostCompatibilityProfileGitHub, runtimeLabel: labels.hostCompatibilityRuntimeGitHub },
    { id: "gitlab", label: labels.hostCompatibilityProfileGitLab, runtimeLabel: labels.hostCompatibilityRuntimeGitLab },
    { id: "obsidian", label: labels.hostCompatibilityProfileObsidian, runtimeLabel: labels.hostCompatibilityRuntimeObsidian }
  ];
  return {
    warningCount: hostSensitiveDiagnostics.length,
    retainedSourceItemCount: retainedSourceItems.length,
    profiles: profiles.map((profile) => {
      const warnings = profileWarnings(profile.id);
      return {
        ...profile,
        status: warnings.length > 0 ? "warning" : "ok",
        warnings
      };
    })
  };
}

function normalizeInitialPreviewZoom(value: TaskGridWebviewOptions["initialPreviewZoom"]): NonNullable<TaskGridWebviewOptions["initialPreviewZoom"]> {
  return value === "fill" ||
    value === "0.75" ||
    value === "1" ||
    value === "1.25" ||
    value === "1.5" ||
    value === "2"
    ? value
    : "fit";
}

function hasNonAsciiText(value: string | undefined): boolean {
  return Boolean(value && /[^\x00-\x7F]/.test(value));
}

function renderPreviewStatusCard(
  kind: "blocked" | "failed",
  title: string,
  message: string,
  labels: Pick<TaskGridWebviewLabels, "previewOpenDiagnostics" | "previewOpenAdvanced" | "previewOpenSource">
): string {
  const advancedButton = kind === "blocked"
    ? `<button type="button" data-preview-detail-tab="advanced">${escapeHtml(labels.previewOpenAdvanced)}</button>`
    : "";
  return `<div class="preview-status-card ${kind === "failed" ? "preview-render-failed" : "preview-blocked"}" data-review-id="preview-status-card" data-preview-status="${kind}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
    <div class="preview-status-actions">
      <button type="button" data-preview-detail-tab="diagnostics">${escapeHtml(labels.previewOpenDiagnostics)}</button>
      ${advancedButton}
      <button type="button" data-preview-detail-tab="source">${escapeHtml(labels.previewOpenSource)}</button>
    </div>
  </div>`;
}

function renderScript(
  nonce: string,
  allowEditing: boolean,
  mermaidModuleUri: string | undefined,
  previewSource: string | undefined,
  previewLabels: {
    renderFailed: string;
    renderFailedTitle: string;
    openDiagnostics: string;
    openAdvanced: string;
    openSource: string;
    webviewErrorTitle: string;
    webviewErrorMessage: string;
    webviewErrorOpenDiagnostics: string;
    webviewErrorOpenSource: string;
    webviewErrorDismiss: string;
  },
  mermaidRuntimeVersion: string,
  shouldOpenDetails: boolean,
  initialDetailTab: string,
  forceInitialDetailTab: boolean,
  preserveInitialRowActionMenu: boolean,
  enableUiReviewSnapshot: boolean,
  enableTestWebviewOperations: boolean,
  testWebviewGeneration: number | undefined,
  previewScheduleEditModel: PreviewScheduleEditModel,
  initialPreviewEditMode: boolean,
  initialPreviewEditSelectedNodeId: string | undefined,
  hostBridgeScriptOption: string | undefined
): string {
  const sourceLiteral = jsonForScript(previewSource ?? "");
  const previewLabelsLiteral = JSON.stringify(previewLabels)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const mermaidRuntimeVersionLiteral = jsonForScript(mermaidRuntimeVersion);
  const mermaidModuleLiteral = mermaidModuleUri ? jsonForScript(mermaidModuleUri) : "";
  const hostBridgeScript = renderHostBridgeScript(hostBridgeScriptOption);
  const initialDetailsLiteral = shouldOpenDetails ? "true" : "false";
  const initialDetailTabLiteral = jsonForScript(initialDetailTab);
  const forceInitialDetailTabLiteral = forceInitialDetailTab ? "true" : "false";
  const preserveInitialRowActionMenuLiteral = preserveInitialRowActionMenu ? "true" : "false";
  const enableUiReviewSnapshotLiteral = enableUiReviewSnapshot ? "true" : "false";
  const initialPreviewEditModeLiteral = initialPreviewEditMode ? "true" : "false";
  const initialPreviewEditSelectedNodeIdLiteral = jsonForScript(initialPreviewEditSelectedNodeId ?? "");
  const previewScheduleEditModelLiteral = JSON.stringify(previewScheduleEditModel)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const importBlock = mermaidModuleUri && previewSource
    ? `import mermaid from ${mermaidModuleLiteral};
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    const previewRenderRuntime = { runtimeType: "bundled", runtimeVersion: ${mermaidRuntimeVersionLiteral}, securityLevel: "strict" };
    vscode.postMessage({ type: "preview-render-started", ...previewRenderRuntime });
    try {
      const rendered = await mermaid.render("mermaid-gantt-preview", ${sourceLiteral});
      const target = document.getElementById("mermaid-preview");
      if (target) {
        target.innerHTML = rendered.svg;
        setPreviewZoom(activePreviewZoom());
        restorePreviewScroll();
      }
      vscode.postMessage({ type: "preview-render-succeeded", ...previewRenderRuntime });
      scheduleUiReviewSnapshot("preview-render-succeeded");
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      const target = document.getElementById("mermaid-preview");
      if (target) {
        target.innerHTML = renderPreviewStatusCard("failed", previewUiLabels.renderFailedTitle, previewUiLabels.renderFailed + message);
      }
      vscode.postMessage({ type: "preview-render-failed", message, ...previewRenderRuntime });
      scheduleUiReviewSnapshot("preview-render-failed");
    }`
    : "";
  const editingBlock = renderEditingMessageHandlers(allowEditing);
  const testWebviewOperationBlock = renderTestWebviewOperationBlock(enableTestWebviewOperations, testWebviewGeneration);
  return `<script type="module" nonce="${escapeHtml(nonce)}">
    ${hostBridgeScript}
    const shell = document.querySelector(".shell");
    const detailsToggle = document.getElementById("details-toggle");
    const detailsClose = document.getElementById("details-close");
    const detailsDrawer = document.getElementById("details-drawer");
    const detailTabs = Array.from(document.querySelectorAll("[data-detail-tab]"));
    const detailPanels = Array.from(document.querySelectorAll("[data-detail-panel]"));
    const webviewErrorBoundary = document.getElementById("webview-error-boundary");
    const webviewErrorSummary = document.getElementById("webview-error-summary");
    const layoutOptions = Array.from(document.querySelectorAll("[data-layout-option]"));
    const hostProfileOptions = Array.from(document.querySelectorAll("[data-host-profile-option]"));
    const hostProfileCards = Array.from(document.querySelectorAll("[data-host-profile-card]"));
    const hostProfileActiveLabel = document.querySelector("[data-host-profile-active-label]");
    const previewTarget = document.getElementById("mermaid-preview");
    const previewFocusToggle = document.getElementById("preview-focus-toggle");
    const previewCollapseToggle = document.getElementById("preview-collapse-toggle");
    const previewZoomButtons = Array.from(document.querySelectorAll("[data-preview-zoom]"));
    const previewZoomValueButton = document.querySelector('[data-preview-zoom="reset"]');
    const previewZoomLevels = [0.75, 1, 1.25, 1.5, 2];
    const previewUiLabels = ${previewLabelsLiteral};
    const previewEditToggle = document.getElementById("preview-edit-toggle");
    const previewEditOverlay = document.getElementById("preview-edit-overlay");
    const previewEditTrack = document.querySelector("[data-review-id='preview-edit-track']");
    const previewEditStatus = document.getElementById("preview-edit-status");
    const previewEditAxis = document.querySelector(".preview-edit-axis");
    const previewEditTimelineRange = document.querySelector("[data-preview-edit-timeline-range]");
    const previewEditSelectedViewportButton = document.querySelector('[data-action="preview-edit-viewport"][data-value="selected"]');
    const previewEditGuideLine = document.getElementById("preview-edit-guide-line");
    const previewEditDragTooltip = document.getElementById("preview-edit-drag-tooltip");
    const previewMiniEditor = document.getElementById("preview-mini-editor");
    const previewMiniCalendar = document.getElementById("preview-mini-calendar");
    const previewScheduleEditModel = ${previewScheduleEditModelLiteral};
    let previewDragState = null;
    let previewPanState = null;
    let previewSpacePanActive = false;
    let previewScrollRestored = false;
    let detailsFocusReturnTarget = null;

    function showWebviewErrorBoundary(message, source) {
      const summary = String(message || "Unknown Webview error");
      if (isBenignWebviewError(summary)) {
        return;
      }
      if (webviewErrorSummary instanceof HTMLElement) {
        webviewErrorSummary.textContent = summary;
      }
      if (webviewErrorBoundary instanceof HTMLElement) {
        webviewErrorBoundary.hidden = false;
        shell?.classList.add("webview-error-open");
      }
      if (typeof vscode !== "undefined") {
        vscode.postMessage({
          type: "webview-error",
          source,
          message: summary
        });
      }
      scheduleUiReviewSnapshot("webview-error");
    }
    function isBenignWebviewError(message) {
      return message === "ResizeObserver loop completed with undelivered notifications." ||
        message === "ResizeObserver loop limit exceeded";
    }

    window.addEventListener("error", (event) => {
      showWebviewErrorBoundary(event.message || event.error, "window.error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      showWebviewErrorBoundary(reason, "unhandledrejection");
    });
    let previewScrollPersistTimer = 0;
    let previewMiniSelectedTaskId = "";
    let previewLastViewportAction = "initial";
    const previewMiniCalendarState = { field: "", monthIso: "" };
    function appendUniqueToken(currentValue, token) {
      const values = currentValue.split(/[,\\s]+/).map((value) => value.trim()).filter(Boolean);
      if (!values.includes(token)) {
        values.push(token);
      }
      return values.join(" ");
    }
    function dateFormatTokens(format) {
      const source = typeof format === "string" && format.trim() ? format.trim() : "YYYY-MM-DD";
      return {
        source,
        tokens: Array.from(source.matchAll(/YYYY|YY|MM|DD/g)).map((match) => match[0])
      };
    }
    function dateFormatParts(format) {
      const { source } = dateFormatTokens(format);
      const parts = [];
      const tokenRegex = /YYYY|YY|MM|DD/g;
      let index = 0;
      let match;
      while ((match = tokenRegex.exec(source)) !== null) {
        if (match.index > index) {
          parts.push({ type: "literal", value: source.slice(index, match.index) });
        }
        parts.push({ type: "token", value: match[0] });
        index = match.index + match[0].length;
      }
      if (index < source.length) {
        parts.push({ type: "literal", value: source.slice(index) });
      }
      return parts;
    }
    function formatDateForMermaid(isoDate, format) {
      const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(isoDate || "");
      if (!match) {
        return "";
      }
      const { source, tokens } = dateFormatTokens(format);
      const hasYear = tokens.includes("YYYY") || tokens.includes("YY");
      if (!hasYear || !tokens.includes("MM") || !tokens.includes("DD")) {
        return "";
      }
      return source
        .replace(/YYYY/g, match[1])
        .replace(/YY/g, match[1].slice(2))
        .replace(/MM/g, match[2])
        .replace(/DD/g, match[3]);
    }
    function dateLiteralToIsoDate(value, format) {
      const literal = (value || "").trim();
      if (literal === "") {
        return "";
      }
      const formatParts = dateFormatParts(format);
      if (formatParts.length === 0) {
        return "";
      }
      const dateParts = {};
      let cursor = 0;
      for (const part of formatParts) {
        if (part.type === "literal") {
          if (!literal.startsWith(part.value, cursor)) {
            return "";
          }
          cursor += part.value.length;
          continue;
        }
        const width = part.value === "YYYY" ? 4 : 2;
        const value = literal.slice(cursor, cursor + width);
        if (!new RegExp("^\\\\d{" + width + "}$").test(value)) {
          return "";
        }
        dateParts[part.value] = value;
        cursor += width;
      }
      if (cursor !== literal.length) {
        return "";
      }
      const year = dateParts.YYYY || (dateParts.YY ? "20" + dateParts.YY : "");
      return year && dateParts.MM && dateParts.DD ? year + "-" + dateParts.MM + "-" + dateParts.DD : "";
    }
    const storageKey = "mermaid-gantt-task-grid-details";
    const storedDetails = (() => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || "null");
      } catch {
        return null;
      }
    })();
    const defaultDetailsOpen = ${initialDetailsLiteral};
    const storedDetailsOpen = typeof storedDetails?.open === "boolean" ? storedDetails.open : false;
    const storedDetailsTab = typeof storedDetails?.tab === "string" ? storedDetails.tab : undefined;
    const defaultLayout = shell?.dataset.defaultLayout === "vertical" ? "vertical" : "horizontal";
    const defaultPreviewZoom = normalizePreviewZoom(previewTarget?.dataset.defaultPreviewZoom);
    const defaultPreviewCollapsed = shell?.dataset.defaultPreviewCollapsed === "true";
    const defaultPreviewFocused = shell?.dataset.defaultPreviewFocused === "true";
    const storedLayout = storedDetails?.layout === "vertical"
      ? "vertical"
      : storedDetails?.layout === "horizontal"
        ? "horizontal"
        : defaultLayout;
    const storedPreviewZoom = normalizePreviewZoom(storedDetails?.previewZoom ?? defaultPreviewZoom);
    const storedPreviewCollapsed = typeof storedDetails?.previewCollapsed === "boolean"
      ? storedDetails.previewCollapsed
      : defaultPreviewCollapsed;
    const storedPreviewFocused = typeof storedDetails?.previewFocused === "boolean"
      ? storedDetails.previewFocused
      : defaultPreviewFocused;
    const storedPreviewScrollLeft = Number.isFinite(storedDetails?.previewScrollLeft)
      ? Math.max(0, Math.round(storedDetails.previewScrollLeft))
      : 0;
    const storedPreviewScrollTop = Number.isFinite(storedDetails?.previewScrollTop)
      ? Math.max(0, Math.round(storedDetails.previewScrollTop))
      : 0;
    const storedHostProfile = typeof storedDetails?.hostProfile === "string" ? storedDetails.hostProfile : "mermaid-latest";
    const initialDetailsOpen = defaultDetailsOpen || storedDetailsOpen;
    const initialDetailsTab = ${forceInitialDetailTabLiteral} ? ${initialDetailTabLiteral} : storedDetailsTab ?? ${initialDetailTabLiteral};
    function activeLayout() {
      return shell?.classList.contains("layout-vertical") ? "vertical" : "horizontal";
    }
    function activePreviewZoom() {
      return previewTarget?.dataset.previewZoom || "fit";
    }
    function isPreviewCollapsed() {
      return shell?.classList.contains("preview-collapsed") ?? false;
    }
    function isPreviewFocused() {
      return shell?.classList.contains("preview-focused") ?? false;
    }
    function activePreviewScrollLeft() {
      return previewTarget instanceof HTMLElement ? previewTarget.scrollLeft : 0;
    }
    function activePreviewScrollTop() {
      return previewTarget instanceof HTMLElement ? previewTarget.scrollTop : 0;
    }
    function activeHostProfile() {
      const active = hostProfileOptions.find((option) => option instanceof HTMLElement && option.classList.contains("active"));
      return active instanceof HTMLElement ? active.dataset.hostProfileOption || "mermaid-latest" : "mermaid-latest";
    }
    function persistViewState(
      open,
      tab,
      layout,
      previewZoom = activePreviewZoom(),
      previewCollapsed = isPreviewCollapsed(),
      previewFocused = isPreviewFocused(),
      previewScrollLeft = activePreviewScrollLeft(),
      previewScrollTop = activePreviewScrollTop(),
      hostProfile = activeHostProfile()
    ) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ open, tab, layout, previewZoom, previewCollapsed, previewFocused, previewScrollLeft, previewScrollTop, hostProfile }));
      } catch {
        // Ignore webview storage failures; this state is presentation-only.
      }
    }
    function normalizePreviewZoom(value) {
      if (value === "fit" || value === "fill") {
        return value;
      }
      const numeric = Number(value);
      return previewZoomLevels.includes(numeric) ? String(numeric) : "fit";
    }
    function currentNumericPreviewZoom() {
      const current = activePreviewZoom();
      if (current === "fit" || current === "fill") {
        return 1;
      }
      const numeric = Number(current);
      return previewZoomLevels.includes(numeric) ? numeric : 1;
    }
    function setPreviewZoom(value) {
      const normalized = normalizePreviewZoom(value);
      const zoom = normalized === "fit"
        ? calculateFitPreviewZoom()
        : normalized === "fill"
          ? calculateFillPreviewZoom()
          : Number(normalized);
      if (previewTarget) {
        previewTarget.dataset.previewZoom = normalized;
        previewTarget.classList.toggle("zoom-fit", normalized === "fit");
      }
      applyPreviewSvgSize(zoom);
      clampPreviewScroll();
      updatePreviewZoomValue(zoom);
      for (const button of previewZoomButtons) {
        if (button instanceof HTMLElement) {
          const mode = button.dataset.previewZoom;
          button.setAttribute("aria-pressed", String(
            (mode === "fit" && normalized === "fit")
              || (mode === "fill" && normalized === "fill")
              || (mode === "reset" && normalized === "1")
          ));
        }
      }
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout(), normalized);
    }
    function maxPreviewScrollLeft() {
      return previewTarget instanceof HTMLElement ? Math.max(0, previewTarget.scrollWidth - previewTarget.clientWidth) : 0;
    }
    function maxPreviewScrollTop() {
      return previewTarget instanceof HTMLElement ? Math.max(0, previewTarget.scrollHeight - previewTarget.clientHeight) : 0;
    }
    function clampValue(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
    function clampPreviewScroll() {
      if (!(previewTarget instanceof HTMLElement)) {
        return;
      }
      previewTarget.scrollLeft = clampValue(previewTarget.scrollLeft, 0, maxPreviewScrollLeft());
      previewTarget.scrollTop = clampValue(previewTarget.scrollTop, 0, maxPreviewScrollTop());
    }
    function restorePreviewScroll() {
      if (!(previewTarget instanceof HTMLElement)) {
        return;
      }
      previewTarget.scrollLeft = clampValue(storedPreviewScrollLeft, 0, maxPreviewScrollLeft());
      previewTarget.scrollTop = clampValue(storedPreviewScrollTop, 0, maxPreviewScrollTop());
      previewScrollRestored = true;
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout());
    }
    function schedulePreviewScrollPersist() {
      if (!(previewTarget instanceof HTMLElement)) {
        return;
      }
      window.clearTimeout(previewScrollPersistTimer);
      previewScrollPersistTimer = window.setTimeout(() => {
        persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout());
        scheduleUiReviewSnapshot("preview-pan-scroll");
      }, 120);
    }
    function updatePreviewZoomValue(zoom) {
      if (!(previewZoomValueButton instanceof HTMLElement)) {
        return;
      }
      previewZoomValueButton.textContent = formatPreviewZoomPercent(zoom);
    }
    function formatPreviewZoomPercent(zoom) {
      if (!Number.isFinite(zoom) || zoom <= 0) {
        return "100%";
      }
      return String(Math.round(zoom * 100)) + "%";
    }
    function updatePreviewCollapseToggle(collapsed) {
      if (previewCollapseToggle instanceof HTMLElement) {
        const label = collapsed
          ? previewCollapseToggle.dataset.expandLabel ?? ""
          : previewCollapseToggle.dataset.collapseLabel ?? "";
        previewCollapseToggle.setAttribute("aria-expanded", String(!collapsed));
        previewCollapseToggle.setAttribute("aria-label", label);
        previewCollapseToggle.setAttribute("title", label);
      }
    }
    function updatePreviewFocusToggle(focused) {
      if (previewFocusToggle instanceof HTMLElement) {
        const label = focused
          ? previewFocusToggle.dataset.exitFocusLabel ?? ""
          : previewFocusToggle.dataset.focusLabel ?? "";
        previewFocusToggle.setAttribute("aria-pressed", String(focused));
        previewFocusToggle.setAttribute("aria-label", label);
        previewFocusToggle.setAttribute("title", label);
      }
    }
    function setPreviewCollapsed(collapsed) {
      shell?.classList.toggle("preview-collapsed", collapsed);
      if (collapsed) {
        shell?.classList.remove("preview-focused");
        updatePreviewFocusToggle(false);
      }
      updatePreviewCollapseToggle(collapsed);
      if (!collapsed) {
        refreshFitPreviewZoom();
      }
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout(), activePreviewZoom(), collapsed);
    }
    function setPreviewFocused(focused) {
      shell?.classList.toggle("preview-focused", focused);
      if (focused) {
        shell?.classList.remove("preview-collapsed");
        updatePreviewCollapseToggle(false);
        closeRowActionMenus();
      }
      updatePreviewFocusToggle(focused);
      refreshFitPreviewZoom();
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout(), activePreviewZoom(), isPreviewCollapsed(), focused);
    }
    function applyPreviewSvgSize(zoom) {
      const svg = previewSvg();
      if (!(svg instanceof SVGSVGElement)) {
        return;
      }
      const intrinsicWidth = svgIntrinsicWidth(svg);
      const intrinsicHeight = svgIntrinsicHeight(svg);
      if (intrinsicWidth <= 0 || intrinsicHeight <= 0 || !Number.isFinite(zoom) || zoom <= 0) {
        svg.style.removeProperty("width");
        svg.style.removeProperty("height");
        return;
      }
      svg.style.width = String(Math.round(intrinsicWidth * zoom)) + "px";
      svg.style.height = String(Math.round(intrinsicHeight * zoom)) + "px";
    }
    function previewSvg() {
      return previewTarget?.querySelector("svg") ?? null;
    }
    function svgIntrinsicWidth(svg) {
      if (!(svg instanceof SVGSVGElement)) {
        return 0;
      }
      const viewBoxWidth = svg.viewBox?.baseVal?.width;
      if (typeof viewBoxWidth === "number" && viewBoxWidth > 0) {
        return viewBoxWidth;
      }
      const width = svg.getAttribute("width");
      const parsedWidth = width ? Number.parseFloat(width) : 0;
      if (parsedWidth > 0) {
        return parsedWidth;
      }
      const box = svg.getBBox();
      return box.width > 0 ? box.width : 0;
    }
    function svgIntrinsicHeight(svg) {
      if (!(svg instanceof SVGSVGElement)) {
        return 0;
      }
      const viewBoxHeight = svg.viewBox?.baseVal?.height;
      if (typeof viewBoxHeight === "number" && viewBoxHeight > 0) {
        return viewBoxHeight;
      }
      const height = svg.getAttribute("height");
      const parsedHeight = height ? Number.parseFloat(height) : 0;
      if (parsedHeight > 0) {
        return parsedHeight;
      }
      const box = svg.getBBox();
      return box.height > 0 ? box.height : 0;
    }
    function calculateFitPreviewZoom() {
      const svg = previewSvg();
      const intrinsicWidth = svgIntrinsicWidth(svg);
      const intrinsicHeight = svgIntrinsicHeight(svg);
      if (!previewTarget || intrinsicWidth <= 0 || intrinsicHeight <= 0) {
        return 1;
      }
      const availableWidth = Math.max(0, previewTarget.clientWidth - 24);
      if (availableWidth <= 0) {
        return 1;
      }
      return Math.max(0.25, Math.min(4, availableWidth / intrinsicWidth));
    }
    function calculateFillPreviewZoom() {
      const svg = previewSvg();
      const intrinsicWidth = svgIntrinsicWidth(svg);
      const intrinsicHeight = svgIntrinsicHeight(svg);
      if (!previewTarget || intrinsicWidth <= 0 || intrinsicHeight <= 0) {
        return 1;
      }
      const availableWidth = Math.max(0, previewTarget.clientWidth - 24);
      const availableHeight = Math.max(0, previewTarget.clientHeight - 24);
      if (availableWidth <= 0 || availableHeight <= 0) {
        return 1;
      }
      const widthFit = availableWidth / intrinsicWidth;
      const heightFill = availableHeight / intrinsicHeight;
      const controlledFill = Math.min(Math.max(widthFit, heightFill), widthFit * 1.5);
      return Math.max(0.25, Math.min(4, controlledFill));
    }
    function refreshFitPreviewZoom() {
      const previewZoom = activePreviewZoom();
      if (previewZoom === "fit" || previewZoom === "fill") {
        setPreviewZoom(previewZoom);
      }
    }
    function escapePreviewHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    function renderPreviewStatusCard(kind, title, message) {
      const advancedButton = kind === "blocked"
        ? '<button type="button" data-preview-detail-tab="advanced">' + escapePreviewHtml(previewUiLabels.openAdvanced) + '</button>'
        : "";
      return '<div class="preview-status-card ' + (kind === "failed" ? "preview-render-failed" : "preview-blocked") + '" data-review-id="preview-status-card" data-preview-status="' + escapePreviewHtml(kind) + '">' +
        '<h3>' + escapePreviewHtml(title) + '</h3>' +
        '<p>' + escapePreviewHtml(message) + '</p>' +
        '<div class="preview-status-actions">' +
        '<button type="button" data-preview-detail-tab="diagnostics">' + escapePreviewHtml(previewUiLabels.openDiagnostics) + '</button>' +
        advancedButton +
        '<button type="button" data-preview-detail-tab="source">' + escapePreviewHtml(previewUiLabels.openSource) + '</button>' +
        '</div></div>';
    }
    function postPreviewEditState() {
      if (!${allowEditing ? "true" : "false"}) {
        return;
      }
      vscode.postMessage({
        type: "preview-edit-state",
        previewEditMode: isPreviewEditMode(),
        nodeId: isPreviewEditMode() && previewMiniSelectedTaskId ? previewMiniSelectedTaskId : undefined
      });
    }
    function setPreviewEditMode(enabled, notify = true) {
      shell?.classList.toggle("preview-editing", enabled);
      if (previewEditToggle instanceof HTMLElement) {
        previewEditToggle.setAttribute("aria-pressed", String(enabled));
        previewEditToggle.textContent = enabled
          ? previewEditToggle.dataset.doneLabel ?? "Done"
          : previewEditToggle.dataset.editLabel ?? "Edit";
      }
      if (previewEditOverlay instanceof HTMLElement) {
        previewEditOverlay.setAttribute("aria-hidden", String(!enabled));
      }
      if (!enabled) {
        cancelPreviewDrag();
        hidePreviewMiniEditor();
      } else {
        renderPreviewEditDateAxis();
        window.setTimeout(renderPreviewEditDateAxis, 0);
      }
      if (notify) {
        postPreviewEditState();
      }
      scheduleUiReviewSnapshot(enabled ? "preview-edit-enabled" : "preview-edit-disabled");
    }
    function isPreviewEditMode() {
      return shell?.classList.contains("preview-editing") ?? false;
    }
    function previewMiniValue(field) {
      return previewMiniEditor?.querySelector('[data-preview-mini-field="' + field + '"]') ?? null;
    }
    function setPreviewMiniValue(field, value) {
      const element = previewMiniValue(field);
      if (element instanceof HTMLElement) {
        element.dataset.value = value || "";
        element.textContent = value || "—";
      }
    }
    function setPreviewMiniDisabled(field, disabled) {
      const element = previewMiniValue(field);
      if (element instanceof HTMLElement) {
        element.dataset.previewMiniDisabled = String(disabled);
      }
    }
    function previewMiniDateButton(field) {
      return previewMiniEditor?.querySelector('[data-preview-mini-date-button="' + field + '"]') ?? null;
    }
    function previewMiniDurationDays(value) {
      const parsed = parsePreviewDurationDays(value);
      return parsed?.days ?? 1;
    }
    function stepPreviewMiniDuration(value, dayDelta) {
      const nextDays = Math.max(1, previewMiniDurationDays(value) + dayDelta);
      return formatPreviewDurationDays(nextDays, value || "1d");
    }
    function hidePreviewMiniCalendar() {
      previewMiniCalendarState.field = "";
      if (previewMiniCalendar instanceof HTMLElement) {
        previewMiniCalendar.hidden = true;
      }
    }
    function openPreviewMiniCalendar(field) {
      const value = previewMiniValue(field);
      if (!(value instanceof HTMLElement) || value.dataset.previewMiniDisabled === "true") {
        return;
      }
      const current = dateLiteralToIsoDate(value.dataset.value ?? "", previewScheduleEditModel.dateFormat) || utcDayToIsoDate(Math.floor(Date.now() / 86400000));
      previewMiniCalendarState.field = field;
      previewMiniCalendarState.monthIso = current.slice(0, 7) + "-01";
      renderPreviewMiniCalendar();
      if (previewMiniCalendar instanceof HTMLElement) {
        previewMiniCalendar.hidden = false;
        positionPreviewMiniCalendar();
      }
    }
    function togglePreviewMiniCalendar(field) {
      if (previewMiniCalendar instanceof HTMLElement && !previewMiniCalendar.hidden && previewMiniCalendarState.field === field) {
        hidePreviewMiniCalendar();
        return;
      }
      openPreviewMiniCalendar(field);
    }
    function shiftPreviewMiniCalendarMonth(delta) {
      if (!previewMiniCalendarState.field || !Number.isFinite(delta)) {
        return;
      }
      previewMiniCalendarState.monthIso = addIsoMonths(previewMiniCalendarState.monthIso, delta);
      renderPreviewMiniCalendar();
      positionPreviewMiniCalendar();
    }
    function renderPreviewMiniCalendar() {
      if (!(previewMiniCalendar instanceof HTMLElement) || !previewMiniCalendarState.monthIso) {
        return;
      }
      const label = previewMiniCalendar.querySelector("[data-preview-mini-calendar-label]");
      const grid = previewMiniCalendar.querySelector("[data-preview-mini-calendar-grid]");
      const currentValue = previewMiniCalendarState.field
        ? previewMiniValue(previewMiniCalendarState.field)
        : null;
      const selectedIso = currentValue instanceof HTMLElement
        ? dateLiteralToIsoDate(currentValue.dataset.value ?? "", previewScheduleEditModel.dateFormat)
        : "";
      if (label instanceof HTMLElement) {
        label.textContent = previewMiniCalendarState.monthIso.slice(0, 7);
      }
      if (!(grid instanceof HTMLElement)) {
        return;
      }
      grid.replaceChildren();
      const monthStart = isoDateToUtcDay(previewMiniCalendarState.monthIso);
      const firstDate = new Date(monthStart * 86400000);
      const firstWeekday = firstDate.getUTCDay();
      const gridStart = monthStart - firstWeekday;
      const month = previewMiniCalendarState.monthIso.slice(5, 7);
      for (let index = 0; index < 42; index += 1) {
        const isoDate = utcDayToIsoDate(gridStart + index);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preview-mini-calendar-day" +
          (isoDate === selectedIso ? " selected" : "") +
          (isoDate.slice(5, 7) === month ? "" : " outside");
        button.dataset.action = "preview-mini-calendar-day";
        button.dataset.isoDate = isoDate;
        button.textContent = String(Number(isoDate.slice(8, 10)));
        grid.appendChild(button);
      }
    }
    function positionPreviewMiniCalendar() {
      if (!(previewMiniEditor instanceof HTMLElement) || !(previewMiniCalendar instanceof HTMLElement) || !previewMiniCalendarState.field) {
        return;
      }
      const button = previewMiniEditor.querySelector('[data-preview-mini-date-button="' + previewMiniCalendarState.field + '"]');
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const editorRect = previewMiniEditor.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const calendarWidth = previewMiniCalendar.offsetWidth || Math.min(312, Math.max(0, editorRect.width - 20));
      const calendarHeight = previewMiniCalendar.offsetHeight || 220;
      const leftMax = Math.max(10, editorRect.width - calendarWidth - 10);
      const preferredLeft = buttonRect.left - editorRect.left + (buttonRect.width / 2) - (calendarWidth / 2);
      const left = Math.min(leftMax, Math.max(10, preferredLeft));
      const belowTop = buttonRect.bottom - editorRect.top + 6;
      const aboveTop = buttonRect.top - editorRect.top - calendarHeight - 6;
      const minTop = 12 - editorRect.top;
      const viewportBottom = window.innerHeight - 12;
      const top = editorRect.top + belowTop + calendarHeight <= viewportBottom
        ? belowTop
        : Math.max(minTop, aboveTop);
      previewMiniCalendar.style.setProperty("--preview-mini-calendar-left", left.toFixed(1) + "px");
      previewMiniCalendar.style.setProperty("--preview-mini-calendar-top", top.toFixed(1) + "px");
    }
    function addIsoMonths(isoDate, delta) {
      const match = /^(\\d{4})-(\\d{2})-\\d{2}$/.exec(isoDate || "");
      if (!match) {
        return utcDayToIsoDate(Math.floor(Date.now() / 86400000)).slice(0, 7) + "-01";
      }
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
      const year = String(date.getUTCFullYear()).padStart(4, "0");
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      return year + "-" + month + "-01";
    }
    function hidePreviewMiniEditor() {
      previewMiniSelectedTaskId = "";
      if (previewMiniEditor instanceof HTMLElement) {
        previewMiniEditor.hidden = true;
        previewMiniEditor.dataset.nodeId = "";
        previewMiniEditor.dataset.kind = "";
      }
      updatePreviewSelectedViewportButton();
      document.querySelectorAll("[data-preview-edit-task].selected").forEach((candidate) => {
        candidate.classList.remove("selected");
      });
      hidePreviewMiniCalendar();
    }
    function selectPreviewMiniTask(nodeId) {
      const task = previewEditTask(nodeId);
      if (!task?.editable || !(previewMiniEditor instanceof HTMLElement)) {
        hidePreviewMiniEditor();
        return;
      }
      previewMiniSelectedTaskId = nodeId;
      previewMiniEditor.hidden = false;
      previewMiniEditor.dataset.nodeId = nodeId;
      previewMiniEditor.dataset.kind = task.kind;
      const label = previewMiniEditor.querySelector("[data-preview-mini-label]");
      if (label instanceof HTMLElement) {
        label.textContent = task.label || nodeId;
      }
      const durationOptions = previewMiniEditor.querySelector("[data-preview-mini-duration-options]");
      const startDateButton = previewMiniDateButton("start");
      const endDateButton = previewMiniDateButton("end");
      setPreviewMiniValue("start", task.start || "");
      setPreviewMiniValue("end", task.end || "");
      setPreviewMiniValue("duration", task.duration || "");
      setPreviewMiniDisabled("start", false);
      setPreviewMiniDisabled("end", task.kind !== "start-end");
      setPreviewMiniDisabled("duration", task.kind !== "start-duration");
      if (durationOptions instanceof HTMLElement) {
        durationOptions.dataset.previewMiniDisabled = String(task.kind !== "start-duration");
      }
      if (startDateButton instanceof HTMLButtonElement) {
        startDateButton.disabled = false;
      }
      if (endDateButton instanceof HTMLButtonElement) {
        endDateButton.disabled = task.kind !== "start-end";
      }
      updatePreviewSelectedViewportButton();
      document.querySelectorAll("[data-preview-edit-task]").forEach((candidate) => {
        if (candidate instanceof HTMLElement) {
          candidate.classList.toggle("selected", candidate.dataset.nodeId === nodeId);
        }
      });
      if (previewEditStatus instanceof HTMLElement) {
        const guidance = previewEditStatus.querySelector(".preview-edit-guidance");
        if (guidance instanceof HTMLElement) {
          guidance.textContent = task.kind === "start-end"
            ? (task.start || "") + " - " + (task.end || "")
            : (task.start || "") + ", " + (task.duration || "");
        }
      }
      hidePreviewMiniCalendar();
      ensurePreviewSelectedTaskInViewport(false);
      postPreviewEditState();
      scheduleUiReviewSnapshot("preview-mini-selected");
    }
    function applyPreviewMiniEditor() {
      if (!(previewMiniEditor instanceof HTMLElement) || !previewMiniSelectedTaskId) {
        return;
      }
      const task = previewEditTask(previewMiniSelectedTaskId);
      if (!task?.editable) {
        return;
      }
      const start = previewMiniValue("start") instanceof HTMLElement ? previewMiniValue("start").dataset.value ?? "" : "";
      const end = previewMiniValue("end") instanceof HTMLElement ? previewMiniValue("end").dataset.value ?? "" : "";
      const duration = previewMiniValue("duration") instanceof HTMLElement ? previewMiniValue("duration").dataset.value ?? "" : "";
      const message = task.kind === "start-end"
        ? { type: "preview-mini-update-task", nodeId: previewMiniSelectedTaskId, start, end }
        : { type: "preview-mini-update-task", nodeId: previewMiniSelectedTaskId, start, duration };
      vscode.postMessage(message);
    }
    function previewKeyboardNudge(event) {
      if (!isPreviewEditMode() || previewDragState || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return false;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return false;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return false;
      }
      const dayDelta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1);
      const patch = previewEditPatch(previewMiniSelectedTaskId, dayDelta);
      if (!patch) {
        return false;
      }
      event.preventDefault();
      vscode.postMessage(patch);
      scheduleUiReviewSnapshot("preview-keyboard-nudge");
      return true;
    }
    function previewKeyboardResize(event) {
      if (!isPreviewEditMode() || previewDragState || event.isComposing || event.metaKey || event.ctrlKey || !event.altKey) {
        return false;
      }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return false;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return false;
      }
      const dayDelta = (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1);
      const patch = previewResizePatch(previewMiniSelectedTaskId, "right", dayDelta);
      if (!patch) {
        return false;
      }
      event.preventDefault();
      vscode.postMessage(patch);
      scheduleUiReviewSnapshot("preview-keyboard-resize");
      return true;
    }
    function previewEditTask(nodeId) {
      return previewScheduleEditModel.tasks.find((task) => task.nodeId === nodeId);
    }
    function updatePreviewSelectedViewportButton() {
      if (previewEditSelectedViewportButton instanceof HTMLButtonElement) {
        const task = previewEditTask(previewMiniSelectedTaskId);
        previewEditSelectedViewportButton.disabled = !task?.editable;
      }
    }
    function selectedPreviewTaskIsVisible() {
      const task = previewEditTask(previewMiniSelectedTaskId);
      if (!task?.editable || typeof task.startDay !== "number" || typeof task.endDay !== "number") {
        return false;
      }
      return task.startDay >= previewScheduleEditModel.domainStartDay &&
        task.endDay <= previewScheduleEditModel.domainEndDay;
    }
    function viewportForPreviewTask(task) {
      if (!task?.editable || typeof task.startDay !== "number" || typeof task.endDay !== "number") {
        return null;
      }
      const padding = 7;
      const span = Math.max(1, previewScheduleEditModel.totalDays);
      const desiredStart = task.startDay - padding;
      const desiredEnd = task.endDay + padding;
      if (desiredEnd - desiredStart > span) {
        return { startDay: desiredStart, endDay: desiredEnd };
      }
      if (desiredStart < previewScheduleEditModel.domainStartDay) {
        return { startDay: desiredStart, endDay: desiredStart + span };
      }
      if (desiredEnd > previewScheduleEditModel.domainEndDay) {
        return { startDay: desiredEnd - span, endDay: desiredEnd };
      }
      return null;
    }
    function ensurePreviewSelectedTaskInViewport(notifyIfUnchanged) {
      const task = previewEditTask(previewMiniSelectedTaskId);
      const viewport = viewportForPreviewTask(task);
      previewLastViewportAction = "selected";
      if (viewport) {
        setPreviewEditViewport(viewport.startDay, viewport.endDay, true, "selected");
        return;
      }
      if (notifyIfUnchanged) {
        setPreviewEditViewport(previewScheduleEditModel.domainStartDay, previewScheduleEditModel.domainEndDay, true, "selected");
        return;
      }
      scheduleUiReviewSnapshot("preview-edit-selected-visible");
    }
    function previewEditDayDelta(deltaPixels) {
      if (!(previewEditTrack instanceof HTMLElement)) {
        return 0;
      }
      const width = previewEditTrack.getBoundingClientRect().width;
      if (!Number.isFinite(deltaPixels) || !Number.isFinite(width) || width <= 0) {
        return 0;
      }
      const rawDays = (deltaPixels / width) * previewScheduleEditModel.totalDays;
      const snapped = Math.round(rawDays);
      if (snapped !== 0) {
        return snapped;
      }
      const intentionalDragThreshold = Math.min(Math.max(width / (previewScheduleEditModel.totalDays * 4), 8), 24);
      return Math.abs(deltaPixels) >= intentionalDragThreshold
        ? deltaPixels > 0 ? 1 : -1
        : 0;
    }
    function isoDateToUtcDay(isoDate) {
      const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(isoDate || "");
      if (!match) {
        return 0;
      }
      return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
    }
    function utcDayToIsoDate(day) {
      const date = new Date(day * 86400000);
      const year = String(date.getUTCFullYear()).padStart(4, "0");
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
      return year + "-" + month + "-" + dayOfMonth;
    }
    function addIsoDays(isoDate, days) {
      return utcDayToIsoDate(isoDateToUtcDay(isoDate) + days);
    }
    function previewEditDateAxisStep() {
      const totalDays = Math.max(1, previewScheduleEditModel.totalDays);
      const width = previewEditTrack instanceof HTMLElement
        ? previewEditTrack.getBoundingClientRect().width
        : 0;
      const dayWidth = width > 0 ? width / totalDays : 0;
      if (dayWidth >= 42) {
        return 1;
      }
      if (dayWidth >= 24) {
        return 2;
      }
      if (dayWidth >= 10) {
        return 7;
      }
      if (dayWidth >= 5) {
        return 14;
      }
      return 31;
    }
    function previewEditDateAxisLabel(day, step) {
      const iso = utcDayToIsoDate(day);
      return step >= 31 ? iso.slice(0, 7) : iso.slice(5);
    }
    function renderPreviewEditDateAxis() {
      if (!(previewEditAxis instanceof HTMLElement)) {
        return;
      }
      const startDay = previewScheduleEditModel.domainStartDay;
      const endDay = previewScheduleEditModel.domainEndDay;
      const totalDays = Math.max(1, previewScheduleEditModel.totalDays);
      const step = previewEditDateAxisStep();
      const ticks = [];
      for (let day = startDay; day < endDay; day += step) {
        const leftPercent = ((day + 0.5 - startDay) / totalDays) * 100;
        const label = previewEditDateAxisLabel(day, step);
        ticks.push('<span class="preview-edit-axis-tick" style="left: ' + leftPercent.toFixed(3) + '%" title="' + utcDayToIsoDate(day) + '">' + label + '</span>');
      }
      ticks.push('<span id="preview-edit-axis-cursor" class="preview-edit-axis-cursor" data-review-id="preview-edit-axis-cursor" hidden></span>');
      previewEditAxis.innerHTML = ticks.join("");
    }
    function setPreviewEditViewport(startDay, endDay, notify = true, action = "manual") {
      if (!Number.isInteger(startDay) || !Number.isInteger(endDay) || endDay <= startDay) {
        return;
      }
      previewLastViewportAction = action;
      previewScheduleEditModel.domainStartDay = startDay;
      previewScheduleEditModel.domainEndDay = endDay;
      previewScheduleEditModel.totalDays = Math.max(1, endDay - startDay);
      previewScheduleEditModel.domainStartIso = utcDayToIsoDate(startDay);
      previewScheduleEditModel.domainEndIso = utcDayToIsoDate(endDay);
      if (previewEditTrack instanceof HTMLElement) {
        previewEditTrack.style.setProperty("--preview-edit-total-days", String(previewScheduleEditModel.totalDays));
      }
      renderPreviewEditDateAxis();
      if (previewEditTimelineRange instanceof HTMLElement) {
        previewEditTimelineRange.textContent = previewScheduleEditModel.domainStartIso + " - " + previewScheduleEditModel.domainEndIso;
      }
      document.querySelectorAll("[data-preview-edit-task]").forEach((candidate) => {
        if (!(candidate instanceof HTMLElement)) {
          return;
        }
        const task = previewEditTask(candidate.dataset.nodeId ?? "");
        if (!task || typeof task.startDay !== "number" || typeof task.endDay !== "number") {
          candidate.style.setProperty("--preview-edit-left", "0%");
          candidate.style.setProperty("--preview-edit-width", "0%");
          return;
        }
        const leftPercent = ((task.startDay - previewScheduleEditModel.domainStartDay) / previewScheduleEditModel.totalDays) * 100;
        const widthPercent = ((task.endDay - task.startDay) / previewScheduleEditModel.totalDays) * 100;
        candidate.style.setProperty("--preview-edit-left", leftPercent.toFixed(3) + "%");
        candidate.style.setProperty("--preview-edit-width", Math.max(1, widthPercent).toFixed(3) + "%");
      });
      updatePreviewSelectedViewportButton();
      if (notify) {
        vscode.postMessage({
          type: "preview-edit-viewport",
          viewportStartIso: previewScheduleEditModel.domainStartIso,
          viewportEndIso: previewScheduleEditModel.domainEndIso
        });
      }
      scheduleUiReviewSnapshot("preview-edit-viewport");
    }
    function applyPreviewEditViewportAction(action) {
      cancelPreviewDrag();
      const span = Math.max(1, previewScheduleEditModel.totalDays);
      const pageDelta = Math.max(7, Math.round(span / 2));
      if (action === "previous") {
        setPreviewEditViewport(previewScheduleEditModel.domainStartDay - pageDelta, previewScheduleEditModel.domainEndDay - pageDelta, true, "previous");
        return;
      }
      if (action === "next") {
        setPreviewEditViewport(previewScheduleEditModel.domainStartDay + pageDelta, previewScheduleEditModel.domainEndDay + pageDelta, true, "next");
        return;
      }
      if (action === "today") {
        const today = Math.floor(Date.now() / 86400000);
        const start = today - Math.floor(span / 2);
        setPreviewEditViewport(start, start + span, true, "today");
        return;
      }
      if (action === "selected") {
        ensurePreviewSelectedTaskInViewport(true);
        return;
      }
      if (action === "fit") {
        setPreviewEditViewport(previewScheduleEditModel.defaultDomainStartDay, previewScheduleEditModel.defaultDomainEndDay, true, "fit");
      }
    }
    function previewEditPatch(nodeId, dayDelta) {
      if (!Number.isInteger(dayDelta) || dayDelta === 0) {
        return null;
      }
      const task = previewEditTask(nodeId);
      if (!task || !task.editable || !task.startIso) {
        return null;
      }
      const nextStart = formatDateForMermaid(addIsoDays(task.startIso, dayDelta), previewScheduleEditModel.dateFormat);
      if (!nextStart) {
        return null;
      }
      if (task.kind === "start-end") {
        if (!task.endIso) {
          return null;
        }
        const nextEnd = formatDateForMermaid(addIsoDays(task.endIso, dayDelta), previewScheduleEditModel.dateFormat);
        return nextEnd ? { type: "preview-drag-task", nodeId, start: nextStart, end: nextEnd, dayDelta } : null;
      }
      return { type: "preview-drag-task", nodeId, start: nextStart, dayDelta };
    }
    function parsePreviewDurationDays(value) {
      const match = /^\\s*(\\d+(?:\\.\\d+)?)\\s*(d|day|days|w|week|weeks|month|months|y|year|years)\\s*$/i.exec(value || "");
      if (!match) {
        return null;
      }
      const amount = Number(match[1]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }
      const unit = match[2].toLowerCase();
      const multiplier = unit.startsWith("w")
        ? 7
        : unit.startsWith("month")
          ? 30
          : unit.startsWith("y")
            ? 365
            : 1;
      return {
        days: Math.max(1, Math.round(amount * multiplier)),
        unit
      };
    }
    function formatPreviewDurationDays(days, sourceDuration) {
      const roundedDays = Math.max(1, Math.round(days));
      const parsed = parsePreviewDurationDays(sourceDuration);
      if (parsed?.unit.startsWith("w") && roundedDays % 7 === 0) {
        return String(roundedDays / 7) + "w";
      }
      if (parsed?.unit.startsWith("month") && roundedDays % 30 === 0) {
        const amount = roundedDays / 30;
        return String(amount) + (amount === 1 ? "month" : "months");
      }
      if (parsed?.unit.startsWith("y") && roundedDays % 365 === 0) {
        return String(roundedDays / 365) + "y";
      }
      return String(roundedDays) + "d";
    }
    function previewResizePatch(nodeId, edge, dayDelta) {
      if (!Number.isInteger(dayDelta) || dayDelta === 0 || (edge !== "left" && edge !== "right")) {
        return null;
      }
      const task = previewEditTask(nodeId);
      if (!task || !task.editable || typeof task.startDay !== "number" || typeof task.endDay !== "number" || !task.startIso) {
        return null;
      }
      if (task.kind === "start-duration") {
        if (!task.duration || typeof task.durationDays !== "number") {
          return null;
        }
        if (edge === "right") {
          const nextDurationDays = task.durationDays + dayDelta;
          return nextDurationDays >= 1
            ? { type: "preview-resize-task", nodeId, edge, duration: formatPreviewDurationDays(nextDurationDays, task.duration), dayDelta }
            : null;
        }
        const nextDurationDays = task.durationDays - dayDelta;
        const nextStart = formatDateForMermaid(addIsoDays(task.startIso, dayDelta), previewScheduleEditModel.dateFormat);
        return nextDurationDays >= 1 && nextStart
          ? { type: "preview-resize-task", nodeId, edge, start: nextStart, duration: formatPreviewDurationDays(nextDurationDays, task.duration), dayDelta }
          : null;
      }
      if (task.kind === "start-end") {
        if (!task.endIso) {
          return null;
        }
        if (edge === "right") {
          const nextEndDay = task.endDay + dayDelta;
          const nextEnd = formatDateForMermaid(addIsoDays(task.endIso, dayDelta), previewScheduleEditModel.dateFormat);
          return nextEndDay - task.startDay >= 1 && nextEnd
            ? { type: "preview-resize-task", nodeId, edge, end: nextEnd, dayDelta }
            : null;
        }
        const nextStartDay = task.startDay + dayDelta;
        const nextStart = formatDateForMermaid(addIsoDays(task.startIso, dayDelta), previewScheduleEditModel.dateFormat);
        return task.endDay - nextStartDay >= 1 && nextStart
          ? { type: "preview-resize-task", nodeId, edge, start: nextStart, dayDelta }
          : null;
      }
      return null;
    }
    function previewDragTooltipLabel(task, patch, dayDelta) {
      if (!task || !patch) {
        return "";
      }
      const delta = " (" + (dayDelta > 0 ? "+" : "") + dayDelta + "d)";
      if (patch.type === "preview-resize-task") {
        if (task.kind === "start-duration") {
          const startLabel = patch.start || task.start || "";
          const durationLabel = patch.duration || task.duration || "";
          const durationDays = parsePreviewDurationDays(durationLabel)?.days;
          const endLabel = task.startIso && durationDays
            ? formatDateForMermaid(addIsoDays(task.startIso, durationDays), previewScheduleEditModel.dateFormat)
            : "";
          return patch.edge === "left"
            ? startLabel + ", " + durationLabel + delta
            : (endLabel ? endLabel + ", " : "") + durationLabel + delta;
        }
        return patch.edge === "left"
          ? (patch.start || task.start || "") + delta
          : (patch.end || task.end || "") + delta;
      }
      if (patch.end) {
        return patch.start + " - " + patch.end + delta;
      }
      return patch.start + (task.duration ? ", " + task.duration : "") + delta;
    }
    function previewDragGuide(task, patch, dayDelta) {
      if (!task || !patch || typeof task.startDay !== "number" || typeof task.endDay !== "number") {
        return null;
      }
      if (patch.type === "preview-resize-task") {
        if (patch.edge === "left") {
          return { day: task.startDay + dayDelta, label: patch.start || addIsoDays(task.startIso || "", dayDelta) };
        }
        const nextEndDay = task.endDay + dayDelta;
        const label = patch.end || formatDateForMermaid(utcDayToIsoDate(nextEndDay), previewScheduleEditModel.dateFormat);
        return { day: nextEndDay, label };
      }
      return { day: task.startDay + dayDelta, label: patch.start || addIsoDays(task.startIso || "", dayDelta) };
    }
    function updatePreviewDragGuide(task, patch, dayDelta) {
      if (!(previewEditTrack instanceof HTMLElement)) {
        return;
      }
      const guide = previewDragGuide(task, patch, dayDelta);
      const axisCursor = document.getElementById("preview-edit-axis-cursor");
      if (!guide || !guide.label) {
        hidePreviewDragGuide();
        return;
      }
      const leftPercent = ((guide.day - previewScheduleEditModel.domainStartDay) / Math.max(1, previewScheduleEditModel.totalDays)) * 100;
      const clampedLeft = Math.min(100, Math.max(0, leftPercent));
      if (previewEditGuideLine instanceof HTMLElement) {
        previewEditGuideLine.style.left = clampedLeft.toFixed(3) + "%";
        previewEditGuideLine.hidden = false;
      }
      if (axisCursor instanceof HTMLElement) {
        axisCursor.style.left = clampedLeft.toFixed(3) + "%";
        axisCursor.textContent = guide.label;
        axisCursor.hidden = false;
      }
    }
    function hidePreviewDragGuide() {
      if (previewEditGuideLine instanceof HTMLElement) {
        previewEditGuideLine.hidden = true;
      }
      const axisCursor = document.getElementById("preview-edit-axis-cursor");
      if (axisCursor instanceof HTMLElement) {
        axisCursor.hidden = true;
      }
    }
    function updatePreviewDragTooltip(task, patch, dayDelta) {
      if (!(previewEditDragTooltip instanceof HTMLElement) || !(previewEditTrack instanceof HTMLElement) || !previewDragState) {
        return;
      }
      const label = previewDragTooltipLabel(task, patch, dayDelta);
      if (!label) {
        previewEditDragTooltip.hidden = true;
        return;
      }
      const trackRect = previewEditTrack.getBoundingClientRect();
      const barRect = previewDragState.element.getBoundingClientRect();
      const anchorX = previewDragState.mode === "resize" && previewDragState.edge === "left"
        ? barRect.left
        : previewDragState.mode === "resize" && previewDragState.edge === "right"
          ? barRect.right
          : barRect.left + (barRect.width / 2);
      const left = Math.min(Math.max(anchorX - trackRect.left, 8), Math.max(8, trackRect.width - 8));
      const top = Math.min(Math.max(barRect.top - trackRect.top - 30, 4), Math.max(4, trackRect.height - 28));
      previewEditDragTooltip.textContent = label;
      previewEditDragTooltip.style.left = left.toFixed(1) + "px";
      previewEditDragTooltip.style.top = top.toFixed(1) + "px";
      previewEditDragTooltip.hidden = false;
      updatePreviewDragGuide(task, patch, dayDelta);
    }
    function hidePreviewDragTooltip() {
      if (previewEditDragTooltip instanceof HTMLElement) {
        previewEditDragTooltip.hidden = true;
      }
      hidePreviewDragGuide();
    }
    function paintPreviewResizeGhost(task, edge, dayDelta, element) {
      if (!task || typeof task.startDay !== "number" || typeof task.endDay !== "number") {
        return;
      }
      const nextStartDay = edge === "left" ? task.startDay + dayDelta : task.startDay;
      const nextEndDay = edge === "right" ? task.endDay + dayDelta : task.endDay;
      if (nextEndDay - nextStartDay < 1) {
        return;
      }
      const leftPercent = ((nextStartDay - previewScheduleEditModel.domainStartDay) / previewScheduleEditModel.totalDays) * 100;
      const widthPercent = ((nextEndDay - nextStartDay) / previewScheduleEditModel.totalDays) * 100;
      element.style.setProperty("--preview-edit-left", leftPercent.toFixed(3) + "%");
      element.style.setProperty("--preview-edit-width", Math.max(1, widthPercent).toFixed(3) + "%");
    }
    function updatePreviewDrag(event) {
      if (!previewDragState) {
        return;
      }
      const deltaPixels = event.clientX - previewDragState.startX;
      const dayDelta = previewEditDayDelta(deltaPixels);
      previewDragState.dayDelta = dayDelta;
      const task = previewEditTask(previewDragState.nodeId);
      const patch = previewDragState.mode === "resize"
        ? previewResizePatch(previewDragState.nodeId, previewDragState.edge, dayDelta)
        : previewEditPatch(previewDragState.nodeId, dayDelta);
      if (previewDragState.mode === "resize") {
        if (patch) {
          paintPreviewResizeGhost(task, previewDragState.edge, dayDelta, previewDragState.element);
        }
      } else {
        previewDragState.element.style.transform = "translateX(" + Math.round(deltaPixels) + "px)";
      }
      if (previewEditStatus instanceof HTMLElement) {
        const summary = patch
          ? (patch.end
              ? (patch.start ? patch.start + " - " + patch.end : patch.end)
              : patch.duration
                ? (patch.start ? patch.start + ", " + patch.duration : patch.duration)
                : patch.start) + " (" + (dayDelta > 0 ? "+" : "") + dayDelta + "d)"
          : previewEditStatus.textContent;
        previewEditStatus.dataset.dragSummary = summary || "";
        const guidance = previewEditStatus.querySelector(".preview-edit-guidance");
        if (guidance instanceof HTMLElement && summary) {
          guidance.textContent = summary;
        }
      }
      updatePreviewDragTooltip(task, patch, dayDelta);
    }
    function cancelPreviewDrag() {
      if (!previewDragState) {
        return;
      }
      previewDragState.element.classList.remove("dragging");
      previewDragState.element.style.removeProperty("transform");
      previewDragState.element.style.setProperty("--preview-edit-left", previewDragState.originalLeft);
      previewDragState.element.style.setProperty("--preview-edit-width", previewDragState.originalWidth);
      hidePreviewDragTooltip();
      previewDragState = null;
    }
    function commitPreviewDrag() {
      if (!previewDragState) {
        return;
      }
      const nodeId = previewDragState.nodeId;
      const patch = previewDragState.mode === "resize"
        ? previewResizePatch(previewDragState.nodeId, previewDragState.edge, previewDragState.dayDelta)
        : previewEditPatch(previewDragState.nodeId, previewDragState.dayDelta);
      cancelPreviewDrag();
      if (patch) {
        vscode.postMessage(patch);
        return;
      }
      if (nodeId) {
        selectPreviewMiniTask(nodeId);
      }
    }
    function isTypingTarget(target) {
      return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
    }
    function setPreviewSpacePanActive(active) {
      previewSpacePanActive = active;
      if (!previewPanState && previewTarget instanceof HTMLElement) {
        previewTarget.classList.toggle("space-pan-ready", active);
      }
    }
    function startPreviewPan(event) {
      if (!(previewTarget instanceof HTMLElement)) {
        return;
      }
      const isMiddleDrag = event.button === 1;
      const isSpaceDrag = event.button === 0 && previewSpacePanActive;
      if (!isMiddleDrag && !isSpaceDrag) {
        return;
      }
      event.preventDefault();
      previewPanState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: previewTarget.scrollLeft,
        scrollTop: previewTarget.scrollTop
      };
      previewTarget.classList.add("is-panning");
      try {
        previewTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in some Webview implementations.
      }
    }
    function updatePreviewPan(event) {
      if (!previewPanState || !(previewTarget instanceof HTMLElement) || event.pointerId !== previewPanState.pointerId) {
        return;
      }
      event.preventDefault();
      previewTarget.scrollLeft = previewPanState.scrollLeft - (event.clientX - previewPanState.startX);
      previewTarget.scrollTop = previewPanState.scrollTop - (event.clientY - previewPanState.startY);
    }
    function finishPreviewPan(event) {
      if (!previewPanState || !(previewTarget instanceof HTMLElement) || event.pointerId !== previewPanState.pointerId) {
        return;
      }
      previewTarget.classList.remove("is-panning");
      try {
        previewTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in some Webview implementations.
      }
      previewPanState = null;
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout());
      scheduleUiReviewSnapshot("preview-pan");
    }
    function stepPreviewZoom(direction) {
      const current = currentNumericPreviewZoom();
      const currentIndex = previewZoomLevels.findIndex((level) => level >= current);
      const baseIndex = currentIndex === -1 ? 1 : currentIndex;
      const nextIndex = Math.max(0, Math.min(previewZoomLevels.length - 1, baseIndex + direction));
      setPreviewZoom(String(previewZoomLevels[nextIndex]));
    }
    function setLayout(layout) {
      const normalized = layout === "vertical" ? "vertical" : "horizontal";
      shell?.classList.toggle("layout-horizontal", normalized === "horizontal");
      shell?.classList.toggle("layout-vertical", normalized === "vertical");
      for (const option of layoutOptions) {
        if (option instanceof HTMLElement) {
          option.setAttribute("aria-pressed", String(option.dataset.layoutOption === normalized));
        }
      }
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), normalized);
    }
    function focusElementSoon(element) {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      window.setTimeout(() => element.focus(), 0);
    }
    function elementIsFocusable(element, allowNegativeTabIndex = false) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (element.hidden || element.getAttribute("aria-hidden") === "true" || element.getAttribute("aria-disabled") === "true") {
        return false;
      }
      if ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.disabled) {
        return false;
      }
      if (!allowNegativeTabIndex && element.tabIndex < 0) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }
    function detailsFocusableElements() {
      if (!(detailsDrawer instanceof HTMLElement)) {
        return [];
      }
      return Array.from(detailsDrawer.querySelectorAll([
        "button",
        "input",
        "select",
        "textarea",
        "a[href]",
        "[tabindex]:not([tabindex='-1'])"
      ].join(","))).filter((element) => elementIsFocusable(element));
    }
    function rememberDetailsFocusReturnTarget() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !(detailsDrawer instanceof HTMLElement && detailsDrawer.contains(active))) {
        detailsFocusReturnTarget = active;
      }
    }
    function focusDetailsDrawer() {
      const activeTab = detailTabs.find((tab) => tab instanceof HTMLElement && tab.getAttribute("aria-selected") === "true");
      const target = activeTab instanceof HTMLElement
        ? activeTab
        : detailsClose instanceof HTMLElement
          ? detailsClose
          : detailsFocusableElements()[0];
      focusElementSoon(target);
    }
    function restoreDetailsFocus() {
      const target = detailsFocusReturnTarget instanceof HTMLElement ? detailsFocusReturnTarget : detailsToggle;
      detailsFocusReturnTarget = null;
      focusElementSoon(target);
    }
    function handleDetailsFocusTrap(event) {
      if (event.key !== "Tab" || !(detailsDrawer instanceof HTMLElement) || !(shell?.classList.contains("details-open") ?? false)) {
        return false;
      }
      const focusables = detailsFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        return true;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !detailsDrawer.contains(active)) {
        event.preventDefault();
        focusElementSoon(first);
        return true;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        focusElementSoon(last);
        return true;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        focusElementSoon(first);
        return true;
      }
      return false;
    }
    function handleDetailTabKeydown(event) {
      const tab = event.target instanceof Element ? event.target.closest("[data-detail-tab]") : null;
      if (!(tab instanceof HTMLElement)) {
        return false;
      }
      const index = detailTabs.findIndex((candidate) => candidate === tab);
      if (index < 0) {
        return false;
      }
      let nextIndex = index;
      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % detailTabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + detailTabs.length) % detailTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = detailTabs.length - 1;
      } else {
        return false;
      }
      const nextTab = detailTabs[nextIndex];
      if (!(nextTab instanceof HTMLElement) || !nextTab.dataset.detailTab) {
        return false;
      }
      event.preventDefault();
      setDetailTab(nextTab.dataset.detailTab);
      setDetailsOpen(true);
      focusElementSoon(nextTab);
      return true;
    }
    function rowMenuItems(menu) {
      return Array.from(menu.querySelectorAll(".menu-item")).filter((item) => elementIsFocusable(item));
    }
    function focusRowMenuItem(menu, index) {
      const items = rowMenuItems(menu);
      if (items.length === 0) {
        return;
      }
      const bounded = Math.max(0, Math.min(items.length - 1, index));
      focusElementSoon(items[bounded]);
    }
    function openRowActionMenu(button, focusPosition = "none") {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const wrapper = button.closest(".row-action-menu-wrap");
      if (!(wrapper instanceof HTMLElement)) {
        return;
      }
      const willOpen = !wrapper.classList.contains("open");
      closeRowActionMenus(false);
      if (!willOpen) {
        return;
      }
      setDetailsOpen(false, true);
      wrapper.classList.add("open");
      button.setAttribute("aria-expanded", "true");
      positionRowActionMenu(wrapper);
      const menu = wrapper.querySelector(".row-action-menu");
      if (menu instanceof HTMLElement) {
        if (focusPosition === "first") {
          focusRowMenuItem(menu, 0);
        } else if (focusPosition === "last") {
          focusRowMenuItem(menu, rowMenuItems(menu).length - 1);
        }
      }
    }
    function handleRowActionMenuKeydown(event) {
      const menuButton = event.target instanceof Element ? event.target.closest("[data-action='toggle-row-action-menu']") : null;
      if (menuButton instanceof HTMLElement) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openRowActionMenu(menuButton, event.key === "ArrowUp" ? "last" : "first");
          return true;
        }
        return false;
      }
      const menuItem = event.target instanceof Element ? event.target.closest(".row-action-menu .menu-item") : null;
      if (!(menuItem instanceof HTMLElement)) {
        return false;
      }
      const menu = menuItem.closest(".row-action-menu");
      const wrapper = menuItem.closest(".row-action-menu-wrap");
      if (!(menu instanceof HTMLElement) || !(wrapper instanceof HTMLElement)) {
        return false;
      }
      const items = rowMenuItems(menu);
      const index = items.findIndex((item) => item === menuItem);
      if (event.key === "Escape") {
        event.preventDefault();
        closeRowActionMenus(true);
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusRowMenuItem(menu, (index + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusRowMenuItem(menu, (index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Home") {
        event.preventDefault();
        focusRowMenuItem(menu, 0);
        return true;
      }
      if (event.key === "End") {
        event.preventDefault();
        focusRowMenuItem(menu, items.length - 1);
        return true;
      }
      if (event.key === "Tab") {
        closeRowActionMenus(false);
      }
      return false;
    }
    function dependencyPickerOptions(picker) {
      return Array.from(picker.querySelectorAll(".dependency-option")).filter((option) => elementIsFocusable(option, true) && !option.hidden);
    }
    function focusDependencyOption(picker, index) {
      const options = dependencyPickerOptions(picker);
      if (options.length === 0) {
        return;
      }
      const bounded = Math.max(0, Math.min(options.length - 1, index));
      for (const option of options) {
        if (option instanceof HTMLElement) {
          option.tabIndex = -1;
        }
      }
      const option = options[bounded];
      if (option instanceof HTMLElement) {
        option.tabIndex = 0;
        const search = picker.querySelector(".dependency-search");
        if (search instanceof HTMLElement && option.id) {
          search.setAttribute("aria-activedescendant", option.id);
        }
        focusElementSoon(option);
      }
    }
    function handleDependencyPickerKeydown(event) {
      const picker = event.target instanceof Element ? event.target.closest(".dependency-picker") : null;
      if (!(picker instanceof HTMLElement)) {
        return false;
      }
      const options = dependencyPickerOptions(picker);
      const targetOption = event.target instanceof Element ? event.target.closest(".dependency-option") : null;
      const targetSearch = event.target instanceof HTMLElement && event.target.classList.contains("dependency-search") ? event.target : null;
      if (targetSearch instanceof HTMLElement && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        focusDependencyOption(picker, event.key === "ArrowUp" ? options.length - 1 : 0);
        return true;
      }
      if (targetOption instanceof HTMLElement) {
        const index = options.findIndex((option) => option === targetOption);
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusDependencyOption(picker, (index + 1) % options.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusDependencyOption(picker, (index - 1 + options.length) % options.length);
          return true;
        }
        if (event.key === "Home") {
          event.preventDefault();
          focusDependencyOption(picker, 0);
          return true;
        }
        if (event.key === "End") {
          event.preventDefault();
          focusDependencyOption(picker, options.length - 1);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          const search = picker.querySelector(".dependency-search");
          if (search instanceof HTMLElement) {
            search.removeAttribute("aria-activedescendant");
            focusElementSoon(search);
          }
          return true;
        }
      }
      return false;
    }
    function openNativeDatePicker(button) {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const wrap = button.closest(".date-picker-wrap");
      const picker = wrap?.querySelector(".native-date-picker");
      const textInput = button.closest(".date-field")?.querySelector("input[data-field]:not(.native-date-picker)");
      if (!(picker instanceof HTMLInputElement)) {
        return;
      }
      if (textInput instanceof HTMLInputElement) {
        const isoValue = dateLiteralToIsoDate(textInput.value, button.dataset.dateFormat);
        if (isoValue) {
          picker.value = isoValue;
        }
      }
      picker.focus();
      picker.click();
    }
    function closeRowActionMenus(restoreFocus = false) {
      let focusTarget = null;
      document.querySelectorAll(".row-action-menu-wrap.open").forEach((candidate) => {
        if (!focusTarget) {
          const button = candidate.querySelector(".menu-button");
          if (button instanceof HTMLElement) {
            focusTarget = button;
          }
        }
        candidate.classList.remove("open");
        candidate.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "false");
        const menu = candidate.querySelector(".row-action-menu");
        if (menu instanceof HTMLElement) {
          menu.removeAttribute("style");
        }
      });
      if (restoreFocus) {
        focusElementSoon(focusTarget);
      }
    }
    function positionRowActionMenu(wrapper) {
      const button = wrapper.querySelector(".menu-button");
      const menu = wrapper.querySelector(".row-action-menu");
      if (!(button instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
        return;
      }
      menu.style.position = "fixed";
      menu.style.right = "auto";
      menu.style.bottom = "auto";
      menu.style.left = "0px";
      menu.style.top = "0px";
      const buttonRect = button.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const drawerRect = detailsDrawer instanceof HTMLElement && shell?.classList.contains("details-open")
        ? detailsDrawer.getBoundingClientRect()
        : undefined;
      const margin = 8;
      const preferredTop = buttonRect.bottom + 4;
      const fallbackTop = buttonRect.top - menuRect.height - 4;
      const preferAbove = Boolean(drawerRect && shell?.classList.contains("responsive-narrow"));
      const belowFits = preferredTop + menuRect.height <= window.innerHeight - margin;
      const top = preferAbove && fallbackTop >= margin
        ? fallbackTop
        : belowFits
        ? preferredTop
        : Math.max(margin, fallbackTop);
      const viewportRight = drawerRect && drawerRect.width > 0 && drawerRect.left < window.innerWidth - margin
        ? Math.max(margin + menuRect.width, drawerRect.left - margin)
        : window.innerWidth - margin;
      const left = Math.min(
        Math.max(margin, buttonRect.right - menuRect.width),
        Math.max(margin, viewportRight - menuRect.width)
      );
      menu.style.left = String(Math.round(left)) + "px";
      menu.style.top = String(Math.round(top)) + "px";
    }
    function positionOpenRowActionMenus() {
      document.querySelectorAll(".row-action-menu-wrap.open").forEach((candidate) => {
        if (candidate instanceof HTMLElement) {
          positionRowActionMenu(candidate);
        }
      });
    }
    function scheduleUiReviewSnapshot(reason) {
      if (!${enableUiReviewSnapshotLiteral}) {
        return;
      }
      window.setTimeout(() => postUiReviewSnapshot(reason), 80);
    }
    function postUiReviewSnapshot(reason) {
      if (!${enableUiReviewSnapshotLiteral}) {
        return;
      }
      const selfReviewElement = document.getElementById("llm-ui-self-review");
      const baseSelfReview = (() => {
        try {
          const raw = selfReviewElement?.textContent || "{}";
          return JSON.parse(raw
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&"));
        } catch {
          return {};
        }
      })();
      vscode.postMessage({
        type: "ui-review-snapshot",
        snapshot: {
          capturedAt: new Date().toISOString(),
          reason,
          selfReview: {
            ...baseSelfReview,
            layout: activeLayout(),
            detailsOpen: shell?.classList.contains("details-open") ?? false,
            detailsTab: activeDetailTab(),
            previewCollapsed: isPreviewCollapsed(),
            previewFocused: isPreviewFocused(),
            previewPanEnabled: true,
            previewPanGesture: "Space+drag or middle-button drag",
            previewScrollLeft: activePreviewScrollLeft(),
            previewScrollTop: activePreviewScrollTop(),
            previewScrollRestored,
            previewErrorCard: document.querySelector("[data-preview-status]")?.getAttribute("data-preview-status") || "none",
            webviewErrorBoundary: webviewErrorBoundary instanceof HTMLElement,
            webviewErrorVisible: webviewErrorBoundary instanceof HTMLElement && !webviewErrorBoundary.hidden,
            previewEditMode: isPreviewEditMode(),
            previewEditOverlayAriaHidden: previewEditOverlay instanceof HTMLElement
              ? previewEditOverlay.getAttribute("aria-hidden") === "true"
              : undefined,
            previewMiniEditorOpen: previewMiniEditor instanceof HTMLElement && !previewMiniEditor.hidden,
            previewTimelineStart: previewScheduleEditModel.domainStartIso,
            previewTimelineEnd: previewScheduleEditModel.domainEndIso,
            previewTimelineDays: previewScheduleEditModel.totalDays,
            previewDateAxis: true,
            previewDateAxisTickCount: document.querySelectorAll(".preview-edit-axis-tick").length,
            previewDragGuide: true,
            previewKeyboardNudge: true,
            previewKeyboardResize: true,
            hostCompatibility: {
              ...(baseSelfReview.hostCompatibility || {}),
              selectedProfile: activeHostProfile()
            },
            previewSelectedTaskVisible: selectedPreviewTaskIsVisible(),
            previewViewportAction: previewLastViewportAction,
            previewTimelineSticky: isPreviewFocused(),
            draggableTaskCount: previewScheduleEditModel.draggableTaskCount,
            unsupportedTaskCount: previewScheduleEditModel.unsupportedTaskCount,
            keyboardReview: true,
            detailsFocusManaged: true,
            activeMenuKeyboardNavigable: true,
            pickerKeyboardNavigable: true,
            escapePriority: [
              "preview-drag",
              "preview-mini-editor",
              "row-action-menu",
              "details-drawer"
            ],
            activeMenu: document.querySelector(".row-action-menu-wrap.open") ? "row-action-menu" : "none"
          },
          geometry: collectUiReviewGeometry()
        }
      });
    }
    function collectUiReviewGeometry() {
      const candidates = Array.from(document.querySelectorAll([
        "[data-review-id]",
        "button",
        "input",
        "select",
        "textarea",
        "[role='tab']",
        "[role='menu']",
        "[role='menuitem']",
        ".row-action-menu",
        ".dependency-picker"
      ].join(",")));
      const elements = candidates
        .filter((element, index, all) => all.indexOf(element) === index)
        .map((element, index) => serializeUiReviewElement(element, index));
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        elements,
        relationships: collectUiReviewRelationships()
      };
    }
    function serializeUiReviewElement(element, index) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible = style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0 &&
        intersectsVisibleClipAncestors(element, rect, style);
      const label = element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element.value : "") ||
        (element.textContent || "").replace(/\\s+/g, " ").trim();
      return {
        reviewId: element.getAttribute("data-review-id") ||
          element.id ||
          element.getAttribute("data-action") ||
          element.getAttribute("data-detail-tab") ||
          element.className?.toString().split(/\\s+/).filter(Boolean).slice(0, 2).join(".") ||
          element.tagName.toLowerCase() + "-" + index,
        tagName: element.tagName,
        role: element.getAttribute("role") || element.getAttribute("aria-role") || element.tagName.toLowerCase(),
        label: label.slice(0, 160),
        visible,
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        action: element instanceof HTMLElement ? element.dataset.action : undefined,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left
        },
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        className: element.className?.toString()
      };
    }
    function intersectsVisibleClipAncestors(element, rect, style = window.getComputedStyle(element)) {
      if (style.position === "fixed") {
        return true;
      }
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        const ancestorStyle = window.getComputedStyle(ancestor);
        const clips = /hidden|auto|scroll|clip/.test([
          ancestorStyle.overflowX,
          ancestorStyle.overflowY,
          ancestorStyle.overflow
        ].join(" "));
        if (clips) {
          const ancestorRect = ancestor.getBoundingClientRect();
          const intersects = rect.right > ancestorRect.left + 1 &&
            rect.left < ancestorRect.right - 1 &&
            rect.bottom > ancestorRect.top + 1 &&
            rect.top < ancestorRect.bottom - 1;
          if (!intersects) {
            return false;
          }
        }
        ancestor = ancestor.parentElement;
      }
      return true;
    }
    function collectUiReviewRelationships() {
      const relationships = [];
      document.querySelectorAll(".row-action-menu-wrap.open").forEach((wrapper, index) => {
        const button = wrapper.querySelector(".menu-button");
        const menu = wrapper.querySelector(".row-action-menu");
        if (button instanceof HTMLElement && menu instanceof HTMLElement) {
          relationships.push({
            type: "popup-anchor",
            sourceReviewId: menu.getAttribute("data-review-id") || "row-action-menu-" + index,
            targetReviewId: button.getAttribute("data-review-id") || "row-action-menu-button-" + index,
            distance: rectDistance(menu.getBoundingClientRect(), button.getBoundingClientRect())
          });
        }
      });
      document.querySelectorAll(".dependency-picker").forEach((picker, index) => {
        const input = picker.querySelector(".dependency-search");
        if (input instanceof HTMLElement && picker instanceof HTMLElement) {
          relationships.push({
            type: "picker-anchor",
            sourceReviewId: picker.getAttribute("data-review-id") || "dependency-picker-" + index,
            targetReviewId: input.getAttribute("data-review-id") || "dependency-search-" + index,
            distance: rectDistance(picker.getBoundingClientRect(), input.getBoundingClientRect())
          });
        }
      });
      return relationships;
    }
    function rectDistance(a, b) {
      const dx = Math.max(0, Math.max(b.left - a.right, a.left - b.right));
      const dy = Math.max(0, Math.max(b.top - a.bottom, a.top - b.bottom));
      return Math.round(Math.sqrt(dx * dx + dy * dy));
    }
    function setDetailsOpen(open, preserveRowActionMenus = false, manageFocus = false) {
      const wasOpen = shell?.classList.contains("details-open") ?? false;
      if (open && !wasOpen && manageFocus) {
        rememberDetailsFocusReturnTarget();
      }
      if (open && !preserveRowActionMenus) {
        closeRowActionMenus();
      }
      if (!open && !preserveRowActionMenus && (wasOpen || manageFocus)) {
        closeRowActionMenus(false);
      }
      shell?.classList.toggle("details-open", open);
      detailsToggle?.setAttribute("aria-expanded", String(open));
      persistViewState(open, activeDetailTab(), activeLayout());
      if (open && manageFocus) {
        focusDetailsDrawer();
      }
      if (!open && wasOpen && manageFocus) {
        restoreDetailsFocus();
      }
    }
    function activeDetailTab() {
      const active = detailTabs.find((tab) => tab instanceof HTMLElement && tab.classList.contains("active"));
      return active instanceof HTMLElement ? active.dataset.detailTab || "settings" : "settings";
    }
    function setDetailTab(tabName) {
      for (const tab of detailTabs) {
        if (tab instanceof HTMLElement) {
          const active = tab.dataset.detailTab === tabName;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", String(active));
          tab.setAttribute("tabindex", active ? "0" : "-1");
        }
      }
      for (const panel of detailPanels) {
        if (panel instanceof HTMLElement) {
          const active = panel.dataset.detailPanel === tabName;
          panel.classList.toggle("active", active);
          panel.hidden = !active;
        }
      }
      persistViewState(shell?.classList.contains("details-open") ?? false, tabName, activeLayout());
    }
    function setHostProfile(profileId) {
      const nextProfileId = hostProfileOptions.some((option) => {
        return option instanceof HTMLElement && option.dataset.hostProfileOption === profileId;
      }) ? profileId : "mermaid-latest";
      let activeLabel = "";
      for (const option of hostProfileOptions) {
        if (option instanceof HTMLElement) {
          const active = option.dataset.hostProfileOption === nextProfileId;
          option.classList.toggle("active", active);
          option.setAttribute("aria-pressed", String(active));
          if (active) {
            activeLabel = option.textContent?.trim() || profileId;
          }
        }
      }
      for (const card of hostProfileCards) {
        if (card instanceof HTMLElement) {
          card.hidden = card.dataset.hostProfileCard !== nextProfileId;
        }
      }
      if (hostProfileActiveLabel instanceof HTMLElement && activeLabel) {
        hostProfileActiveLabel.textContent = activeLabel;
      }
      persistViewState(shell?.classList.contains("details-open") ?? false, activeDetailTab(), activeLayout());
      scheduleUiReviewSnapshot("host-profile-changed");
    }
    setLayout(storedLayout);
    setPreviewZoom(storedPreviewZoom);
    setPreviewCollapsed(storedPreviewCollapsed);
    setPreviewFocused(storedPreviewFocused && !storedPreviewCollapsed);
    renderPreviewEditDateAxis();
    setHostProfile(storedHostProfile);
    setDetailTab(initialDetailsTab);
    setDetailsOpen(initialDetailsOpen, ${preserveInitialRowActionMenuLiteral});
    positionOpenRowActionMenus();
    for (const option of layoutOptions) {
      option.addEventListener("click", () => {
        if (option instanceof HTMLElement && option.dataset.layoutOption) {
          setLayout(option.dataset.layoutOption);
        }
      });
    }
    for (const option of hostProfileOptions) {
      option.addEventListener("click", () => {
        if (option instanceof HTMLElement && option.dataset.hostProfileOption) {
          setHostProfile(option.dataset.hostProfileOption);
        }
      });
    }
    detailsToggle?.addEventListener("click", () => {
      setDetailsOpen(!(shell?.classList.contains("details-open") ?? false), false, true);
    });
    detailsClose?.addEventListener("click", () => setDetailsOpen(false, false, true));
    previewCollapseToggle?.addEventListener("click", () => {
      setPreviewCollapsed(!isPreviewCollapsed());
    });
    previewFocusToggle?.addEventListener("click", () => {
      setPreviewFocused(!isPreviewFocused());
    });
    previewEditToggle?.addEventListener("click", () => {
      setPreviewEditMode(!isPreviewEditMode());
    });
    previewTarget?.addEventListener("pointerdown", (event) => {
      if (event instanceof PointerEvent) {
        startPreviewPan(event);
      }
    });
    previewTarget?.addEventListener("pointermove", (event) => {
      if (event instanceof PointerEvent) {
        updatePreviewPan(event);
      }
    });
    previewTarget?.addEventListener("pointerup", (event) => {
      if (event instanceof PointerEvent) {
        finishPreviewPan(event);
      }
    });
    previewTarget?.addEventListener("pointercancel", (event) => {
      if (event instanceof PointerEvent) {
        finishPreviewPan(event);
      }
    });
    previewTarget?.addEventListener("scroll", () => {
      schedulePreviewScrollPersist();
    }, { passive: true });
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        setPreviewSpacePanActive(true);
      }
    });
    document.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        setPreviewSpacePanActive(false);
      }
    });
    document.addEventListener("click", (event) => {
      const webviewErrorTab = event.target instanceof Element ? event.target.closest("[data-webview-error-tab]") : null;
      if (webviewErrorTab instanceof HTMLElement) {
        const tab = webviewErrorTab.dataset.webviewErrorTab;
        if (tab) {
          setDetailTab(tab);
          setDetailsOpen(true, false, true);
        }
        return;
      }
      const dismissWebviewError = event.target instanceof Element ? event.target.closest('[data-action="dismiss-webview-error"]') : null;
      if (dismissWebviewError instanceof HTMLElement) {
        if (webviewErrorBoundary instanceof HTMLElement) {
          webviewErrorBoundary.hidden = true;
        }
        shell?.classList.remove("webview-error-open");
        scheduleUiReviewSnapshot("webview-error-dismissed");
        return;
      }
      const target = event.target instanceof Element ? event.target.closest("[data-preview-detail-tab]") : null;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tab = target.dataset.previewDetailTab;
      if (tab) {
        setDetailTab(tab);
        setDetailsOpen(true, false, true);
      }
    });
    for (const button of previewZoomButtons) {
      button.addEventListener("click", () => {
        if (!(button instanceof HTMLElement)) {
          return;
        }
        if (button.dataset.previewZoom === "in") {
          stepPreviewZoom(1);
          return;
        }
        if (button.dataset.previewZoom === "out") {
          stepPreviewZoom(-1);
          return;
        }
        if (button.dataset.previewZoom === "reset") {
          setPreviewZoom("1");
          return;
        }
        setPreviewZoom(button.dataset.previewZoom);
      });
    }
    for (const tab of detailTabs) {
      tab.addEventListener("click", () => {
        if (tab instanceof HTMLElement && tab.dataset.detailTab) {
          setDetailTab(tab.dataset.detailTab);
          setDetailsOpen(true);
        }
      });
    }
    window.addEventListener("resize", () => {
      refreshFitPreviewZoom();
      renderPreviewEditDateAxis();
      positionOpenRowActionMenus();
    });
    if (typeof ResizeObserver !== "undefined" && previewTarget) {
      const resizeObserver = new ResizeObserver(() => {
        refreshFitPreviewZoom();
        renderPreviewEditDateAxis();
      });
      resizeObserver.observe(previewTarget);
    }
    if (${initialPreviewEditModeLiteral}) {
      setPreviewEditMode(true, false);
      const initialPreviewEditSelectedNodeId = ${initialPreviewEditSelectedNodeIdLiteral};
      if (initialPreviewEditSelectedNodeId) {
        selectPreviewMiniTask(initialPreviewEditSelectedNodeId);
      }
    }
    ${importBlock}
    refreshFitPreviewZoom();
    scheduleUiReviewSnapshot("initial");
    ${editingBlock}
    ${testWebviewOperationBlock}
  </script>`;
}
