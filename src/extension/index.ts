import * as vscode from "vscode";
import {
  applyEditorAction,
  createEditorState,
  findMarkdownGanttBlockAtOffset,
  findMarkdownGanttBlocks,
  parseGanttLossless,
  projectGanttSemantic,
  replaceMarkdownGanttBlock,
  type EditorAction,
  type EditorState,
  type MarkdownGanttBlockContext,
  type Range as GanttRange,
  type TaskGridFilter,
  type TaskGridSort,
  type TaskGridSortField
} from "../core";
import {
  createJsonlFileRuntimeSink,
  createRuntimeLogger,
  emitNormalizedGanttLogged,
  parseGanttLosslessLogged,
  resolveGanttDocumentLogged,
  type RuntimeLogger
} from "../logging";
import { renderTaskGridHtml, type TaskGridWebviewLabels, type TaskGridWebviewOptions } from "./task-grid-webview";

const SOURCE_CHANGE_RENDER_DEBOUNCE_MS = 200;

export function activate(context: vscode.ExtensionContext): void {
  const runtimeLogger = createExtensionRuntimeLogger();
  let activeTaskGridSession: ActiveTaskGridSession | undefined;
  const parserInfo = vscode.commands.registerCommand("mermaidGantt.showParserInfo", async () => {
    await recordUiCommand(runtimeLogger, "mermaidGantt.showParserInfo");
    const editor = vscode.window.activeTextEditor;
    const text = editor?.document.getText() ?? "gantt\n";
    const document = runtimeLogger
      ? await parseGanttLosslessLogged(text, runtimeLogger)
      : parseGanttLossless(text);
    await vscode.window.showInformationMessage(
      vscode.l10n.t(
        "Mermaid Gantt parser ready: {0} items, {1} document errors",
        document.items.length,
        document.errors.length
      )
    );
  });

  const openTaskGrid = vscode.commands.registerCommand("mermaidGantt.openTaskGrid", async (target?: TaskGridOpenTarget) => {
    await recordUiCommand(runtimeLogger, "mermaidGantt.openTaskGrid");
    const editor = await taskGridSourceEditor(target);
    const session = await createTaskGridSession(editor, runtimeLogger, target);
    if (!session) {
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "mermaidGanttTaskGrid",
      vscode.l10n.t("Mermaid Gantt Editor"),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist", "webview")
        ]
      }
    );
    activeTaskGridSession = {
      state: session.state,
      markdownBlockIndex: session.markdownBlockIndex,
      editor,
      panel,
      presentationState: { previewEditMode: false },
      webviewGeneration: 0,
      pendingTestWebviewOperations: new Map()
    };
    renderSessionPanelNow(context, activeTaskGridSession);

    panel.webview.onDidReceiveMessage(async (message: TaskGridMessage) => {
      if (!activeTaskGridSession || activeTaskGridSession.panel !== panel) {
        return;
      }
      await applyTaskGridMessageToSession(message, activeTaskGridSession, context, runtimeLogger);
    });
    panel.onDidDispose(() => {
      if (activeTaskGridSession?.panel === panel) {
        clearScheduledPanelRender(activeTaskGridSession);
        activeTaskGridSession = undefined;
      }
    });
  });

  const subscriptions: vscode.Disposable[] = [
    parserInfo,
    openTaskGrid,
    vscode.languages.registerCodeLensProvider({ language: "markdown" }, new MarkdownGanttCodeLensProvider())
  ];
  if (process.env.MERMAID_GANTT_ENABLE_TEST_COMMANDS === "1") {
    subscriptions.push(
      vscode.commands.registerCommand("mermaidGantt.test.getTaskGridState", () => {
        return activeTaskGridSession?.state;
      }),
      vscode.commands.registerCommand("mermaidGantt.test.getEditorSnapshot", () => {
        return createTestEditorSnapshot(activeTaskGridSession);
      }),
      vscode.commands.registerCommand("mermaidGantt.test.getUiReviewSnapshot", () => {
        return activeTaskGridSession?.uiReviewSnapshot;
      }),
      vscode.commands.registerCommand("mermaidGantt.test.applyTaskGridMessage", async (message: TaskGridMessage) => {
        if (!activeTaskGridSession) {
          throw new Error("Task Grid session is not open.");
        }
        await applyTaskGridMessageToSession(message, activeTaskGridSession, context, runtimeLogger);
        return activeTaskGridSession.state;
      }),
      vscode.commands.registerCommand("mermaidGantt.test.runWebviewOperation", async (operation: TestWebviewOperation) => {
        if (!activeTaskGridSession) {
          throw new Error("Task Grid session is not open.");
        }
        return runTestWebviewOperation(activeTaskGridSession, operation);
      }),
      vscode.commands.registerCommand("mermaidGantt.test.revealTaskGrid", () => {
        activeTaskGridSession?.panel.reveal(vscode.ViewColumn.One, false);
        return activeTaskGridSession !== undefined;
      }),
      vscode.commands.registerCommand("mermaidGantt.test.disposeTaskGrid", () => {
        if (activeTaskGridSession) {
          clearScheduledPanelRender(activeTaskGridSession);
        }
        activeTaskGridSession?.panel?.dispose();
        activeTaskGridSession = undefined;
      })
    );
  }
  context.subscriptions.push(...subscriptions);
}

export function deactivate(): void {}

interface TaskGridMessage {
  type?: string;
  nodeId?: string;
  sectionId?: string;
  settingKey?: string;
  value?: string;
  start?: string;
  end?: string;
  duration?: string;
  edge?: "left" | "right";
  dayDelta?: number;
  checked?: boolean;
  previewEditMode?: boolean;
  viewportStartIso?: string;
  viewportEndIso?: string;
  message?: string;
  code?: string;
  startOffset?: number;
  actionIndex?: number;
  direction?: "up" | "down";
  position?: string;
  snapshot?: unknown;
  operationId?: string;
  ok?: boolean;
  error?: string;
  detail?: unknown;
  webviewGeneration?: number;
  source?: string;
  runtimeType?: string;
  runtimeVersion?: string;
  securityLevel?: string;
}

interface TaskGridOpenTarget {
  documentUri?: string;
  blockContentStartOffset?: number;
}

type PreviewRenderMessageType =
  | "preview-render-started"
  | "preview-render-succeeded"
  | "preview-render-failed";

type SourceHistoryMessageType =
  | "undo"
  | "redo";

interface TaskGridSession {
  state: EditorState;
  markdownBlockIndex?: number;
}

interface ActiveTaskGridSession extends TaskGridSession {
  editor: vscode.TextEditor | undefined;
  panel: vscode.WebviewPanel;
  presentationState: TaskGridPresentationState;
  uiReviewSnapshot?: unknown;
  testWebviewOperationReady?: boolean;
  pendingRenderTimer?: ReturnType<typeof setTimeout>;
  webviewGeneration: number;
  pendingTestWebviewOperations: Map<string, PendingTestWebviewOperation>;
}

interface TaskGridPresentationState {
  previewEditMode: boolean;
  previewEditSelectedNodeId?: string;
  previewEditViewportStartIso?: string;
  previewEditViewportEndIso?: string;
}

interface TestEditorSnapshot {
  activeDocumentUri?: string;
  languageId?: string;
  text?: string;
  selectionStartOffset?: number;
  selectionEndOffset?: number;
  mode?: "structured" | "fallback";
  diagnosticCodes?: string[];
  taskGridPresentationState?: TaskGridPresentationState;
}

interface TestWebviewOperation {
  type?: "preview-resize" | "preview-pan";
  taskSelector?: {
    label?: string;
    sourceOrder?: number;
  };
  edge?: "left" | "right";
  dayDelta?: number;
  deltaX?: number;
  deltaY?: number;
  expectedSourceIncludes?: string | string[];
  timeoutMs?: number;
}

