import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  applyEditorAction,
  createEditorState,
  parseGanttLossless,
  type EditorState,
  type TaskGridRow
} from "../../src/core";
import {
  renderTaskGridHtml,
  type TaskGridWebviewLabels
} from "../../src/app";

type CaseResult = {
  taskCount: number;
  sectionCount: number;
  sourceBytes: number;
  parseMs: number;
  editorStateMs: number;
  corePipelineMs: number;
  renderHtmlMs: number;
  actionMs: {
    labelUpdateMs: number;
    dependencyUpdateMs: number;
    sortFilterMs: number;
  };
  totalMs: number;
  heapDeltaMb: number;
  result: "pass" | "warn" | "fail";
  warnings: string[];
  failures: string[];
};

const CASES = [100, 500, 1000];
const TASKS_PER_SECTION = 25;
const WARN_LIMITS = {
  corePipelineMs: 2000,
  renderHtmlMs: 2500,
  totalMs: 5000,
  heapDeltaMb: 256
};
const HARD_LIMITS = {
  corePipelineMs: 6000,
  renderHtmlMs: 6000,
  totalMs: 12000,
  heapDeltaMb: 512
};

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = resolve(root, ".tmp", "perf", "large-gantt", runId);
mkdirSync(artifactDir, { recursive: true });

const results = CASES.map(runCase);
const overallResult = results.some((result) => result.result === "fail")
  ? "fail"
  : results.some((result) => result.result === "warn")
    ? "warn"
    : "pass";

const summary = {
  runId,
  capturedAt: new Date().toISOString(),
  thresholds: {
    warn: WARN_LIMITS,
    hard: HARD_LIMITS
  },
  overallResult,
  cases: results
};

