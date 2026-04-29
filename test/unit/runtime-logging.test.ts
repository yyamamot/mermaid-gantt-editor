import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createJsonlFileRuntimeSink,
  createRuntimeLogger,
  createRuntimeLogEvent,
  emitNormalizedGanttLogged,
  formatRuntimeLogEvent,
  parseGanttLosslessLogged,
  parseRuntimeLogEvent,
  resolveGanttDocumentLogged,
  validateRuntimeLogEvent
} from "../../src/logging";
import { projectGanttSemantic } from "../../src/core";

describe("runtime JSONL logging", () => {
  it("formats and parses a runtime event line", () => {
    const event = createRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "info",
      event: "parser.import.succeeded",
      source: "parser",
      runId: "run-1",
      operation: "import",
      documentId: "doc",
      mode: "structured",
      outcome: "succeeded",
      message: "ok"
    });

    const line = formatRuntimeLogEvent(event);

    expect(line).toBe(JSON.stringify(event));
    expect(parseRuntimeLogEvent(line)).toEqual(event);
  });

  it("fills timestamp through the injected clock", () => {
    const event = createRuntimeLogEvent({
      level: "info",
      event: "ui.command.executed",
      source: "ui",
      runId: "run-1",
      operation: "command",
      message: "mermaidGantt.openTaskGrid"
    }, () => new Date("2026-04-24T01:02:03.000Z"));

    expect(event.ts).toBe("2026-04-24T01:02:03.000Z");
    expect(event.message).toBe("mermaidGantt.openTaskGrid");
  });

  it("accepts product fallback events with document context", () => {
    const event = createRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "warn",
      event: "fallback.entered",
      source: "ui",
      runId: "run-1",
      operation: "fallback-transition",
      documentId: "doc-1",
      mode: "fallback",
      message: "Task Grid opened in fallback mode."
    });

    expect(event).toMatchObject({
      event: "fallback.entered",
      documentId: "doc-1",
      mode: "fallback",
      message: "Task Grid opened in fallback mode."
    });
  });

  it("accepts Webview error boundary events", () => {
    const event = createRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "error",
      event: "ui.webview.error",
      source: "ui",
      runId: "run-1",
      operation: "webview",
      outcome: "failed",
      documentId: "doc-1",
      mode: "structured",
      message: "Unhandled rejection"
    });

    expect(validateRuntimeLogEvent(event).ok).toBe(true);
  });

  it("keeps preview render runtime metadata", () => {
    const event = createRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "info",
      event: "preview.render.succeeded",
      source: "preview",
      runId: "run-1",
      operation: "render",
      outcome: "succeeded",
      documentId: "doc-1",
      mode: "structured",
      runtime: {
        type: "bundled",
        mermaidVersion: "11.14.0",
        securityLevel: "strict"
      }
    });

    expect(parseRuntimeLogEvent(formatRuntimeLogEvent(event)).runtime).toEqual({
      type: "bundled",
      mermaidVersion: "11.14.0",
      securityLevel: "strict"
    });
  });

  it("rejects taxonomy mismatches", () => {
    const result = validateRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "info",
      event: "parser.import.started",
      source: "ui",
      runId: "run-1",
      operation: "command",
      outcome: "succeeded"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "source must be parser for parser.import.started",
      "operation must be import for parser.import.started",
      "outcome must be started for parser.import.started"
    ]);
  });

  it("rejects missing required fields", () => {
    const result = validateRuntimeLogEvent({
      level: "info",
      event: "fallback.entered",
      source: "ui",
      operation: "fallback-transition"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("ts must be a non-empty string");
    expect(result.errors).toContain("runId must be a non-empty string");
  });

  it("rejects non-string optional messages", () => {
    const result = validateRuntimeLogEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "warn",
      event: "preview.render.failed",
      source: "preview",
      runId: "run-1",
      operation: "render",
      outcome: "failed",
      message: 123
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("message must be a string when present");
  });

  it("records parser, validator, and emitter operations through opt-in wrappers", async () => {
    const events: unknown[] = [];
    const logger = createRuntimeLogger({
      runId: "run-2",
      sink: (event) => {
        events.push(event);
      },
      now: () => new Date("2026-04-24T00:00:00.000Z")
    });

    const document = await parseGanttLosslessLogged("gantt\nTask A : a1, 1d\n", logger);
    const resolved = await resolveGanttDocumentLogged(document, logger);
    const emitted = await emitNormalizedGanttLogged(projectGanttSemantic(document), logger, document.nodeId);

    expect(resolved.diagnostics).toEqual([]);
    expect(emitted.source).toContain("Task A");
    expect(events).toMatchObject([
      { event: "parser.import.started", runId: "run-2", outcome: "started" },
      { event: "parser.import.succeeded", runId: "run-2", outcome: "succeeded", documentId: document.nodeId },
      { event: "validator.run.started", runId: "run-2", outcome: "started", documentId: document.nodeId },
      { event: "validator.run.succeeded", runId: "run-2", outcome: "succeeded", documentId: document.nodeId },
      { event: "emitter.export.started", runId: "run-2", outcome: "started", documentId: document.nodeId },
      { event: "emitter.export.succeeded", runId: "run-2", outcome: "succeeded", documentId: document.nodeId }
    ]);
  });

  it("appends runtime events to a JSONL file sink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-runtime-"));
    const path = join(dir, "runtime.jsonl");
    try {
      const logger = createRuntimeLogger({
        runId: "run-file",
        sink: createJsonlFileRuntimeSink(path),
        now: () => new Date("2026-04-24T00:00:00.000Z")
      });

      await logger.record({
        level: "info",
        event: "ui.command.executed",
        source: "ui",
        operation: "command"
      });

      const lines = (await readFile(path, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(parseRuntimeLogEvent(lines[0]!)).toMatchObject({
        event: "ui.command.executed",
        runId: "run-file"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