interface TestWebviewOperationResult {
  ok: boolean;
  operationId: string;
  detail?: unknown;
}

interface PendingTestWebviewOperation {
  resolve: (result: TestWebviewOperationResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function createTestEditorSnapshot(session: ActiveTaskGridSession | undefined): TestEditorSnapshot {
  const editor = vscode.window.activeTextEditor ?? session?.editor;
  const snapshot: TestEditorSnapshot = {};
  if (editor) {
    snapshot.activeDocumentUri = editor.document.uri.toString();
    snapshot.languageId = editor.document.languageId;
    snapshot.text = editor.document.getText();
    snapshot.selectionStartOffset = editor.document.offsetAt(editor.selection.start);
    snapshot.selectionEndOffset = editor.document.offsetAt(editor.selection.end);
  }
  if (session) {
    snapshot.mode = session.state.mode;
    snapshot.diagnosticCodes = session.state.diagnostics.map((diagnostic) => diagnostic.code);
    snapshot.taskGridPresentationState = session.presentationState;
  }
  return snapshot;
}

async function createTaskGridSession(
  editor: vscode.TextEditor | undefined,
  runtimeLogger: RuntimeLogger | undefined,
  target?: TaskGridOpenTarget
): Promise<TaskGridSession | undefined> {
  const text = editor?.document.getText() ?? "gantt\n";
  const blocks = editor ? findMarkdownGanttBlocks(text, editor.document.uri.toString()) : [];
  const selectedBlock = editor
    ? await selectMarkdownGanttBlock(editor, text, blocks, target)
    : undefined;
  if (selectedBlock) {
    const document = runtimeLogger
      ? await parseGanttLosslessLogged(selectedBlock.gantt.source, runtimeLogger)
      : selectedBlock.gantt;
    await logValidationAndEmitPreview(document, runtimeLogger);
    const state = createEditorState(document);
    await recordFallbackEntered(runtimeLogger, state, "Task Grid opened in fallback mode.");
    return {
      state,
      markdownBlockIndex: blocks.findIndex((block) => block.blockId === selectedBlock.blockId)
    };
  }
  const document = runtimeLogger
    ? await parseGanttLosslessLogged(text, runtimeLogger)
    : parseGanttLossless(text);
  await logValidationAndEmitPreview(document, runtimeLogger);
  const state = createEditorState(document);
  await recordFallbackEntered(runtimeLogger, state, "Task Grid opened in fallback mode.");
  return {
    state
  };
}

async function selectMarkdownGanttBlock(
  editor: vscode.TextEditor,
  text: string,
  blocks: MarkdownGanttBlockContext[],
  target?: TaskGridOpenTarget
): Promise<MarkdownGanttBlockContext | undefined> {
  const targetBlock = blockFromOpenTarget(blocks, target);
  if (targetBlock) {
    return targetBlock;
  }
  const activeOffset = editor.document.offsetAt(editor.selection.active);
  const blockAtCursor = findMarkdownGanttBlockAtOffset(text, activeOffset, editor.document.uri.toString());
  if (blockAtCursor) {
    return blockAtCursor;
  }
  if (blocks.length <= 1) {
    return blocks[0];
  }

  const picked = await vscode.window.showQuickPick(
    blocks.map((block, index) => ({
      label: vscode.l10n.t("Gantt block {0}", index + 1),
      description: vscode.l10n.t(
        "Lines {0}-{1}",
        block.blockContentRange.start.line,
        block.blockContentRange.end.line
      ),
      detail: summarizeMarkdownGanttBlock(block),
      block
    })),
    {
      ignoreFocusOut: true,
      placeHolder: vscode.l10n.t("Select the Mermaid Gantt block to edit")
    }
  );
  return picked?.block;
}

function blockFromOpenTarget(
  blocks: MarkdownGanttBlockContext[],
  target: TaskGridOpenTarget | undefined
): MarkdownGanttBlockContext | undefined {
  if (typeof target?.blockContentStartOffset !== "number") {
    return undefined;
  }
  return blocks.find((block) => block.blockContentRange.start.offset === target.blockContentStartOffset);
}

async function taskGridSourceEditor(target: TaskGridOpenTarget | undefined): Promise<vscode.TextEditor | undefined> {
  if (!target?.documentUri) {
    return vscode.window.activeTextEditor;
  }
  const targetUri = vscode.Uri.parse(target.documentUri);
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.toString() === targetUri.toString()) {
    return activeEditor;
  }
  const document = await vscode.workspace.openTextDocument(targetUri);
  return vscode.window.showTextDocument(document, vscode.ViewColumn.Active, false);
}

function summarizeMarkdownGanttBlock(block: MarkdownGanttBlockContext): string {
  return block.gantt.source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? block.blockId;
}

class MarkdownGanttCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const blocks = findMarkdownGanttBlocks(document.getText(), document.uri.toString());
    return blocks.map((block) => {
      const openingFenceLine = Math.max(0, block.blockContentRange.start.line - 2);
      const range = new vscode.Range(openingFenceLine, 0, openingFenceLine, 0);
      return new vscode.CodeLens(range, {
        title: vscode.l10n.t("Open Gantt Editor"),
        command: "mermaidGantt.openTaskGrid",
        arguments: [{
          documentUri: document.uri.toString(),
          blockContentStartOffset: block.blockContentRange.start.offset
        } satisfies TaskGridOpenTarget]
      });
    });
  }
}

async function applyTaskGridMessageToSession(
  message: TaskGridMessage,
  session: ActiveTaskGridSession,
  context: vscode.ExtensionContext,
  runtimeLogger: RuntimeLogger | undefined
): Promise<void> {
  if (isPreviewRenderMessage(message)) {
    await recordPreviewRender(runtimeLogger, message, session.state);
    return;
  }
  if (message.type === "webview-error") {
    await recordWebviewError(runtimeLogger, message, session.state);
    return;
  }
  if (message.type === "ui-review-snapshot") {
    session.uiReviewSnapshot = message.snapshot;
    return;
  }
  if (message.type === "test-webview-operation-ready") {
    if (isCurrentTestWebviewGeneration(session, message)) {
      session.testWebviewOperationReady = true;
    }
    return;
  }
  if (message.type === "test-webview-operation-result") {
    resolveTestWebviewOperationResult(session, message);
    return;
  }
  if (message.type === "preview-edit-state") {
    session.presentationState = message.previewEditMode === true
      ? {
          ...session.presentationState,
          previewEditMode: true,
          ...(typeof message.nodeId === "string" && message.nodeId ? { previewEditSelectedNodeId: message.nodeId } : {})
        }
      : { ...session.presentationState, previewEditMode: false, previewEditSelectedNodeId: undefined };
    return;
  }
  if (message.type === "preview-edit-viewport") {
    session.presentationState = {
      ...session.presentationState,
      ...(typeof message.viewportStartIso === "string" && message.viewportStartIso ? { previewEditViewportStartIso: message.viewportStartIso } : {}),
      ...(typeof message.viewportEndIso === "string" && message.viewportEndIso ? { previewEditViewportEndIso: message.viewportEndIso } : {})
    };
    return;
  }
  if (isSourceHistoryMessage(message)) {
    await applySourceHistoryMessageToSession(message.type, session, runtimeLogger);
    if (session.editor && isVisibleTextEditor(session.editor)) {
      revealEditorSelection(session.editor, session.state, currentMarkdownBlock(session.editor, session.markdownBlockIndex));
    }
    session.testWebviewOperationReady = false;
    renderSessionPanelNow(context, session);
    return;
  }
  const confirmedMessage = await confirmDeleteMessage(message);
  if (!confirmedMessage) {
    return;
  }
  const action = toEditorAction(confirmedMessage, session.state);
  if (!action) {
    return;
  }
  const result = applyEditorAction(session.state, action);
  if (result.diagnostics.length > 0) {
    await vscode.window.showWarningMessage(result.diagnostics[0]?.message ?? vscode.l10n.t("Task Grid action failed."));
    return;
  }
  if (result.sourceChanged && session.editor) {
    const nextSession = await applySourceToEditor(session.editor, result.state, session.markdownBlockIndex, runtimeLogger);
    session.state = nextSession.state;
    session.markdownBlockIndex = nextSession.markdownBlockIndex;
  } else {
    session.state = result.state;
  }
  if (session.state.mode === "fallback") {
    await recordFallbackEntered(runtimeLogger, session.state, "Task Grid entered fallback mode after an editor action.");
  }
  updatePreviewEditPresentationState(session, confirmedMessage);
  if (session.editor && isVisibleTextEditor(session.editor)) {
    revealEditorSelection(session.editor, session.state, currentMarkdownBlock(session.editor, session.markdownBlockIndex));
  }
  session.testWebviewOperationReady = false;
  if (result.sourceChanged) {
    scheduleSourceChangedPanelRender(context, session);
  } else {
    renderSessionPanelNow(context, session);
  }
}

