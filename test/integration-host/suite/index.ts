import * as assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { findMarkdownGanttBlocks } from "../../../src/core";
import type { EditorState } from "../../../src/core";
import type { AssertionSpec, ScenarioSpec } from "../../../src/harness";
import { parseRuntimeLogEvent } from "../../../src/logging";

const execFileAsync = promisify(execFile);

export async function run(): Promise<void> {
  await activateDevelopmentExtension();
  if (process.env.MERMAID_GANTT_HOST_SUITE_MODE === "nightly-visual") {
    await testCommandsAreRegistered();
    await testNightlyVisualSmokeScenarioFromManifest();
    await testRuntimeJsonlWasWritten();
    return;
  }

  await testCommandsAreRegistered();
  await testCommandsRunAgainstStandaloneGanttDocument();
  await testEditorSnapshotCommandObservesActiveDocument();
  await testTaskGridAcceptsDayFirstDateFormat();
  await testTaskGridMessageUpdatesStandaloneGanttDocument();
  await testTaskGridPreviewDragMessageUpdatesStandaloneSchedule();
  await testTaskGridPreviewResizeMessageUpdatesStandaloneSchedule();
  await testTaskGridPreviewResizeWebviewOperationUpdatesStandaloneSchedule();
  await testTaskGridWebviewOperationWaitsForDebouncedSourceRender();
  await testTaskGridPreviewMiniEditorMessageUpdatesStandaloneSchedule();
  await testTaskGridPreviewEditModePersistsAfterStandaloneScheduleCommit();
  await testTaskGridMessageReplacesFallbackRawSource();
  await testTaskGridMessageAppliesDiagnosticQuickFix();
  await testTaskGridMessageAppliesHostCompatibilityQuickFix();
  await testTaskGridMessageAppliesDependencyQuickFix();
  await testTaskGridMessageDeletesUnreferencedTask();
  await testTaskGridMessageDeletesEmptySection();
  await testTaskGridMessageDeletesSectionWithTasks();
  await testTaskGridMessageMovesSection();
  await testTaskGridMessageMovesTask();
  await testTaskGridMessageMovesTaskToSection();
  await testTaskGridMessageAddsSection();
  await testTaskGridMessageAddsSectionBelow();
  await testTaskGridMessageAddsTaskToEmptySection();
  await testTaskGridMessageAddsTask();
  await testTaskGridMessageAddsTaskBelowSourceTask();
  await testTaskGridMessageAddsTaskAboveSourceTask();
  await testTaskGridMessageDuplicatesTask();
  await testTaskGridMessageUpdatesUntilDependency();
  await testTaskGridMessageUpdatesTaskTags();
  await testTaskGridMessageUndoRedoStandaloneSource();
  await testTaskGridViewControlsAreViewOnly();
  await testTaskGridMessageUpdatesDocumentSettings();
  await testTaskGridMessageUpdatesSectionLabel();
  await testTaskGridCommandRunsAgainstMarkdownGanttBlock();
  await testTaskGridMessageUpdatesMarkdownGanttBlock();
  await testTaskGridPreviewDragMessageUpdatesMarkdownGanttBlock();
  await testTaskGridPreviewResizeMessageUpdatesMarkdownGanttBlock();
  await testTaskGridPreviewResizeWebviewOperationUpdatesMarkdownGanttBlock();
  await testTaskGridPreviewMiniEditorMessageUpdatesMarkdownGanttBlock();
  await testTaskGridPreviewEditModePersistsAfterMarkdownScheduleCommit();
  await testTaskGridMessageReplacesMarkdownGanttBlockRawSource();
  await testTaskGridMessageMovesMarkdownGanttBlockTask();
  await testTaskGridMessageUndoRedoMarkdownGanttBlock();
  await testTaskGridMessageUpdatesSelectedMarkdownGanttBlock();
  await testMarkdownGanttCodeLensTargetsGanttBlocks();
  await testTaskGridCommandRunsAgainstTargetedMarkdownGanttBlock();
  await testRuntimeLogsFallbackEntry();
  await testNightlyVisualSmokeScenarioFromManifest();
  await testRuntimeJsonlWasWritten();
}

async function activateDevelopmentExtension(): Promise<void> {
  const extension = vscode.extensions.getExtension("yyamamot.mermaid-gantt-editor");
  assert.ok(extension, "development extension yyamamot.mermaid-gantt-editor is not available");
  await extension.activate();
}

async function testCommandsAreRegistered(): Promise<void> {
  const commands = await vscode.commands.getCommands(true);

  assert.ok(commands.includes("mermaidGantt.showParserInfo"));
  assert.ok(commands.includes("mermaidGantt.openTaskGrid"));
  assert.ok(commands.includes("mermaidGantt.test.getTaskGridState"));
  assert.ok(commands.includes("mermaidGantt.test.getEditorSnapshot"));
  assert.ok(commands.includes("mermaidGantt.test.getUiReviewSnapshot"));
  assert.ok(commands.includes("mermaidGantt.test.applyTaskGridMessage"));
  assert.ok(commands.includes("mermaidGantt.test.runWebviewOperation"));
  assert.ok(commands.includes("mermaidGantt.test.revealTaskGrid"));
}

async function testCommandsRunAgainstStandaloneGanttDocument(): Promise<void> {
  const editor = await openDocument("gantt\nTask A : a1, 1d\n", "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");

  assert.equal(editor.document.getText(), "gantt\nTask A : a1, 1d\n");
  assert.equal(vscode.window.tabGroups.all.length, 1, "Task Grid should open in the active editor group instead of creating a side-by-side split");
  await disposeTaskGridAndCloseEditors();
}

