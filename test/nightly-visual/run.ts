import { copyFileSync, existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  assertNightlyVisualScreenshotArtifact,
  createHarnessEvent,
  createJsonlFileHarnessSink,
  createVSCodeHostScenarioBridgeDependencies,
  loadNightlyVisualScenarioSpecs,
  runVSCodeHarnessScenario,
  type HarnessConfig,
  type NightlyVisualCaptureMetadata,
  type PngVisualSignal,
  type ScenarioSpec,
  writeHarnessDebugBundle
} from "../../src/harness";
import type { RuntimeLogEventName } from "../../src/logging";

async function main(): Promise<void> {
  const extensionDevelopmentPath = resolve(__dirname, "../../..");
  const extensionTestsPath = resolve(__dirname, "../integration-host/suite");
  const runtimeLogDir = mkdtempSync(join(tmpdir(), "mermaid-gantt-nightly-visual-"));
  const artifactRoot = join(runtimeLogDir, "artifacts");
  const manifestPath = join(extensionDevelopmentPath, "fixtures", "harness-manifest.json");
  const scenarios = await loadNightlyVisualScenarioSpecs(manifestPath, extensionDevelopmentPath);
  const scenario = selectNightlyVisualScenario(scenarios);
  if (!scenario) {
    throw new Error("nightly visual manifest does not contain a scenario.");
  }
  const scenarioId = scenario.id;
  const computerUseOptIn = process.env.MERMAID_GANTT_NIGHTLY_COMPUTER_USE === "1";
  const computerUseHoldMs = process.env.MERMAID_GANTT_NIGHTLY_COMPUTER_USE_HOLD_MS;
  const config: HarnessConfig = {
    workspacePath: extensionDevelopmentPath,
    runId: `nightly-visual-${Date.now()}`,
    mode: "nightly-visual",
    artifactRoot,
    runtimeJsonlPath: join(runtimeLogDir, "runtime.jsonl"),
    harnessJsonlPath: join(runtimeLogDir, "harness.jsonl"),
    vscodeLaunchProfile: "debug-f5",
    screenshotPolicy: "always"
  };
  const scenarioArtifactRoot = join(artifactRoot, config.runId, scenarioId);
  const screenshotPath = join(scenarioArtifactRoot, "screenshots", "screen-1.png");
  const captureMetadataPath = screenshotPath.replace(/\.png$/u, ".capture.json");
  const computerUseHandoffPath = screenshotPath.replace(/\.png$/u, ".computer-use-handoff.json");
  const uiReviewSnapshotPath = join(scenarioArtifactRoot, "ui-review-snapshot.json");
  const commandTracePath = join(scenarioArtifactRoot, "command-trace.json");
  const editorSnapshotPath = join(scenarioArtifactRoot, "editor-snapshot.json");

  await runVSCodeHarnessScenario(
    config,
    scenario,
    {
      extensionDevelopmentPath,
      extensionTestsPath,
      extraLaunchArgs: nightlyVisualExtraLaunchArgs(),
      enableTestCommands: true,
      extensionTestsEnv: {
        MERMAID_GANTT_EXTENSION_ROOT: extensionDevelopmentPath,
        MERMAID_GANTT_HARNESS_MANIFEST: manifestPath,
        MERMAID_GANTT_HOST_SUITE_MODE: "nightly-visual",
        MERMAID_GANTT_NIGHTLY_SCENARIO_PATH: selectedScenarioPath(scenario),
        MERMAID_GANTT_NIGHTLY_SCREENSHOT_PATH: screenshotPath,
        MERMAID_GANTT_UI_REVIEW_SNAPSHOT_PATH: uiReviewSnapshotPath,
        MERMAID_GANTT_COMMAND_TRACE_PATH: commandTracePath,
        MERMAID_GANTT_EDITOR_SNAPSHOT_PATH: editorSnapshotPath,
        MERMAID_GANTT_TEST_UI_REVIEW_SNAPSHOT: "1",
        MERMAID_GANTT_TEST_DETAIL_TAB: process.env.MERMAID_GANTT_TEST_DETAIL_TAB ?? "settings",
        ...(process.env.MERMAID_GANTT_TEST_OPEN_DETAILS
          ? { MERMAID_GANTT_TEST_OPEN_DETAILS: process.env.MERMAID_GANTT_TEST_OPEN_DETAILS }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU
          ? { MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU: process.env.MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_PREVIEW_COLLAPSED
          ? { MERMAID_GANTT_TEST_PREVIEW_COLLAPSED: process.env.MERMAID_GANTT_TEST_PREVIEW_COLLAPSED }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_PREVIEW_FOCUSED
          ? { MERMAID_GANTT_TEST_PREVIEW_FOCUSED: process.env.MERMAID_GANTT_TEST_PREVIEW_FOCUSED }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_WEBVIEW_LAYOUT
          ? { MERMAID_GANTT_TEST_WEBVIEW_LAYOUT: process.env.MERMAID_GANTT_TEST_WEBVIEW_LAYOUT }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_PREVIEW_ZOOM
          ? { MERMAID_GANTT_TEST_PREVIEW_ZOOM: process.env.MERMAID_GANTT_TEST_PREVIEW_ZOOM }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_RESPONSIVE_MODE
          ? { MERMAID_GANTT_TEST_RESPONSIVE_MODE: process.env.MERMAID_GANTT_TEST_RESPONSIVE_MODE }
          : {}),
        ...(process.env.MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU
          ? { MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU: process.env.MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU }
          : {}),
        ...(computerUseOptIn ? {
          MERMAID_GANTT_NIGHTLY_COMPUTER_USE: "1",
          ...(computerUseHoldMs ? { MERMAID_GANTT_NIGHTLY_COMPUTER_USE_HOLD_MS: computerUseHoldMs } : {})
        } : {})
      }
    },
    createVSCodeHostScenarioBridgeDependencies({
      commandTracePath,
      editorSnapshotPath
    })
  );

  assertHarnessLaunchEvents(config.harnessJsonlPath);
  const requiresPreviewRender = scenarioRequiresPreviewRender(scenario);
  const previewCollapsed = process.env.MERMAID_GANTT_TEST_PREVIEW_COLLAPSED === "1";
  const { captureMetadata, visualSignal } = await assertNightlyVisualScreenshotArtifact({
    screenshotPath,
    captureMetadataPath,
    previewCollapsed,
    ...(!requiresPreviewRender || previewCollapsed ? {
      visualSignalThresholds: {
        minLightPixelRatio: previewCollapsed ? 0.0005 : 0.003,
        minAccentPixelRatio: 0
      }
    } : {})
  });
  await recordScreenshotArtifact(config, scenarioId, screenshotPath, captureMetadata);
  await recordComputerUseHandoffIfRequested(config, scenarioId, computerUseHandoffPath);
  await writeNightlyDebugBundle(config, {
    artifactRoot: scenarioArtifactRoot,
    manifestPath,
    scenarioId,
    scenarioPath: selectedScenarioPath(scenario),
    requiresPreviewRender,
    allowsDiagnosticFailures: scenario.assertions.some((assertion) => assertion.type === "diagnostic"),
    screenshotPath,
    captureMetadata,
    visualSignal,
    captureMetadataPath,
    computerUseHandoffPath,
    uiReviewSnapshotPath
  });
  console.log(`nightly visual artifacts: ${join(artifactRoot, config.runId)}`);
}

function nightlyVisualExtraLaunchArgs(): string[] {
  const locale = process.env.MERMAID_GANTT_NIGHTLY_LOCALE?.trim();
  return locale ? [`--locale=${locale}`] : [];
}

function scenarioRequiresPreviewRender(scenario: ScenarioSpec): boolean {
  return scenario.assertions.some((assertion) => {
    return assertion.type === "preview-source" && assertion.expected === "available";
  });
}

function selectNightlyVisualScenario(scenarios: ScenarioSpec[]): ScenarioSpec | undefined {
  const selectedPath = process.env.MERMAID_GANTT_NIGHTLY_SCENARIO_PATH;
  if (!selectedPath) {
    return scenarios[0];
  }
  return scenarios.find((scenario) => scenarioPathForId(scenario.id) === selectedPath || scenario.id === selectedPath);
}

function selectedScenarioPath(scenario: { id: string }): string {
  return process.env.MERMAID_GANTT_NIGHTLY_SCENARIO_PATH ?? scenarioPathForId(scenario.id);
}

function scenarioPathForId(id: string): string {
  return `fixtures/harness/${id}/scenario.json`;
}

async function recordComputerUseHandoffIfRequested(
  config: HarnessConfig,
  scenarioId: string,
  handoffPath: string
): Promise<void> {
  if (!existsSync(handoffPath)) {
    return;
  }
  const sink = createJsonlFileHarnessSink(config.harnessJsonlPath);
  await sink(createHarnessEvent({
    level: "info",
    event: "computer-use.handoff.created",
    runId: config.runId,
    scenarioId,
    tool: "computer-use",
    target: "optional-nightly-visual-handoff",
    outcome: "succeeded",
    artifactPath: handoffPath
  }));
}

function assertHarnessLaunchEvents(harnessJsonlPath: string): void {
  const text = readFileSync(harnessJsonlPath, "utf8");
  if (!text.includes("vscode.launch.started") || !text.includes("vscode.launch.ready")) {
    throw new Error("VS Code host controller did not write launch events to harness JSONL.");
  }
}

async function recordScreenshotArtifact(
  config: HarnessConfig,
  scenarioId: string,
  screenshotPath: string,
  captureMetadata?: NightlyVisualCaptureMetadata
): Promise<void> {
  if (!existsSync(screenshotPath)) {
    return;
  }
  const sink = createJsonlFileHarnessSink(config.harnessJsonlPath);
  if (captureMetadata?.captureMode === "full-screen-fallback") {
    await sink(createHarnessEvent({
      level: "warn",
      event: "artifact.screenshot.captured",
      runId: config.runId,
      scenarioId,
      tool: "macos",
      target: `fallback: ${captureMetadata.fallbackReason ?? "unknown"}`,
      outcome: "started",
      artifactPath: screenshotPath
    }));
  }
  await sink(createHarnessEvent({
    level: "info",
    event: "artifact.screenshot.captured",
    runId: config.runId,
    scenarioId,
    tool: "macos",
    target: captureMetadata?.command ?? "screencapture -x",
    outcome: "succeeded",
    artifactPath: screenshotPath
  }));
}

async function writeNightlyDebugBundle(
  config: HarnessConfig,
  input: {
    artifactRoot: string;
    manifestPath: string;
    scenarioId: string;
    scenarioPath: string;
    requiresPreviewRender: boolean;
    allowsDiagnosticFailures: boolean;
    screenshotPath: string;
    captureMetadata?: NightlyVisualCaptureMetadata;
    visualSignal?: PngVisualSignal;
    captureMetadataPath: string;
    computerUseHandoffPath: string;
    uiReviewSnapshotPath: string;
  }
): Promise<void> {
  mkdirSync(input.artifactRoot, { recursive: true });
  copyIfExists(config.runtimeJsonlPath, join(input.artifactRoot, "runtime.jsonl"));
  copyIfExists(config.harnessJsonlPath, join(input.artifactRoot, "harness.jsonl"));
  copyIfExists(input.manifestPath, join(input.artifactRoot, "scenario-manifest.json"));
  if (input.scenarioPath) {
    copyIfExists(join(config.workspacePath, input.scenarioPath), join(input.artifactRoot, "scenario.json"));
  }
  const workspaceState = {
    workspacePath: config.workspacePath,
    mode: config.mode,
    screenshotPolicy: config.screenshotPolicy,
    screenshotCapture: input.captureMetadata ?? null,
    visualSignal: input.visualSignal ?? null
  };
  const commandTracePath = join(input.artifactRoot, "command-trace.json");
  const commandTrace = readJsonIfExists(commandTracePath) ?? {
    commands: [
      "mermaidGantt.openTaskGrid",
      "mermaidGantt.test.getEditorSnapshot",
      input.captureMetadata?.command ?? "screencapture -x"
    ]
  };
  copyIfExists(input.captureMetadataPath, join(input.artifactRoot, "screenshots", "screen-1.capture.json"));
  copyIfExists(input.uiReviewSnapshotPath, join(input.artifactRoot, "ui-review-snapshot.json"));
  const computerUseHandoffExists = existsSync(input.computerUseHandoffPath);
  if (computerUseHandoffExists) {
    copyIfExists(input.computerUseHandoffPath, join(input.artifactRoot, "screenshots", "screen-1.computer-use-handoff.json"));
  }
  const sink = createJsonlFileHarnessSink(config.harnessJsonlPath);
  await sink(createHarnessEvent({
    level: "info",
    event: "artifact.debug-bundle.created",
    runId: config.runId,
    scenarioId: input.scenarioId,
    outcome: "succeeded",
    artifactPath: input.artifactRoot
  }));
  await writeHarnessDebugBundle({
    artifactRoot: input.artifactRoot,
    config,
    scenario: JSON.parse(readFileSync(join(config.workspacePath, input.scenarioPath), "utf8")) as ScenarioSpec,
    workspaceState,
    commandTrace,
    outcome: "passed",
    summaryTitle: "Nightly Visual Harness Summary",
    summaryFields: {
      harnessJsonl: config.harnessJsonlPath,
      runtimeJsonl: config.runtimeJsonlPath,
      screenshotPath: input.screenshotPath,
      screenshotBytes: existsSync(input.screenshotPath) ? statSync(input.screenshotPath).size : 0,
      screenshotSize: existsSync(input.screenshotPath) ? formatPngDimensions(input.screenshotPath) : "missing",
      screenshotColorBuckets: input.visualSignal?.uniqueColorBuckets ?? "missing",
      screenshotDarkPixelRatio: input.visualSignal ? formatRatio(input.visualSignal.darkPixelRatio) : "missing",
      screenshotLightPixelRatio: input.visualSignal ? formatRatio(input.visualSignal.lightPixelRatio) : "missing",
      screenshotAccentPixelRatio: input.visualSignal ? formatRatio(input.visualSignal.accentPixelRatio) : "missing",
      captureMode: input.captureMetadata?.captureMode ?? "missing",
      captureCommand: input.captureMetadata?.command ?? "missing",
      captureWindowId: input.captureMetadata?.bounds?.windowId ?? "none",
      captureBounds: input.captureMetadata?.bounds ? formatCaptureBounds(input.captureMetadata.bounds) : "none",
      captureFallbackReason: input.captureMetadata?.fallbackReason ?? "none",
      preCaptureActions: input.captureMetadata?.preCaptureActions?.join(", ") || "none",
      computerUseOptional: computerUseHandoffExists ? "handoff-created" : "not-requested",
      computerUseHandoffPath: computerUseHandoffExists ? input.computerUseHandoffPath : "none",
      uiReviewSnapshotPath: existsSync(input.uiReviewSnapshotPath) ? input.uiReviewSnapshotPath : "missing"
    },
    healthOptions: {
      label: "Nightly visual harness",
      requiredRuntimeEvents: input.requiresPreviewRender ? ["preview.render.succeeded"] : [],
      requiredHarnessEvents: ["vscode.launch.ready", "artifact.screenshot.captured", "artifact.debug-bundle.created"],
      allowedFailedRuntimeEvents: allowedFailedRuntimeEvents(input.requiresPreviewRender, input.allowsDiagnosticFailures)
    }
  });
}

function allowedFailedRuntimeEvents(requiresPreviewRender: boolean, allowsDiagnosticFailures: boolean): RuntimeLogEventName[] {
  if (requiresPreviewRender) {
    return allowsDiagnosticFailures ? ["validator.run.failed"] : [];
  }
  return allowsDiagnosticFailures
    ? ["validator.run.failed", "emitter.export.failed"]
    : ["emitter.export.failed"];
}

function formatCaptureBounds(bounds: NonNullable<NightlyVisualCaptureMetadata["bounds"]>): string {
  return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
}

function formatPngDimensions(path: string): string {
  const dimensions = readPngDimensions(path);
  return `${dimensions.width}x${dimensions.height}`;
}

function formatRatio(value: number): string {
  return value.toFixed(4);
}

function readPngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  if (bytes.length < 24) {
    return { width: 0, height: 0 };
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function copyIfExists(source: string, target: string): void {
  if (existsSync(source)) {
    if (source === target) {
      return;
    }
    copyFileSync(source, target);
    return;
  }
  writeFileSync(target, "", "utf8");
}

function readJsonIfExists(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
