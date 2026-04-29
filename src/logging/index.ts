import { appendFile } from "node:fs/promises";
import {
  emitNormalizedGantt,
  parseGanttLossless,
  resolveGanttDocument,
  type EmitResult,
  type GanttDocument,
  type ResolvedDocument,
  type SemanticDocument
} from "../core";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type RuntimeLogSource =
  | "parser"
  | "validator"
  | "emitter"
  | "preview"
  | "ui";

export type RuntimeLogOperation =
  | "import"
  | "validate"
  | "export"
  | "render"
  | "command"
  | "webview"
  | "fallback-transition";

export type RuntimeLogOutcome =
  | "started"
  | "succeeded"
  | "failed";

export type RuntimeLogMode = "structured" | "fallback";

export type RuntimeLogEventName =
  | "parser.import.started"
  | "parser.import.succeeded"
  | "parser.import.failed"
  | "validator.run.started"
  | "validator.run.succeeded"
  | "validator.run.failed"
  | "emitter.export.started"
  | "emitter.export.succeeded"
  | "emitter.export.failed"
  | "preview.render.started"
  | "preview.render.succeeded"
  | "preview.render.failed"
  | "fallback.entered"
  | "ui.webview.error"
  | "ui.command.executed";

export interface RuntimeLogEvent {
  ts: string;
  level: RuntimeLogLevel;
  event: RuntimeLogEventName;
  source: RuntimeLogSource;
  runId: string;
  operation: RuntimeLogOperation;
  documentId?: string;
  mode?: RuntimeLogMode;
  outcome?: RuntimeLogOutcome;
  message?: string;
  runtime?: {
    type?: string;
    mermaidVersion?: string;
    securityLevel?: string;
  };
}

export type RuntimeLogEventInput = Omit<RuntimeLogEvent, "ts"> & {
  ts?: string;
};

export type RuntimeLogSink = (event: RuntimeLogEvent) => void | Promise<void>;

export interface RuntimeLogger {
  readonly runId: string;
  record(input: Omit<RuntimeLogEventInput, "runId">): Promise<void>;
}

export interface RuntimeLoggerOptions {
  runId: string;
  sink: RuntimeLogSink;
  now?: () => Date;
}

export interface RuntimeLogValidationResult {
  ok: boolean;
  errors: string[];
}

export function createRuntimeLogger(options: RuntimeLoggerOptions): RuntimeLogger {
  return {
    runId: options.runId,
    async record(input: Omit<RuntimeLogEventInput, "runId">): Promise<void> {
      const event = createRuntimeLogEvent({
        ...input,
        runId: options.runId
      }, options.now);
      await options.sink(event);
    }
  };
}

export function createJsonlFileRuntimeSink(path: string): RuntimeLogSink {
  return async (event) => {
    await appendFile(path, `${formatRuntimeLogEvent(event)}\n`, "utf8");
  };
}

export async function parseGanttLosslessLogged(source: string, logger: RuntimeLogger): Promise<GanttDocument> {
  await logger.record({
    level: "info",
    event: "parser.import.started",
    source: "parser",
    operation: "import",
    outcome: "started"
  });
  try {
    const document = parseGanttLossless(source);
    await logger.record({
      level: document.errors.length > 0 ? "warn" : "info",
      event: document.errors.length > 0 ? "parser.import.failed" : "parser.import.succeeded",
      source: "parser",
      operation: "import",
      outcome: document.errors.length > 0 ? "failed" : "succeeded",
      documentId: document.nodeId
    });
    return document;
  } catch (error) {
    await logger.record({
      level: "error",
      event: "parser.import.failed",
      source: "parser",
      operation: "import",
      outcome: "failed"
    });
    throw error;
  }
}

export async function resolveGanttDocumentLogged(
  document: GanttDocument,
  logger: RuntimeLogger
): Promise<ResolvedDocument> {
  await logger.record({
    level: "info",
    event: "validator.run.started",
    source: "validator",
    operation: "validate",
    outcome: "started",
    documentId: document.nodeId
  });
  try {
    const resolved = resolveGanttDocument(document);
    const hasErrors = resolved.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    await logger.record({
      level: hasErrors ? "warn" : "info",
      event: hasErrors ? "validator.run.failed" : "validator.run.succeeded",
      source: "validator",
      operation: "validate",
      outcome: hasErrors ? "failed" : "succeeded",
      documentId: document.nodeId
    });
    return resolved;
  } catch (error) {
    await logger.record({
      level: "error",
      event: "validator.run.failed",
      source: "validator",
      operation: "validate",
      outcome: "failed",
      documentId: document.nodeId
    });
    throw error;
  }
}

export async function emitNormalizedGanttLogged(
  semantic: SemanticDocument,
  logger: RuntimeLogger,
  documentId?: string
): Promise<EmitResult> {
  await logger.record({
    level: "info",
    event: "emitter.export.started",
    source: "emitter",
    operation: "export",
    outcome: "started",
    documentId,
    mode: semantic.projectionIssues.some((issue) => issue.severity === "error") ? "fallback" : "structured"
  });
  try {
    const result = emitNormalizedGantt(semantic);
    const failed = result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    await logger.record({
      level: failed ? "warn" : "info",
      event: failed ? "emitter.export.failed" : "emitter.export.succeeded",
      source: "emitter",
      operation: "export",
      outcome: failed ? "failed" : "succeeded",
      documentId,
      mode: result.mode === "normalized-emit" && !failed ? "structured" : "fallback"
    });
    return result;
  } catch (error) {
    await logger.record({
      level: "error",
      event: "emitter.export.failed",
      source: "emitter",
      operation: "export",
      outcome: "failed",
      documentId
    });
    throw error;
  }
}

