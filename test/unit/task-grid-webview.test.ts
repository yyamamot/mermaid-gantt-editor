import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEditorAction,
  createPreviewScheduleEditModel,
  createEditorState,
  parseGanttLossless
} from "../../src/core";
import {
  renderTaskGridHtml,
  type TaskGridAppHostAdapter,
  type TaskGridWebviewLabels
} from "../../src/app";
import { renderEditingMessageHandlers } from "../../src/app";
import { renderPreviewScheduleOverlay } from "../../src/app";
import { renderTestWebviewOperationBlock } from "../../src/app";

describe("renderTaskGridHtml", () => {
  it("renders Task Grid rows, diagnostics, preview source, and advanced source items", () => {
    const state = createEditorState(parseGanttLossless([
      "%%{init: { \"theme\": \"forest\" }}%%",
      "gantt",
      "section 設計",
      "Task <A> : a1, after missing, 2d",
      "%% comment"
    ].join("\n") + "\n"));
    const html = renderTaskGridHtml(state, labels());

    expect(html).toContain("Task Grid");
    expect(html).toContain("layout-horizontal");
    expect(html).toContain('class="preview-pane"');
    expect(html).toContain('class="details-drawer"');
    expect(html).toContain('id="details-toggle"');
    expect(html).toContain('aria-controls="details-drawer"');
    expect(html).toContain('id="details-drawer"');
    expect(html).toContain('role="complementary"');
    expect(html).toContain('data-layout-option="horizontal"');
    expect(html).toContain('data-layout-option="vertical"');
    expect(html).toContain('aria-pressed="true">Horizontal</button>');
    expect(html).toContain('aria-pressed="false">Vertical</button>');
    expect(html).toContain('style="--task-grid-row-count: 1"');
    expect(html).toContain('data-row-count="1"');
    expect(html).toContain('id="llm-ui-self-review"');
    expect(html).toContain("&quot;mode&quot;:&quot;structured&quot;");
    expect(html).toContain("&quot;visibleRowCount&quot;:1");
    expect(html).toContain("&quot;detailsOpen&quot;:true");
    expect(html).toContain("grid-preview-balance");
    expect(html).toContain("task-grid-column-overflow");
    expect(html).toContain("structured-action-visibility");
    expect(html).toContain("--bg: var(--vscode-editor-background");
    expect(html).toContain("--panel: var(--vscode-sideBar-background");
    expect(html).toContain("--input-bg: var(--vscode-input-background");
    expect(html).toContain("--button-bg: var(--vscode-button-background");
    expect(html).toContain("--preview-canvas-bg: #ffffff");
    expect(html).toContain("background: var(--preview-canvas-bg)");
    expect(html).toContain("color: var(--preview-canvas-fg)");
    expect(html).toContain("&quot;previewTheme&quot;:&quot;light-canvas&quot;");
    expect(html).toContain("&quot;previewPanEnabled&quot;:true");
    expect(html).toContain("&quot;previewPanGesture&quot;:&quot;Space+drag or middle-button drag&quot;");
    expect(html).toContain("&quot;previewScrollRestored&quot;:false");
    expect(html).toContain("&quot;previewErrorCard&quot;:&quot;blocked&quot;");
    expect(html).toContain("&quot;webviewErrorBoundary&quot;:true");
    expect(html).toContain("&quot;webviewErrorVisible&quot;:false");
    expect(html).toContain("&quot;previewEditMode&quot;:false");
    expect(html).toContain("&quot;previewMiniEditor&quot;:true");
    expect(html).toContain("&quot;previewMiniEditorOpen&quot;:false");
    expect(html).toContain("&quot;previewTimelineDays&quot;");
    expect(html).toContain("&quot;previewDateAxis&quot;:true");
    expect(html).toContain("&quot;previewDragGuide&quot;:true");
    expect(html).toContain("&quot;previewKeyboardNudge&quot;:true");
    expect(html).toContain("&quot;previewKeyboardResize&quot;:true");
    expect(html).toContain("&quot;keyboardReview&quot;:true");
    expect(html).toContain("&quot;detailsFocusManaged&quot;:true");
    expect(html).toContain("&quot;activeMenuKeyboardNavigable&quot;:true");
    expect(html).toContain("&quot;pickerKeyboardNavigable&quot;:true");
    expect(html).toContain("&quot;escapePriority&quot;:[&quot;preview-drag&quot;,&quot;preview-mini-editor&quot;,&quot;row-action-menu&quot;,&quot;details-drawer&quot;]");
    expect(html).toContain("&quot;draggableTaskCount&quot;:0");
    expect(html).toContain("&quot;unsupportedTaskCount&quot;:1");
    expect(html).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr))");
    expect(html).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(html).toContain("table-layout: fixed");
    expect(html).toContain("width: 94rem");
    expect(html).toContain("grid-no-tags");
    expect(html).toContain(".grid.grid-no-tags");
    expect(html).toContain(".grid.grid-has-tags");
    expect(html).toContain(".grid.grid-has-tags .col-start");
    expect(html).toContain(".grid.grid-has-tags .col-end { width: 14%; }");
    expect(html).toContain(".grid.grid-has-tags .col-actions { width: 5%; }");
    expect(html).toContain(".grid.grid-no-tags .col-end { width: 16%; }");
    expect(html).toContain(".shell.layout-vertical .grid.grid-has-tags .col-end { width: 24%; }");
    expect(html).toContain(".shell.layout-vertical .grid.grid-no-tags .col-end { width: 23%; }");
    expect(html).toContain(".shell.responsive-narrow .grid.grid-has-tags .col-start");
    expect(html).toContain(".shell.responsive-narrow .grid.grid-has-tags .col-end { width: 21%; }");
    expect(html).toContain(".shell.responsive-narrow .grid.grid-no-tags .col-end { width: 20%; }");
    expect(html).toContain("padding-inline: 6px 8px");
    expect(html).toContain('<col class="col-section">');
    expect(html).toContain('<td class="section-label"');
    expect(html).toContain(".shell.responsive-narrow");
    expect(html).toContain("responsive-japanese-layout");
    expect(html).toContain("popup-viewport-clamp");
    expect(html).toContain("keyboard-accessibility");
    expect(html).toContain("focus-restore");
    expect(html).toContain("menu-keyboard-navigation");
    expect(html).toContain("overflow-x: hidden");
    expect(html).toContain(".details-drawer input");
    expect(html).toContain("white-space: normal");
    expect(html).toContain("ResizeObserver loop completed with undelivered notifications.");
    expect(html).toContain("min-height: 3.1rem");
    expect(html).toContain('data-review-id="shell"');
    expect(html).toContain('data-review-id="task-grid"');
    expect(html).toContain('data-review-id="preview-pane"');
    expect(html).toContain('data-review-id="details-drawer"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('tabindex="0" aria-controls="detail-panel-diagnostics"');
    expect(html).toContain('tabindex="-1" aria-controls="detail-panel-settings"');
    expect(html).toContain('aria-controls="detail-panel-diagnostics"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="detail-tab-diagnostics"');
    expect(html).toContain('id="detail-panel-settings" role="tabpanel" aria-labelledby="detail-tab-settings" hidden');
    expect(html).toContain("details-open");
    expect(html).toContain('data-initial-detail-tab="diagnostics"');
    expect(html).toContain('class="section-header"');
    expect(html).toContain('class="task-grid-toolbar"');
    expect(html).toContain('class="compact-search"');
    expect(html).toContain('data-action="update-grid-filter-text"');
    expect(html).toContain('data-action="update-grid-filter-severity"');
    expect(html).toContain('data-action="update-grid-sort"');
    expect(html).not.toContain('class="toolbar"');
    expect(html).toContain("設計");
    expect(html).toContain("Task &lt;A&gt;");
    expect(html).toContain("UNDEFINED_DEPENDENCY");
    expect(html).toContain('data-diagnostic-code="UNDEFINED_DEPENDENCY"');
    expect(html).toContain('data-action="apply-diagnostic-action"');
    expect(html).toContain('data-action-index="0"');
    expect(html).toContain("data-start-offset=");
    expect(html).toContain("Inspector");
    expect(html).toContain("Document Settings");
    expect(html).toContain("Task Label");
    expect(html).toContain("Structured editing is limited");
    expect(html).toContain("Dependency references an unknown task ID.");
    expect(html).toContain("Choose an existing task ID");
    expect(html).not.toContain("diagnostics.undefinedDependency");
    expect(html).toContain("Stage");
    expect(html).toContain("Location");
    expect(html).toContain("Reason");
    expect(html).toContain("Impact");
    expect(html).toContain("Action");
    expect(html).toContain("Host Compatibility");
    expect(html).toContain('data-review-id="host-compatibility-profile"');
    expect(html).toContain('data-review-id="mermaid-runtime-profile"');
    expect(html).toContain('data-mermaid-runtime="bundled"');
    expect(html).toContain('data-mermaid-runtime-version="11.14.0"');
    expect(html).toContain("Bundled Mermaid 11.14.0");
    expect(html).toContain("Security Level");
    expect(html).toContain("Target Host");
    expect(html).toContain('data-host-profile-option="github"');
    expect(html).toContain('data-host-profile="github"');
    expect(html).toContain('data-host-profile="gitlab"');
    expect(html).toContain('data-host-profile="obsidian"');
    expect(html).toContain('data-host-profile-card="github"');
    expect(html).toContain("Profiles are guidance only");
    expect(html).toContain("0 compatibility warnings");
    expect(html).toContain("1 retained source items");
    expect(html).toContain("Directive");
    expect(html).toContain("Comment");
    expect(html).toContain("This retained source item is not currently editable");
    expect(html).toContain("Raw source only");
    expect(html).toContain("Source range");
    expect(html).toContain('class="advanced-source-actions"');
    expect(html).toContain(">Open Source</button>");
    expect(html).toContain("Preview source is blocked");
    expect(html).toContain("Preview blocked");
    expect(html).toContain('data-review-id="preview-status-card"');
    expect(html).toContain('data-preview-status="blocked"');
    expect(html).toContain('data-preview-detail-tab="diagnostics"');
    expect(html).toContain('data-preview-detail-tab="advanced"');
    expect(html).toContain('data-preview-detail-tab="source"');
    expect(html).toContain("Raw Source Editor");
    expect(html).toContain('data-action="replace-source"');
    expect(html).toContain('id="mermaid-preview"');
    expect(html).toContain('id="webview-error-boundary"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("The source is preserved.");
    expect(html).toContain('data-webview-error-tab="diagnostics"');
    expect(html).toContain('data-action="dismiss-webview-error"');
    expect(html).toContain('class="preview-header"');
    expect(html).toContain('data-preview-zoom="fit"');
    expect(html).toContain('data-preview-zoom="fill"');
    expect(html).toContain('aria-label="Fit preview to pane width."');
    expect(html).toContain('title="Fit preview to pane width."');
    expect(html).toContain('aria-label="Fill preview whitespace, capped at 1.5x width fit."');
    expect(html).toContain('title="Fill preview whitespace, capped at 1.5x width fit."');
    expect(html).toContain('title="Pan preview with Space+drag or middle-button drag."');
    expect(html).toContain('data-preview-zoom="out"');
    expect(html).toContain('data-preview-zoom="reset"');
    expect(html).toContain('data-preview-zoom="in"');
    expect(html).toContain('id="preview-edit-toggle"');
    expect(html).toContain('data-review-id="preview-edit-toggle"');
    expect(html).toContain('id="preview-edit-overlay"');
    expect(html).toContain('data-review-id="preview-edit-overlay"');
    expect(html).toContain('data-editable="false"');
    expect(html).not.toContain("data-preview-theme");
    expect(html).not.toContain("dark Mermaid");
    expect(html).not.toContain('theme: "dark"');
    expect(html).toContain('id="preview-collapse-toggle"');
    expect(html).toContain('aria-label="Collapse preview"');
    expect(html).toContain('title="Collapse preview"');
    expect(html).toContain('data-collapse-label="Collapse preview"');
    expect(html).toContain('data-expand-label="Expand preview"');
    expect(html).toContain('id="preview-focus-toggle"');
    expect(html).toContain('data-review-id="preview-focus-toggle"');
    expect(html).toContain('aria-label="Focus preview"');
    expect(html).toContain('title="Focus preview"');
    expect(html).toContain('data-focus-label="Focus preview"');
    expect(html).toContain('data-exit-focus-label="Show Task Grid"');
    expect(html).toContain("&quot;previewFocused&quot;:false");
    expect(html).toContain(".shell.preview-focused .main");
    expect(html).toContain("setPreviewFocused");
    expect(html).not.toContain('class="shell layout-horizontal preview-collapsed');
    expect(html).toContain('data-default-preview-collapsed="false"');
    expect(html).toContain("calculateFitPreviewZoom");
    expect(html).toContain("calculateFillPreviewZoom");
    expect(html).toContain("ResizeObserver");
    expect(html).toContain('data-detail-panel="source"');
    expect(html).not.toContain("Task <A>");
  });

  it("uses compact proportional grid columns when tags are present", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Design review : done, a1, 2026-04-25, 2d",
      "Implementation : b1, after a1, 3d"
    ].join("\n") + "\n"));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });
    const tableHtml = html.slice(html.indexOf('<table class="grid'), html.indexOf("</table>"));

    expect(tableHtml).toContain('<table class="grid grid-has-tags" data-review-id="task-grid-table">');
    expect(html).toContain('<div class="table-wrap" data-review-id="task-grid-table-wrap">');
    expect(tableHtml).toContain('<col class="col-tags">');
    expect(tableHtml).toContain("<th>Tags</th>");
    expect(tableHtml).toContain('<span class="chip">done</span>');
    expect(html).toContain(".grid.grid-has-tags .col-section { width: 12%; }");
    expect(html).toContain(".grid.grid-has-tags .col-task { width: 22%; }");
    expect(html).toContain(".grid.grid-has-tags .col-start");
    expect(html).toContain(".grid.grid-has-tags .col-end { width: 14%; }");
    expect(html).toContain(".grid.grid-has-tags .col-tags { width: 8%; }");
  });

  it("localizes dynamic dependency quick-fix labels through Webview labels", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "Task B : b1, after missing, 2d"
    ].join("\n") + "\n"));
    const html = renderTaskGridHtml(state, labels());

    expect(html).toContain(">Use dependency a1</button>");
    expect(html).toContain('data-diagnostic-code="UNDEFINED_DEPENDENCY"');
  });

  it("can render editable cells with a nonce-bound script", () => {
    const state = createEditorState(parseGanttLossless("gantt\nincludes weekdays\nexcludes weekends\nsection Planning\nTask A : a1, 2d\nTask B : b1, after a1, 1d\nsection Build\nTask C : c1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      nonce: "abc123",
      mermaidModuleUri: "vscode-resource://mermaid.esm.min.mjs",
      initialDetailsOpen: true,
      initialDetailTab: "settings",
      enableUiReviewSnapshot: true
    });

    expect(html).toContain('nonce="abc123"');
    expect(html).toContain("details-open");
    expect(html).toContain('data-initial-detail-tab="settings"');
    expect(html).toContain('import mermaid from "vscode-resource://mermaid.esm.min.mjs"');
    expect(html).toContain('mermaid.render("mermaid-gantt-preview"');
    expect(html).toContain('mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });');
    expect(html).not.toContain('theme: "dark"');
    expect(html).toContain('type: "preview-render-started"');
    expect(html).toContain('type: "preview-render-succeeded"');
    expect(html).toContain('type: "preview-render-failed"');
    expect(html).toContain("previewCollapsed");
    expect(html).toContain("previewFocused");
    expect(html).toContain("previewSelectedTaskVisible");
    expect(html).toContain("previewViewportAction");
    expect(html).toContain("previewTimelineSticky");
    expect(html).toContain("previewDateAxisTickCount");
    expect(html).toContain("previewDragGuide");
    expect(html).toContain("previewKeyboardNudge");
    expect(html).toContain("previewKeyboardResize");
    expect(html).toContain("setPreviewCollapsed");
    expect(html).toContain("previewZoomValueButton");
    expect(html).toContain("updatePreviewZoomValue(zoom)");
    expect(html).toContain("formatPreviewZoomPercent(zoom)");
    expect(html).toContain("setPreviewZoom(activePreviewZoom())");
    expect(html).toContain("previewScrollLeft");
    expect(html).toContain("previewScrollTop");
    expect(html).toContain("webviewErrorVisible");
    expect(html).toContain('type: "webview-error"');
    expect(html).toContain('window.addEventListener("error"');
    expect(html).toContain('window.addEventListener("unhandledrejection"');
    expect(html).toContain("showWebviewErrorBoundary");
    expect(html).toContain("webview-error-dismissed");
    expect(html).toContain("restorePreviewScroll()");
    expect(html).toContain("startPreviewPan(event)");
    expect(html).toContain("finishPreviewPan(event)");
    expect(html).toContain("space-pan-ready");
    expect(html).toContain("is-panning");
    expect(html).toContain('renderPreviewStatusCard("failed"');
    expect(html).toContain("previewPanEnabled: true");
    expect(html).toContain("previewErrorCard");
    expect(html).toContain("setPreviewEditMode");
    expect(html).toContain('type: "preview-edit-state"');
    expect(html).toContain("postPreviewEditState");
    expect(html).toContain("initialPreviewEditSelectedNodeId");
    expect(html).toContain("previewScheduleEditModel");
    expect(html).toContain('data-review-id="preview-edit-timeline-controls"');
    expect(html).toContain('data-review-id="preview-edit-date-axis"');
    expect(html).toContain('data-review-id="preview-edit-guide-line"');
    expect(html).toContain('data-review-id="preview-edit-axis-cursor"');
    expect(html).toContain("preview-edit-axis-tick");
    expect(html).toContain("preview-edit-guide-line");
    expect(html).toContain("preview-edit-axis-cursor");
    expect(html).toContain("renderPreviewEditDateAxis");
    expect(html).toContain("previewEditDateAxisStep");
    expect(html).toContain("previewEditDateAxisLabel");
    expect(html).toContain("updatePreviewDragGuide");
    expect(html).toContain("hidePreviewDragGuide");
    expect(html).toContain("previewKeyboardNudge(event)");
    expect(html).toContain("function previewKeyboardNudge(event)");
    expect(html).toContain("previewKeyboardResize(event)");
    expect(html).toContain("function previewKeyboardResize(event)");
    expect(html).toContain('event.key !== "ArrowLeft" && event.key !== "ArrowRight"');
    expect(html).toContain("event.shiftKey ? 7 : 1");
    expect(html).toContain('previewResizePatch(previewMiniSelectedTaskId, "right", dayDelta)');
    expect(html).toContain('data-action="preview-edit-viewport"');
    expect(html).toContain('data-value="selected"');
    expect(html).toContain('data-review-id="preview-edit-viewport-selected"');
    expect(html).toContain(">Selected</button>");
    expect(html).toContain('type: "preview-edit-viewport"');
    expect(html).toContain("applyPreviewEditViewportAction");
    expect(html).toContain("setPreviewEditViewport");
    expect(html).toContain("ensurePreviewSelectedTaskInViewport");
    expect(html).toContain("viewportForPreviewTask");
    expect(html).toContain("selectedPreviewTaskIsVisible");
    expect(html).toContain("previewLastViewportAction");
    expect(html).toContain("defaultDomainStartDay");
    expect(html).toContain("updatePreviewDrag(event);\n      commitPreviewDrag();");
    expect(html).toContain('type: "preview-drag-task"');
    expect(html).toContain('type: "preview-resize-task"');
    expect(html).toContain('type: "preview-mini-update-task"');
    expect(html).toContain("data-preview-edit-task");
    expect(html).toContain('id="preview-edit-drag-tooltip"');
    expect(html).toContain("previewDragTooltipLabel");
    expect(html).toContain("updatePreviewDragTooltip");
    expect(html).toContain("hidePreviewDragTooltip");
    expect(html).toContain('mode: resizeEdge ? "resize" : "move"');
    expect(html).toContain('id="preview-mini-editor"');
    expect(html).toContain('data-review-id="preview-mini-editor"');
    expect(html).toContain('data-action="preview-mini-apply"');
    expect(html).toContain('data-action="preview-mini-open-date"');
    expect(html).toContain('button.dataset.action = "preview-mini-calendar-day"');
    expect(html).toContain('data-action="preview-mini-calendar-month"');
    expect(html).toContain('data-action="preview-mini-duration-step"');
    expect(html).toContain('data-action="preview-mini-duration-option"');
    expect(html).toContain("renderPreviewMiniCalendar");
    expect(html).toContain("openPreviewMiniCalendar");
    expect(html).toContain("togglePreviewMiniCalendar");
    expect(html).toContain("previewMiniCalendarState.field === field");
    expect(html).toContain("positionPreviewMiniCalendar");
    expect(html).toContain("--preview-mini-calendar-left");
    expect(html).toContain("width: min(19.5rem, calc(100% - 20px));");
    expect(html).toContain("max-height: min(17rem, calc(100vh - 24px));");
    expect(html).toContain("const minTop = 12 - editorRect.top;");
    expect(html).toContain("stepPreviewMiniDuration");
    expect(html).toContain('class="preview-mini-value" data-preview-mini-field="start"');
    expect(html).toContain('class="preview-mini-value" data-preview-mini-field="end"');
    expect(html).toContain('class="preview-mini-value" data-preview-mini-field="duration"');
    expect(html).not.toContain('<input data-preview-mini-field=');
    expect(html).not.toContain('data-action="preview-mini-pick-date"');
    expect(html).not.toContain("showPicker");
    expect(html).not.toContain('vscode.postMessage({ type: "select-task", nodeId })');
    expect(html).toContain("selectPreviewMiniTask");
    expect(html).toContain("applyPreviewMiniEditor");
    expect(html).toContain("Drag a supported task to reschedule.");
    expect(html).toContain('type: "ui-review-snapshot"');
    expect(html).toContain("collectUiReviewGeometry");
    expect(html).toContain("popup-anchor");
    expect(html).toContain('data-action="update-task-label"');
    expect(html).toContain('class="wide rich-label-editor"');
    expect(html).toContain(">Task Label");
    expect(html).toContain("Use this multiline editor for long labels.");
    expect(html).toContain('data-action="update-task-id"');
    expect(html).toContain('data-action="update-task-start"');
    expect(html).toContain('data-action="update-task-end"');
    expect(html).toContain('data-action="update-task-duration"');
    expect(html).toContain('data-action="update-task-dependencies"');
    expect(html).toContain('data-action="update-task-until"');
    expect(html).toContain('data-action="update-task-tags"');
    expect(html).toContain('data-action="toggle-task-tag"');
    expect(html).toContain('data-tag="milestone"');
    expect(html).toContain('aria-label="Toggle tag milestone"');
    expect(html).toContain('data-action="update-section-label"');
    expect(html).toContain('data-action="update-setting"');
    expect(html).toContain('data-action="undo"');
    expect(html).toContain('data-action="redo"');
    expect(html).toContain('aria-label="Undo"');
    expect(html).toContain('title="Redo"');
    expect(html).toContain('data-action="add-section"');
    expect(html).toContain(">Add section</button>");
    expect(html).toContain('data-action="add-task"');
    expect(html).toContain(">Add task</button>");
    expect(html).toContain(">Add task above</button>");
    expect(html).toContain(">Add task below</button>");
    expect(html).toContain(">Add task at section top</button>");
    expect(html).toContain(">Duplicate task</button>");
    expect(html).toContain('type: "add-task"');
    const settingsPanel = html.slice(
      html.indexOf('data-detail-panel="settings"'),
      html.indexOf('data-detail-panel="inspector"')
    );
    expect(settingsPanel).toContain('data-action="update-grid-sort"');
    const diagnosticsPanel = html.slice(
      html.indexOf('data-detail-panel="diagnostics"'),
      html.indexOf('data-detail-panel="advanced"')
    );
    expect(diagnosticsPanel).toContain('data-action="update-grid-filter-severity"');
    expect(html).toContain('data-action="request-delete-task"');
    expect(html).toContain('data-action="toggle-row-action-menu"');
    expect(html).toContain('data-action="duplicate-task"');
    expect(html).toContain('data-action="move-task"');
    expect(html).toContain('data-action="move-task-to-section"');
    expect(html).toContain('data-action="request-delete-section"');
    expect(html).toContain('data-action="move-section"');
    expect(html).toContain(">Add section below</button>");
    expect(html).toContain('data-direction="up"');
    expect(html).toContain('data-direction="down"');
    expect(html).toContain(">Move task up</button>");
    expect(html).toContain(">Move task down</button>");
    expect(html).toContain(">Move to section: Planning</button>");
    expect(html).toContain(">Move section up</button>");
    expect(html).toContain(">Move section down</button>");
    expect(html).toContain(">Delete section</button>");
    expect(html).toContain('type: "request-delete-section"');
    expect(html).toContain('type: "move-task"');
    expect(html).toContain('type: "move-task-to-section"');
    expect(html).toContain('type: "move-section"');
    expect(html).toContain('type: "update-task-tags"');
    expect(html).toContain("data-current-tags");
    expect(html).toContain("nextTags.join(\" \")");
    expect(html).toContain('closest(".field-block")');
    expect(html).toContain('event.stopPropagation()');
    expect(html).toContain('getAttribute("aria-pressed") === "true"');
    expect(html).toContain('group.dataset.currentTags = nextTags.join(" ")');
    expect(html).toContain('setAttribute("aria-pressed"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain("function closeRowActionMenus(restoreFocus = false)");
    expect(html).toContain('function openRowActionMenu(button, focusPosition = "none")');
    expect(html).toContain("drawerRect.left - margin");
    expect(html).toContain("viewportRight - menuRect.width");
    expect(html).toContain('shell?.classList.contains("responsive-narrow")');
    expect(html).toContain("preferAbove && fallbackTop >= margin");
    expect(html).toContain("function intersectsVisibleClipAncestors(element, rect");
    expect(html).toContain('style.position === "fixed"');
    expect(html).toContain("ancestorStyle.overflowY");
    expect(html).toContain("setDetailsOpen(false, true)");
    expect(html).toContain("actionTarget instanceof HTMLInputElement");
    expect(html).toContain("actionTarget instanceof HTMLTextAreaElement");
    expect(html).toContain("actionTarget instanceof HTMLSelectElement");
    expect(html).toContain("<th>Actions</th>");
    expect(html).toContain('<td class="row-actions"><div class="row-action-menu-wrap"');
    expect(html).toContain('<button class="menu-item danger"');
    expect(html).toContain('<button class="danger-button wide"');
    expect(html).toContain('aria-label="Delete task"');
    expect(html).toContain('title="Delete task"');
    expect(html).toContain('<svg viewBox="0 0 24 24"');
    expect(html).toContain(">Delete task</button>");
    expect(html).toContain("Delete this task?");
    expect(html).toContain('type: "request-delete-task"');
    expect(html).toContain('type: key === "y" || event.shiftKey ? "redo" : "undo"');
    expect(html).toContain('event.preventDefault()');
    expect(html).not.toContain("confirm(message)");
    expect(html).toContain('data-setting-key="title"');
    expect(html).toContain('data-setting-key="accTitle"');
    expect(html).toContain('data-setting-key="accDescr"');
    expect(html).toContain("Accessibility Title");
    expect(html).toContain("Accessibility Description");
    expect(html).toContain('data-setting-key="dateFormat"');
    expect(html).toContain('data-setting-key="axisFormat" value="" placeholder="%Y-%m-%d"');
    expect(html).toContain('data-setting-key="tickInterval" value="" placeholder="1week"');
    expect(html).toContain('data-action="apply-input-option" data-target-action="update-setting" data-setting-key="tickInterval"');
    expect(html).toContain('data-value="1week"');
    expect(html).toContain('data-setting-key="weekday"');
    expect(html).toContain('<select data-action="update-setting" data-setting-key="weekday">');
    expect(html).toContain('<option value="monday">monday</option>');
    expect(html).toContain('data-setting-key="weekend"');
    expect(html).toContain('<select data-action="update-setting" data-setting-key="weekend">');
    expect(html).toContain('<option value="saturday">saturday</option>');
    expect(html).toContain('data-setting-key="includes"');
    expect(html).toContain('data-setting-key="excludes"');
    expect(html).toContain("<textarea");
    expect(html).toContain('placeholder="2026-05-04"');
    expect(html).toContain('placeholder="weekends"');
    expect(html).toContain('data-setting-key="todayMarker" value="" placeholder="stroke-width:2px,stroke:#f00"');
    expect(html).toContain(">weekdays</textarea>");
    expect(html).toContain(">weekends</textarea>");
    expect(html).not.toContain('data-setting-key="topAxis"');
    expect(html).toContain('data-setting-key="inclusiveEndDates"');
    expect(html).not.toContain("<datalist");
    expect(html).toContain('data-value="b1"');
    expect(html).toContain('class="dependency-picker"');
    expect(html).toContain('data-field="dependencies" value="" placeholder="id1 id2"');
    expect(html).toContain('data-field="until" value="" placeholder="id1"');
    expect(html).toContain('class="dependency-search" data-review-id=');
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Search task ID or label"');
    expect(html).toContain('aria-label="Search task ID or label"');
    expect(html).toContain('aria-controls="dependency-picker-update-task-dependencies-');
    expect(html).toContain('aria-activedescendant=""');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option" tabindex="-1"');
    expect(html).toContain('data-search="b1 task b planning"');
    expect(html).toContain('data-dependency-empty hidden>No matching tasks</div>');
    expect(html).toContain('classList.contains("dependency-search")');
    expect(html).toContain('target.removeAttribute("aria-activedescendant")');
    expect(html).toContain('candidate.hidden = !matches');
    expect(html).toContain('class="option-chip dependency-option"');
    expect(html).toContain('title="b1 - Task B (Planning)"');
    expect(html).toContain('<span class="option-id">b1</span><span class="option-label">Task B</span><span class="option-section">(Planning)</span>');
    expect(html).toContain('data-target-action="update-task-dependencies"');
    expect(html).toContain('data-target-action="update-task-until"');
    expect(html).toContain('type: "apply-diagnostic-action"');
    expect(html).toContain('type: "select-task"');
    expect(html).toContain("globalThis.mermaidGanttHost");
    const previewPane = html.slice(
      html.indexOf('<section class="preview-pane">'),
      html.indexOf('<aside class="details-drawer"')
    );
    expect(previewPane).not.toContain("section Planning");
    const header = html.slice(html.indexOf("<header>"), html.indexOf("</header>"));
    expect(header).not.toContain("data-action");
    const previewHeader = html.slice(html.indexOf('<div class="preview-header">'), html.indexOf('<div class="preview-box"'));
    expect(previewHeader).not.toContain("data-action");
    expect(html).toContain('data-detail-panel="source"');
    expect(html).toContain("section Planning");
  });

  it("allows VS Code adapter bridge injection without coupling app rendering to acquireVsCodeApi", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      hostBridgeScript: "const vscode = acquireVsCodeApi();"
    });

    expect(html).toContain("const vscode = acquireVsCodeApi();");
    expect(html).toContain('data-action="update-task-label"');
  });

  it("defines a browser host adapter contract for future static site reuse", async () => {
    const events: unknown[] = [];
    const adapter: TaskGridAppHostAdapter = {
      loadInitialSource: () => "gantt\nTask A : a1, 1d\n",
      applySourceChange: (source) => {
        events.push({ type: "source", source });
      },
      persistPresentationState: (key, value) => {
        events.push({ type: "persist", key, value });
      },
      readPresentationState: <T = unknown>(key: string): T | undefined => {
        events.push({ type: "read", key });
        return key === "layout" ? ("horizontal" as T) : undefined;
      },
      reportPreviewEvent: (event) => {
        events.push(event);
      },
      reportError: (error) => {
        events.push(error);
      }
    };

    await adapter.applySourceChange("gantt\nTask B : b1, 2d\n");
    await adapter.persistPresentationState("layout", "horizontal");
    const layout = await adapter.readPresentationState<string>("layout");
    await adapter.reportPreviewEvent({ type: "preview-render-started", runtimeVersion: "11.14.0" });
    await adapter.reportError({ message: "boom", source: "unit" });

    expect(await adapter.loadInitialSource()).toContain("Task A");
    expect(layout).toBe("horizontal");
    expect(events).toEqual([
      { type: "source", source: "gantt\nTask B : b1, 2d\n" },
      { type: "persist", key: "layout", value: "horizontal" },
      { type: "read", key: "layout" },
      { type: "preview-render-started", runtimeVersion: "11.14.0" },
      { message: "boom", source: "unit" }
    ]);
  });

  it("renders resize handles only for editable preview tasks", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 2026-05-04, 2d",
      "Task B : b1, after a1, 1d",
      ""
    ].join("\n")));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).toContain('data-preview-resize-handle="left"');
    expect(html).toContain('data-preview-resize-handle="right"');
    expect(html.match(/data-preview-resize-handle="/g)?.length).toBe(2);
    expect(html).toContain('data-editable="true"');
    expect(html).toContain('data-editable="false"');
    expect(html).toContain('data-source-order="');
  });

  it("renders test-only preview operation hooks only when explicitly enabled", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-05-04, 2d",
      ""
    ].join("\n")));
    const normalHtml = renderTaskGridHtml(state, labels(), { allowEditing: true });
    const testHtml = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      enableTestWebviewOperations: true
    });

    expect(normalHtml).not.toContain("test-webview-operation");
    expect(testHtml).toContain("test-webview-operation");
    expect(testHtml).toContain("runPreviewResizeTestOperation");
    expect(testHtml).toContain("runPreviewPanTestOperation");
    expect(testHtml).toContain('type: "preview-pan"');
    expect(testHtml).toContain('data-source-order="');
  });

  it("renders selected tag toggle state without changing schedule fields", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : done, milestone, a1, 2d",
      ""
    ].join("\n")));
    const html = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialDetailTab: "inspector"
    });
    const inspectorPanel = html.slice(
      html.indexOf('data-detail-panel="inspector"'),
      html.indexOf('data-detail-panel="diagnostics"')
    );

    expect(inspectorPanel).toContain('data-action="toggle-task-tag"');
    expect(inspectorPanel).toContain('data-tag="active"');
    expect(inspectorPanel).toContain('data-tag="done"');
    expect(inspectorPanel).toContain('data-tag="crit"');
    expect(inspectorPanel).toContain('data-tag="milestone"');
    expect(inspectorPanel).toContain('data-tag="vert"');
    expect(inspectorPanel).toContain('class="chips tag-toggle-group" data-current-tags="done milestone"');
    expect(inspectorPanel).toContain('<div class="wide field-block"><span>Tags</span>');
    expect(inspectorPanel).toContain('data-tag="done" aria-pressed="true"');
    expect(inspectorPanel).toContain('data-tag="milestone" aria-pressed="true"');
    expect(inspectorPanel).toContain('data-tag="crit" aria-pressed="false"');
    expect(inspectorPanel).toContain('value="2d"');
  });

  it("does not offer dependency picker options when adding metadata would exceed Mermaid task syntax", () => {
    const baseState = createEditorState(parseGanttLossless([
      "gantt",
      "section Planning",
      "Task A : a1, 2026-01-01, 1d",
      "Task B : b1, 2026-01-02, 2d"
    ].join("\n") + "\n"));
    const selected = applyEditorAction(baseState, {
      type: "select-task",
      nodeId: baseState.grid.rows[1]?.nodeId ?? ""
    }).state;
    const html = renderTaskGridHtml(selected, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialDetailTab: "inspector"
    });
    const inspectorPanel = html.slice(
      html.indexOf('data-detail-panel="inspector"'),
      html.indexOf('data-detail-panel="diagnostics"')
    );

    expect(inspectorPanel).toContain('data-action="update-task-dependencies"');
    expect(inspectorPanel).toContain('data-action="update-task-until"');
    expect(inspectorPanel).not.toContain('class="dependency-picker"');
    expect(inspectorPanel).not.toContain('data-target-action="update-task-dependencies"');
    expect(inspectorPanel).not.toContain('data-target-action="update-task-until"');
  });

  it("localizes delete repair diagnostic action labels", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\nTask B : b1, after a1, 2d\n"));
    const referenceRange = {
      start: { offset: 34, line: 3, column: 25 },
      end: { offset: 36, line: 3, column: 27 }
    };
    const diagnosticState = {
      ...state,
      diagnostics: [{
        code: "EDITOR_TASK_DELETE_REFERENCED",
        stage: "lossless-write-back" as const,
        severity: "error" as const,
        messageKey: "diagnostics.editorTaskDeleteReferenced",
        summary: "Task is referenced.",
        primaryRange: referenceRange,
        primaryRaw: "a1",
        suggestedActions: [{
          kind: "quick-fix" as const,
          labelKey: "diagnostics.action.removeBlockingReference",
          labelText: "Remove reference a1",
          replacement: {
            range: {
              start: { offset: 27, line: 3, column: 18 },
              end: { offset: 36, line: 3, column: 27 }
            },
            text: ""
          }
        }, {
          kind: "quick-fix" as const,
          labelKey: "diagnostics.action.replaceBlockingReference",
          labelText: "Replace reference with b1",
          replacement: {
            range: referenceRange,
            text: "b1"
          }
        }]
      }]
    };
    const html = renderTaskGridHtml(diagnosticState, {
      ...labels(),
      removeBlockingReference: "参照 {0} を削除",
      replaceBlockingReference: "参照先を {0} に変更"
    }, {
      allowEditing: true,
      initialDetailsOpen: true,
      initialDetailTab: "diagnostics"
    });

    expect(html).toContain(">参照 a1 を削除</button>");
    expect(html).toContain(">参照先を b1 に変更</button>");
    expect(html).not.toContain(">Remove reference a1</button>");
    expect(html).not.toContain(">Replace reference with b1</button>");
  });

  it("disables structured controls and preserves raw source in fallback mode", () => {
    const source = readProductFixture("fallback-invalid-metadata");
    const state = createEditorState(parseGanttLossless(source));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(state.mode).toBe("fallback");
    expect(html).toContain("Unsupported in structured mode");
    expect(html).toContain('data-initial-detail-tab="source"');
    expect(html).toContain("Raw Source Editor");
    expect(html).toContain('data-action="replace-source"');
    expect(html).toContain("Task A : a1, 3dX");
    expect(html).toContain("Structured editing and preview are blocked");
    expect(html).not.toContain('data-action="update-task-label"');
    expect(html).not.toContain('data-action="update-task-id"');
    expect(html).not.toContain('data-action="update-task-start"');
    expect(html).not.toContain('data-action="update-task-duration"');
    expect(html).not.toContain('data-action="toggle-task-tag"');
    expect(html).not.toContain('data-action="update-section-label"');
    expect(html).not.toContain('data-action="update-setting"');
    expect(html).toContain('<textarea class="setting-list" placeholder="2026-05-04" disabled>');
    expect(html).toContain('<textarea class="setting-list" placeholder="weekends" disabled>');
    expect(html).toContain('<input value="" placeholder="stroke-width:2px,stroke:#f00" disabled>');
    expect(html).toContain("<select disabled><option value=\"\"></option><option value=\"friday\">friday</option><option value=\"saturday\">saturday</option></select>");
    expect(html).toContain('data-action="undo"');
    expect(html).toContain('data-action="redo"');
    expect(html).not.toContain('data-action="add-section"');
    expect(html).not.toContain('data-action="add-task"');
    expect(html).not.toContain('data-action="move-task"');
    expect(html).not.toContain('data-action="toggle-row-action-menu"');
  });

  it("renders empty explicit sections as selectable section rows", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "section Backlog",
      "section Build",
      "Task A : a1, 1d"
    ].join("\n") + "\n"));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).toContain('class="section-row');
    expect(html).toContain('data-section-id="section-0"');
    expect(html).toContain("Empty section");
    expect(html).toContain('data-action="update-section-label" data-section-id="section-0"');
    expect(html).toContain('data-action="add-task" data-section-id="section-0"');
    expect(html).toContain(">Add task</button>");
    expect(html).toContain('data-action="request-delete-section"');
    expect(html).toContain(">Delete section</button>");
    expect(html).toContain('type: "select-section"');
    expect(html).toContain('type: "request-delete-section"');
  });

  it("keeps supported task editing visible while explaining limited advanced source items", () => {
    const source = readProductFixture("limited-editing-advanced-items");
    const state = createEditorState(parseGanttLossless(source));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(state.mode).toBe("structured");
    expect(state.previewSource).toBeUndefined();
    expect(html).toContain("Preview source is unavailable");
    expect(html).toContain('data-initial-detail-tab="diagnostics"');
    expect(html).toContain('data-action="update-task-label"');
    expect(html).toContain('data-action="update-task-id"');
    expect(html).toContain("DirectiveBlock");
    expect(html).toContain("ClickStmt");
    expect(html).toContain("This retained source item is not currently editable");
    expect(html).toContain("%%{init:");
    expect(html).toContain('click a1 href &quot;https://example.com&quot;');
    expect(html).toContain('data-action="replace-source"');
  });

  it("renders host compatibility diagnostics as guidance plus a safe quick-fix", () => {
    const source = readProductFixture("host-compatibility-frontmatter");
    const state = createEditorState(parseGanttLossless(source));
    const html = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialDetailTab: "diagnostics"
    });

    expect(state.diagnostics.map((diagnostic) => diagnostic.code)).toContain("HOST_VERSION_SENSITIVE_SYNTAX");
    expect(html).toContain("HOST_VERSION_SENSITIVE_SYNTAX");
    expect(html).toContain("This syntax may depend on the Mermaid host version.");
    expect(html).toContain(">Check Mermaid host version</button>");
    expect(html).toContain(">Comment out compact display mode</button>");
    expect(html).toContain("1 compatibility warnings");
    expect(html).toContain("1 retained source items");
    expect(html).toContain("&quot;hostCompatibility&quot;:{&quot;selectedProfile&quot;:&quot;mermaid-latest&quot;");
    expect(html).toContain("&quot;warningCount&quot;:1,&quot;retainedSourceItemCount&quot;:1");
    expect(html).toContain("&quot;mermaidRuntime&quot;:{&quot;type&quot;:&quot;bundled&quot;,&quot;version&quot;:&quot;11.14.0&quot;");
    expect(html).toContain("Profile warnings");
    expect(html).toContain("GitLab-hosted Mermaid");
    expect(html).toContain("displayMode compact can depend on the Mermaid host version.");
    expect(html).toContain("GitHub chooses the Mermaid runtime in the host");
    expect(html).toContain('data-action="apply-diagnostic-action"');
    expect(html).not.toContain("diagnostics.hostVersionSensitiveSyntax");
    expect(html).not.toContain("displayMode: compact</button>");
  });

  it("renders the current view-only sort and filter state", () => {
    const state = createEditorState(
      parseGanttLossless("gantt\nBeta : b1, 1d\nAlpha : a1, 1d\n"),
      { kind: "document" },
      {
        sort: { field: "label", direction: "asc" },
        filter: { text: "Alpha" }
      }
    );
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).toContain('value="Alpha"');
    expect(html).toContain('<option value="label:asc" selected>Task A-Z</option>');
    expect(html).toContain('<option value="" selected>All severities</option>');
    expect(html).toContain("Alpha");
    expect(html).not.toContain('<td class="label" title="Beta">');
    expect(html).not.toContain('data-action="move-task"');
    expect(html).not.toContain('data-action="move-task-to-section"');
    expect(html).not.toContain('data-action="move-section"');
  });

  it("renders date format helper and field warning for mismatched task dates", () => {
    const document = parseGanttLossless([
      "gantt",
      "dateFormat DD-MM-YYYY",
      "Task A : a1, 2026-01-01, 2d",
      ""
    ].join("\n"));
    const baseState = createEditorState(document);
    const state = createEditorState(document, { kind: "task", nodeId: baseState.grid.rows[0]?.nodeId ?? "" });
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).toContain('placeholder="04-05-2026"');
    expect(html).toContain('placeholder="3d"');
    expect(html).toContain('class="date-field"');
    expect(html).toContain('data-action="open-date-picker"');
    expect(html).toContain('data-action="pick-date"');
    expect(html).toContain('type="date"');
    expect(html).toContain('data-date-format="DD-MM-YYYY"');
    expect(html).toContain('aria-label="Open date picker"');
    expect(html).toContain('title="Open date picker"');
    expect(html).toContain('class="native-date-picker"');
    expect(html).toContain('pointerdown');
    expect(html).toContain("Use dateFormat example: 04-05-2026");
    expect(html).toContain("Duration examples: 3d, 1w, 1month");
    expect(html).toContain("Setting End replaces Duration for this task.");
    expect(html).toContain('class="field-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("This date does not match dateFormat.");
  });

  it("does not render click href editing in the inspector", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 1d",
      "click a1 href \"https://example.com/ticket/123\"",
      ""
    ].join("\n")));
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).not.toContain("Click link");
    expect(html).not.toContain('data-action="update-task-click-href"');
    expect(html).toContain("ClickStmt");
    expect(html).toContain('click a1 href &quot;https://example.com/ticket/123&quot;');
  });

  it("renders duration option chips and end-before-start inline warning", () => {
    const document = parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-05-04, 2026-05-03",
      ""
    ].join("\n"));
    const baseState = createEditorState(document);
    const state = createEditorState(document, { kind: "task", nodeId: baseState.grid.rows[0]?.nodeId ?? "" });
    const html = renderTaskGridHtml(state, labels(), { allowEditing: true });

    expect(html).toContain('data-action="apply-input-option" data-target-action="update-task-duration"');
    expect(html).toContain('data-value="1d"');
    expect(html).toContain('data-value="1w"');
    expect(html).toContain('data-value="1month"');
    expect(html).toContain('value="2026-05-04"');
    expect(html).toContain("End is before start.");
    expect(html).toContain("Setting Duration replaces End for this task.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("formatDateForMermaid");
    expect(html).toContain("dateLiteralToIsoDate");
  });

  it("can render vertical layout and fill preview from initial presentation options", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      initialLayout: "vertical",
      initialPreviewZoom: "fill"
    });

    expect(html).toContain('class="shell layout-vertical');
    expect(html).toContain('data-default-layout="vertical"');
    expect(html).toContain('data-default-preview-zoom="fill"');
    expect(html).toContain('data-layout-option="horizontal" aria-pressed="false"');
    expect(html).toContain('data-layout-option="vertical" aria-pressed="true"');
    expect(html).toContain('data-preview-zoom="fit" aria-pressed="false"');
    expect(html).toContain('data-preview-zoom="fill" aria-pressed="true"');
  });

  it("can render preview initially collapsed", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      initialPreviewCollapsed: true
    });

    expect(html).toContain('class="shell layout-horizontal preview-collapsed"');
    expect(html).toContain('data-default-preview-collapsed="true"');
    expect(html).toContain('id="preview-collapse-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expand preview"');
    expect(html).toContain('title="Expand preview"');
    expect(html).toContain('.shell.preview-collapsed .preview-box');
    expect(html).toContain('.shell.preview-collapsed .preview-controls');
  });

  it("can render preview initially focused", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      initialPreviewFocused: true
    });

    expect(html).toContain('class="shell layout-horizontal preview-focused"');
    expect(html).toContain('data-default-preview-focused="true"');
    expect(html).toContain('id="preview-focus-toggle"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Show Task Grid"');
    expect(html).toContain('title="Show Task Grid"');
    expect(html).toContain("&quot;previewInitialFocused&quot;:true");
    expect(html).toContain("&quot;previewFocused&quot;:true");
    expect(html).toContain(".shell.preview-focused .preview-edit-timeline-controls");
    expect(html).toContain("position: sticky");
    expect(html).toContain("&quot;previewTimelineSticky&quot;:true");
  });

  it("can render the first row action menu initially open for visual capture", () => {
    const state = createEditorState(parseGanttLossless("gantt\nTask A : a1, 1d\nTask B : b1, 1d\n"));
    const html = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialOpenRowActionMenu: true
    });

    expect(html).toContain('class="row-action-menu-wrap open"');
    expect(html).toContain('<div class="shell layout-horizontal"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(">Add task below</button>");
    expect(html).toContain(">Duplicate task</button>");
    expect(html).toContain(">Move task up</button>");
    expect(html).toContain(">Move task down</button>");
    expect(html).toContain(">Delete task</button>");
  });

  it("renders test-only responsive narrow layout for Japanese stress fixtures", () => {
    const state = createEditorState(parseGanttLossless(readProductFixture("ja-responsive")));
    const normalHtml = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialOpenRowActionMenu: true
    });
    const responsiveHtml = renderTaskGridHtml(state, labels(), {
      allowEditing: true,
      initialDetailsOpen: true,
      initialOpenRowActionMenu: true,
      initialOpenDetailsWithRowActionMenu: true,
      initialResponsiveMode: "narrow",
      initialDetailTab: "inspector"
    });

    expect(normalHtml).not.toContain("responsive-narrow details-open");
    expect(responsiveHtml).toContain('class="shell layout-horizontal responsive-narrow details-open"');
    expect(responsiveHtml).toContain("&quot;responsiveMode&quot;:&quot;narrow&quot;");
    expect(responsiveHtml).toContain("&quot;localeStress&quot;:true");
    expect(responsiveHtml).toContain("&quot;horizontalOverflowRisk&quot;:true");
    expect(responsiveHtml).toContain("非常に長い日本語セクション名と確認工程");
    expect(responsiveHtml).toContain("要件定義と画面レイアウト確認のためのとても長い日本語タスク");
    expect(responsiveHtml).toContain('class="row-action-menu-wrap open"');
    expect(responsiveHtml).toContain(".shell.responsive-narrow .preview-mini-editor");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .row-action-menu");
    expect(responsiveHtml).toContain("max-width: min(14rem, calc(100vw - 2rem))");
    expect(responsiveHtml).toContain("max-height: min(16rem, calc(100vh - 10rem))");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .menu-item");
    expect(responsiveHtml).toContain("line-height: 1.1");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .preview-pane");
    expect(responsiveHtml).toContain("max-height: 24rem");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .detail-tabs");
    expect(responsiveHtml).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .detail-tab::after");
    expect(responsiveHtml).toContain("content: attr(data-detail-tab)");
    expect(responsiveHtml).toContain("text-transform: capitalize");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .rich-label-editor textarea");
    expect(responsiveHtml).toContain(".shell.responsive-narrow .rich-label-editor .field-helper");
    expect(responsiveHtml).toContain("width: min(22rem, calc(100vw - 1.5rem))");
    expect(responsiveHtml).toContain("grid-template-columns: 1fr");
    expect(responsiveHtml).toContain("max-width: min(18rem, calc(100vw - 24px))");
    expect(responsiveHtml).toContain("overflow-wrap: anywhere");
    expect(responsiveHtml).toContain('data-source-order="');
  });

  it("restores preview edit mode and supported task selection from initial options", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task A : a1, 2026-05-01, 2d",
      "Task B : b1, after a1, 1d",
      ""
    ].join("\n")));
    const supportedNodeId = state.grid.rows[0]?.nodeId;
    const unsupportedNodeId = state.grid.rows[1]?.nodeId;
    expect(supportedNodeId).toBeTruthy();
    expect(unsupportedNodeId).toBeTruthy();

    const html = renderTaskGridHtml(state, labels(), {
      initialPreviewEditMode: true,
      initialPreviewEditSelectedNodeId: supportedNodeId
    });

    expect(html).toContain("preview-editing");
    expect(html).toContain('aria-pressed="true" data-edit-label="Edit" data-done-label="Done">Done</button>');
    expect(html).toContain('id="preview-edit-overlay" class="preview-edit-overlay" data-review-id="preview-edit-overlay" aria-hidden="false"');
    expect(html).toContain("&quot;previewEditMode&quot;:true");
    expect(html).toContain("&quot;previewEditOverlayAriaHidden&quot;:false");
    expect(html).toContain("&quot;previewMiniEditorOpen&quot;:true");
    expect(html).toContain(`const initialPreviewEditSelectedNodeId = "${supportedNodeId}"`);
    expect(html).toContain("selectPreviewMiniTask(initialPreviewEditSelectedNodeId)");

    const unsupportedHtml = renderTaskGridHtml(state, labels(), {
      initialPreviewEditMode: true,
      initialPreviewEditSelectedNodeId: unsupportedNodeId
    });
    expect(unsupportedHtml).toContain("preview-editing");
    expect(unsupportedHtml).toContain("&quot;previewEditMode&quot;:true");
    expect(unsupportedHtml).toContain("&quot;previewEditOverlayAriaHidden&quot;:false");
    expect(unsupportedHtml).toContain("&quot;previewMiniEditorOpen&quot;:false");
    expect(unsupportedHtml).toContain('const initialPreviewEditSelectedNodeId = ""');
  });

  it("renders Preview Edit overlay from the split preview module", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "Task <A> : a1, 2026-05-04, 2d",
      "Task B : b1, after a1, 1d",
      ""
    ].join("\n")));
    const model = createPreviewScheduleEditModel(state.grid.rows, state.semantic?.settings.dateFormat);
    const html = renderPreviewScheduleOverlay(model, labels());
    const editModeHtml = renderPreviewScheduleOverlay(model, labels(), { initialEditMode: true });

    expect(html).toContain('id="preview-edit-overlay"');
    expect(html).toContain('aria-hidden="true"');
    expect(editModeHtml).toContain('id="preview-edit-overlay" class="preview-edit-overlay" data-review-id="preview-edit-overlay" aria-hidden="false"');
    expect(html).toContain('data-review-id="preview-edit-track"');
    expect(html).toContain("Task &lt;A&gt;");
    expect(html).toContain('data-label="Task &lt;A&gt;"');
    expect(html).toContain('data-preview-resize-handle="left"');
    expect(html).toContain('data-preview-resize-handle="right"');
    expect(html).toContain('data-editable="false"');
    expect(html).toContain("This task cannot be dragged in Preview Edit mode.");
    expect(html).toContain('id="preview-mini-editor"');
    expect(html).toContain('data-action="preview-mini-apply"');
  });

  it("renders test Webview operation listener only when enabled", () => {
    expect(renderTestWebviewOperationBlock(false)).toBe("");
    const script = renderTestWebviewOperationBlock(true, 7);

    expect(script).toContain("test-webview-operation");
    expect(script).toContain("test-webview-operation-result");
    expect(script).toContain("webviewGeneration: 7");
    expect(script).toContain("runPreviewResizeTestOperation");
    expect(script).toContain("runPreviewPanTestOperation");
    expect(script).toContain('type: "preview-pan"');
    expect(script).toContain("dispatchPreviewTestPointer");
    expect(script).toContain("test-webview-operation-ready");
  });

  it("renders editing message handlers from the split message module", () => {
    expect(renderEditingMessageHandlers(false)).toBe("");
    const script = renderEditingMessageHandlers(true);

    expect(script).toContain('document.addEventListener("keydown"');
    expect(script).toContain('document.addEventListener("click"');
    expect(script).toContain('document.addEventListener("change"');
    expect(script).toContain("updatePreviewDrag(event);");
    expect(script).toContain("commitPreviewDrag();");
    expect(script).toContain("handleDetailsFocusTrap(event)");
    expect(script).toContain("handleDetailTabKeydown(event)");
    expect(script).toContain("handleRowActionMenuKeydown(event)");
    expect(script).toContain("handleDependencyPickerKeydown(event)");
    expect(script).toContain('document.querySelector(".row-action-menu-wrap.open")');
    expect(script).toContain("closeRowActionMenus(true)");
    expect(script).toContain('shell?.classList.contains("details-open")');
    expect(script).toContain("setDetailsOpen(false, false, true)");
    expect(script).toContain('actionTarget.dataset.action === "open-date-picker"');
    expect(script).toContain("openNativeDatePicker(actionTarget)");
    expect(script).toContain('type: "update-task-tags"');
    expect(script).toContain('type: "select-task"');
  });
});

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
      "diagnostics.action.chooseExistingTaskId": "Choose an existing task ID",
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

function readProductFixture(name: string): string {
  return readFileSync(join(process.cwd(), "fixtures", "product", name, "source.mmd"), "utf8");
}
