import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  analyzePngVisualSignal,
  assertNightlyVisualScreenshotArtifact,
  assertRuntimeHarnessLogJoinHealthy,
  collectRuntimeHarnessLogs,
  collectVisualDebugArtifacts,
  createHarnessEvent,
  createMacOSDebugAidRunner,
  createRuntimeHarnessLogIndex,
  createVisualDebugPlan,
  createVSCodeHostLaunchPlan,
  createVSCodeHostScenarioBridgeDependencies,
  filterKnownVSCodeHostNoise,
  formatHarnessEvent,
  loadNightlyVisualScenarioSpecs,
  observeVSCodeEditorStateController,
  parseHarnessScenarioManifestJson,
  parseScenarioSpecJson,
  parseHarnessEvent,
  prepareHarnessWorkspace,
  readVSCodeHostScenarioCommandTrace,
  readVSCodeHostScenarioEditorSnapshot,
  resolveInstalledVSCodeExecutablePath,
  runHeadlessHarnessScenario,
  runNightlyVisualHarness,
  runVisualDebugIfNeeded,
  runVSCodeHarnessScenario,
  runVSCodeCommandController,
  runVSCodeHostController,
  validateHarnessEvent,
  validateHarnessScenarioManifest,
  validatePngVisualSignal,
  validateScenarioSpec,
  type HarnessConfig,
  type ScenarioSpec,
  writeHarnessDebugBundle,
  writeRuntimeHarnessLogIndex
} from "../../src/harness";
import { createRuntimeLogEvent, formatRuntimeLogEvent } from "../../src/logging";

describe("harness JSONL contract", () => {
  it("formats and parses a harness event line", () => {
    const event = createHarnessEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "info",
      event: "harness.run.started",
      runId: "run-1",
      scenarioId: "scenario-1",
      outcome: "started"
    });

    const line = formatHarnessEvent(event);

    expect(line).toBe(JSON.stringify(event));
    expect(parseHarnessEvent(line)).toEqual(event);
  });

  it("rejects invalid event taxonomy", () => {
    const result = validateHarnessEvent({
      ts: "2026-04-24T00:00:00.000Z",
      level: "info",
      event: "command.exec.started",
      runId: "run-1",
      scenarioId: "scenario-1",
      tool: "macos",
      outcome: "started"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("tool must be one of: vscode when present");
  });
});

describe("ScenarioSpec contract", () => {
  it("parses the nightly visual smoke scenario fixture", async () => {
    const manifest = parseHarnessScenarioManifestJson(await readFile("fixtures/harness-manifest.json", "utf8"));
    expect(manifest.nightlyVisual).toContain("fixtures/harness/nightly-visual-smoke/scenario.json");
    expect(manifest.nightlyVisual).toContain("fixtures/harness/nightly-visual-task-grid-no-tags/scenario.json");
    expect(manifest.nightlyVisual).toContain("fixtures/harness/nightly-visual-preview-resize/scenario.json");
    expect(manifest.nightlyVisual).toContain("fixtures/harness/nightly-visual-preview-pan/scenario.json");
    expect(manifest.nightlyVisual).toContain("fixtures/harness/nightly-visual-ja-responsive/scenario.json");

    const scenario = parseScenarioSpecJson(await readFile("fixtures/harness/nightly-visual-smoke/scenario.json", "utf8"));

    expect(scenario).toMatchObject({
      id: "nightly-visual-smoke",
      expectedMode: "structured"
    });
    expect(scenario.steps.map((step) => step.id)).toEqual([
      "open-fixture",
      "open-task-grid",
      "get-editor-snapshot"
    ]);
    const noTagsScenario = parseScenarioSpecJson(await readFile("fixtures/harness/nightly-visual-task-grid-no-tags/scenario.json", "utf8"));
    expect(noTagsScenario).toMatchObject({
      id: "nightly-visual-task-grid-no-tags",
      fixture: "fixtures/product/task-grid-no-tags/source.mmd",
      expectedMode: "structured"
    });

    const previewResizeScenario = parseScenarioSpecJson(await readFile("fixtures/harness/nightly-visual-preview-resize/scenario.json", "utf8"));
    expect(previewResizeScenario.steps.map((step) => step.id)).toEqual([
      "open-fixture",
      "open-task-grid",
      "resize-api-design-right",
      "get-editor-snapshot"
    ]);
    const previewPanScenario = parseScenarioSpecJson(await readFile("fixtures/harness/nightly-visual-preview-pan/scenario.json", "utf8"));
    expect(previewPanScenario).toMatchObject({
      id: "nightly-visual-preview-pan",
      fixture: "fixtures/product/preview-pan/source.mmd",
      expectedMode: "structured"
    });
    expect(previewPanScenario.steps.map((step) => step.id)).toEqual([
      "open-fixture",
      "open-task-grid",
      "pan-preview",
      "get-editor-snapshot"
    ]);
    const jaResponsiveScenario = parseScenarioSpecJson(await readFile("fixtures/harness/nightly-visual-ja-responsive/scenario.json", "utf8"));
    expect(jaResponsiveScenario).toMatchObject({
      id: "nightly-visual-ja-responsive",
      fixture: "fixtures/product/ja-responsive/source.mmd",
      expectedMode: "structured"
    });
  });

  it("rejects invalid scenario specs", () => {
    const result = validateScenarioSpec({
      id: "bad",
      fixture: "fixtures/source.mmd",
      expectedMode: "structured",
      steps: [{ id: "run", type: "run-command" }],
      assertions: [{ type: "mode", expected: "unknown" }]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("steps[0].command must be a non-empty string");
    expect(result.errors).toContain("assertions[0].expected must be one of: structured, fallback");
  });

  it("loads nightly visual scenario specs from the harness manifest", async () => {
    const scenarios = await loadNightlyVisualScenarioSpecs("fixtures/harness-manifest.json");

    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "nightly-visual-smoke",
      "nightly-visual-task-grid-no-tags",
      "nightly-visual-diagnostics",
      "nightly-visual-fallback",
      "nightly-visual-limited-editing",
      "nightly-visual-preview-resize",
      "nightly-visual-preview-pan",
      "nightly-visual-ja-responsive"
    ]);
    expect(scenarios[0]?.fixture).toBe("fixtures/product/task-grid-basic/source.mmd");
  });

  it("rejects invalid harness scenario manifests", () => {
    expect(validateHarnessScenarioManifest({
      nightlyVisual: ["fixtures/a/scenario.json", "fixtures/a/scenario.json"]
    })).toMatchObject({
      ok: false,
      errors: ["nightlyVisual[1] must be unique"]
    });

    expect(validateHarnessScenarioManifest({
      nightlyVisual: [""]
    })).toMatchObject({
      ok: false,
      errors: ["nightlyVisual[0] must be a non-empty string"]
    });
  });
});