function updatePreviewEditPresentationState(session: ActiveTaskGridSession, message: TaskGridMessage): void {
  if (
    message.type !== "preview-drag-task" &&
    message.type !== "preview-resize-task" &&
    message.type !== "preview-mini-update-task"
  ) {
    return;
  }
  if (typeof message.nodeId !== "string" || !message.nodeId) {
    return;
  }
  session.presentationState = {
    ...session.presentationState,
    previewEditMode: true,
    previewEditSelectedNodeId: message.nodeId
  };
}

async function applySourceHistoryMessageToSession(
  type: SourceHistoryMessageType,
  session: ActiveTaskGridSession,
  runtimeLogger: RuntimeLogger | undefined
): Promise<void> {
  if (!session.editor) {
    await vscode.window.showWarningMessage(vscode.l10n.t("Task Grid source editor was not found."));
    return;
  }
  const panelColumn = session.panel.viewColumn ?? vscode.ViewColumn.Active;
  const sourceEditor = await vscode.window.showTextDocument(
    session.editor.document,
    session.editor.viewColumn ?? vscode.ViewColumn.Active,
    false
  );
  session.editor = sourceEditor;
  if (session.markdownBlockIndex !== undefined && !currentMarkdownBlock(sourceEditor, session.markdownBlockIndex)) {
    await vscode.window.showWarningMessage(vscode.l10n.t("Markdown Gantt block was not found. Undo/redo was not applied."));
    session.panel.reveal(panelColumn, false);
    return;
  }

  await vscode.commands.executeCommand(type);
  const refreshed = await refreshTaskGridSessionFromSourceEditor(
    sourceEditor,
    session.markdownBlockIndex,
    session.state.selected,
    runtimeLogger
  );
  if (refreshed) {
    session.state = refreshed.state;
    session.markdownBlockIndex = refreshed.markdownBlockIndex;
  }
  session.panel.reveal(panelColumn, false);
}

async function confirmDeleteMessage(message: TaskGridMessage): Promise<TaskGridMessage | undefined> {
  if (message.type !== "request-delete-task" && message.type !== "request-delete-section") {
    return message;
  }
  if (message.type === "request-delete-task" && !message.nodeId) {
    return undefined;
  }
  if (message.type === "request-delete-section" && !message.sectionId) {
    return undefined;
  }
  const deleteLabel = message.type === "request-delete-task"
    ? vscode.l10n.t("Delete task")
    : vscode.l10n.t("Delete section");
  const selected = await vscode.window.showWarningMessage(
    message.type === "request-delete-task"
      ? vscode.l10n.t("Delete this task?")
      : vscode.l10n.t("Delete this section?"),
    { modal: true },
    deleteLabel
  );
  if (selected !== deleteLabel) {
    return undefined;
  }
  return { ...message, type: message.type === "request-delete-task" ? "delete-task" : "delete-section" };
}

async function applySourceToEditor(
  editor: vscode.TextEditor,
  nextState: EditorState,
  markdownBlockIndex: number | undefined,
  runtimeLogger: RuntimeLogger | undefined
): Promise<TaskGridSession> {
  if (markdownBlockIndex === undefined) {
    await replaceDocumentText(editor.document, nextState.source);
    await logValidationAndEmitPreview(parseGanttLossless(nextState.source), runtimeLogger);
    return { state: nextState };
  }

  const currentText = editor.document.getText();
  const block = currentMarkdownBlock(editor, markdownBlockIndex);
  if (!block) {
    await vscode.window.showWarningMessage(vscode.l10n.t("Markdown Gantt block was not found. The editor was not updated."));
    return { state: nextState, markdownBlockIndex };
  }

  const nextText = replaceMarkdownGanttBlock(currentText, block.blockContentRange, nextState.source);
  await replaceDocumentText(editor.document, nextText);
  const nextBlock = findMarkdownGanttBlocks(nextText, editor.document.uri.toString())[markdownBlockIndex];
  if (nextBlock) {
    await logValidationAndEmitPreview(nextBlock.gantt, runtimeLogger);
  }
  return nextBlock
    ? { state: createEditorState(nextBlock.gantt, nextState.selected), markdownBlockIndex }
    : { state: nextState, markdownBlockIndex };
}

async function refreshTaskGridSessionFromSourceEditor(
  editor: vscode.TextEditor,
  markdownBlockIndex: number | undefined,
  selected: EditorState["selected"],
  runtimeLogger: RuntimeLogger | undefined
): Promise<TaskGridSession | undefined> {
  if (markdownBlockIndex === undefined) {
    const document = parseGanttLossless(editor.document.getText());
    await logValidationAndEmitPreview(document, runtimeLogger);
    return { state: createEditorState(document, selected) };
  }

  const block = currentMarkdownBlock(editor, markdownBlockIndex);
  if (!block) {
    await vscode.window.showWarningMessage(vscode.l10n.t("Markdown Gantt block was not found. Task Grid was not refreshed."));
    return undefined;
  }
  await logValidationAndEmitPreview(block.gantt, runtimeLogger);
  return {
    state: createEditorState(block.gantt, selected),
    markdownBlockIndex
  };
}

function currentMarkdownBlock(
  editor: vscode.TextEditor,
  markdownBlockIndex: number | undefined
): MarkdownGanttBlockContext | undefined {
  if (markdownBlockIndex === undefined) {
    return undefined;
  }
  return findMarkdownGanttBlocks(editor.document.getText(), editor.document.uri.toString())[markdownBlockIndex];
}

function createExtensionRuntimeLogger(): RuntimeLogger | undefined {
  const path = process.env.MERMAID_GANTT_RUNTIME_JSONL;
  if (!path) {
    return undefined;
  }
  return createRuntimeLogger({
    runId: process.env.MERMAID_GANTT_RUN_ID || `vscode-${Date.now()}`,
    sink: createJsonlFileRuntimeSink(path)
  });
}

async function recordUiCommand(runtimeLogger: RuntimeLogger | undefined, command: string): Promise<void> {
  await runtimeLogger?.record({
    level: "info",
    event: "ui.command.executed",
    source: "ui",
    operation: "command",
    message: command
  });
}

async function logValidationAndEmitPreview(
  document: ReturnType<typeof parseGanttLossless>,
  runtimeLogger: RuntimeLogger | undefined
): Promise<void> {
  if (!runtimeLogger) {
    return;
  }
  await resolveGanttDocumentLogged(document, runtimeLogger);
  await emitNormalizedGanttLogged(projectGanttSemantic(document), runtimeLogger, document.nodeId);
}

