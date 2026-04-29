import {
  type PreviewScheduleEditModel,
  type PreviewScheduleEditTask
} from "../core";
import { escapeHtml } from "./task-grid-webview-utils";

export interface PreviewEditOverlayLabels {
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
  start: string;
  end: string;
  duration: string;
  datePicker: string;
}

export function renderPreviewScheduleOverlay(
  model: PreviewScheduleEditModel,
  labels: PreviewEditOverlayLabels,
  options: { initialEditMode?: boolean } = {}
): string {
  const rows = model.tasks
    .map((task) => renderPreviewScheduleTask(task, labels))
    .join("");
  return `<div id="preview-edit-overlay" class="preview-edit-overlay" data-review-id="preview-edit-overlay" aria-hidden="${options.initialEditMode === true ? "false" : "true"}" aria-label="${escapeHtml(labels.previewEditGuidance)}">
      <div class="preview-edit-timeline-controls" data-review-id="preview-edit-timeline-controls">
        <div class="preview-edit-timeline-actions">
          <button class="preview-edit-timeline-button" type="button" data-action="preview-edit-viewport" data-value="previous">${escapeHtml(labels.previewTimelinePrevious)}</button>
          <button class="preview-edit-timeline-button" type="button" data-action="preview-edit-viewport" data-value="next">${escapeHtml(labels.previewTimelineNext)}</button>
          <button class="preview-edit-timeline-button" type="button" data-action="preview-edit-viewport" data-value="today">${escapeHtml(labels.previewTimelineToday)}</button>
          <button class="preview-edit-timeline-button" type="button" data-action="preview-edit-viewport" data-value="selected" data-review-id="preview-edit-viewport-selected" disabled>${escapeHtml(labels.previewTimelineSelected)}</button>
          <button class="preview-edit-timeline-button" type="button" data-action="preview-edit-viewport" data-value="fit">${escapeHtml(labels.previewTimelineFit)}</button>
        </div>
        <span class="preview-edit-timeline-range" data-preview-edit-timeline-range>${escapeHtml(model.domainStartIso)} - ${escapeHtml(model.domainEndIso)}</span>
      </div>
      <div class="preview-edit-axis" data-review-id="preview-edit-date-axis" aria-hidden="true"></div>
      <div class="preview-edit-track" data-review-id="preview-edit-track" style="--preview-edit-row-count: ${escapeHtml(String(Math.max(model.tasks.length, 1)))}; --preview-edit-total-days: ${escapeHtml(String(Math.max(model.totalDays, 1)))}">${rows}<div id="preview-edit-guide-line" class="preview-edit-guide-line" data-review-id="preview-edit-guide-line" hidden></div><div id="preview-edit-drag-tooltip" class="preview-edit-drag-tooltip" data-review-id="preview-edit-drag-tooltip" hidden></div></div>
      <div id="preview-edit-status" class="preview-edit-status"><span class="preview-edit-guidance">${escapeHtml(labels.previewEditGuidance)}</span><span>${escapeHtml(String(model.draggableTaskCount))} / ${escapeHtml(String(model.tasks.length))}</span></div>
      ${renderPreviewMiniEditor(labels)}
    </div>`;
}