describe("collectRuntimeHarnessLogs", () => {
  it("joins runtime and harness JSONL by runId and counts failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-logs-"));
    try {
      const runtimePath = join(dir, "runtime.jsonl");
      const harnessPath = join(dir, "harness.jsonl");
      await writeFile(runtimePath, [
        formatRuntimeLogEvent(createRuntimeLogEvent({
          ts: "2026-04-24T00:00:00.000Z",
          level: "info",
          event: "parser.import.started",
          source: "parser",
          runId: "run-1",
          operation: "import",
          outcome: "started"
        })),
        formatRuntimeLogEvent(createRuntimeLogEvent({
          ts: "2026-04-24T00:00:01.000Z",
          level: "error",
          event: "validator.run.failed",
          source: "validator",
          runId: "run-1",
          operation: "validate",
          outcome: "failed"
        })),
        formatRuntimeLogEvent(createRuntimeLogEvent({
          ts: "2026-04-24T00:00:02.000Z",
          level: "info",
          event: "parser.import.started",
          source: "parser",
          runId: "foreign-run",
          operation: "import",
          outcome: "started"
        }))
      ].join("\n"), "utf8");
      await writeFile(harnessPath, [
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:00.000Z",
          level: "info",
          event: "harness.run.started",
          runId: "run-1",
          scenarioId: "scenario-1",
          outcome: "started"
        })),
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:03.000Z",
          level: "error",
          event: "harness.run.finished",
          runId: "run-1",
          scenarioId: "scenario-1",
          outcome: "failed"
        }))
      ].join("\n"), "utf8");

      const joined = await collectRuntimeHarnessLogs({
        runId: "run-1",
        runtimeJsonlPath: runtimePath,
        harnessJsonlPath: harnessPath
      });

      expect(joined.runtimeEvents).toHaveLength(2);
      expect(joined.harnessEvents).toHaveLength(2);
      expect(joined.runtimeEventCounts["parser.import.started"]).toBe(1);
      expect(joined.harnessEventCounts["harness.run.finished"]).toBe(1);
      expect(joined.failedRuntimeEvents.map((event) => event.event)).toEqual(["validator.run.failed"]);
      expect(joined.failedHarnessEvents.map((event) => event.event)).toEqual(["harness.run.finished"]);
      expect(createRuntimeHarnessLogIndex(joined)).toMatchObject({
        runId: "run-1",
        failedRuntimeEvents: ["validator.run.failed"],
        failedHarnessEvents: ["harness.run.finished"]
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a reusable log index and gates required healthy events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-log-index-"));
    try {
      const runtimePath = join(dir, "runtime.jsonl");
      const harnessPath = join(dir, "harness.jsonl");
      await writeFile(runtimePath, [
        formatRuntimeLogEvent(createRuntimeLogEvent({
          ts: "2026-04-24T00:00:00.000Z",
          level: "info",
          event: "preview.render.started",
          source: "preview",
          runId: "run-1",
          operation: "render",
          outcome: "started"
        })),
        formatRuntimeLogEvent(createRuntimeLogEvent({
          ts: "2026-04-24T00:00:01.000Z",
          level: "info",
          event: "preview.render.succeeded",
          source: "preview",
          runId: "run-1",
          operation: "render",
          outcome: "succeeded"
        }))
      ].join("\n"), "utf8");
      await writeFile(harnessPath, [
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:00.000Z",
          level: "info",
          event: "vscode.launch.ready",
          runId: "run-1",
          scenarioId: "nightly",
          tool: "vscode",
          outcome: "succeeded"
        })),
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:01.000Z",
          level: "info",
          event: "artifact.screenshot.captured",
          runId: "run-1",
          scenarioId: "nightly",
          tool: "macos",
          target: "screencapture -x",
          outcome: "succeeded",
          artifactPath: join(dir, "screen-1.png")
        }))
      ].join("\n"), "utf8");

      const joined = await collectRuntimeHarnessLogs({
        runId: "run-1",
        runtimeJsonlPath: runtimePath,
        harnessJsonlPath: harnessPath
      });
      const index = await writeRuntimeHarnessLogIndex(dir, joined);

      expect(index.runtimeEventCounts["preview.render.succeeded"]).toBe(1);
      await expect(readFile(join(dir, "log-index.json"), "utf8")).resolves.toContain("preview.render.succeeded");
      expect(() => assertRuntimeHarnessLogJoinHealthy(joined, {
        requiredRuntimeEvents: ["preview.render.succeeded"],
        requiredHarnessEvents: ["vscode.launch.ready", "artifact.screenshot.captured"]
      })).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects failed or missing required runtime/harness events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-log-health-"));
    try {
      const runtimePath = join(dir, "runtime.jsonl");
      const harnessPath = join(dir, "harness.jsonl");
      await writeFile(runtimePath, formatRuntimeLogEvent(createRuntimeLogEvent({
        ts: "2026-04-24T00:00:00.000Z",
        level: "error",
        event: "preview.render.failed",
        source: "preview",
        runId: "run-1",
        operation: "render",
        outcome: "failed"
      })), "utf8");
      await writeFile(harnessPath, "", "utf8");

      const joined = await collectRuntimeHarnessLogs({
        runId: "run-1",
        runtimeJsonlPath: runtimePath,
        harnessJsonlPath: harnessPath
      });

      expect(() => assertRuntimeHarnessLogJoinHealthy(joined, {
        label: "Nightly visual harness",
        requiredRuntimeEvents: ["preview.render.succeeded"],
        requiredHarnessEvents: ["vscode.launch.ready"]
      })).toThrow(/runtimeFailures=preview\.render\.failed/);
      expect(() => assertRuntimeHarnessLogJoinHealthy(joined, {
        label: "Nightly visual harness",
        requiredRuntimeEvents: ["preview.render.succeeded"],
        requiredHarnessEvents: ["vscode.launch.ready"]
      })).toThrow(/missingRuntime=preview\.render\.succeeded/);
      expect(() => assertRuntimeHarnessLogJoinHealthy(joined, {
        label: "Nightly visual harness",
        allowedFailedRuntimeEvents: ["preview.render.failed"]
      })).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("surfaces malformed JSONL while treating missing logs as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-log-parse-"));
    try {
      const missingRuntimePath = join(dir, "missing-runtime.jsonl");
      const harnessPath = join(dir, "harness.jsonl");
      await writeFile(harnessPath, "", "utf8");

      const empty = await collectRuntimeHarnessLogs({
        runId: "run-1",
        runtimeJsonlPath: missingRuntimePath,
        harnessJsonlPath: harnessPath
      });
      expect(empty.runtimeEvents).toEqual([]);

      const malformedRuntimePath = join(dir, "runtime.jsonl");
      await writeFile(malformedRuntimePath, "{not-json}\n", "utf8");
      await expect(collectRuntimeHarnessLogs({
        runId: "run-1",
        runtimeJsonlPath: malformedRuntimePath,
        harnessJsonlPath: harnessPath
      })).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes a production debug bundle with complete copied logs and health gate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-debug-bundle-"));
    try {
      const config = createHarnessConfig(dir, "run-1");
      const scenario: ScenarioSpec = {
        id: "bundle",
        fixture: "source.mmd",
        expectedMode: "structured",
        steps: [{ id: "open-fixture", type: "open-fixture" }],
        assertions: [{ type: "mode", expected: "structured" }]
      };
      await writeFile(config.runtimeJsonlPath, formatRuntimeLogEvent(createRuntimeLogEvent({
        ts: "2026-04-24T00:00:00.000Z",
        level: "info",
        event: "preview.render.succeeded",
        source: "preview",
        runId: "run-1",
        operation: "render",
        outcome: "succeeded"
      })), "utf8");
      await writeFile(config.harnessJsonlPath, [
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:00.000Z",
          level: "info",
          event: "vscode.launch.ready",
          runId: "run-1",
          scenarioId: "bundle",
          tool: "vscode",
          outcome: "succeeded"
        })),
        formatHarnessEvent(createHarnessEvent({
          ts: "2026-04-24T00:00:01.000Z",
          level: "info",
          event: "artifact.debug-bundle.created",
          runId: "run-1",
          scenarioId: "bundle",
          outcome: "succeeded",
          artifactPath: join(dir, "artifacts", "run-1", "bundle")
        }))
      ].join("\n"), "utf8");

      const artifactRoot = join(dir, "artifacts", "run-1", "bundle");
      const result = await writeHarnessDebugBundle({
        artifactRoot,
        config,
        scenario,
        workspaceState: { mode: "structured" },
        commandTrace: { commands: ["mermaidGantt.openTaskGrid"] },
        outcome: "passed",
        summaryFields: { mode: "structured" },
        healthOptions: {
          requiredRuntimeEvents: ["preview.render.succeeded"],
          requiredHarnessEvents: ["vscode.launch.ready", "artifact.debug-bundle.created"]
        }
      });

      expect(result.logIndex.runtimeEventCounts["preview.render.succeeded"]).toBe(1);
      await expect(readFile(join(artifactRoot, "harness.jsonl"), "utf8")).resolves.toContain("artifact.debug-bundle.created");
      await expect(readFile(join(artifactRoot, "summary.md"), "utf8")).resolves.toContain("harnessEvents: 2");
      await expect(readFile(join(artifactRoot, "summary.md"), "utf8")).resolves.toContain("failedHarnessEvents: none");
      await expect(readFile(join(artifactRoot, "command-trace.json"), "utf8")).resolves.toContain("mermaidGantt.openTaskGrid");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("VS Code Host Controller helpers", () => {
  it("creates a launch plan with deterministic env and test commands", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-plan-"));
    try {
      const executablePath = join(
        dir,
        ".vscode-test",
        "vscode-darwin-arm64-1.117.0",
        "Visual Studio Code.app",
        "Contents",
        "MacOS",
        "Code"
      );
      await mkdir(join(executablePath, ".."), { recursive: true });
      await writeFile(executablePath, "", "utf8");
      const config = createHarnessConfig(dir, "host-run");

      const plan = createVSCodeHostLaunchPlan(config, {
        extensionDevelopmentPath: dir,
        extensionTestsPath: join(dir, "out", "test"),
        enableTestCommands: true,
        extraLaunchArgs: ["--user-data-dir=/tmp/profile"],
        extensionTestsEnv: {
          MERMAID_GANTT_EXTENSION_ROOT: dir
        }
      });

      expect(plan).toMatchObject({
        version: "1.117.0",
        extensionDevelopmentPath: dir,
        extensionTestsPath: join(dir, "out", "test"),
        extensionTestsEnv: {
          MERMAID_GANTT_RUNTIME_JSONL: config.runtimeJsonlPath,
          MERMAID_GANTT_RUN_ID: "host-run",
          MERMAID_GANTT_ENABLE_TEST_COMMANDS: "1",
          MERMAID_GANTT_EXTENSION_ROOT: dir
        },
        launchArgs: ["--user-data-dir=/tmp/profile", "--disable-extensions"]
      });
      if (process.platform === "darwin") {
        expect(plan.vscodeExecutablePath).toBe(executablePath);
        expect(resolveInstalledVSCodeExecutablePath(dir, "1.117.0")).toBe(executablePath);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("filters only known VS Code host noise", () => {
    const text = [
      "[1:ERROR:microsoft/src/shell/browser/api/electron_api_cross_app_ipc.cc:364] CrossAppIPC: Failed to get peer bundle ID. Ensure this is a host app with an embedded MiniApp, or an embedded MiniApp with ElectronHostBundleId set.",
      "[main] CrossAppIPCService: connecting to peer",
      "(node:123) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.",
      "(Use `Code Helper (Plugin) --trace-deprecation ...` to show where the warning was created)",
      "[123:ERROR:base/process/process_mac.cc:53] task_policy_set TASK_CATEGORY_POLICY: (os/kern) invalid argument (4)",
      "[123:ERROR:base/process/process_mac.cc:98] task_policy_set TASK_SUPPRESSION_POLICY: (os/kern) invalid argument (4)",
      "[main] Blocked vscode-webview request vscode-webview://example/index.html?id=1",
      "Settings Sync: Account status changed from uninitialized to unavailable",
      "Started local extension host with pid 123",
      "real error"
    ].join("\n");

    expect(filterKnownVSCodeHostNoise(text)).toBe([
      "Started local extension host with pid 123",
      "real error"
    ].join("\n"));
  });

  it("records launch started and ready events around an injected runner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-controller-"));
    try {
      const events: string[] = [];
      const exitCode = await runVSCodeHostController(
        createHarnessConfig(dir, "host-run"),
        { id: "scenario-1" },
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async (plan) => {
          expect(plan.extensionDevelopmentPath).toBe(dir);
          return 0;
        }
      );

      expect(exitCode).toBe(0);
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "vscode.launch.started",
        "vscode.launch.ready"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records launch failed events when the injected runner rejects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-controller-"));
    try {
      const events: string[] = [];
      await expect(runVSCodeHostController(
        createHarnessConfig(dir, "host-run"),
        { id: "scenario-1" },
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => {
          throw new Error("launch failed");
        }
      )).rejects.toThrow("launch failed");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "vscode.launch.started",
        "vscode.launch.failed"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records launch failed events when the injected runner exits nonzero", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-controller-"));
    try {
      const events: string[] = [];
      await expect(runVSCodeHostController(
        createHarnessConfig(dir, "host-run"),
        { id: "scenario-1" },
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => 1
      )).rejects.toThrow("VS Code host exited with code 1.");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "vscode.launch.started",
        "vscode.launch.failed"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("prepareHarnessWorkspace", () => {
  it("copies the scenario fixture into an isolated artifact workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-workspace-"));
    try {
      await mkdir(join(dir, "fixtures"), { recursive: true });
      await writeFile(join(dir, "fixtures", "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      const config = createHarnessConfig(dir, "run-1");

      const prepared = await prepareHarnessWorkspace(config, {
        id: "scenario-1",
        fixture: "fixtures/source.mmd"
      });

      expect(prepared.workspacePath).toBe(join(dir, "artifacts", "run-1", "scenario-1", "workspace"));
      expect(prepared.relativeFixturePath).toBe("fixtures/source.mmd");
      await expect(readFile(prepared.fixturePath, "utf8")).resolves.toBe("gantt\nTask A : a1, 1d\n");
      await expect(readFile(prepared.metadataPath, "utf8")).resolves.toContain("\"scenarioId\": \"scenario-1\"");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runVSCodeCommandController", () => {
  it("records command execution started and finished events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-command-controller-"));
    try {
      const events: string[] = [];
      const result = await runVSCodeCommandController(
        createHarnessConfig(dir, "run-1"),
        { id: "scenario-1" },
        {
          stepId: "open-grid",
          command: "mermaidGantt.openTaskGrid"
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async (execution) => {
          expect(execution.command).toBe("mermaidGantt.openTaskGrid");
          return { ok: true };
        }
      );

      expect(result).toEqual({ ok: true });
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "command.exec.started",
        "command.exec.finished"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records command execution failure events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-command-controller-"));
    try {
      const events: string[] = [];
      await expect(runVSCodeCommandController(
        createHarnessConfig(dir, "run-1"),
        { id: "scenario-1" },
        {
          stepId: "open-grid",
          command: "mermaidGantt.openTaskGrid"
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => {
          throw new Error("command failed");
        }
      )).rejects.toThrow("command failed");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "command.exec.started",
        "command.exec.failed"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("observeVSCodeEditorStateController", () => {
  it("records editor state observation events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-editor-state-controller-"));
    try {
      const events: string[] = [];
      const snapshot = await observeVSCodeEditorStateController(
        createHarnessConfig(dir, "run-1"),
        { id: "scenario-1" },
        "observe-state",
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => ({
          activeDocumentUri: "file:///workspace/source.mmd",
          languageId: "mermaid",
          mode: "structured",
          diagnosticCodes: []
        })
      );

      expect(snapshot).toMatchObject({
        activeDocumentUri: "file:///workspace/source.mmd",
        mode: "structured"
      });
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "command.exec.started",
        "command.exec.finished"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records editor state observation failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-editor-state-controller-"));
    try {
      const events: string[] = [];
      await expect(observeVSCodeEditorStateController(
        createHarnessConfig(dir, "run-1"),
        { id: "scenario-1" },
        "observe-state",
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => {
          throw new Error("state unavailable");
        }
      )).rejects.toThrow("state unavailable");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "command.exec.started",
        "command.exec.failed"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("VS Code host scenario bridge", () => {
  it("reads host-written command trace and editor snapshot artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-bridge-"));
    try {
      const commandTracePath = join(dir, "command-trace.json");
      const editorSnapshotPath = join(dir, "editor-snapshot.json");
      await writeFile(commandTracePath, JSON.stringify({
        scenarioId: "scenario-1",
        commands: [
          {
            stepId: "open-fixture",
            command: "vscode.open",
            target: join(dir, "fixtures", "source.mmd")
          },
          {
            stepId: "open-grid",
            command: "mermaidGantt.openTaskGrid",
            target: "mermaidGantt.openTaskGrid"
          }
        ]
      }), "utf8");
      await writeFile(editorSnapshotPath, JSON.stringify({
        activeDocumentUri: "file:///workspace/fixtures/source.mmd",
        mode: "structured",
        diagnosticCodes: []
      }), "utf8");

      const dependencies = createVSCodeHostScenarioBridgeDependencies({
        commandTracePath,
        editorSnapshotPath
      });
      const command = await dependencies.commandRunner({
        stepId: "open-grid",
        command: "mermaidGantt.openTaskGrid"
      });
      const snapshot = await dependencies.editorObserver?.();
      const trace = await readVSCodeHostScenarioCommandTrace(commandTracePath);
      const directSnapshot = await readVSCodeHostScenarioEditorSnapshot(editorSnapshotPath);

      expect(command).toMatchObject({
        stepId: "open-grid",
        command: "mermaidGantt.openTaskGrid"
      });
      expect(snapshot?.mode).toBe("structured");
      expect(trace.commands).toHaveLength(2);
      expect(directSnapshot.diagnosticCodes).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects missing host command trace entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-host-bridge-"));
    try {
      const commandTracePath = join(dir, "command-trace.json");
      const editorSnapshotPath = join(dir, "editor-snapshot.json");
      await writeFile(commandTracePath, JSON.stringify({
        scenarioId: "scenario-1",
        commands: []
      }), "utf8");
      await writeFile(editorSnapshotPath, JSON.stringify({ mode: "structured" }), "utf8");

      const dependencies = createVSCodeHostScenarioBridgeDependencies({
        commandTracePath,
        editorSnapshotPath
      });

      await expect(dependencies.commandRunner({
        stepId: "open-grid",
        command: "mermaidGantt.openTaskGrid"
      })).rejects.toThrow("does not contain command open-grid:mermaidGantt.openTaskGrid");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runVSCodeHarnessScenario", () => {
  it("prepares workspace, launches host, runs steps, and observes editor state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-vscode-scenario-"));
    try {
      await mkdir(join(dir, "fixtures"), { recursive: true });
      await writeFile(join(dir, "fixtures", "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      const events: string[] = [];
      const commands: string[] = [];
      const scenario: ScenarioSpec = {
        id: "scenario-1",
        fixture: "fixtures/source.mmd",
        expectedMode: "structured",
        steps: [
          { id: "open-fixture", type: "open-fixture" },
          { id: "open-grid", type: "run-command", command: "mermaidGantt.openTaskGrid" }
        ],
        assertions: [{ type: "mode", expected: "structured" }]
      };

      const result = await runVSCodeHarnessScenario(
        createHarnessConfig(dir, "run-1"),
        scenario,
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        {
          hostRunner: async (plan) => {
            expect(plan.launchArgs).toContain(join(dir, "artifacts", "run-1", "scenario-1", "workspace"));
            return 0;
          },
          commandRunner: async (execution) => {
            commands.push(execution.command);
            return { ok: true };
          },
          editorObserver: async () => ({
            activeDocumentUri: "file:///workspace/fixtures/source.mmd",
            mode: "structured",
            diagnosticCodes: []
          })
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        }
      );

      expect(result.outcome).toBe("passed");
      expect(result.editorState?.mode).toBe("structured");
      expect(commands).toEqual(["vscode.open", "mermaidGantt.openTaskGrid"]);
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "harness.run.started",
        "vscode.launch.started",
        "vscode.launch.ready",
        "command.exec.started",
        "command.exec.finished",
        "command.exec.started",
        "command.exec.finished",
        "command.exec.started",
        "command.exec.finished",
        "harness.run.finished"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records scenario failure when VS Code orchestration fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-vscode-scenario-"));
    try {
      await mkdir(join(dir, "fixtures"), { recursive: true });
      await writeFile(join(dir, "fixtures", "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      const events: string[] = [];

      await expect(runVSCodeHarnessScenario(
        createHarnessConfig(dir, "run-1"),
        {
          id: "scenario-1",
          fixture: "fixtures/source.mmd",
          expectedMode: "structured",
          steps: [{ id: "open-fixture", type: "open-fixture" }],
          assertions: [{ type: "mode", expected: "structured" }]
        },
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        {
          hostRunner: async () => {
            throw new Error("host failed");
          },
          commandRunner: async () => undefined
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        }
      )).rejects.toThrow("host failed");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "harness.run.started",
        "vscode.launch.started",
        "vscode.launch.failed",
        "harness.run.finished"
      ]);
      expect(parseHarnessEvent(events[3]!).outcome).toBe("failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records scenario failure when workspace preparation fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-vscode-scenario-"));
    try {
      const events: string[] = [];

      await expect(runVSCodeHarnessScenario(
        createHarnessConfig(dir, "run-1"),
        {
          id: "scenario-1",
          fixture: "fixtures/missing.mmd",
          expectedMode: "structured",
          steps: [{ id: "open-fixture", type: "open-fixture" }],
          assertions: [{ type: "mode", expected: "structured" }]
        },
        {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        {
          commandRunner: async () => undefined
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        }
      )).rejects.toThrow();

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "harness.run.started",
        "harness.run.finished"
      ]);
      expect(parseHarnessEvent(events[1]!).outcome).toBe("failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runNightlyVisualHarness", () => {
  it("loads manifest scenarios, runs VS Code orchestration, and applies visual debug policy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-nightly-harness-"));
    try {
      await mkdir(join(dir, "fixtures", "harness", "nightly"), { recursive: true });
      await mkdir(join(dir, "fixtures", "product", "task-grid-basic"), { recursive: true });
      await writeFile(join(dir, "fixtures", "product", "task-grid-basic", "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      await writeFile(join(dir, "fixtures", "harness", "nightly", "scenario.json"), JSON.stringify({
        id: "nightly-1",
        fixture: "fixtures/product/task-grid-basic/source.mmd",
        expectedMode: "structured",
        steps: [
          { id: "open-fixture", type: "open-fixture" },
          { id: "open-grid", type: "run-command", command: "mermaidGantt.openTaskGrid" }
        ],
        assertions: [
          { type: "mode", expected: "structured" },
          { type: "preview-source", expected: "available" }
        ]
      }), "utf8");
      await writeFile(join(dir, "fixtures", "harness-manifest.json"), JSON.stringify({
        nightlyVisual: ["fixtures/harness/nightly/scenario.json"]
      }), "utf8");
      const config: HarnessConfig = {
        ...createHarnessConfig(dir, "run-1"),
        mode: "nightly-visual",
        screenshotPolicy: "always"
      };
      const events: string[] = [];
      const commands: string[] = [];

      const result = await runNightlyVisualHarness(config, {
        manifestPath: join(dir, "fixtures", "harness-manifest.json"),
        hostOptions: {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        dependencies: {
          hostRunner: async () => 0,
          commandRunner: async (execution) => {
            commands.push(execution.command);
            return { ok: true };
          },
          editorObserver: async () => ({
            mode: "structured",
            diagnosticCodes: []
          })
        },
        sink: (event) => {
          events.push(formatHarnessEvent(event));
        },
        macosRunner: async (command) => {
          await writeFile(command[2]!, "png", "utf8");
        }
      });

      expect(result.runId).toBe("run-1");
      expect(result.scenarios.map((scenario) => scenario.scenarioId)).toEqual(["nightly-1"]);
      expect(result.visualDebugPlans[0]?.shouldCaptureScreenshot).toBe(true);
      expect(commands).toEqual(["vscode.open", "mermaidGantt.openTaskGrid"]);
      expect(events.map((line) => parseHarnessEvent(line).event)).toContain("artifact.screenshot.captured");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-nightly configs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-nightly-harness-"));
    try {
      await expect(runNightlyVisualHarness(createHarnessConfig(dir, "run-1"), {
        manifestPath: join(dir, "fixtures", "harness-manifest.json"),
        hostOptions: {
          extensionDevelopmentPath: dir,
          extensionTestsPath: join(dir, "out", "test")
        },
        dependencies: {
          commandRunner: async () => undefined
        }
      })).rejects.toThrow("requires config.mode to be nightly-visual");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createVisualDebugPlan", () => {
  it("captures screenshots for nightly visual always policy", () => {
    const config = {
      ...createHarnessConfig("/workspace", "run-1"),
      mode: "nightly-visual" as const,
      screenshotPolicy: "always" as const
    };
    const plan = createVisualDebugPlan(config, {
      runId: "run-1",
      scenarioId: "scenario-1",
      outcome: "passed",
      artifactRoot: "/workspace/artifacts/run-1/scenario-1"
    });

    expect(plan).toMatchObject({
      shouldCaptureScreenshot: true,
      reason: "policy-always",
      captureMode: "active-window",
      screenshotPath: "/workspace/artifacts/run-1/scenario-1/screenshots/screen-1.png"
    });
    expect(plan.preferredMacosCommands).toEqual([[
      "screencapture",
      "-x",
      "-o",
      "-l",
      "<active-window-id>",
      plan.screenshotPath
    ]]);
    expect(plan.fallbackMacosCommands).toEqual([["screencapture", "-x", plan.screenshotPath]]);
    expect(plan.macosCommands).toEqual([["screencapture", "-x", plan.screenshotPath]]);
  });

  it("captures screenshots only for visual failure classes under on-failure policy", () => {
    const config = {
      ...createHarnessConfig("/workspace", "run-1"),
      mode: "nightly-visual" as const,
      screenshotPolicy: "on-failure" as const
    };

    expect(createVisualDebugPlan(config, {
      runId: "run-1",
      scenarioId: "scenario-1",
      outcome: "failed",
      failureClass: "ui-divergence",
      artifactRoot: "/workspace/artifacts/run-1/scenario-1"
    }).shouldCaptureScreenshot).toBe(true);

    expect(createVisualDebugPlan(config, {
      runId: "run-1",
      scenarioId: "scenario-1",
      outcome: "failed",
      failureClass: "assertion-failed",
      artifactRoot: "/workspace/artifacts/run-1/scenario-1"
    }).shouldCaptureScreenshot).toBe(false);
  });
});

describe("collectVisualDebugArtifacts", () => {
  it("runs planned macOS screenshot commands and records artifact events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-visual-debug-"));
    try {
      const config = {
        ...createHarnessConfig(dir, "run-1"),
        mode: "nightly-visual" as const,
        screenshotPolicy: "always" as const
      };
      const result = {
        runId: "run-1",
        scenarioId: "scenario-1",
        outcome: "passed" as const,
        artifactRoot: join(dir, "artifacts", "run-1", "scenario-1")
      };
      const plan = createVisualDebugPlan(config, result);
      const events: string[] = [];
      const commands: string[][] = [];

      await collectVisualDebugArtifacts(
        config,
        { id: "scenario-1" },
        plan,
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async (command) => {
          commands.push(command);
          await writeFile(plan.screenshotPath, "png", "utf8");
        }
      );

      expect(commands).toEqual([["screencapture", "-x", plan.screenshotPath]]);
      await expect(readFile(plan.screenshotPath, "utf8")).resolves.toBe("png");
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "computer-use.session.started",
        "artifact.screenshot.captured",
        "computer-use.session.finished"
      ]);
      const event = parseHarnessEvent(events[1]!);
      expect(event).toMatchObject({
        event: "artifact.screenshot.captured",
        tool: "macos",
        outcome: "succeeded",
        artifactPath: plan.screenshotPath
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records failed screenshot artifact events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-visual-debug-"));
    try {
      const config = {
        ...createHarnessConfig(dir, "run-1"),
        mode: "nightly-visual" as const,
        screenshotPolicy: "always" as const
      };
      const plan = createVisualDebugPlan(config, {
        runId: "run-1",
        scenarioId: "scenario-1",
        outcome: "passed",
        artifactRoot: join(dir, "artifacts", "run-1", "scenario-1")
      });
      const events: string[] = [];

      await expect(collectVisualDebugArtifacts(
        config,
        { id: "scenario-1" },
        plan,
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async () => {
          throw new Error("screencapture failed");
        }
      )).rejects.toThrow("screencapture failed");

      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "computer-use.session.started",
        "artifact.screenshot.captured",
        "computer-use.session.finished"
      ]);
      expect(parseHarnessEvent(events[1]!).outcome).toBe("failed");
      expect(parseHarnessEvent(events[2]!).outcome).toBe("failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createMacOSDebugAidRunner", () => {
  it("rejects commands outside the macOS debug aid allowlist before execution", async () => {
    const runner = createMacOSDebugAidRunner(["screencapture"]);

    await expect(runner(["rm", "-rf", "/tmp/example"])).rejects.toThrow("not allowed");
  });

  it("rejects empty commands", async () => {
    const runner = createMacOSDebugAidRunner();

    await expect(runner([])).rejects.toThrow("must not be empty");
  });
});

describe("runVisualDebugIfNeeded", () => {
  it("returns a no-op plan without running commands when screenshots are not required", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-visual-if-needed-"));
    try {
      const commands: string[][] = [];
      const plan = await runVisualDebugIfNeeded(
        createHarnessConfig(dir, "run-1"),
        { id: "scenario-1" },
        {
          runId: "run-1",
          scenarioId: "scenario-1",
          outcome: "passed",
          artifactRoot: join(dir, "artifacts", "run-1", "scenario-1")
        },
        () => {},
        async (command) => {
          commands.push(command);
        }
      );

      expect(plan.shouldCaptureScreenshot).toBe(false);
      expect(commands).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs visual artifact collection when screenshots are required", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-visual-if-needed-"));
    try {
      const config = {
        ...createHarnessConfig(dir, "run-1"),
        mode: "nightly-visual" as const,
        screenshotPolicy: "always" as const
      };
      const events: string[] = [];
      const plan = await runVisualDebugIfNeeded(
        config,
        { id: "scenario-1" },
        {
          runId: "run-1",
          scenarioId: "scenario-1",
          outcome: "passed",
          artifactRoot: join(dir, "artifacts", "run-1", "scenario-1")
        },
        (event) => {
          events.push(formatHarnessEvent(event));
        },
        async (command) => {
          await writeFile(command[2]!, "png", "utf8");
        }
      );

      expect(plan.shouldCaptureScreenshot).toBe(true);
      expect(events.map((line) => parseHarnessEvent(line).event)).toEqual([
        "computer-use.session.started",
        "artifact.screenshot.captured",
        "computer-use.session.finished"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("PNG visual signal assertions", () => {
  it("accepts a screenshot-like image with dark shell, light preview, and accent controls", () => {
    const png = makeRgbaPng(32, 32, (x, y) => {
      if (x < 16 && y < 16) {
        return [16, 24, 32, 255];
      }
      if (x >= 16 && y < 16) {
        return [245, 247, 248, 255];
      }
      if (x < 16 && y >= 16) {
        return [66, 198, 181, 255];
      }
      return [(x * 7) & 0xff, (y * 7) & 0xff, ((x + y) * 5) & 0xff, 255];
    });

    const signal = analyzePngVisualSignal(png);

    expect(signal).toMatchObject({
      width: 32,
      height: 32
    });
    expect(validatePngVisualSignal(signal)).toEqual([]);
  });

  it("accepts VS Code themed blue controls in visual captures", () => {
    const png = makeRgbaPng(32, 32, (x, y) => {
      if (x < 16 && y < 16) {
        return [10, 20, 34, 255];
      }
      if (x >= 16 && y < 16) {
        return [250, 250, 250, 255];
      }
      if (x < 16 && y >= 16) {
        return [52, 75, 115, 255];
      }
      return [(x * 7) & 0xff, (y * 5) & 0xff, ((x + y) * 3) & 0xff, 255];
    });

    expect(validatePngVisualSignal(analyzePngVisualSignal(png))).toEqual([]);
  });

  it("rejects blank visual captures", () => {
    const png = makeRgbaPng(16, 16, () => [16, 24, 32, 255]);
    const errors = validatePngVisualSignal(analyzePngVisualSignal(png));

    expect(errors.join("\n")).toContain("color buckets");
    expect(errors.join("\n")).toContain("light preview pixels");
    expect(errors.join("\n")).toContain("accent control pixels");
  });

  it("accepts nightly visual screenshot artifacts with capture metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-nightly-artifact-"));
    try {
      const screenshotPath = join(dir, "screen-1.png");
      const captureMetadataPath = join(dir, "screen-1.capture.json");
      const png = makeRgbaPng(800, 600, (x, y) => {
        if (x < 400 && y < 300) {
          return [16, 24, 32, 255];
        }
        if (x >= 400 && y < 300) {
          return [245, 247, 248, 255];
        }
        if (x < 400 && y >= 300) {
          return [66, 198, 181, 255];
        }
        return [(x * 7) & 0xff, (y * 5) & 0xff, ((x + y) * 3) & 0xff, 255];
      });
      await writeFile(screenshotPath, png);
      await writeFile(captureMetadataPath, JSON.stringify({
        captureMode: "active-window",
        command: "screencapture -x -o -l 123",
        bounds: { x: 0, y: 0, width: 800, height: 600, windowId: 123 },
        startedAt: "2026-04-26T00:00:00.000Z",
        finishedAt: "2026-04-26T00:00:01.000Z"
      }), "utf8");

      const result = await assertNightlyVisualScreenshotArtifact({
        screenshotPath,
        captureMetadataPath,
        platform: "darwin"
      });

      expect(result.captureMetadata?.captureMode).toBe("active-window");
      expect(result.visualSignal).toMatchObject({ width: 800, height: 600 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed nightly visual screenshot artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-nightly-artifact-"));
    try {
      const screenshotPath = join(dir, "screen-1.png");
      const captureMetadataPath = join(dir, "screen-1.capture.json");
      await writeFile(screenshotPath, "not-png", "utf8");
      await writeFile(captureMetadataPath, JSON.stringify({
        captureMode: "active-window",
        command: "screencapture -x",
        startedAt: "2026-04-26T00:00:00.000Z",
        finishedAt: "2026-04-26T00:00:01.000Z"
      }), "utf8");

      await expect(assertNightlyVisualScreenshotArtifact({
        screenshotPath,
        captureMetadataPath,
        platform: "darwin"
      })).rejects.toThrow("not a PNG");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runHeadlessHarnessScenario", () => {
  it("runs a fixture scenario and writes the required debug bundle files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-"));
    try {
      await writeFile(join(dir, "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      await writeFile(join(dir, "runtime.jsonl"), "", "utf8");
      const config = createHarnessConfig(dir, "run-1");
      const scenario: ScenarioSpec = {
        id: "basic",
        fixture: "source.mmd",
        expectedMode: "structured",
        steps: [{ id: "open-fixture", type: "open-fixture" }],
        assertions: [
          { type: "mode", expected: "structured" },
          { type: "preview-source", expected: "available" }
        ]
      };

      const result = await runHeadlessHarnessScenario(config, scenario);

      expect(result).toMatchObject({
        runId: "run-1",
        scenarioId: "basic",
        outcome: "passed"
      });
      const artifactRoot = join(dir, "artifacts", "run-1", "basic");
      await expect(readFile(join(artifactRoot, "runtime.jsonl"), "utf8")).resolves.toBe("");
      await expect(readFile(join(artifactRoot, "harness.jsonl"), "utf8")).resolves.toContain("harness.run.finished");
      await expect(readFile(join(artifactRoot, "log-index.json"), "utf8")).resolves.toContain("harness.run.finished");
      await expect(readFile(join(artifactRoot, "scenario.json"), "utf8")).resolves.toContain("\"id\": \"basic\"");
      await expect(readFile(join(artifactRoot, "workspace-state.json"), "utf8")).resolves.toContain("\"mode\": \"structured\"");
      await expect(readFile(join(artifactRoot, "command-trace.json"), "utf8")).resolves.toContain("open-fixture");
      await expect(readFile(join(artifactRoot, "summary.md"), "utf8")).resolves.toContain("outcome: passed");

      const harnessLines = (await readFile(config.harnessJsonlPath, "utf8")).trim().split("\n");
      expect(harnessLines.map((line) => parseHarnessEvent(line).event)).toEqual([
        "harness.run.started",
        "command.exec.started",
        "log.collect.started",
        "log.collect.finished",
        "command.exec.finished",
        "artifact.debug-bundle.created",
        "harness.run.finished"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns failed when assertions do not match", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mermaid-gantt-harness-"));
    try {
      await writeFile(join(dir, "source.mmd"), "gantt\nTask A : a1, 1d\n", "utf8");
      const config = createHarnessConfig(dir, "run-2");

      const result = await runHeadlessHarnessScenario(config, {
        id: "failing",
        fixture: "source.mmd",
        expectedMode: "fallback",
        steps: [{ id: "open-fixture", type: "open-fixture" }],
        assertions: [{ type: "mode", expected: "fallback" }]
      });

      expect(result.outcome).toBe("failed");
      expect(result.failureClass).toBe("assertion-failed");
      await expect(readFile(join(result.artifactRoot, "summary.md"), "utf8")).resolves.toContain("expected mode fallback");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createHarnessConfig(workspacePath: string, runId: string): HarnessConfig {
  return {
    workspacePath,
    runId,
    mode: "headless",
    artifactRoot: join(workspacePath, "artifacts"),
    runtimeJsonlPath: join(workspacePath, "runtime.jsonl"),
    harnessJsonlPath: join(workspacePath, "harness.jsonl"),
    vscodeLaunchProfile: "debug-f5",
    screenshotPolicy: "never"
  };
}

function makeRgbaPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha] = pixel(x, y);
      const base = rowOffset + 1 + (x * 4);
      raw[base] = red;
      raw[base + 1] = green;
      raw[base + 2] = blue;
      raw[base + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([
    length,
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4)
  ]);
}