async function recordFallbackEntered(
  runtimeLogger: RuntimeLogger | undefined,
  state: EditorState,
  message: string
): Promise<void> {
  if (state.mode !== "fallback") {
    return;
  }
  await runtimeLogger?.record({
    level: "warn",
    event: "fallback.entered",
    source: "ui",
    operation: "fallback-transition",
    documentId: state.documentId,
    mode: "fallback",
    message
  });
}

function isPreviewRenderMessage(message: TaskGridMessage): message is TaskGridMessage & { type: PreviewRenderMessageType } {
  return message.type === "preview-render-started" ||
    message.type === "preview-render-succeeded" ||
    message.type === "preview-render-failed";
}

function isSourceHistoryMessage(message: TaskGridMessage): message is TaskGridMessage & { type: SourceHistoryMessageType } {
  return message.type === "undo" || message.type === "redo";
}

async function recordPreviewRender(
  runtimeLogger: RuntimeLogger | undefined,
  message: TaskGridMessage & { type: PreviewRenderMessageType },
  state: EditorState
): Promise<void> {
  const suffix = message.type.replace("preview-render-", "") as "started" | "succeeded" | "failed";
  const runtime = {
    ...(message.runtimeType ? { type: message.runtimeType } : {}),
    ...(message.runtimeVersion ? { mermaidVersion: message.runtimeVersion } : {}),
    ...(message.securityLevel ? { securityLevel: message.securityLevel } : {})
  };
  await runtimeLogger?.record({
    level: suffix === "failed" ? "warn" : "info",
    event: `preview.render.${suffix}`,
    source: "preview",
    operation: "render",
    outcome: suffix,
    documentId: state.documentId,
    mode: state.mode,
    ...(Object.keys(runtime).length > 0 ? { runtime } : {}),
    ...(message.message ? { message: message.message } : {})
  });
}

async function recordWebviewError(
  runtimeLogger: RuntimeLogger | undefined,
  message: TaskGridMessage,
  state: EditorState
): Promise<void> {
  const source = message.source ? ` (${message.source})` : "";
  await runtimeLogger?.record({
    level: "error",
    event: "ui.webview.error",
    source: "ui",
    operation: "webview",
    outcome: "failed",
    documentId: state.documentId,
    mode: state.mode,
    message: `${message.message ?? "Webview error"}${source}`
  });
}

function clearScheduledPanelRender(session: ActiveTaskGridSession): void {
  if (!session.pendingRenderTimer) {
    return;
  }
  clearTimeout(session.pendingRenderTimer);
  session.pendingRenderTimer = undefined;
}

function renderSessionPanelNow(context: vscode.ExtensionContext, session: ActiveTaskGridSession): void {
  clearScheduledPanelRender(session);
  session.webviewGeneration += 1;
  renderSessionPanel(context, session, session.webviewGeneration);
}

function scheduleSourceChangedPanelRender(context: vscode.ExtensionContext, session: ActiveTaskGridSession): void {
  clearScheduledPanelRender(session);
  session.webviewGeneration += 1;
  const webviewGeneration = session.webviewGeneration;
  session.pendingRenderTimer = setTimeout(() => {
    session.pendingRenderTimer = undefined;
    renderSessionPanel(context, session, webviewGeneration);
  }, SOURCE_CHANGE_RENDER_DEBOUNCE_MS);
}

function renderSessionPanel(context: vscode.ExtensionContext, session: ActiveTaskGridSession, webviewGeneration: number): void {
  renderPanel(context, session.panel, session.state, session.presentationState, webviewGeneration);
}

function isCurrentTestWebviewGeneration(session: ActiveTaskGridSession, message: TaskGridMessage): boolean {
  return typeof message.webviewGeneration === "number" && message.webviewGeneration === session.webviewGeneration;
}

function renderPanel(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  state: EditorState,
  presentationState: TaskGridPresentationState = { previewEditMode: false },
  webviewGeneration?: number
): void {
  panel.webview.html = renderTaskGridHtml(state, createTaskGridLabels(), {
    nonce: createNonce(),
    allowEditing: true,
    ...testWebviewPresentationOptions(),
    testWebviewGeneration: webviewGeneration,
    initialPreviewEditMode: presentationState.previewEditMode,
    initialPreviewEditSelectedNodeId: presentationState.previewEditSelectedNodeId,
    initialPreviewEditViewportStartIso: presentationState.previewEditViewportStartIso,
    initialPreviewEditViewportEndIso: presentationState.previewEditViewportEndIso,
    mermaidRuntimeVersion: bundledMermaidVersion(context),
    hostBridgeScript: vscodeTaskGridHostBridgeScript(),
    mermaidModuleUri: panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "mermaid.esm.min.mjs")
    ).toString()
  });
}

function vscodeTaskGridHostBridgeScript(): string {
  return "const vscode = acquireVsCodeApi();";
}

function bundledMermaidVersion(context: vscode.ExtensionContext): string {
  const version = context.extension.packageJSON?.dependencies?.mermaid;
  return typeof version === "string" && version.trim() ? version.trim() : "unknown";
}

function testWebviewPresentationOptions(): Pick<TaskGridWebviewOptions, "initialLayout" | "initialPreviewZoom" | "initialPreviewCollapsed" | "initialPreviewFocused" | "initialDetailsOpen" | "initialDetailTab" | "initialOpenRowActionMenu" | "initialOpenDetailsWithRowActionMenu" | "initialResponsiveMode" | "enableUiReviewSnapshot" | "enableTestWebviewOperations"> {
  if (process.env.MERMAID_GANTT_ENABLE_TEST_COMMANDS !== "1") {
    return {};
  }
  return {
    enableTestWebviewOperations: true,
    enableUiReviewSnapshot: process.env.MERMAID_GANTT_TEST_UI_REVIEW_SNAPSHOT === "1",
    ...(process.env.MERMAID_GANTT_TEST_WEBVIEW_LAYOUT === "vertical"
      ? { initialLayout: "vertical" as const }
      : {}),
    ...(isTestPreviewZoom(process.env.MERMAID_GANTT_TEST_PREVIEW_ZOOM)
      ? { initialPreviewZoom: process.env.MERMAID_GANTT_TEST_PREVIEW_ZOOM }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_PREVIEW_COLLAPSED === "1"
      ? { initialPreviewCollapsed: true }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_PREVIEW_FOCUSED === "1"
      ? { initialPreviewFocused: true }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_OPEN_DETAILS === "1"
      ? { initialDetailsOpen: true }
      : {}),
    ...(isTestDetailTab(process.env.MERMAID_GANTT_TEST_DETAIL_TAB)
      ? { initialDetailTab: process.env.MERMAID_GANTT_TEST_DETAIL_TAB }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU === "1"
      ? { initialOpenRowActionMenu: true }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU === "1"
      ? { initialOpenDetailsWithRowActionMenu: true }
      : {}),
    ...(process.env.MERMAID_GANTT_TEST_RESPONSIVE_MODE === "narrow"
      ? { initialResponsiveMode: "narrow" as const }
      : {})
  };
}

function isTestDetailTab(value: string | undefined): value is NonNullable<TaskGridWebviewOptions["initialDetailTab"]> {
  return value === "settings" ||
    value === "inspector" ||
    value === "diagnostics" ||
    value === "advanced" ||
    value === "source";
}

function isTestPreviewZoom(value: string | undefined): value is NonNullable<TaskGridWebviewOptions["initialPreviewZoom"]> {
  return value === "fit" ||
    value === "fill" ||
    value === "0.75" ||
    value === "1" ||
    value === "1.25" ||
    value === "1.5" ||
    value === "2";
}