export function createRuntimeLogEvent(input: RuntimeLogEventInput, now: () => Date = () => new Date()): RuntimeLogEvent {
  const event = {
    ...input,
    ts: input.ts ?? now().toISOString()
  };
  assertRuntimeLogEvent(event);
  return event;
}

export function formatRuntimeLogEvent(event: RuntimeLogEvent): string {
  assertRuntimeLogEvent(event);
  return JSON.stringify(event);
}

export function parseRuntimeLogEvent(line: string): RuntimeLogEvent {
  const parsed = JSON.parse(line) as RuntimeLogEvent;
  assertRuntimeLogEvent(parsed);
  return parsed;
}

export function validateRuntimeLogEvent(value: unknown): RuntimeLogValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["event must be an object"] };
  }

  const event = value as Partial<RuntimeLogEvent>;
  requireString(event.ts, "ts", errors);
  if (typeof event.ts === "string" && Number.isNaN(Date.parse(event.ts))) {
    errors.push("ts must be an ISO-compatible timestamp");
  }
  requireEnum(event.level, "level", ["debug", "info", "warn", "error"], errors);
  requireEnum(event.event, "event", RUNTIME_EVENT_NAMES, errors);
  requireEnum(event.source, "source", RUNTIME_SOURCES, errors);
  requireString(event.runId, "runId", errors);
  requireEnum(event.operation, "operation", RUNTIME_OPERATIONS, errors);
  optionalString(event.documentId, "documentId", errors);
  optionalEnum(event.mode, "mode", ["structured", "fallback"], errors);
  optionalEnum(event.outcome, "outcome", ["started", "succeeded", "failed"], errors);
  optionalString(event.message, "message", errors);
  validateEventTaxonomy(event, errors);

  return { ok: errors.length === 0, errors };
}

export function assertRuntimeLogEvent(value: unknown): asserts value is RuntimeLogEvent {
  const result = validateRuntimeLogEvent(value);
  if (!result.ok) {
    throw new Error(`Invalid runtime log event: ${result.errors.join("; ")}`);
  }
}

const RUNTIME_EVENT_NAMES: RuntimeLogEventName[] = [
  "parser.import.started",
  "parser.import.succeeded",
  "parser.import.failed",
  "validator.run.started",
  "validator.run.succeeded",
  "validator.run.failed",
  "emitter.export.started",
  "emitter.export.succeeded",
  "emitter.export.failed",
  "preview.render.started",
  "preview.render.succeeded",
  "preview.render.failed",
  "fallback.entered",
  "ui.webview.error",
  "ui.command.executed"
];

const RUNTIME_SOURCES: RuntimeLogSource[] = [
  "parser",
  "validator",
  "emitter",
  "preview",
  "ui"
];

const RUNTIME_OPERATIONS: RuntimeLogOperation[] = [
  "import",
  "validate",
  "export",
  "render",
  "command",
  "webview",
  "fallback-transition"
];

function validateEventTaxonomy(event: Partial<RuntimeLogEvent>, errors: string[]): void {
  if (!event.event || !event.source || !event.operation) {
    return;
  }

  const expected = taxonomyForEvent(event.event);
  if (event.source !== expected.source) {
    errors.push(`source must be ${expected.source} for ${event.event}`);
  }
  if (event.operation !== expected.operation) {
    errors.push(`operation must be ${expected.operation} for ${event.event}`);
  }
  if (expected.outcome && event.outcome !== expected.outcome) {
    errors.push(`outcome must be ${expected.outcome} for ${event.event}`);
  }
}

function taxonomyForEvent(event: RuntimeLogEventName): {
  source: RuntimeLogSource;
  operation: RuntimeLogOperation;
  outcome?: RuntimeLogOutcome;
} {
  if (event.startsWith("parser.import.")) {
    return { source: "parser", operation: "import", outcome: outcomeFromSuffix(event) };
  }
  if (event.startsWith("validator.run.")) {
    return { source: "validator", operation: "validate", outcome: outcomeFromSuffix(event) };
  }
  if (event.startsWith("emitter.export.")) {
    return { source: "emitter", operation: "export", outcome: outcomeFromSuffix(event) };
  }
  if (event.startsWith("preview.render.")) {
    return { source: "preview", operation: "render", outcome: outcomeFromSuffix(event) };
  }
  if (event === "fallback.entered") {
    return { source: "ui", operation: "fallback-transition" };
  }
  if (event === "ui.webview.error") {
    return { source: "ui", operation: "webview", outcome: "failed" };
  }
  return { source: "ui", operation: "command" };
}

function outcomeFromSuffix(event: string): RuntimeLogOutcome {
  if (event.endsWith(".started")) {
    return "started";
  }
  if (event.endsWith(".succeeded")) {
    return "succeeded";
  }
  return "failed";
}

function requireString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function optionalString(value: unknown, field: string, errors: string[]): void {
  if (value !== undefined && typeof value !== "string") {
    errors.push(`${field} must be a string when present`);
  }
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: T[], errors: string[]): void {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: T[], errors: string[]): void {
  if (value !== undefined && (typeof value !== "string" || !allowed.includes(value as T))) {
    errors.push(`${field} must be one of: ${allowed.join(", ")} when present`);
  }
}
