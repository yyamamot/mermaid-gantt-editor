export interface TaskGridAppHostAdapter {
  loadInitialSource(): string | Promise<string>;
  applySourceChange(source: string): void | Promise<void>;
  persistPresentationState(key: string, value: unknown): void | Promise<void>;
  readPresentationState<T = unknown>(key: string): T | undefined | Promise<T | undefined>;
  reportPreviewEvent(event: TaskGridAppHostEvent): void | Promise<void>;
  reportError(error: TaskGridAppHostError): void | Promise<void>;
}

export interface TaskGridAppHostEvent {
  type: "preview-render-started" | "preview-render-succeeded" | "preview-render-failed" | "ui-review-snapshot" | string;
  [key: string]: unknown;
}

export interface TaskGridAppHostError {
  message: string;
  source?: string;
  stack?: string;
}

export const defaultBrowserTaskGridHostBridgeScript = `
    const vscode = globalThis.mermaidGanttHost ?? {
      postMessage(message) {
        globalThis.parent?.postMessage?.({ source: "mermaid-gantt", message }, "*");
      }
    };`;

export function renderHostBridgeScript(script?: string): string {
  return script ?? defaultBrowserTaskGridHostBridgeScript;
}