function toEditorAction(message: TaskGridMessage, state: EditorState): EditorAction | undefined {
  if (message.type === "select-diagnostic") {
    const diagnostic = state.diagnostics.find((candidate) => {
      return candidate.code === message.code &&
        candidate.primaryRange.start.offset === message.startOffset;
    });
    return diagnostic
      ? { type: "select-diagnostic", code: diagnostic.code, primaryRange: diagnostic.primaryRange }
      : undefined;
  }
  if (message.type === "select-section" && message.sectionId) {
    return { type: "select-section", sectionId: message.sectionId };
  }
  if (message.type === "apply-diagnostic-action") {
    const actionIndex = message.actionIndex;
    const diagnostic = state.diagnostics.find((candidate) => {
      return candidate.code === message.code &&
        candidate.primaryRange.start.offset === message.startOffset;
    });
    return diagnostic && typeof actionIndex === "number" && Number.isInteger(actionIndex)
      ? {
          type: "apply-diagnostic-action",
          code: diagnostic.code,
          primaryRange: diagnostic.primaryRange,
          actionIndex
      }
      : undefined;
  }
  if (message.type === "replace-source" && typeof message.value === "string") {
    return { type: "replace-source", source: message.value };
  }
  if (message.type === "preview-drag-task" && message.nodeId && typeof message.start === "string") {
    return {
      type: "update-task-schedule",
      nodeId: message.nodeId,
      start: message.start,
      ...(typeof message.end === "string" ? { end: message.end } : {})
    };
  }
  if (message.type === "preview-resize-task" && message.nodeId) {
    const hasStart = typeof message.start === "string";
    const hasEnd = typeof message.end === "string";
    const hasDuration = typeof message.duration === "string";
    if (!hasStart && !hasEnd && !hasDuration) {
      return undefined;
    }
    if (hasEnd && hasDuration) {
      return undefined;
    }
    return {
      type: "update-task-schedule",
      nodeId: message.nodeId,
      ...(hasStart ? { start: message.start } : {}),
      ...(hasEnd ? { end: message.end } : {}),
      ...(hasDuration ? { duration: message.duration } : {})
    };
  }
  if (message.type === "preview-mini-update-task" && message.nodeId) {
    const hasStart = typeof message.start === "string";
    const hasEnd = typeof message.end === "string";
    const hasDuration = typeof message.duration === "string";
    if (!hasStart && !hasEnd && !hasDuration) {
      return undefined;
    }
    if (hasEnd && hasDuration) {
      return undefined;
    }
    return {
      type: "update-task-schedule",
      nodeId: message.nodeId,
      ...(hasStart ? { start: message.start } : {}),
      ...(hasEnd ? { end: message.end } : {}),
      ...(hasDuration ? { duration: message.duration } : {})
    };
  }
  if (message.type === "update-grid-filter-text" && typeof message.value === "string") {
    return {
      type: "update-grid-view",
      sort: state.grid.sort,
      filter: normalizeTaskGridFilter({
        ...state.grid.filter,
        text: message.value.trim() || undefined
      })
    };
  }
  if (message.type === "update-grid-filter-severity" && typeof message.value === "string") {
    const severity = toTaskGridSeverity(message.value);
    return {
      type: "update-grid-view",
      sort: state.grid.sort,
      filter: normalizeTaskGridFilter({
        ...state.grid.filter,
        severity
      })
    };
  }
  if (message.type === "update-grid-sort" && typeof message.value === "string") {
    return {
      type: "update-grid-view",
      sort: toTaskGridSort(message.value),
      filter: state.grid.filter
    };
  }
  if (message.type === "update-section-label" && message.sectionId && typeof message.value === "string") {
    return { type: "update-section-label", sectionId: message.sectionId, label: message.value };
  }
  if (message.type === "update-setting" && isEditableSettingKey(message.settingKey)) {
    const value = typeof message.checked === "boolean"
      ? message.checked
      : typeof message.value === "string"
        ? isArraySettingKey(message.settingKey)
          ? message.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
          : message.value.trim() === "" ? undefined : message.value
        : undefined;
    return { type: "update-setting", key: message.settingKey, value };
  }
  if (message.type === "add-section") {
    return message.sectionId
      ? { type: "add-section", afterSectionId: message.sectionId }
      : { type: "add-section" };
  }
  if (message.type === "add-task") {
    return message.nodeId
      ? message.position === "above"
        ? { type: "add-task", beforeNodeId: message.nodeId }
        : { type: "add-task", afterNodeId: message.nodeId }
      : message.sectionId
      ? { type: "add-task", sectionId: message.sectionId, position: message.position === "section-start" ? "section-start" : "section-end" }
      : { type: "add-task" };
  }
  if (message.type === "delete-section" && message.sectionId) {
    return { type: "delete-section", sectionId: message.sectionId };
  }
  if (message.type === "move-section" && message.sectionId && isMoveDirection(message.direction)) {
    return { type: "move-section", sectionId: message.sectionId, direction: message.direction };
  }
  if (!message.nodeId) {
    return undefined;
  }
  if (message.type === "select-task") {
    return { type: "select-task", nodeId: message.nodeId };
  }
  if (message.type === "delete-task") {
    return { type: "delete-task", nodeId: message.nodeId };
  }
  if (message.type === "duplicate-task") {
    return { type: "duplicate-task", nodeId: message.nodeId };
  }
  if (message.type === "move-task" && isMoveDirection(message.direction)) {
    return { type: "move-task", nodeId: message.nodeId, direction: message.direction };
  }
  if (message.type === "move-task-to-section" && message.sectionId) {
    return { type: "move-task-to-section", nodeId: message.nodeId, sectionId: message.sectionId };
  }
  if (typeof message.value !== "string") {
    return undefined;
  }
  switch (message.type) {
    case "update-task-label":
      return { type: "update-task-label", nodeId: message.nodeId, label: message.value };
    case "update-task-id":
      return { type: "update-task-id", nodeId: message.nodeId, id: message.value, dependencyPatchPolicy: "confirm" };
    case "update-task-duration":
      return { type: "update-task-schedule", nodeId: message.nodeId, duration: message.value };
    case "update-task-start":
      return { type: "update-task-schedule", nodeId: message.nodeId, start: message.value };
    case "update-task-end":
      return { type: "update-task-schedule", nodeId: message.nodeId, end: message.value };
    case "update-task-dependencies":
      return {
        type: "update-task-dependencies",
        nodeId: message.nodeId,
        refs: message.value.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean)
      };
    case "update-task-until":
      return {
        type: "update-task-until",
        nodeId: message.nodeId,
        ref: message.value.trim() || undefined
      };
    case "update-task-tags":
      return {
        type: "update-task-tags",
        nodeId: message.nodeId,
        tags: message.value.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean)
      };
    default:
      return undefined;
  }
}

async function runTestWebviewOperation(
  session: ActiveTaskGridSession,
  operation: TestWebviewOperation
): Promise<{ operation: TestWebviewOperationResult; editorSnapshot: TestEditorSnapshot }> {
  validateTestWebviewOperation(operation);
  const timeoutMs = normalizeTestOperationTimeoutMs(operation.timeoutMs);
  await waitForTestWebviewOperationReady(session, timeoutMs);
  const result = await postTestWebviewOperation(session, operation, timeoutMs);
  await waitForExpectedSourceIncludes(session.editor, operation.expectedSourceIncludes, timeoutMs);
  return {
    operation: result,
    editorSnapshot: createTestEditorSnapshot(session)
  };
}