async function testEditorSnapshotCommandObservesActiveDocument(): Promise<void> {
  const source = "gantt\nTask A : a1, 1d\n";
  const editor = await openDocument(source, "mermaid");
  const taskOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(taskOffset),
    editor.document.positionAt(taskOffset + "Task A".length)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const snapshot = await editorSnapshot();

  assert.equal(snapshot.languageId, "plaintext");
  assert.equal(snapshot.text, source);
  assert.equal(snapshot.selectionStartOffset, taskOffset);
  assert.equal(snapshot.selectionEndOffset, taskOffset + "Task A".length);
  assert.equal(snapshot.mode, "structured");
  assert.deepEqual(snapshot.diagnosticCodes, []);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridAcceptsDayFirstDateFormat(): Promise<void> {
  const source = "gantt\ndateFormat DD-MM-YYYY\nTask A : t1, 25-04-2026, 2d\n";
  await openDocument(source, "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();

  assert.equal(state.mode, "structured");
  assert.equal(state.previewSource, source);
  assert.deepEqual(state.grid.rows.map((row) => ({
    id: row.id,
    start: row.start,
    duration: row.duration
  })), [{
    id: "t1",
    start: "25-04-2026",
    duration: "2d"
  }]);
  assert.deepEqual(state.diagnostics.map((diagnostic) => diagnostic.code), []);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesStandaloneGanttDocument(): Promise<void> {
  const editor = await openDocument("gantt\nTask A : a1, 1d\n", "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const taskNodeId = await firstTaskNodeId();
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-label",
    nodeId: taskNodeId,
    value: "Task B"
  });

  assert.equal(editor.document.getText(), "gantt\nTask B : a1, 1d\n");
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewDragMessageUpdatesStandaloneSchedule(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first preview drag task node id was not available");
  assert.ok(taskB, "second preview drag task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-drag-task",
    nodeId: taskA,
    start: "2026-05-03"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-drag-task",
    nodeId: taskB,
    start: "2026-05-06",
    end: "2026-05-08"
  });

  const expectedAfterBoth = [
    "gantt",
    "Task A : a1, 2026-05-03, 3d",
    "Task B : b1, 2026-05-06, 2026-05-08",
    ""
  ].join("\n");
  assert.equal(editor.document.getText(), expectedAfterBoth);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "undo"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-05-03, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"));

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "redo"
  });
  assert.equal(editor.document.getText(), expectedAfterBoth);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewResizeMessageUpdatesStandaloneSchedule(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first preview resize task node id was not available");
  assert.ok(taskB, "second preview resize task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskA,
    edge: "right",
    duration: "5d"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskA,
    edge: "left",
    start: "2026-04-30",
    duration: "6d"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskB,
    edge: "right",
    end: "2026-05-08"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskB,
    edge: "left",
    start: "2026-05-05"
  });

  const expectedAfterResize = [
    "gantt",
    "Task A : a1, 2026-04-30, 6d",
    "Task B : b1, 2026-05-05, 2026-05-08",
    ""
  ].join("\n");
  assert.equal(editor.document.getText(), expectedAfterResize);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "undo"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-04-30, 6d",
    "Task B : b1, 2026-05-04, 2026-05-08",
    ""
  ].join("\n"));

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "redo"
  });
  assert.equal(editor.document.getText(), expectedAfterResize);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewResizeWebviewOperationUpdatesStandaloneSchedule(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const result = await vscode.commands.executeCommand<{
    operation: { ok: boolean };
    editorSnapshot: { text?: string };
  }>("mermaidGantt.test.runWebviewOperation", {
    type: "preview-resize",
    taskSelector: { label: "Task A" },
    edge: "right",
    dayDelta: 1,
    expectedSourceIncludes: "Task A : a1, 2026-05-01, 4d",
    timeoutMs: 5000
  });

  assert.equal(result.operation.ok, true);
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-05-01, 4d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"));
  assert.equal(result.editorSnapshot.text, editor.document.getText());
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridWebviewOperationWaitsForDebouncedSourceRender(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  assert.ok(taskA, "first task node id was not available for debounced render test");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-label",
    nodeId: taskA,
    value: "Task A Renamed"
  });
  const result = await vscode.commands.executeCommand<{
    operation: { ok: boolean };
    editorSnapshot: { text?: string };
  }>("mermaidGantt.test.runWebviewOperation", {
    type: "preview-resize",
    taskSelector: { label: "Task A Renamed" },
    edge: "right",
    dayDelta: 1,
    expectedSourceIncludes: "Task A Renamed : a1, 2026-05-01, 4d",
    timeoutMs: 5000
  });

  assert.equal(result.operation.ok, true);
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A Renamed : a1, 2026-05-01, 4d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"));
  assert.equal(result.editorSnapshot.text, editor.document.getText());
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewMiniEditorMessageUpdatesStandaloneSchedule(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first preview mini editor task node id was not available");
  assert.ok(taskB, "second preview mini editor task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskA,
    start: "2026-06-01",
    duration: "4d"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskB,
    start: "2026-06-10",
    end: "2026-06-15"
  });

  const expectedAfterMiniEdit = [
    "gantt",
    "Task A : a1, 2026-06-01, 4d",
    "Task B : b1, 2026-06-10, 2026-06-15",
    ""
  ].join("\n");
  assert.equal(editor.document.getText(), expectedAfterMiniEdit);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "undo"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-06-01, 4d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"));

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "redo"
  });
  assert.equal(editor.document.getText(), expectedAfterMiniEdit);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewEditModePersistsAfterStandaloneScheduleCommit(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first preview edit mode task node id was not available");
  assert.ok(taskB, "second preview edit mode task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-state",
    previewEditMode: true,
    nodeId: taskA
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-viewport",
    viewportStartIso: "2026-04-01",
    viewportEndIso: "2026-05-20"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskA,
    edge: "right",
    duration: "4d"
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: true,
    previewEditSelectedNodeId: taskA,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-drag-task",
    nodeId: taskB,
    start: "2026-05-06",
    end: "2026-05-08"
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: true,
    previewEditSelectedNodeId: taskB,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskB,
    start: "2026-06-10",
    end: "2026-06-15"
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: true,
    previewEditSelectedNodeId: taskB,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-state",
    previewEditMode: false
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: false,
    previewEditSelectedNodeId: undefined,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-05-01, 4d",
    "Task B : b1, 2026-06-10, 2026-06-15",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageReplacesFallbackRawSource(): Promise<void> {
  const editor = await openDocument("gantt\nTask A : a1, 3dX\n", "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  assert.equal((await taskGridState()).mode, "fallback");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "replace-source",
    value: "gantt\nTask B : b1, 2d\n"
  });

  const state = await taskGridState();
  assert.equal(editor.document.getText(), "gantt\nTask B : b1, 2d\n");
  assert.equal(state.mode, "structured");
  assert.deepEqual(state.grid.rows.map((row) => row.label), ["Task B"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAppliesDiagnosticQuickFix(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "dateFormat DD-MM-YYYY",
    "Task A : 2026-01-01, 3d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const diagnostic = state.diagnostics.find((item) => item.code === "DATE_FORMAT_MISMATCH");
  assert.ok(diagnostic, "DATE_FORMAT_MISMATCH diagnostic was not produced");
  const actionIndex = diagnostic.suggestedActions.findIndex((action) => action.kind === "quick-fix");
  assert.ok(actionIndex >= 0, "DATE_FORMAT_MISMATCH quick-fix was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "apply-diagnostic-action",
    code: diagnostic.code,
    startOffset: diagnostic.primaryRange.start.offset,
    actionIndex
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "dateFormat DD-MM-YYYY",
    "Task A : 01-01-2026, 3d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAppliesHostCompatibilityQuickFix(): Promise<void> {
  const editor = await openDocument([
    "---",
    "config:",
    "  gantt:",
    "    displayMode: compact",
    "---",
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const diagnostic = state.diagnostics.find((item) => item.code === "HOST_VERSION_SENSITIVE_SYNTAX");
  assert.ok(diagnostic, "HOST_VERSION_SENSITIVE_SYNTAX diagnostic was not produced");
  const actionIndex = diagnostic.suggestedActions.findIndex((action) => {
    return action.kind === "quick-fix" && action.replacement?.text === "# displayMode: compact";
  });
  assert.ok(actionIndex >= 0, "HOST_VERSION_SENSITIVE_SYNTAX quick-fix was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "apply-diagnostic-action",
    code: diagnostic.code,
    startOffset: diagnostic.primaryRange.start.offset,
    actionIndex
  });

  assert.equal(editor.document.getText(), [
    "---",
    "config:",
    "  gantt:",
    "    # displayMode: compact",
    "---",
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAppliesDependencyQuickFix(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, after missing, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const diagnostic = state.diagnostics.find((item) => item.code === "UNDEFINED_DEPENDENCY");
  assert.ok(diagnostic, "UNDEFINED_DEPENDENCY diagnostic was not produced");
  const actionIndex = diagnostic.suggestedActions.findIndex((action) => {
    return action.kind === "quick-fix" && action.replacement?.text === "a1";
  });
  assert.ok(actionIndex >= 0, "UNDEFINED_DEPENDENCY dependency target quick-fix was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "apply-diagnostic-action",
    code: diagnostic.code,
    startOffset: diagnostic.primaryRange.start.offset,
    actionIndex
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, after a1, 2d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageDeletesUnreferencedTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[1]?.nodeId;
  assert.ok(taskNodeId, "second task row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "delete-task",
    nodeId: taskNodeId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageDeletesEmptySection(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Backlog",
    "section Build",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "empty section row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "delete-section",
    sectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Build",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.equal((await taskGridState()).grid.rows.length, 1);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageDeletesSectionWithTasks(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "Task B : b1, after a1, 2d",
    "section Build",
    "Task C : c1, 3d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "section id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "delete-section",
    sectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Build",
    "Task C : c1, 3d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows.map((row) => row.sectionLabel), ["Build"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageMovesSection(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "section Build",
    "Task B : b1, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "section id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "move-section",
    sectionId,
    direction: "down"
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Build",
    "Task B : b1, 2d",
    "section Planning",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows.map((row) => row.sectionLabel), ["Build", "Planning"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageMovesTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    "section Build",
    "Task C : c1, 3d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[1]?.nodeId;
  assert.ok(taskNodeId, "task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "move-task",
    nodeId: taskNodeId,
    direction: "up"
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Planning",
    "Task B : b1, 2d",
    "Task A : a1, 1d",
    "section Build",
    "Task C : c1, 3d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows.map((row) => row.id), ["b1", "a1", "c1"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageMovesTaskToSection(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    "section Build",
    "Task C : c1, 3d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[0]?.nodeId;
  const targetSectionId = state.grid.rows[2]?.sectionId;
  assert.ok(taskNodeId, "task node id was not available");
  assert.ok(targetSectionId, "target section id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "move-task-to-section",
    nodeId: taskNodeId,
    sectionId: targetSectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Planning",
    "Task B : b1, 2d",
    "section Build",
    "Task C : c1, 3d",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows.map((row) => `${row.sectionLabel}:${row.id}`), [
    "Planning:b1",
    "Build:c1",
    "Build:a1"
  ]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsSection(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-section"
  });

  const state = await taskGridState();
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "section New section",
    ""
  ].join("\n"));
  assert.equal(state.grid.rows[1]?.kind, "section");
  assert.equal(state.grid.rows[1]?.sectionLabel, "New section");
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsSectionBelow(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "section Build",
    "Task B : b1, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "section id was not available");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-section",
    sectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "section New section",
    "section Build",
    "Task B : b1, 2d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsTaskToEmptySection(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Backlog",
    "section Build",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "empty section row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task",
    sectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Backlog",
    "New task : task1, 1d",
    "section Build",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.equal((await taskGridState()).grid.rows[0]?.sectionLabel, "Backlog");
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "section id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task",
    sectionId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "New task : task1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsTaskBelowSourceTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[0]?.nodeId;
  assert.ok(taskNodeId, "first task row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task",
    nodeId: taskNodeId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "New task : task1, 1d",
    "Task B : b1, 2d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageAddsTaskAboveSourceTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[1]?.nodeId;
  assert.ok(taskNodeId, "second task row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task",
    nodeId: taskNodeId,
    position: "above"
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "New task : task1, 1d",
    "Task B : b1, 2d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageDuplicatesTask(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 2026-01-01, 2d",
    "Task B : b1, after a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[0]?.nodeId;
  assert.ok(taskNodeId, "first task row was not produced");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "duplicate-task",
    nodeId: taskNodeId
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 2026-01-01, 2d",
    "Task A : task1, 2026-01-01, 2d",
    "Task B : b1, after a1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesUntilDependency(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, after a1",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[1]?.nodeId;
  assert.ok(taskNodeId, "second task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-until",
    nodeId: taskNodeId,
    value: "a1"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, after a1, until a1",
    ""
  ].join("\n"));
  assert.equal((await taskGridState()).grid.rows[1]?.until, "a1");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-until",
    nodeId: taskNodeId,
    value: ""
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    "Task B : b1, after a1",
    ""
  ].join("\n"));
  assert.equal((await taskGridState()).grid.rows[1]?.until, undefined);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesTaskTags(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "Task A : done, a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[0]?.nodeId;
  assert.ok(taskNodeId, "first task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-tags",
    nodeId: taskNodeId,
    value: "crit milestone"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : crit, milestone, a1, 1d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows[0]?.tags, ["crit", "milestone"]);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-tags",
    nodeId: taskNodeId,
    value: ""
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows[0]?.tags, []);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-tags",
    nodeId: taskNodeId,
    value: "milestone"
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : milestone, a1, 1d",
    ""
  ].join("\n"));
  assert.equal((await taskGridState()).grid.rows[0]?.duration, "1d");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-tags",
    nodeId: taskNodeId,
    value: ""
  });
  assert.equal(editor.document.getText(), [
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  assert.deepEqual((await taskGridState()).grid.rows[0]?.tags, []);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUndoRedoStandaloneSource(): Promise<void> {
  const source = [
    "gantt",
    "Task A : a1, 1d",
    ""
  ].join("\n");
  const expectedAfterAdd = [
    "gantt",
    "Task A : a1, 1d",
    "New task : task1, 1d",
    ""
  ].join("\n");
  const editor = await openDocument(source, "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task"
  });
  assert.equal(editor.document.getText(), expectedAfterAdd);
  assert.equal((await taskGridState()).grid.rows.length, 2);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "undo"
  });
  assert.equal(editor.document.getText(), source);
  assert.equal((await taskGridState()).grid.rows.length, 1);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "redo"
  });
  assert.equal(editor.document.getText(), expectedAfterAdd);
  assert.equal((await taskGridState()).grid.rows.length, 2);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridViewControlsAreViewOnly(): Promise<void> {
  const source = [
    "gantt",
    "Beta : b1, 1d",
    "Alpha : a1, 1d",
    ""
  ].join("\n");
  const editor = await openDocument(source, "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-grid-filter-text",
    value: "Alpha"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-grid-sort",
    value: "label:asc"
  });
  const state = await taskGridState();

  assert.equal(editor.document.getText(), source);
  assert.equal(state.grid.isViewOnlyOrdering, true);
  assert.equal(state.grid.filter?.text, "Alpha");
  assert.deepEqual(state.grid.sort, { field: "label", direction: "asc" });
  assert.equal(state.grid.viewOrder.length, 1);
  assert.equal(state.grid.rows.find((row) => row.nodeId === state.grid.viewOrder[0])?.label, "Alpha");
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesDocumentSettings(): Promise<void> {
  const editor = await openDocument("gantt\nTask A : a1, 1d\n", "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "title",
    value: "Release Plan"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "accTitle",
    value: "Release roadmap"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "accDescr",
    value: "Roadmap from design to validation"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "dateFormat",
    value: "YYYY-MM-DD"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "weekday",
    value: "monday"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "weekend",
    value: "saturday"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "includes",
    value: "weekdays\n2026-05-02"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-setting",
    settingKey: "excludes",
    value: "weekends"
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "excludes weekends",
    "includes weekdays",
    "includes 2026-05-02",
    "weekend saturday",
    "weekday monday",
    "dateFormat YYYY-MM-DD",
    "accDescr: Roadmap from design to validation",
    "accTitle: Release roadmap",
    "title Release Plan",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesSectionLabel(): Promise<void> {
  const editor = await openDocument([
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    ""
  ].join("\n"), "mermaid");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const sectionId = state.grid.rows[0]?.sectionId;
  assert.ok(sectionId, "section id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-section-label",
    sectionId,
    value: "設計"
  });

  assert.equal(editor.document.getText(), [
    "gantt",
    "section 設計",
    "Task A : a1, 1d",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridCommandRunsAgainstMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");

  assert.equal(editor.document.getText(), source);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task B : a1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const taskNodeId = await firstTaskNodeId();
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-label",
    nodeId: taskNodeId,
    value: "Task B"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewDragMessageUpdatesMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 2d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-02, 2d",
    "Task B : b1, 2026-05-04, 2026-05-06",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const targetOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(targetOffset),
    editor.document.positionAt(targetOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first markdown preview drag task node id was not available");
  assert.ok(taskB, "second markdown preview drag task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-drag-task",
    nodeId: taskA,
    start: "2026-05-02"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-drag-task",
    nodeId: taskB,
    start: "2026-05-04",
    end: "2026-05-06"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.ok(editor.document.getText().includes("Other : other1, 2026-06-01, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewResizeMessageUpdatesMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 2d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-04-30, 3d",
    "Task B : b1, 2026-05-03, 2026-05-06",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const targetOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(targetOffset),
    editor.document.positionAt(targetOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first markdown preview resize task node id was not available");
  assert.ok(taskB, "second markdown preview resize task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskA,
    edge: "left",
    start: "2026-04-30",
    duration: "3d"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskB,
    edge: "right",
    end: "2026-05-06"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.ok(editor.document.getText().includes("Other : other1, 2026-06-01, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewResizeWebviewOperationUpdatesMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 2d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 3d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const targetOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(targetOffset),
    editor.document.positionAt(targetOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const result = await vscode.commands.executeCommand<{
    operation: { ok: boolean };
    editorSnapshot: { text?: string };
  }>("mermaidGantt.test.runWebviewOperation", {
    type: "preview-resize",
    taskSelector: { label: "Task A" },
    edge: "right",
    dayDelta: 1,
    expectedSourceIncludes: "Task A : a1, 2026-05-01, 3d",
    timeoutMs: 5000
  });

  assert.equal(result.operation.ok, true);
  assert.equal(editor.document.getText(), expected);
  assert.equal(result.editorSnapshot.text, expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.ok(editor.document.getText().includes("Other : other1, 2026-06-01, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewMiniEditorMessageUpdatesMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 2d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-07-01, 5d",
    "Task B : b1, 2026-07-10, 2026-07-14",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const targetOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(targetOffset),
    editor.document.positionAt(targetOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first markdown preview mini editor task node id was not available");
  assert.ok(taskB, "second markdown preview mini editor task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskA,
    start: "2026-07-01",
    duration: "5d"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskB,
    start: "2026-07-10",
    end: "2026-07-14"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.ok(editor.document.getText().includes("Other : other1, 2026-06-01, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridPreviewEditModePersistsAfterMarkdownScheduleCommit(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 2d",
    "Task B : b1, 2026-05-03, 2026-05-05",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const targetOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(targetOffset),
    editor.document.positionAt(targetOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskA = state.grid.rows[0]?.nodeId;
  const taskB = state.grid.rows[1]?.nodeId;
  assert.ok(taskA, "first markdown preview edit mode task node id was not available");
  assert.ok(taskB, "second markdown preview edit mode task node id was not available");

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-state",
    previewEditMode: true,
    nodeId: taskA
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-viewport",
    viewportStartIso: "2026-04-01",
    viewportEndIso: "2026-05-20"
  });
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-resize-task",
    nodeId: taskA,
    edge: "right",
    duration: "4d"
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: true,
    previewEditSelectedNodeId: taskA,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-mini-update-task",
    nodeId: taskB,
    start: "2026-07-10",
    end: "2026-07-14"
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: true,
    previewEditSelectedNodeId: taskB,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "preview-edit-state",
    previewEditMode: false
  });
  assert.deepEqual(await taskGridPresentationState(), {
    previewEditMode: false,
    previewEditSelectedNodeId: undefined,
    previewEditViewportStartIso: "2026-04-01",
    previewEditViewportEndIso: "2026-05-20"
  });
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.ok(editor.document.getText().includes("Other : other1, 2026-06-01, 1d"));
  assert.equal(editor.document.getText(), [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 2026-05-01, 4d",
    "Task B : b1, 2026-07-10, 2026-07-14",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 2026-06-01, 1d",
    "```",
    ""
  ].join("\n"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageReplacesMarkdownGanttBlockRawSource(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 3dX",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "Intro prose stays put.",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task B : b1, 2d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Other : other1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const fallbackOffset = source.indexOf("Task A");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(fallbackOffset),
    editor.document.positionAt(fallbackOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  assert.equal((await taskGridState()).mode, "fallback");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "replace-source",
    value: "gantt\nTask B : b1, 2d\n"
  });

  const state = await taskGridState();
  assert.equal(editor.document.getText(), expected);
  assert.equal(state.mode, "structured");
  assert.deepEqual(state.grid.rows.map((row) => row.label), ["Task B"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageMovesMarkdownGanttBlockTask(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "section Planning",
    "Task A : a1, 1d",
    "Task B : b1, 2d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "section Planning",
    "Task B : b1, 2d",
    "Task A : a1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const state = await taskGridState();
  const taskNodeId = state.grid.rows[1]?.nodeId;
  assert.ok(taskNodeId, "task node id was not available");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "move-task",
    nodeId: taskNodeId,
    direction: "up"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  assert.deepEqual((await taskGridState()).grid.rows.map((row) => row.id), ["b1", "a1"]);
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUndoRedoMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 1d",
    "```",
    ""
  ].join("\n");
  const expectedAfterAdd = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Task A : a1, 1d",
    "New task : task1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "add-task"
  });
  assert.equal(editor.document.getText(), expectedAfterAdd);
  assert.equal((await taskGridState()).grid.rows.length, 2);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "undo"
  });
  assert.equal(editor.document.getText(), source);
  assert.equal((await taskGridState()).grid.rows.length, 1);

  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "redo"
  });
  assert.equal(editor.document.getText(), expectedAfterAdd);
  assert.equal((await taskGridState()).grid.rows.length, 2);
  assert.ok(editor.document.getText().includes("flowchart TD\nA --> B"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridMessageUpdatesSelectedMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "gantt",
    "First : a1, 1d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Second : b1, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "```mermaid",
    "gantt",
    "First : a1, 1d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Updated second : b1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const secondOffset = source.indexOf("Second");
  editor.selection = new vscode.Selection(
    editor.document.positionAt(secondOffset),
    editor.document.positionAt(secondOffset)
  );

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  const taskNodeId = await firstTaskNodeId();
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-label",
    nodeId: taskNodeId,
    value: "Updated second"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("First : a1, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testTaskGridCommandRunsAgainstTargetedMarkdownGanttBlock(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "gantt",
    "First : a1, 1d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Second : b1, 1d",
    "```",
    ""
  ].join("\n");
  const expected = [
    "# Plan",
    "",
    "```mermaid",
    "gantt",
    "First : a1, 1d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Targeted second : b1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const blocks = findMarkdownGanttBlocks(source, editor.document.uri.toString());
  assert.equal(blocks.length, 2, "expected two Markdown Gantt blocks");

  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid", {
    documentUri: editor.document.uri.toString(),
    blockContentStartOffset: blocks[1]?.blockContentRange.start.offset
  });
  const taskNodeId = await firstTaskNodeId();
  await vscode.commands.executeCommand("mermaidGantt.test.applyTaskGridMessage", {
    type: "update-task-label",
    nodeId: taskNodeId,
    value: "Targeted second"
  });

  assert.equal(editor.document.getText(), expected);
  assert.ok(editor.document.getText().includes("First : a1, 1d"));
  await disposeTaskGridAndCloseEditors();
}

async function testMarkdownGanttCodeLensTargetsGanttBlocks(): Promise<void> {
  const source = [
    "# Plan",
    "",
    "```mermaid",
    "flowchart TD",
    "A --> B",
    "```",
    "",
    "```mermaid",
    "gantt",
    "First : a1, 1d",
    "```",
    "",
    "```mermaid",
    "gantt",
    "Second : b1, 1d",
    "```",
    ""
  ].join("\n");
  const editor = await openDocument(source, "markdown");
  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );

  assert.equal(lenses.length, 2, "expected one CodeLens per Markdown Gantt block");
  assert.ok(lenses.every((lens) => lens.command?.command === "mermaidGantt.openTaskGrid"));
  assert.ok(lenses.every((lens) => lens.command?.title.includes("Gantt Editor")));
  assert.deepEqual(
    lenses.map((lens) => lens.range.start.line),
    [7, 12]
  );
  await disposeTaskGridAndCloseEditors();
}

async function testNightlyVisualSmokeScenarioFromManifest(): Promise<void> {
  const extensionRoot = process.env.MERMAID_GANTT_EXTENSION_ROOT;
  const manifestPath = process.env.MERMAID_GANTT_HARNESS_MANIFEST;
  assert.ok(extensionRoot, "MERMAID_GANTT_EXTENSION_ROOT is not configured");
  assert.ok(manifestPath, "MERMAID_GANTT_HARNESS_MANIFEST is not configured");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { nightlyVisual?: string[] };
  const scenarioPath = process.env.MERMAID_GANTT_NIGHTLY_SCENARIO_PATH ?? manifest.nightlyVisual?.[0];
  assert.ok(scenarioPath, "nightly visual manifest does not contain a scenario");
  const scenario = JSON.parse(await readFile(join(extensionRoot, scenarioPath), "utf8")) as ScenarioSpec;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? extensionRoot;
  const commandTrace: HostScenarioCommandTraceEntry[] = [];

  for (const step of scenario.steps) {
    if (step.type === "open-fixture") {
      const fixturePath = join(workspaceRoot, scenario.fixture);
      await openDocumentFromFile(fixturePath);
      commandTrace.push({
        stepId: step.id,
        command: "vscode.open",
        args: [fixturePath],
        target: fixturePath
      });
      continue;
    }
    await vscode.commands.executeCommand(step.command, ...(step.args ?? []));
    commandTrace.push({
      stepId: step.id,
      command: step.command,
      args: step.args,
      target: step.command
    });
  }

  const state = await taskGridState();
  const snapshot = await editorSnapshot();
  for (const assertion of scenario.assertions) {
    assertScenarioAssertion(assertion, state, snapshot);
  }
  await writeHostScenarioArtifactsIfRequested(scenario.id, commandTrace, snapshot);
  await prepareWorkbenchForVisualCapture();
  await writeUiReviewSnapshotIfRequested();
  await captureNightlyScreenshotIfRequested();
  await holdForOptionalComputerUseIfRequested();
  await disposeTaskGridAndCloseEditors();
}

interface HostScenarioCommandTraceEntry {
  stepId: string;
  command: string;
  args?: unknown[];
  target?: string;
}

async function writeHostScenarioArtifactsIfRequested(
  scenarioId: string,
  commands: HostScenarioCommandTraceEntry[],
  snapshot: HostEditorSnapshot
): Promise<void> {
  const commandTracePath = process.env.MERMAID_GANTT_COMMAND_TRACE_PATH;
  if (commandTracePath) {
    await mkdir(dirname(commandTracePath), { recursive: true });
    await writeFile(commandTracePath, JSON.stringify({
      scenarioId,
      commands
    }, null, 2), "utf8");
  }
  const editorSnapshotPath = process.env.MERMAID_GANTT_EDITOR_SNAPSHOT_PATH;
  if (editorSnapshotPath) {
    await mkdir(dirname(editorSnapshotPath), { recursive: true });
    await writeFile(editorSnapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  }
}

function assertScenarioAssertion(
  assertion: AssertionSpec,
  state: EditorState,
  snapshot: HostEditorSnapshot
): void {
  if (assertion.type === "mode") {
    assert.equal(state.mode, assertion.expected);
    assert.equal(snapshot.mode, assertion.expected);
  }
  if (assertion.type === "diagnostic") {
    const count = state.diagnostics.filter((diagnostic) => diagnostic.code === assertion.code).length;
    assert.ok(count >= (assertion.minCount ?? 1), `expected diagnostic ${assertion.code}`);
  }
  if (assertion.type === "preview-source") {
    const available = state.previewSource ? "available" : "blocked";
    assert.equal(available, assertion.expected);
  }
}

async function openDocument(content: string, language: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    content,
    language
  });
  return vscode.window.showTextDocument(document);
}

async function openDocumentFromFile(path: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  return vscode.window.showTextDocument(document);
}

async function captureNightlyScreenshotIfRequested(): Promise<void> {
  const screenshotPath = process.env.MERMAID_GANTT_NIGHTLY_SCREENSHOT_PATH;
  if (!screenshotPath) {
    return;
  }
  if (process.platform !== "darwin") {
    return;
  }
  await mkdir(dirname(screenshotPath), { recursive: true });
  const metadataPath = captureMetadataPath(screenshotPath);
  await setTimeout(250);

  const startedAt = new Date().toISOString();
  const boundsResult = await getExtensionHostWindowBounds();
  if (boundsResult.ok) {
    try {
      const windowLayoutActions = await maybeResizeWindowForVisualCapture(boundsResult.bounds);
      const refreshedBounds = await getExtensionHostWindowBounds();
      const bounds = refreshedBounds.ok ? refreshedBounds.bounds : boundsResult.bounds;
      const preCaptureActions = await prepareScreenForWindowCapture(bounds);
      const command = bounds.windowId
        ? ["-x", "-o", "-l", String(bounds.windowId), screenshotPath]
        : ["-x", "-R", formatWindowBounds(bounds), screenshotPath];
      await execFileAsync("screencapture", command, { timeout: 30_000 });
      await writeCaptureMetadata(metadataPath, {
        captureMode: "active-window",
        command: `screencapture ${command.slice(0, -1).join(" ")}`,
        bounds,
        preCaptureActions: [...windowLayoutActions, ...preCaptureActions],
        startedAt,
        finishedAt: new Date().toISOString()
      });
      return;
    } catch (error) {
      await captureFullScreenFallback(screenshotPath, metadataPath, startedAt, `active-window screencapture failed: ${errorMessage(error)}`);
      return;
    }
  }

  await captureFullScreenFallback(screenshotPath, metadataPath, startedAt, boundsResult.reason);
}

async function writeUiReviewSnapshotIfRequested(): Promise<void> {
  const snapshotPath = process.env.MERMAID_GANTT_UI_REVIEW_SNAPSHOT_PATH;
  if (!snapshotPath) {
    return;
  }
  const snapshot = await waitForUiReviewSnapshot();
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
}

async function waitForUiReviewSnapshot(): Promise<unknown> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = await vscode.commands.executeCommand<unknown>("mermaidGantt.test.getUiReviewSnapshot");
    if (snapshot) {
      return snapshot;
    }
    await setTimeout(100);
  }
  throw new Error("UI review snapshot was not posted by the Task Grid webview.");
}

async function holdForOptionalComputerUseIfRequested(): Promise<void> {
  if (process.env.MERMAID_GANTT_NIGHTLY_COMPUTER_USE !== "1") {
    return;
  }
  const screenshotPath = process.env.MERMAID_GANTT_NIGHTLY_SCREENSHOT_PATH;
  if (!screenshotPath) {
    return;
  }
  const holdMs = parseOptionalComputerUseHoldMs(process.env.MERMAID_GANTT_NIGHTLY_COMPUTER_USE_HOLD_MS);
  await writeFile(computerUseHandoffPath(screenshotPath), JSON.stringify({
    enabled: true,
    createdAt: new Date().toISOString(),
    holdMs,
    screenshotPath,
    captureMetadataPath: captureMetadataPath(screenshotPath),
    targetWindowTitle: "[Extension Development Host] Mermaid Gantt Editor",
    instructions: [
      "Use Computer Use only for optional manual visual inspection.",
      "Do not treat Computer Use as the standard nightly gate.",
      "Capture additional screenshots or notes under a separate local artifact directory."
    ]
  }, null, 2), "utf8");
  if (holdMs > 0) {
    await setTimeout(holdMs);
  }
}

function parseOptionalComputerUseHoldMs(value: string | undefined): number {
  if (!value) {
    return 120_000;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 120_000;
  }
  return Math.round(parsed);
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  windowId?: number;
  processId?: number;
  title?: string;
  processName?: string;
}

type WindowBoundsResult =
  | { ok: true; bounds: WindowBounds }
  | { ok: false; reason: string };

interface ScreenshotCaptureMetadata {
  captureMode: "active-window" | "full-screen-fallback";
  command: string;
  bounds?: WindowBounds;
  fallbackReason?: string;
  preCaptureActions: string[];
  startedAt: string;
  finishedAt: string;
}

async function getExtensionHostWindowBounds(): Promise<WindowBoundsResult> {
  const script = [
    "import CoreGraphics",
    "import Foundation",
    "",
    "let preferredTitles = [\"Mermaid Gantt Editor\", \"source.mmd\", \"[Extension Development Host]\"]",
    "let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]",
    "guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {",
    "  throw NSError(domain: \"mermaid-gantt\", code: 1, userInfo: [NSLocalizedDescriptionKey: \"CGWindowListCopyWindowInfo failed\"])",
    "}",
    "",
    "func number(_ value: Any?) -> Double? {",
    "  if let number = value as? NSNumber { return number.doubleValue }",
    "  return nil",
    "}",
    "",
    "func candidate(from window: [String: Any]) -> [String: Any]? {",
    "  let title = window[kCGWindowName as String] as? String ?? \"\"",
    "  let owner = window[kCGWindowOwnerName as String] as? String ?? \"\"",
    "  let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0",
    "  guard layer == 0 else { return nil }",
    "  guard owner == \"Code\" || owner == \"Visual Studio Code\" else { return nil }",
    "  guard let bounds = window[kCGWindowBounds as String] as? [String: Any],",
    "    let x = number(bounds[\"X\"]),",
    "    let y = number(bounds[\"Y\"]),",
    "    let width = number(bounds[\"Width\"]),",
    "    let height = number(bounds[\"Height\"]),",
    "    let id = (window[kCGWindowNumber as String] as? NSNumber)?.intValue,",
    "    let pid = (window[kCGWindowOwnerPID as String] as? NSNumber)?.intValue else { return nil }",
    "  guard width > 0 && height > 0 else { return nil }",
    "  let preferredRank = preferredTitles.firstIndex { title.contains($0) } ?? 100",
    "  let sizeRank = (width >= 900 && width <= 1500 && height >= 700 && height <= 1100) ? 10 : 50",
    "  return [",
    "    \"rank\": preferredRank + sizeRank,",
    "    \"windowId\": id,",
    "    \"processId\": pid,",
    "    \"processName\": owner,",
    "    \"title\": title,",
    "    \"x\": Int(x.rounded()),",
    "    \"y\": Int(y.rounded()),",
    "    \"width\": Int(width.rounded()),",
    "    \"height\": Int(height.rounded())",
    "  ]",
    "}",
    "",
    "let candidates = windows.compactMap(candidate).sorted {",
    "  let lhs = $0[\"rank\"] as? Int ?? 999",
    "  let rhs = $1[\"rank\"] as? Int ?? 999",
    "  return lhs < rhs",
    "}",
    "",
    "guard var selected = candidates.first else {",
    "  throw NSError(domain: \"mermaid-gantt\", code: 2, userInfo: [NSLocalizedDescriptionKey: \"No Code window candidate found\"])",
    "}",
    "selected.removeValue(forKey: \"rank\")",
    "let data = try JSONSerialization.data(withJSONObject: selected, options: [])",
    "FileHandle.standardOutput.write(data)"
  ].join("\n");

  try {
    const { stdout } = await execFileAsync("/usr/bin/swift", ["-e", script], { timeout: 30_000 });
    return parseWindowBounds(stdout);
  } catch (error) {
    return { ok: false, reason: `window bounds swift failed: ${errorMessage(error)}` };
  }
}

function parseWindowBounds(stdout: string): WindowBoundsResult {
  const text = stdout.trim();
  if (text.length === 0) {
    return { ok: false, reason: "window bounds swift returned empty output" };
  }
  let parsed: Partial<WindowBounds>;
  try {
    parsed = JSON.parse(text) as Partial<WindowBounds>;
  } catch {
    return { ok: false, reason: `window bounds output has unexpected shape: ${text}` };
  }
  const { x, y, width, height, windowId, processId, title, processName } = parsed;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return { ok: false, reason: `window bounds rectangle is invalid: ${text}` };
  }
  if (x < 0 || y < 0 || width <= 0 || height <= 0) {
    return { ok: false, reason: `window bounds rectangle is out of range: ${text}` };
  }
  return {
    ok: true,
    bounds: {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      ...(typeof windowId === "number" ? { windowId } : {}),
      ...(typeof processId === "number" ? { processId } : {}),
      ...(title ? { title } : {}),
      ...(processName ? { processName } : {})
    }
  };
}

function formatWindowBounds(bounds: WindowBounds): string {
  return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
}

async function captureFullScreenFallback(
  screenshotPath: string,
  metadataPath: string,
  startedAt: string,
  fallbackReason: string
): Promise<void> {
  await execFileAsync("screencapture", ["-x", screenshotPath], { timeout: 30_000 });
  await writeCaptureMetadata(metadataPath, {
    captureMode: "full-screen-fallback",
    command: "screencapture -x",
    fallbackReason,
    preCaptureActions: [],
    startedAt,
    finishedAt: new Date().toISOString()
  });
}

async function prepareScreenForWindowCapture(bounds: WindowBounds): Promise<string[]> {
  const actions: string[] = [];
  if (await executeWorkbenchCommandIfAvailable("workbench.action.notifications.clearAll")) {
    actions.push("workbench.action.notifications.clearAll");
  }
  if (await executeWorkbenchCommandIfAvailable("notifications.clearAll")) {
    actions.push("notifications.clearAll");
  }
  if (await moveCursorToCaptureSafePoint(bounds)) {
    actions.push("cursor.safe-point");
  }
  await setTimeout(250);
  return actions;
}

async function maybeResizeWindowForVisualCapture(bounds: WindowBounds): Promise<string[]> {
  if (process.env.MERMAID_GANTT_NIGHTLY_RESIZE_WINDOW !== "1") {
    return [];
  }
  if (bounds.processId) {
    const resized = await resizeWindowByAccessibilityPid(bounds.processId);
    if (resized) {
      return ["window.maximize-for-capture"];
    }
  }
  const titleCondition = bounds.title
    ? `name contains ${appleScriptStringLiteral(bounds.title)}`
    : "name contains \"Mermaid Gantt Editor\"";
  const script = [
    "tell application \"Finder\"",
    "  set desktopBounds to bounds of window of desktop",
    "end tell",
    "set screenWidth to item 3 of desktopBounds",
    "set screenHeight to item 4 of desktopBounds",
    "set menuBarHeight to 24",
    "tell application \"System Events\"",
    "  set codeProcesses to (processes whose name is \"Code\") & (processes whose name is \"Visual Studio Code\")",
    "  repeat with codeProcess in codeProcesses",
    "    set frontmost of codeProcess to true",
    `    set matchingWindows to windows of codeProcess whose ${titleCondition}`,
    "    if (count of matchingWindows) > 0 then",
    "      set targetWindow to item 1 of matchingWindows",
    "      set position of targetWindow to {0, menuBarHeight}",
    "      set size of targetWindow to {screenWidth, screenHeight - menuBarHeight}",
    "      return \"ok\"",
    "    end if",
    "  end repeat",
    "end tell",
    "return \"not-found\""
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 30_000 });
    await setTimeout(500);
    return stdout.trim() === "ok" ? ["window.maximize-for-capture"] : ["window.maximize-for-capture.not-found"];
  } catch {
    return ["window.maximize-for-capture.failed"];
  }
}

async function resizeWindowByAccessibilityPid(processId: number): Promise<boolean> {
  const script = [
    "import AppKit",
    "import ApplicationServices",
    "import Foundation",
    "",
    `let pid = pid_t(${processId})`,
    "let app = AXUIElementCreateApplication(pid)",
    "var windowsValue: CFTypeRef?",
    "let windowsError = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windowsValue)",
    "guard windowsError == .success, let windows = windowsValue as? [AXUIElement], let window = windows.first else {",
    "  throw NSError(domain: \"mermaid-gantt\", code: 1, userInfo: [NSLocalizedDescriptionKey: \"AX windows unavailable\"])",
    "}",
    "let frame = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 24, width: 1440, height: 876)",
    "var position = CGPoint(x: frame.minX, y: frame.minY)",
    "var size = CGSize(width: frame.width, height: frame.height)",
    "guard let positionValue = AXValueCreate(.cgPoint, &position),",
    "  let sizeValue = AXValueCreate(.cgSize, &size) else {",
    "  throw NSError(domain: \"mermaid-gantt\", code: 2, userInfo: [NSLocalizedDescriptionKey: \"AX value creation failed\"])",
    "}",
    "let positionError = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, positionValue)",
    "let sizeError = AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, sizeValue)",
    "guard positionError == .success && sizeError == .success else {",
    "  throw NSError(domain: \"mermaid-gantt\", code: 3, userInfo: [NSLocalizedDescriptionKey: \"AX resize failed\"])",
    "}",
    "print(\"ok\")"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("/usr/bin/swift", ["-e", script], { timeout: 30_000 });
    await setTimeout(500);
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}

function appleScriptStringLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

async function executeWorkbenchCommandIfAvailable(command: string): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(command)) {
    return false;
  }
  try {
    await vscode.commands.executeCommand(command);
    return true;
  } catch {
    return false;
  }
}

async function moveCursorToCaptureSafePoint(bounds: WindowBounds): Promise<boolean> {
  const x = Math.max(0, bounds.x + 24);
  const y = Math.max(0, bounds.y + bounds.height - 24);
  const script = [
    "import CoreGraphics",
    "import Foundation",
    `let point = CGPoint(x: ${x}, y: ${y})`,
    "CGWarpMouseCursorPosition(point)",
    "CGAssociateMouseAndMouseCursorPosition(boolean_t(1))"
  ].join("\n");
  try {
    await execFileAsync("/usr/bin/swift", ["-e", script], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

async function writeCaptureMetadata(path: string, metadata: ScreenshotCaptureMetadata): Promise<void> {
  await writeFile(path, JSON.stringify(metadata, null, 2), "utf8");
}

function captureMetadataPath(screenshotPath: string): string {
  return screenshotPath.replace(/\.png$/u, ".capture.json");
}

function computerUseHandoffPath(screenshotPath: string): string {
  return screenshotPath.replace(/\.png$/u, ".computer-use-handoff.json");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function prepareWorkbenchForVisualCapture(): Promise<void> {
  const commands = await vscode.commands.getCommands(true);
  const maybeExecute = async (command: string): Promise<void> => {
    if (!commands.includes(command)) {
      return;
    }
    try {
      await vscode.commands.executeCommand(command);
    } catch {
      // Visual capture prep is best-effort; assertions already verify behavior.
    }
  };

  await maybeExecute("workbench.action.closeSidebar");
  await maybeExecute("workbench.action.closeAuxiliaryBar");
  await maybeExecute("workbench.action.closePanel");
  await maybeExecute("workbench.action.editorLayoutSingle");
  const revealed = await vscode.commands.executeCommand<boolean>("mermaidGantt.test.revealTaskGrid");
  assert.equal(revealed, true, "Task Grid panel was not available for visual capture");
  await maybeExecute("workbench.action.focusActiveEditorGroup");
  await setTimeout(1500);
}

async function firstTaskNodeId(): Promise<string> {
  const state = await taskGridState();
  const nodeId = state?.grid.rows[0]?.nodeId;
  assert.ok(nodeId, "Task Grid state does not contain a first task row");
  return nodeId;
}

async function taskGridState(): Promise<EditorState> {
  const state = await vscode.commands.executeCommand<EditorState | undefined>("mermaidGantt.test.getTaskGridState");
  assert.ok(state, "Task Grid state is not available");
  return state;
}

interface HostEditorSnapshot {
  activeDocumentUri?: string;
  languageId?: string;
  text?: string;
  selectionStartOffset?: number;
  selectionEndOffset?: number;
  mode?: "structured" | "fallback";
  diagnosticCodes?: string[];
  taskGridPresentationState?: {
    previewEditMode: boolean;
    previewEditSelectedNodeId?: string;
    previewEditViewportStartIso?: string;
    previewEditViewportEndIso?: string;
  };
}

async function editorSnapshot(): Promise<HostEditorSnapshot> {
  const snapshot = await vscode.commands.executeCommand<HostEditorSnapshot | undefined>("mermaidGantt.test.getEditorSnapshot");
  assert.ok(snapshot, "Editor snapshot is not available");
  return snapshot;
}

async function taskGridPresentationState(): Promise<NonNullable<HostEditorSnapshot["taskGridPresentationState"]>> {
  const snapshot = await editorSnapshot();
  assert.ok(snapshot.taskGridPresentationState, "Task Grid presentation state is not available");
  return snapshot.taskGridPresentationState;
}

async function disposeTaskGridAndCloseEditors(): Promise<void> {
  await vscode.commands.executeCommand("mermaidGantt.test.disposeTaskGrid");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function testRuntimeLogsFallbackEntry(): Promise<void> {
  const path = process.env.MERMAID_GANTT_RUNTIME_JSONL;
  assert.ok(path, "MERMAID_GANTT_RUNTIME_JSONL is not configured");

  await openDocument("gantt\nTask A : a1, 3dX\n", "mermaid");
  await vscode.commands.executeCommand("mermaidGantt.openTaskGrid");
  assert.equal((await taskGridState()).mode, "fallback");

  const lines = (await readFile(path, "utf8")).trim().split("\n");
  const events = lines.map((line) => parseRuntimeLogEvent(line));
  assert.ok(events.some((event) => {
    return event.event === "fallback.entered" &&
      event.mode === "fallback" &&
      event.documentId &&
      event.message?.includes("fallback mode");
  }), "fallback.entered runtime event was not written");
  await disposeTaskGridAndCloseEditors();
}

async function testRuntimeJsonlWasWritten(): Promise<void> {
  const path = process.env.MERMAID_GANTT_RUNTIME_JSONL;
  assert.ok(path, "MERMAID_GANTT_RUNTIME_JSONL is not configured");

  const lines = (await readFile(path, "utf8")).trim().split("\n");
  const events = lines.map((line) => parseRuntimeLogEvent(line));
  const eventNames = events.map((event) => event.event);

  assert.ok(eventNames.includes("ui.command.executed"));
  assert.ok(eventNames.includes("parser.import.started"));
  assert.ok(eventNames.includes("parser.import.succeeded") || eventNames.includes("parser.import.failed"));
  assert.ok(eventNames.includes("validator.run.started"));
  assert.ok(eventNames.includes("validator.run.succeeded") || eventNames.includes("validator.run.failed"));
  assert.ok(eventNames.includes("emitter.export.started"));
  assert.ok(eventNames.includes("emitter.export.succeeded") || eventNames.includes("emitter.export.failed"));
  assert.ok(events.some((event) => event.event === "ui.command.executed" && event.message === "mermaidGantt.openTaskGrid"));
  assert.ok(events.every((event) => event.runId === process.env.MERMAID_GANTT_RUN_ID));
}