function renderPreviewScheduleTask(task: PreviewScheduleEditTask, labels: PreviewEditOverlayLabels): string {
  const classes = ["preview-edit-bar", task.editable ? "editable" : "unsupported"].join(" ");
  const title = task.editable
    ? `${task.label}: ${task.start ?? ""}${task.end ? ` - ${task.end}` : task.duration ? `, ${task.duration}` : ""}`
    : `${task.label}: ${labels.previewEditUnsupported}${task.unsupportedReason ? ` (${task.unsupportedReason})` : ""}`;
  const resizeHandles = task.editable && task.kind !== "milestone"
    ? `<span class="preview-resize-handle left" data-preview-resize-handle="left" aria-hidden="true"></span><span class="preview-resize-handle right" data-preview-resize-handle="right" aria-hidden="true"></span>`
    : "";
  return `<div class="${escapeHtml(classes)}" role="button" tabindex="0" data-review-id="preview-edit-task-${escapeHtml(task.nodeId)}" data-preview-edit-task="${escapeHtml(task.nodeId)}" data-node-id="${escapeHtml(task.nodeId)}" data-editable="${task.editable ? "true" : "false"}" data-source-order="${escapeHtml(String(task.sourceOrder))}" data-start="${escapeHtml(task.start ?? "")}" data-end="${escapeHtml(task.end ?? "")}" data-duration="${escapeHtml(task.duration ?? "")}" data-label="${escapeHtml(task.label)}" data-start-iso="${escapeHtml(task.startIso ?? "")}" data-end-iso="${escapeHtml(task.endIso ?? "")}" data-kind="${escapeHtml(task.kind)}" aria-disabled="${task.editable ? "false" : "true"}" title="${escapeHtml(title)}" style="--preview-edit-row-index: ${escapeHtml(String(task.rowIndex))}; --preview-edit-left: ${escapeHtml(task.leftPercent.toFixed(3))}%; --preview-edit-width: ${escapeHtml(task.widthPercent.toFixed(3))}%"><span class="preview-edit-label">${escapeHtml(task.label)}</span>${resizeHandles}</div>`;
}

function renderPreviewMiniEditor(labels: PreviewEditOverlayLabels): string {
  return `<div id="preview-mini-editor" class="preview-mini-editor" data-review-id="preview-mini-editor" aria-label="${escapeHtml(labels.previewMiniEditor)}" hidden>
      <div class="preview-mini-title"><strong>${escapeHtml(labels.previewMiniEditor)}</strong><span data-preview-mini-label>${escapeHtml(labels.previewMiniEditorNoTask)}</span></div>
      <label>${escapeHtml(labels.start)}
        <span class="date-field">
          <span class="preview-mini-value" data-preview-mini-field="start" data-value=""></span>
          <span class="date-picker-wrap">
            <button class="icon-button date-picker-button" type="button" data-action="preview-mini-open-date" data-preview-mini-date-button="start" aria-label="${escapeHtml(labels.datePicker)}" title="${escapeHtml(labels.datePicker)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path></svg></button>
          </span>
        </span>
      </label>
      <label>${escapeHtml(labels.end)}
        <span class="date-field">
          <span class="preview-mini-value" data-preview-mini-field="end" data-value=""></span>
          <span class="date-picker-wrap">
            <button class="icon-button date-picker-button" type="button" data-action="preview-mini-open-date" data-preview-mini-date-button="end" aria-label="${escapeHtml(labels.datePicker)}" title="${escapeHtml(labels.datePicker)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path></svg></button>
          </span>
        </span>
      </label>
      <label>${escapeHtml(labels.duration)}
        <span class="preview-mini-value" data-preview-mini-field="duration" data-value=""></span>
        <span class="preview-mini-duration-options" data-preview-mini-duration-options>
          <button class="option-chip" type="button" data-action="preview-mini-duration-step" data-value="-1">-1d</button>
          <button class="option-chip" type="button" data-action="preview-mini-duration-step" data-value="1">+1d</button>
          <button class="option-chip" type="button" data-action="preview-mini-duration-step" data-value="7">+1w</button>
          <button class="option-chip" type="button" data-action="preview-mini-duration-option" data-value="1d">1d</button>
          <button class="option-chip" type="button" data-action="preview-mini-duration-option" data-value="1w">1w</button>
          <button class="option-chip" type="button" data-action="preview-mini-duration-option" data-value="1month">1month</button>
        </span>
      </label>
      <div id="preview-mini-calendar" class="preview-mini-calendar" data-review-id="preview-mini-calendar" hidden>
        <div class="preview-mini-calendar-header">
          <button type="button" data-action="preview-mini-calendar-month" data-value="-1">&lt;</button>
          <span data-preview-mini-calendar-label></span>
          <button type="button" data-action="preview-mini-calendar-month" data-value="1">&gt;</button>
        </div>
        <div class="preview-mini-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
        <div class="preview-mini-calendar-grid" data-preview-mini-calendar-grid></div>
      </div>
      <button class="preview-mini-apply" type="button" data-action="preview-mini-apply">${escapeHtml(labels.previewMiniEditorApply)}</button>
    </div>`;
}