function validateTestWebviewOperation(operation: TestWebviewOperation): void {
  if (!operation || typeof operation !== "object") {
    throw new Error("Test Webview operation must be an object.");
  }
  if (operation.type === "preview-pan") {
    if (!Number.isFinite(operation.deltaX) && !Number.isFinite(operation.deltaY)) {
      throw new Error("preview-pan operation requires deltaX or deltaY.");
    }
    return;
  }
  if (operation.type !== "preview-resize") {
    throw new Error("Unsupported test Webview operation type.");
  }
  if (operation.edge !== "left" && operation.edge !== "right") {
    throw new Error("preview-resize operation requires edge to be left or right.");
  }
  if (!Number.isInteger(operation.dayDelta) || operation.dayDelta === 0) {
    throw new Error("preview-resize operation requires a non-zero integer dayDelta.");
  }
  const selector = operation.taskSelector;
  if (!selector || (typeof selector.label !== "string" && !Number.isInteger(selector.sourceOrder))) {
    throw new Error("preview-resize operation requires taskSelector.label or taskSelector.sourceOrder.");
  }
}

function normalizeTestOperationTimeoutMs(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined
    ? Math.min(Math.max(Math.round(value), 500), 15_000)
    : 5_000;
}

async function waitForTestWebviewOperationReady(session: ActiveTaskGridSession, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!session.testWebviewOperationReady) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Task Grid Webview test operation readiness.");
    }
    await delay(50);
  }
}