writeFileSync(join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
writeFileSync(join(artifactDir, "summary.md"), renderMarkdownSummary(summary));

console.log(`large gantt perf result: ${overallResult}`);
console.log(`large gantt perf artifacts: ${artifactDir}`);

if (overallResult === "fail") {
  process.exitCode = 1;
}

function runCase(taskCount: number): CaseResult {
  try {
    return runMeasuredCase(taskCount);
  } catch (error) {
    const source = generateLargeGanttSource(taskCount);
    return {
      taskCount,
      sectionCount: Math.ceil(taskCount / TASKS_PER_SECTION),
      sourceBytes: Buffer.byteLength(source, "utf8"),
      parseMs: 0,
      editorStateMs: 0,
      corePipelineMs: 0,
      renderHtmlMs: 0,
      actionMs: {
        labelUpdateMs: 0,
        dependencyUpdateMs: 0,
        sortFilterMs: 0
      },
      totalMs: 0,
      heapDeltaMb: 0,
      result: "fail",
      warnings: [],
      failures: [`crash: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function runMeasuredCase(taskCount: number): CaseResult {
  const warnings: string[] = [];
  const failures: string[] = [];
  const sectionCount = Math.ceil(taskCount / TASKS_PER_SECTION);
  const source = generateLargeGanttSource(taskCount);
  const sourceBytes = Buffer.byteLength(source, "utf8");
  const heapBefore = process.memoryUsage().heapUsed;

  const parseTiming = measure(() => parseGanttLossless(source));
  const stateTiming = measure(() => createEditorState(parseTiming.value));
  const htmlTiming = measure(() => renderTaskGridHtml(stateTiming.value, labels(), { allowEditing: true }));
  const actionTiming = measureActions(stateTiming.value);

  const heapDeltaMb = bytesToMb(Math.max(0, process.memoryUsage().heapUsed - heapBefore));
  const corePipelineMs = parseTiming.ms + stateTiming.ms;
  const totalMs = corePipelineMs + htmlTiming.ms + actionTiming.labelUpdateMs +
    actionTiming.dependencyUpdateMs + actionTiming.sortFilterMs;

  validateCase({
    taskCount,
    sectionCount,
    state: stateTiming.value,
    html: htmlTiming.value,
    failures
  });

  if (taskCount === 1000) {
    collectThresholdFindings({
      corePipelineMs,
      renderHtmlMs: htmlTiming.ms,
      totalMs,
      heapDeltaMb,
      warnings,
      failures
    });
  }

  return {
    taskCount,
    sectionCount,
    sourceBytes,
    parseMs: roundMs(parseTiming.ms),
    editorStateMs: roundMs(stateTiming.ms),
    corePipelineMs: roundMs(corePipelineMs),
    renderHtmlMs: roundMs(htmlTiming.ms),
    actionMs: {
      labelUpdateMs: roundMs(actionTiming.labelUpdateMs),
      dependencyUpdateMs: roundMs(actionTiming.dependencyUpdateMs),
      sortFilterMs: roundMs(actionTiming.sortFilterMs)
    },
    totalMs: roundMs(totalMs),
    heapDeltaMb: roundMb(heapDeltaMb),
    result: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    warnings,
    failures
  };
}

function generateLargeGanttSource(taskCount: number): string {
  const lines = [
    "gantt",
    `title Large Gantt Performance Fixture ${taskCount}`,
    "dateFormat YYYY-MM-DD",
    "axisFormat %m/%d"
  ];

  for (let index = 1; index <= taskCount; index += 1) {
    if ((index - 1) % TASKS_PER_SECTION === 0) {
      const sectionNumber = Math.floor((index - 1) / TASKS_PER_SECTION) + 1;
      lines.push(`section 空の確認セクション ${pad(sectionNumber, 2)} 長い日本語見出し`);
      lines.push(`section フェーズ ${pad(sectionNumber, 2)} 大規模性能検証と長い日本語見出し`);
    }
    lines.push(generateTaskLine(index));
  }

  return lines.join("\n") + "\n";
}

function generateTaskLine(index: number): string {
  const id = taskId(index);
  const label = index % 10 === 0
    ? `大規模性能確認タスク ${pad(index, 4)} 日本語ラベルと長い説明タグ付き`
    : `Large planning task ${pad(index, 4)} with deterministic long label`;
  const tags = index % 11 === 0 ? "active, " : index % 17 === 0 ? "done, " : "";
  const duration = `${(index % 5) + 1}d`;
  if (index > 1 && index % 3 === 0) {
    return `${label} : ${tags}${id}, after ${taskId(index - 1)}, ${duration}`;
  }
  const day = ((index - 1) % 28) + 1;
  const month = Math.floor((index - 1) / 28) % 12 + 1;
  return `${label} : ${tags}${id}, 2026-${pad(month, 2)}-${pad(day, 2)}, ${duration}`;
}

function measure<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function measureActions(state: EditorState): CaseResult["actionMs"] {
  const taskRows = state.grid.rows.filter((row): row is TaskGridRow => row.kind === "task");
  const firstTask = taskRows[0];
  const lastTask = taskRows[taskRows.length - 1];
  const dependencyTask = taskRows.find((row) => row.id && row.id !== firstTask?.id && row.dependencies.length > 0);
  if (!firstTask || !lastTask || !dependencyTask || !firstTask.id) {
    throw new Error("Performance fixture did not produce enough editable task rows.");
  }
  const firstTaskId = firstTask.id;

  const updatedLabel = `${lastTask.label} updated`;
  const labelUpdate = measure(() => applyEditorAction(state, {
    type: "update-task-label",
    nodeId: lastTask.nodeId,
    label: updatedLabel
  }));
  const updatedLabelRow = labelUpdate.value.state.grid.rows.find((row) => row.nodeId === lastTask.nodeId);
  if (!labelUpdate.value.sourceChanged || !labelUpdate.value.state.source.includes(updatedLabel) || updatedLabelRow?.label !== updatedLabel) {
    throw new Error("Label update action did not update the generated source.");
  }

  const dependencyUpdate = measure(() => applyEditorAction(state, {
    type: "update-task-dependencies",
    nodeId: dependencyTask.nodeId,
    refs: [firstTaskId]
  }));
  const updatedDependencyRow = dependencyUpdate.value.state.grid.rows.find((row) => row.nodeId === dependencyTask.nodeId);
  if (
    !dependencyUpdate.value.sourceChanged ||
    !dependencyUpdate.value.state.source.includes(`after ${firstTaskId}`) ||
    updatedDependencyRow?.dependencies.join(",") !== firstTaskId
  ) {
    throw new Error("Dependency update action did not update the generated source.");
  }

  const sortFilterUpdate = measure(() => applyEditorAction(state, {
    type: "update-grid-view",
    sort: { field: "label", direction: "asc" },
    filter: { text: "タスク" }
  }));
  if (sortFilterUpdate.value.sourceChanged || sortFilterUpdate.value.state.source !== state.source) {
    throw new Error("Sort/filter view update changed the source.");
  }

  return {
    labelUpdateMs: labelUpdate.ms,
    dependencyUpdateMs: dependencyUpdate.ms,
    sortFilterMs: sortFilterUpdate.ms
  };
}

function validateCase(input: {
  taskCount: number;
  sectionCount: number;
  state: EditorState;
  html: string;
  failures: string[];
}): void {
  const expectedRows = input.taskCount + input.sectionCount;
  if (input.state.mode !== "structured") {
    input.failures.push(`expected structured mode, got ${input.state.mode}`);
  }
  if (input.state.grid.rows.length !== expectedRows) {
    input.failures.push(`row count mismatch: expected ${expectedRows}, got ${input.state.grid.rows.length}`);
  }
  if (!input.state.previewSource) {
    input.failures.push("previewSource is missing");
  }
  if (input.html.trim().length === 0) {
    input.failures.push("rendered HTML is empty");
  }
  if (!input.html.includes('data-review-id="task-grid"')) {
    input.failures.push('rendered HTML is missing data-review-id="task-grid"');
  }
  if (!input.html.includes(`data-row-count="${expectedRows}"`)) {
    input.failures.push(`rendered HTML is missing data-row-count="${expectedRows}"`);
  }
}

function collectThresholdFindings(input: {
  corePipelineMs: number;
  renderHtmlMs: number;
  totalMs: number;
  heapDeltaMb: number;
  warnings: string[];
  failures: string[];
}): void {
  checkThreshold(input.corePipelineMs, WARN_LIMITS.corePipelineMs, HARD_LIMITS.corePipelineMs, "core pipeline", "ms", input);
  checkThreshold(input.renderHtmlMs, WARN_LIMITS.renderHtmlMs, HARD_LIMITS.renderHtmlMs, "HTML render", "ms", input);
  checkThreshold(input.totalMs, WARN_LIMITS.totalMs, HARD_LIMITS.totalMs, "total measured path", "ms", input);
  checkThreshold(input.heapDeltaMb, WARN_LIMITS.heapDeltaMb, HARD_LIMITS.heapDeltaMb, "heap delta", "MB", input);
}

function checkThreshold(
  value: number,
  warnLimit: number,
  hardLimit: number,
  label: string,
  unit: "ms" | "MB",
  input: { warnings: string[]; failures: string[] }
): void {
  const rounded = unit === "ms" ? roundMs(value) : roundMb(value);
  if (value > hardLimit) {
    input.failures.push(`${label} exceeded hard limit: ${rounded}${unit} > ${hardLimit}${unit}`);
    return;
  }
  if (value > warnLimit) {
    input.warnings.push(`${label} exceeded warning threshold: ${rounded}${unit} > ${warnLimit}${unit}`);
  }
}

function renderMarkdownSummary(summary: {
  runId: string;
  capturedAt: string;
  thresholds: { warn: typeof WARN_LIMITS; hard: typeof HARD_LIMITS };
  overallResult: string;
  cases: CaseResult[];
}): string {
  const lines = [
    "# Large Gantt Performance Summary",
    "",
    `- Run ID: \`${summary.runId}\``,
    `- Captured at: \`${summary.capturedAt}\``,
    `- Result: \`${summary.overallResult}\``,
    "",
    "| Tasks | Source bytes | Parse ms | Editor state ms | HTML ms | Total ms | Heap MB | Result |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  for (const item of summary.cases) {
    lines.push([
      `| ${item.taskCount}`,
      item.sourceBytes,
      item.parseMs,
      item.editorStateMs,
      item.renderHtmlMs,
      item.totalMs,
      item.heapDeltaMb,
      `\`${item.result}\` |`
    ].join(" | "));
  }
  lines.push("", "## Warnings");
  appendFindings(lines, summary.cases, "warnings");
  lines.push("", "## Failures");
  appendFindings(lines, summary.cases, "failures");
  lines.push("");
  return lines.join("\n");
}

function appendFindings(lines: string[], cases: CaseResult[], key: "warnings" | "failures"): void {
  const findings = cases.flatMap((item) => item[key].map((message) => ({ taskCount: item.taskCount, message })));
  if (findings.length === 0) {
    lines.push("- None");
    return;
  }
  for (const finding of findings) {
    lines.push(`- ${finding.taskCount} tasks: ${finding.message}`);
  }
}

function labels(): TaskGridWebviewLabels {
  return {
    title: "Mermaid Gantt Editor",
    mode: "Mode",
    taskGrid: "Task Grid",
    search: "Search",
    sort: "Sort",
    severity: "Severity",
    allSeverities: "All severities",
    noSort: "No sort",
    details: "Details",
    layout: "Layout",
    horizontal: "Horizontal",
    vertical: "Vertical",
    previewControls: "Preview controls",
    previewFit: "Fit",
    previewFill: "Fill",
    previewFitTooltip: "Fit preview to pane width.",
    previewFillTooltip: "Fill preview whitespace, capped at 1.5x width fit.",
    previewPanTooltip: "Pan preview with Space+drag or middle-button drag.",
    previewZoomOut: "Zoom out",
    previewResetZoom: "Reset zoom",
    previewZoomIn: "Zoom in",
    previewEdit: "Edit",
    previewEditDone: "Done",
    previewEditGuidance: "Drag a supported task to reschedule.",
    previewEditUnsupported: "This task cannot be dragged in Preview Edit mode.",
    previewTimelinePrevious: "Previous",
    previewTimelineNext: "Next",
    previewTimelineToday: "Today",
    previewTimelineSelected: "Selected",
    previewTimelineFit: "Fit all",
    previewMiniEditor: "Preview schedule editor",
    previewMiniEditorApply: "Apply schedule",
    previewMiniEditorNoTask: "Select a supported task to edit its dates.",
    previewCollapse: "Collapse preview",
    previewExpand: "Expand preview",
    previewFocus: "Focus preview",
    previewExitFocus: "Show Task Grid",
    diagnostics: "Diagnostics",
    documentSettings: "Document Settings",
    inspector: "Inspector",
    selectedTask: "Selected Task",
    emptySection: "Empty section",
    ganttTitle: "Gantt Title",
    accTitle: "Accessibility Title",
    accDescr: "Accessibility Description",
    dateFormat: "Date Format",
    axisFormat: "Axis Format",
    tickInterval: "Tick Interval",
    weekday: "Weekday",
    weekend: "Weekend",
    includes: "Includes",
    includesPlaceholder: "2026-05-04",
    excludes: "Excludes",
    excludesPlaceholder: "weekends",
    dateInputHelp: "Use dateFormat example: {0}",
    datePicker: "Open date picker",
    durationInputHelp: "Duration examples: 3d, 1w, 1month",
    endReplacesDurationHelp: "Setting End replaces Duration for this task.",
    durationReplacesEndHelp: "Setting Duration replaces End for this task.",
    dateInputWarning: "This date does not match dateFormat.",
    dateRangeWarning: "End is before start.",
    todayMarker: "Today Marker",
    topAxis: "Top Axis",
    inclusiveEndDates: "Inclusive End Dates",
    previewSource: "Preview Source",
    previewDiagram: "Preview",
    advancedSourceItems: "Advanced Source Items",
    section: "Section",
    task: "Task",
    id: "ID",
    start: "Start",
    end: "End",
    duration: "Duration",
    dependencies: "Depends",
    until: "Until",
    dependencySearchPlaceholder: "Search task ID or label",
    dependencyNoMatches: "No matching tasks",
    tags: "Tags",
    tagToggle: "Toggle tag {0}",
    actions: "Actions",
    undo: "Undo",
    redo: "Redo",
    addSection: "Add section",
    addSectionBelow: "Add section below",
    addTask: "Add task",
    addTaskAbove: "Add task above",
    addTaskBelow: "Add task below",
    addTaskAtSectionTop: "Add task at section top",
    duplicateTask: "Duplicate task",
    moveTaskUp: "Move task up",
    moveTaskDown: "Move task down",
    moveTaskToSection: "Move to section: {0}",
    moveSectionUp: "Move section up",
    moveSectionDown: "Move section down",
    deleteTask: "Delete task",
    deleteTaskConfirm: "Delete this task?",
    deleteSection: "Delete section",
    deleteSectionConfirm: "Delete this section?",
    rawSourceEditor: "Raw Source Editor",
    sourceOrder: "Source Order",
    noTaskSelected: "No task selected.",
    noDiagnostics: "No diagnostics.",
    noAdvancedSourceItems: "No advanced source items.",
    limitedEditing: "Preview source is unavailable. Structured editing is limited; review diagnostics and Advanced Source Items before writing back.",
    fallbackEditing: "Unsupported in structured mode. Structured editing is disabled; use Diagnostics or Raw Source Editor so the lossless source is preserved.",
    previewBlocked: "Preview source is blocked by projection issues. Review diagnostics or advanced source items.",
    previewRenderFailed: "Preview render failed: ",
    previewBlockedTitle: "Preview blocked",
    previewRenderFailedTitle: "Preview render failed",
    previewOpenDiagnostics: "Open Diagnostics",
    previewOpenAdvanced: "Open Advanced Source Items",
    previewOpenSource: "Open Source",
    webviewErrorTitle: "Task Grid error",
    webviewErrorMessage: "The source is preserved. Review Diagnostics or Source, then reopen Task Grid if needed.",
    webviewErrorOpenDiagnostics: "Open Diagnostics",
    webviewErrorOpenSource: "Open Source",
    webviewErrorDismiss: "Dismiss",
    taskLabelEditor: "Task Label",
    taskLabelEditorHelp: "Use this multiline editor for long labels. The original source is updated only when the field changes.",
    mermaidRuntime: "Mermaid Runtime",
    mermaidRuntimeBundledVersion: "Bundled Mermaid {0}",
    mermaidRuntimeSecurityLevel: "Security Level",
    mermaidRuntimeDeterministic: "The preview uses the bundled runtime for deterministic editing; target hosts can still render differently.",
    hostCompatibility: "Host Compatibility",
    hostCompatibilityGuidance: "Profiles are guidance only; verify the target host Mermaid version before publishing.",
    hostCompatibilityProfileMermaidLatest: "Mermaid latest",
    hostCompatibilityProfileGitHub: "GitHub",
    hostCompatibilityProfileGitLab: "GitLab",
    hostCompatibilityProfileObsidian: "Obsidian",
    hostCompatibilityWarningCount: "{0} compatibility warnings",
    hostCompatibilityRetainedCount: "{0} retained source items",
    hostCompatibilityProfileWarnings: "Profile warnings",
    hostCompatibilityNoWarnings: "No profile-specific warnings for the current source.",
    hostCompatibilityRiskySyntax: "Risky syntax",
    hostCompatibilitySelectedProfile: "Target Host",
    hostCompatibilityRuntimeGitHub: "GitHub-hosted Mermaid",
    hostCompatibilityRuntimeGitLab: "GitLab-hosted Mermaid",
    hostCompatibilityRuntimeObsidian: "Obsidian-hosted Mermaid",
    hostCompatibilityWarningClickCall: "click / call statements are retained in source, but host interaction and security behavior can differ.",
    hostCompatibilityWarningConfig: "frontmatter or init directives are retained; verify whether the target host accepts the same Mermaid config.",
    hostCompatibilityWarningGitHub: "GitHub chooses the Mermaid runtime in the host; use the preview as guidance, not as a guarantee.",
    hostCompatibilityWarningGitLab: "GitLab-hosted Mermaid rendering can lag bundled Mermaid; verify syntax before publishing.",
    hostCompatibilityWarningObsidian: "Obsidian Mermaid behavior depends on the app/plugin version and local settings.",
    diagnosticsStage: "Stage",
    diagnosticsLocation: "Location",
    diagnosticsReason: "Reason",
    diagnosticsImpact: "Impact",
    diagnosticsAction: "Action",
    removeBlockingReference: "Remove reference {0}",
    replaceBlockingReference: "Replace reference with {0}",
    useExistingTaskId: "Use dependency {0}",
    fallbackImpact: "Structured editing and preview are blocked until this source can be projected safely.",
    limitedEditingImpact: "Preview source is blocked; supported grid fields still use source-preserving write-back.",
    diagnosticImpact: "Review the highlighted source range before applying an action.",
    advancedSourceGuidance: "This retained source item is not currently editable in the grid. It stays in the source and can be reviewed or edited from Raw Source Editor.",
    advancedSourceType: "Type",
    advancedSourceRange: "Source range",
    advancedSourceEditability: "Editability",
    advancedSourceRawOnly: "Raw source only",
    advancedSourceReason: "Reason",
    advancedSourceOpenSource: "Open Source",
    advancedSourceOpenDiagnostics: "Open Diagnostics",
    diagnosticMessages: {
      "diagnostics.dateFormatMismatch": "Task date does not match dateFormat.",
      "diagnostics.duplicateTaskId": "Task ID is duplicated.",
      "diagnostics.circularDependency": "Dependency graph contains a cycle.",
      "diagnostics.hostVersionSensitiveSyntax": "This syntax may depend on the Mermaid host version.",
      "diagnostics.includeExcludeConflict": "Includes and Excludes contain the same value.",
      "diagnostics.invalidTickInterval": "Tick Interval is invalid.",
      "diagnostics.keywordLikeTaskLabel": "Task label looks like a Mermaid keyword.",
      "diagnostics.longLabelReadability": "Task label may be hard to read in the preview.",
      "diagnostics.selfDependency": "Task depends on itself.",
      "diagnostics.undefinedDependency": "Dependency references an unknown task ID.",
      "diagnostics.topAxisPreviewUnsupported": "Top Axis is retained in source, but preview rendering is currently unsupported.",
      "diagnostics.editorTaskDeleteReferenced": "Task is referenced by dependency or click source.",
      "diagnostics.editorSectionDeleteReferenced": "Section contains tasks referenced from outside the section.",
      "diagnostics.editorInvalidTickInterval": "Tick Interval is invalid."
    },
    diagnosticActionLabels: {
      "diagnostics.action.alignDateFormat": "Align task dates with dateFormat",
      "diagnostics.action.renameTaskId": "Rename task ID",
      "diagnostics.action.changeDependency": "Change dependency",
      "diagnostics.action.checkMermaidHostVersion": "Check Mermaid host version",
      "diagnostics.action.reviewIncludeExclude": "Review Includes and Excludes",
      "diagnostics.action.useValidTickInterval": "Use a valid Tick Interval",
      "diagnostics.action.renameKeywordLikeLabel": "Rename task label",
      "diagnostics.action.reviewPreviewLabel": "Review preview label",
      "diagnostics.action.chooseExistingTaskId": "Choose existing task ID",
      "diagnostics.action.reviewSource": "Review source",
      "diagnostics.action.useOneWeekTickInterval": "Use 1week",
      "diagnostics.action.convertDateToConfiguredFormat": "Convert date to dateFormat",
      "diagnostics.action.renameDuplicateTaskId": "Rename duplicate task ID",
      "diagnostics.action.prefixKeywordLikeLabel": "Prefix task label",
      "diagnostics.action.commentOutCompactDisplayMode": "Comment out compact display mode",
      "diagnostics.action.useExistingTaskId": "Use existing task ID"
    }
  };
}

function taskId(index: number): string {
  return `t${pad(index, 4)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function bytesToMb(value: number): number {
  return value / 1024 / 1024;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMb(value: number): number {
  return Math.round(value * 100) / 100;
}