async function postTestWebviewOperation(
  session: ActiveTaskGridSession,
  operation: TestWebviewOperation,
  timeoutMs: number
): Promise<TestWebviewOperationResult> {
  const operationId = `test-webview-operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const result = new Promise<TestWebviewOperationResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingTestWebviewOperations.delete(operationId);
      reject(new Error(`Timed out waiting for Webview operation result: ${operationId}`));
    }, timeoutMs);
    session.pendingTestWebviewOperations.set(operationId, { resolve, reject, timeout });
  });
  const accepted = await session.panel.webview.postMessage({
    type: "test-webview-operation",
    operationId,
    operation: {
      type: operation.type,
      taskSelector: operation.taskSelector,
      edge: operation.edge,
      dayDelta: operation.dayDelta,
      deltaX: operation.deltaX,
      deltaY: operation.deltaY
    }
  });
  if (!accepted) {
    const pending = session.pendingTestWebviewOperations.get(operationId);
    if (pending) {
      clearTimeout(pending.timeout);
      session.pendingTestWebviewOperations.delete(operationId);
    }
    throw new Error("Task Grid Webview did not accept the test operation message.");
  }
  return result;
}

function resolveTestWebviewOperationResult(session: ActiveTaskGridSession, message: TaskGridMessage): void {
  const operationId = typeof message.operationId === "string" ? message.operationId : "";
  const pending = session.pendingTestWebviewOperations.get(operationId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timeout);
  session.pendingTestWebviewOperations.delete(operationId);
  if (message.ok === true) {
    pending.resolve({
      ok: true,
      operationId,
      detail: message.detail
    });
    return;
  }
  pending.reject(new Error(`Webview operation failed: ${message.error ?? "unknown error"}`));
}

async function waitForExpectedSourceIncludes(
  editor: vscode.TextEditor | undefined,
  expected: string | string[] | undefined,
  timeoutMs: number
): Promise<void> {
  const expectedValues = (Array.isArray(expected) ? expected : expected ? [expected] : [])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (expectedValues.length === 0) {
    return;
  }
  if (!editor) {
    throw new Error("Cannot verify expected source text because no editor is attached to the Task Grid session.");
  }
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const text = editor.document.getText();
    const missing = expectedValues.filter((value) => !text.includes(value));
    if (missing.length === 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error([
        "Timed out waiting for expected source text after Webview operation.",
        `Missing: ${missing.join(", ")}`,
        `Current source: ${text.slice(0, 1000)}`
      ].join("\n"));
    }
    await delay(50);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTaskGridFilter(filter: TaskGridFilter): TaskGridFilter | undefined {
  const normalized: TaskGridFilter = {};
  if (filter.text) {
    normalized.text = filter.text;
  }
  if (filter.sectionId) {
    normalized.sectionId = filter.sectionId;
  }
  if (filter.severity) {
    normalized.severity = filter.severity;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function toTaskGridSeverity(value: string): TaskGridFilter["severity"] | undefined {
  return value === "error" || value === "warning" || value === "info" ? value : undefined;
}

function toTaskGridSort(value: string): TaskGridSort | undefined {
  const [field, direction] = value.split(":");
  if (!isTaskGridSortField(field) || (direction !== "asc" && direction !== "desc")) {
    return undefined;
  }
  return { field, direction };
}

function isMoveDirection(value: unknown): value is "up" | "down" {
  return value === "up" || value === "down";
}

function isTaskGridSortField(value: string | undefined): value is TaskGridSortField {
  return value === "sourceOrder" ||
    value === "section" ||
    value === "label" ||
    value === "id" ||
    value === "start" ||
    value === "end" ||
    value === "duration";
}

function isEditableSettingKey(
  value: string | undefined
): value is "title" | "accTitle" | "accDescr" | "dateFormat" | "axisFormat" | "tickInterval" | "weekday" | "weekend" | "includes" | "excludes" | "todayMarker" | "inclusiveEndDates" {
  return value === "title" ||
    value === "accTitle" ||
    value === "accDescr" ||
    value === "dateFormat" ||
    value === "axisFormat" ||
    value === "tickInterval" ||
    value === "weekday" ||
    value === "weekend" ||
    value === "includes" ||
    value === "excludes" ||
    value === "todayMarker" ||
    value === "inclusiveEndDates";
}

function isArraySettingKey(value: string): value is "includes" | "excludes" {
  return value === "includes" || value === "excludes";
}

function revealEditorSelection(
  editor: vscode.TextEditor,
  state: EditorState,
  markdownContext: MarkdownGanttBlockContext | undefined
): void {
  const range = selectedSourceRange(state, markdownContext);
  if (!range) {
    return;
  }
  const selection = new vscode.Selection(
    editor.document.positionAt(range.start.offset),
    editor.document.positionAt(range.end.offset)
  );
  editor.selection = selection;
  editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function selectedSourceRange(
  state: EditorState,
  markdownContext: MarkdownGanttBlockContext | undefined
): GanttRange | undefined {
  const blockRelativeRange = selectedBlockRange(state);
  return blockRelativeRange && markdownContext
    ? markdownContext.toDocumentRange(blockRelativeRange)
    : blockRelativeRange;
}

function selectedBlockRange(state: EditorState): GanttRange | undefined {
  if (state.selected.kind === "diagnostic") {
    return state.selected.primaryRange;
  }
  if (state.selected.kind !== "task") {
    return undefined;
  }
  const selectedNodeId = state.selected.nodeId;
  const document = parseGanttLossless(state.source);
  return document.items.find((item) => item.kind === "TaskStmt" && item.nodeId === selectedNodeId)?.range;
}

function isVisibleTextEditor(editor: vscode.TextEditor): boolean {
  return vscode.window.visibleTextEditors.some((visibleEditor) => visibleEditor === editor);
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, text);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("Failed to update Mermaid Gantt source document.");
  }
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 24; index += 1) {
    nonce += chars[Math.floor(Math.random() * chars.length)];
  }
  return nonce;
}

function createTaskGridLabels(): TaskGridWebviewLabels {
  return {
    title: vscode.l10n.t("Mermaid Gantt Editor"),
    mode: vscode.l10n.t("Mode"),
    taskGrid: vscode.l10n.t("Task Grid"),
    search: vscode.l10n.t("Search"),
    sort: vscode.l10n.t("Sort"),
    severity: vscode.l10n.t("Severity"),
    allSeverities: vscode.l10n.t("All severities"),
    noSort: vscode.l10n.t("No sort"),
    details: vscode.l10n.t("Details"),
    layout: vscode.l10n.t("Layout"),
    horizontal: vscode.l10n.t("Horizontal"),
    vertical: vscode.l10n.t("Vertical"),
    previewControls: vscode.l10n.t("Preview controls"),
    previewFit: vscode.l10n.t("Fit"),
    previewFill: vscode.l10n.t("Fill"),
    previewFitTooltip: vscode.l10n.t("Fit preview to pane width."),
    previewFillTooltip: vscode.l10n.t("Fill preview whitespace, capped at 1.5x width fit."),
    previewPanTooltip: vscode.l10n.t("Pan preview with Space+drag or middle-button drag."),
    previewZoomOut: vscode.l10n.t("Zoom out"),
    previewResetZoom: vscode.l10n.t("Reset zoom"),
    previewZoomIn: vscode.l10n.t("Zoom in"),
    previewEdit: vscode.l10n.t("Edit"),
    previewEditDone: vscode.l10n.t("Done"),
    previewEditGuidance: vscode.l10n.t("Drag a supported task to reschedule."),
    previewEditUnsupported: vscode.l10n.t("This task cannot be dragged in Preview Edit mode."),
    previewTimelinePrevious: vscode.l10n.t("Previous"),
    previewTimelineNext: vscode.l10n.t("Next"),
    previewTimelineToday: vscode.l10n.t("Today"),
    previewTimelineSelected: vscode.l10n.t("Selected"),
    previewTimelineFit: vscode.l10n.t("Fit all"),
    previewMiniEditor: vscode.l10n.t("Preview schedule editor"),
    previewMiniEditorApply: vscode.l10n.t("Apply schedule"),
    previewMiniEditorNoTask: vscode.l10n.t("Select a supported task to edit its dates."),
    previewCollapse: vscode.l10n.t("Collapse preview"),
    previewExpand: vscode.l10n.t("Expand preview"),
    previewFocus: vscode.l10n.t("Focus preview"),
    previewExitFocus: vscode.l10n.t("Show Task Grid"),
    diagnostics: vscode.l10n.t("Diagnostics"),
    documentSettings: vscode.l10n.t("Document Settings"),
    previewSource: vscode.l10n.t("Preview Source"),
    previewDiagram: vscode.l10n.t("Preview"),
    advancedSourceItems: vscode.l10n.t("Advanced Source Items"),
    inspector: vscode.l10n.t("Inspector"),
    selectedTask: vscode.l10n.t("Selected Task"),
    emptySection: vscode.l10n.t("Empty section"),
    ganttTitle: vscode.l10n.t("Gantt Title"),
    accTitle: vscode.l10n.t("Accessibility Title"),
    accDescr: vscode.l10n.t("Accessibility Description"),
    dateFormat: vscode.l10n.t("Date Format"),
    axisFormat: vscode.l10n.t("Axis Format"),
    tickInterval: vscode.l10n.t("Tick Interval"),
    weekday: vscode.l10n.t("Weekday"),
    weekend: vscode.l10n.t("Weekend"),
    includes: vscode.l10n.t("Includes"),
    includesPlaceholder: vscode.l10n.t("2026-05-04"),
    excludes: vscode.l10n.t("Excludes"),
    excludesPlaceholder: vscode.l10n.t("weekends"),
    dateInputHelp: vscode.l10n.t("Use dateFormat example: {0}"),
    datePicker: vscode.l10n.t("Open date picker"),
    durationInputHelp: vscode.l10n.t("Duration examples: 3d, 1w, 1month"),
    endReplacesDurationHelp: vscode.l10n.t("Setting End replaces Duration for this task."),
    durationReplacesEndHelp: vscode.l10n.t("Setting Duration replaces End for this task."),
    dateInputWarning: vscode.l10n.t("This date does not match dateFormat."),
    dateRangeWarning: vscode.l10n.t("End is before start."),
    todayMarker: vscode.l10n.t("Today Marker"),
    topAxis: vscode.l10n.t("Top Axis"),
    inclusiveEndDates: vscode.l10n.t("Inclusive End Dates"),
    section: vscode.l10n.t("Section"),
    task: vscode.l10n.t("Task"),
    id: vscode.l10n.t("ID"),
    start: vscode.l10n.t("Start"),
    end: vscode.l10n.t("End"),
    duration: vscode.l10n.t("Duration"),
    dependencies: vscode.l10n.t("Depends"),
    until: vscode.l10n.t("Until"),
    dependencySearchPlaceholder: vscode.l10n.t("Search task ID or label"),
    dependencyNoMatches: vscode.l10n.t("No matching tasks"),
    tags: vscode.l10n.t("Tags"),
    tagToggle: vscode.l10n.t("Toggle tag {0}"),
    actions: vscode.l10n.t("Actions"),
    undo: vscode.l10n.t("Undo"),
    redo: vscode.l10n.t("Redo"),
    addSection: vscode.l10n.t("Add section"),
    addSectionBelow: vscode.l10n.t("Add section below"),
    addTask: vscode.l10n.t("Add task"),
    addTaskAbove: vscode.l10n.t("Add task above"),
    addTaskBelow: vscode.l10n.t("Add task below"),
    addTaskAtSectionTop: vscode.l10n.t("Add task at section top"),
    duplicateTask: vscode.l10n.t("Duplicate task"),
    moveTaskUp: vscode.l10n.t("Move task up"),
    moveTaskDown: vscode.l10n.t("Move task down"),
    moveTaskToSection: vscode.l10n.t("Move to section: {0}"),
    moveSectionUp: vscode.l10n.t("Move section up"),
    moveSectionDown: vscode.l10n.t("Move section down"),
    deleteTask: vscode.l10n.t("Delete task"),
    deleteTaskConfirm: vscode.l10n.t("Delete this task?"),
    deleteSection: vscode.l10n.t("Delete section"),
    deleteSectionConfirm: vscode.l10n.t("Delete this section?"),
    rawSourceEditor: vscode.l10n.t("Raw Source Editor"),
    sourceOrder: vscode.l10n.t("Source Order"),
    noTaskSelected: vscode.l10n.t("No task selected."),
    noDiagnostics: vscode.l10n.t("No diagnostics."),
    noAdvancedSourceItems: vscode.l10n.t("No advanced source items."),
    limitedEditing: vscode.l10n.t("Preview source is unavailable. Structured editing is limited; review diagnostics and Advanced Source Items before writing back."),
    fallbackEditing: vscode.l10n.t("Unsupported in structured mode. Structured editing is disabled; use Diagnostics or Raw Source Editor so the lossless source is preserved."),
    previewBlocked: vscode.l10n.t("Preview source is blocked by projection issues. Review diagnostics or advanced source items."),
    previewRenderFailed: vscode.l10n.t("Preview render failed: "),
    previewBlockedTitle: vscode.l10n.t("Preview blocked"),
    previewRenderFailedTitle: vscode.l10n.t("Preview render failed"),
    previewOpenDiagnostics: vscode.l10n.t("Open Diagnostics"),
    previewOpenAdvanced: vscode.l10n.t("Open Advanced Source Items"),
    previewOpenSource: vscode.l10n.t("Open Source"),
    webviewErrorTitle: vscode.l10n.t("Task Grid error"),
    webviewErrorMessage: vscode.l10n.t("The source is preserved. Review Diagnostics or Source, then reopen Task Grid if needed."),
    webviewErrorOpenDiagnostics: vscode.l10n.t("Open Diagnostics"),
    webviewErrorOpenSource: vscode.l10n.t("Open Source"),
    webviewErrorDismiss: vscode.l10n.t("Dismiss"),
    taskLabelEditor: vscode.l10n.t("Task Label"),
    taskLabelEditorHelp: vscode.l10n.t("Use this multiline editor for long labels. The original source is updated only when the field changes."),
    mermaidRuntime: vscode.l10n.t("Mermaid Runtime"),
    mermaidRuntimeBundledVersion: vscode.l10n.t("Bundled Mermaid {0}"),
    mermaidRuntimeSecurityLevel: vscode.l10n.t("Security Level"),
    mermaidRuntimeDeterministic: vscode.l10n.t("The preview uses the bundled runtime for deterministic editing; target hosts can still render differently."),
    hostCompatibility: vscode.l10n.t("Host Compatibility"),
    hostCompatibilityGuidance: vscode.l10n.t("Profiles are guidance only; verify the target host Mermaid version before publishing."),
    hostCompatibilityProfileMermaidLatest: vscode.l10n.t("Mermaid latest"),
    hostCompatibilityProfileGitHub: vscode.l10n.t("GitHub"),
    hostCompatibilityProfileGitLab: vscode.l10n.t("GitLab"),
    hostCompatibilityProfileObsidian: vscode.l10n.t("Obsidian"),
    hostCompatibilityWarningCount: vscode.l10n.t("{0} compatibility warnings"),
    hostCompatibilityRetainedCount: vscode.l10n.t("{0} retained source items"),
    hostCompatibilityProfileWarnings: vscode.l10n.t("Profile warnings"),
    hostCompatibilityNoWarnings: vscode.l10n.t("No profile-specific warnings for the current source."),
    hostCompatibilityRiskySyntax: vscode.l10n.t("Risky syntax"),
    hostCompatibilitySelectedProfile: vscode.l10n.t("Target Host"),
    hostCompatibilityRuntimeGitHub: vscode.l10n.t("GitHub-hosted Mermaid"),
    hostCompatibilityRuntimeGitLab: vscode.l10n.t("GitLab-hosted Mermaid"),
    hostCompatibilityRuntimeObsidian: vscode.l10n.t("Obsidian-hosted Mermaid"),
    hostCompatibilityWarningClickCall: vscode.l10n.t("click / call statements are retained in source, but host interaction and security behavior can differ."),
    hostCompatibilityWarningConfig: vscode.l10n.t("frontmatter or init directives are retained; verify whether the target host accepts the same Mermaid config."),
    hostCompatibilityWarningGitHub: vscode.l10n.t("GitHub chooses the Mermaid runtime in the host; use the preview as guidance, not as a guarantee."),
    hostCompatibilityWarningGitLab: vscode.l10n.t("GitLab-hosted Mermaid rendering can lag bundled Mermaid; verify syntax before publishing."),
    hostCompatibilityWarningObsidian: vscode.l10n.t("Obsidian Mermaid behavior depends on the app/plugin version and local settings."),
    diagnosticsStage: vscode.l10n.t("Stage"),
    diagnosticsLocation: vscode.l10n.t("Location"),
    diagnosticsReason: vscode.l10n.t("Reason"),
    diagnosticsImpact: vscode.l10n.t("Impact"),
    diagnosticsAction: vscode.l10n.t("Action"),
    removeBlockingReference: vscode.l10n.t("Remove reference {0}"),
    replaceBlockingReference: vscode.l10n.t("Replace reference with {0}"),
    useExistingTaskId: vscode.l10n.t("Use dependency {0}"),
    fallbackImpact: vscode.l10n.t("Structured editing and preview are blocked until this source can be projected safely."),
    limitedEditingImpact: vscode.l10n.t("Preview source is blocked; supported grid fields still use source-preserving write-back."),
    diagnosticImpact: vscode.l10n.t("Review the highlighted source range before applying an action."),
    advancedSourceGuidance: vscode.l10n.t("This retained source item is not currently editable in the grid. It stays in the source and can be reviewed or edited from Raw Source Editor."),
    advancedSourceType: vscode.l10n.t("Type"),
    advancedSourceRange: vscode.l10n.t("Source range"),
    advancedSourceEditability: vscode.l10n.t("Editability"),
    advancedSourceRawOnly: vscode.l10n.t("Raw source only"),
    advancedSourceReason: vscode.l10n.t("Reason"),
    advancedSourceOpenSource: vscode.l10n.t("Open Source"),
    advancedSourceOpenDiagnostics: vscode.l10n.t("Open Diagnostics"),
    diagnosticMessages: {
      "diagnostics.dateFormatMismatch": vscode.l10n.t("Task date does not match dateFormat."),
      "diagnostics.duplicateTaskId": vscode.l10n.t("Task ID is duplicated."),
      "diagnostics.circularDependency": vscode.l10n.t("Dependency graph contains a cycle."),
      "diagnostics.hostVersionSensitiveSyntax": vscode.l10n.t("This syntax may depend on the Mermaid host version."),
      "diagnostics.includeExcludeConflict": vscode.l10n.t("Includes and Excludes contain the same value."),
      "diagnostics.invalidTickInterval": vscode.l10n.t("Tick Interval is invalid."),
      "diagnostics.keywordLikeTaskLabel": vscode.l10n.t("Task label looks like a Mermaid keyword."),
      "diagnostics.longLabelReadability": vscode.l10n.t("Task label may be hard to read in the preview."),
      "diagnostics.selfDependency": vscode.l10n.t("Task depends on itself."),
      "diagnostics.undefinedDependency": vscode.l10n.t("Dependency references an unknown task ID."),
      "diagnostics.topAxisPreviewUnsupported": vscode.l10n.t("Top Axis is retained in source, but preview rendering is currently unsupported."),
      "diagnostics.editorTaskDeleteReferenced": vscode.l10n.t("Task is referenced by dependency or click source."),
      "diagnostics.editorSectionDeleteReferenced": vscode.l10n.t("Section contains tasks referenced from outside the section."),
      "diagnostics.editorInvalidTickInterval": vscode.l10n.t("Tick Interval is invalid.")
    },
    diagnosticActionLabels: {
      "diagnostics.action.alignDateFormat": vscode.l10n.t("Align task dates with dateFormat"),
      "diagnostics.action.renameTaskId": vscode.l10n.t("Rename task ID"),
      "diagnostics.action.changeDependency": vscode.l10n.t("Change dependency"),
      "diagnostics.action.checkMermaidHostVersion": vscode.l10n.t("Check Mermaid host version"),
      "diagnostics.action.reviewIncludeExclude": vscode.l10n.t("Review Includes and Excludes"),
      "diagnostics.action.useValidTickInterval": vscode.l10n.t("Use a valid Tick Interval"),
      "diagnostics.action.renameKeywordLikeLabel": vscode.l10n.t("Rename task label"),
      "diagnostics.action.reviewPreviewLabel": vscode.l10n.t("Review preview label"),
      "diagnostics.action.chooseExistingTaskId": vscode.l10n.t("Choose an existing task ID"),
      "diagnostics.action.reviewSource": vscode.l10n.t("Review source"),
      "diagnostics.action.useOneWeekTickInterval": vscode.l10n.t("Use 1week"),
      "diagnostics.action.convertDateToConfiguredFormat": vscode.l10n.t("Convert date to dateFormat"),
      "diagnostics.action.renameDuplicateTaskId": vscode.l10n.t("Rename duplicate task ID"),
      "diagnostics.action.prefixKeywordLikeLabel": vscode.l10n.t("Prefix task label"),
      "diagnostics.action.commentOutCompactDisplayMode": vscode.l10n.t("Comment out compact display mode"),
      "diagnostics.action.useExistingTaskId": vscode.l10n.t("Use existing task ID")
    }
  };
}
