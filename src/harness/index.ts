import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { inflateSync } from "node:zlib";
import { runTests } from "@vscode/test-electron";
import { createEditorState, parseGanttLossless } from "../core";
import { parseRuntimeLogEvent, type RuntimeLogEvent } from "../logging";
export {
  createUiReviewReport,
  evaluateUiReviewSnapshot,
  resultForUiReviewChecks,
  type UiReviewCheck,
  type UiReviewGeometry,
  type UiReviewReport,
  type UiReviewResult,
  type UiReviewScenarioResult,
  type UiReviewSnapshot
} from "./ui-review";

const execFileAsync = promisify(execFile);

export type HarnessMode = "headless" | "nightly-visual";

export interface HarnessConfig {
  workspacePath: string;
  runId: string;
  mode: HarnessMode;
  artifactRoot: string;
  runtimeJsonlPath: string;
  harnessJsonlPath: string;
  vscodeLaunchProfile: "debug-f5";
  screenshotPolicy: "never" | "on-failure" | "always";
}

export interface ScenarioSpec {
  id: string;
  fixture: string;
  expectedMode: "structured" | "fallback";
  steps: ScenarioStep[];
  assertions: AssertionSpec[];
}

export type ScenarioStep =
  | { id: string; type: "open-fixture" }
  | { id: string; type: "run-command"; command: string; args?: unknown[] };

export type AssertionSpec =
  | { type: "mode"; expected: "structured" | "fallback" }
  | { type: "diagnostic"; code: string; minCount?: number }
  | { type: "preview-source"; expected: "available" | "blocked" };

export interface PngVisualSignal {
  width: number;
  height: number;
  sampledPixels: number;
  uniqueColorBuckets: number;
  darkPixelRatio: number;
  lightPixelRatio: number;
  accentPixelRatio: number;
}

export interface PngVisualSignalThresholds {
  minUniqueColorBuckets?: number;
  minDarkPixelRatio?: number;
  minLightPixelRatio?: number;
  minAccentPixelRatio?: number;
}

export interface NightlyVisualCaptureMetadata {
  captureMode: "active-window" | "full-screen-fallback";
  command: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    windowId?: number;
    title?: string;
    processName?: string;
  };
  fallbackReason?: string;
  preCaptureActions?: string[];
  startedAt: string;
  finishedAt: string;
}

export interface NightlyVisualScreenshotArtifactAcceptanceInput {
  screenshotPath: string;
  captureMetadataPath: string;
  platform?: NodeJS.Platform;
  previewCollapsed?: boolean;
  visualSignalThresholds?: PngVisualSignalThresholds;
}

export interface NightlyVisualScreenshotArtifactAcceptance {
  captureMetadata?: NightlyVisualCaptureMetadata;
  visualSignal?: PngVisualSignal;
}

export interface HarnessRunResult {
  runId: string;
  scenarioId: string;
  outcome: "passed" | "failed" | "blocked";
  failureClass?: string;
  artifactRoot: string;
}

export type HarnessEventName =
  | "harness.run.started"
  | "harness.run.finished"
  | "vscode.launch.started"
  | "vscode.launch.ready"
  | "vscode.launch.failed"
  | "command.exec.started"
  | "command.exec.finished"
  | "command.exec.failed"
  | "log.collect.started"
  | "log.collect.finished"
  | "artifact.screenshot.captured"
  | "artifact.debug-bundle.created"
  | "computer-use.handoff.created"
  | "computer-use.session.started"
  | "computer-use.session.finished";

export interface HarnessEvent {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  event: HarnessEventName;
  runId: string;
  scenarioId: string;
  stepId?: string;
  tool?: "vscode" | "computer-use" | "macos";
  target?: string;
  outcome?: "started" | "succeeded" | "failed";
  artifactPath?: string;
}

export interface HarnessLogValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ScenarioSpecValidationResult {
  ok: boolean;
  errors: string[];
}

export interface HarnessScenarioManifest {
  nightlyVisual: string[];
}

export interface HarnessScenarioManifestValidationResult {
  ok: boolean;
  errors: string[];
}

export type HarnessLogSink = (event: HarnessEvent) => void | Promise<void>;

export interface VSCodeHostControllerOptions {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  version?: string;
  vscodeExecutablePath?: string;
  enableTestCommands?: boolean;
  extraLaunchArgs?: string[];
  extensionTestsEnv?: Record<string, string>;
}

export type VSCodeHostLaunchPlan = Parameters<typeof runTests>[0];
export type VSCodeHostRunner = (plan: VSCodeHostLaunchPlan) => Promise<number>;

export interface PreparedHarnessWorkspace {
  workspacePath: string;
  fixturePath: string;
  relativeFixturePath: string;
  metadataPath: string;
}

export interface VSCodeCommandExecution {
  stepId: string;
  command: string;
  args?: unknown[];
  target?: string;
}

export type VSCodeCommandRunner = (execution: VSCodeCommandExecution) => Promise<unknown>;

export interface VSCodeEditorStateSnapshot {
  activeDocumentUri?: string;
  languageId?: string;
  text?: string;
  selectionStartOffset?: number;
  selectionEndOffset?: number;
  mode?: "structured" | "fallback";
  diagnosticCodes?: string[];
}

export type VSCodeEditorStateObserver = () => Promise<VSCodeEditorStateSnapshot>;

export interface VSCodeHostScenarioCommandTraceEntry {
  stepId: string;
  command: string;
  args?: unknown[];
  target?: string;
}

export interface VSCodeHostScenarioCommandTrace {
  scenarioId: string;
  commands: VSCodeHostScenarioCommandTraceEntry[];
}

export interface VSCodeHostScenarioBridgeOptions {
  commandTracePath: string;
  editorSnapshotPath: string;
  hostRunner?: VSCodeHostRunner;
}

export interface VSCodeHarnessScenarioResult extends HarnessRunResult {
  preparedWorkspace: PreparedHarnessWorkspace;
  editorState?: VSCodeEditorStateSnapshot;
}

export interface VSCodeHarnessScenarioControllerDependencies {
  hostRunner?: VSCodeHostRunner;
  commandRunner: VSCodeCommandRunner;
  editorObserver?: VSCodeEditorStateObserver;
}

export interface NightlyVisualHarnessOptions {
  manifestPath: string;
  hostOptions: VSCodeHostControllerOptions;
  dependencies: VSCodeHarnessScenarioControllerDependencies;
  macosRunner?: MacOSCommandRunner;
  sink?: HarnessLogSink;
}

export interface NightlyVisualHarnessResult {
  runId: string;
  scenarios: VSCodeHarnessScenarioResult[];
  visualDebugPlans: VisualDebugPlan[];
}

export interface RuntimeHarnessLogJoin {
  runId: string;
  runtimeEvents: RuntimeLogEvent[];
  harnessEvents: HarnessEvent[];
  runtimeEventCounts: Record<string, number>;
  harnessEventCounts: Record<string, number>;
  failedRuntimeEvents: RuntimeLogEvent[];
  failedHarnessEvents: HarnessEvent[];
}

export interface RuntimeHarnessLogIndex {
  runId: string;
  runtimeEventCounts: Record<string, number>;
  harnessEventCounts: Record<string, number>;
  failedRuntimeEvents: string[];
  failedHarnessEvents: string[];
}

export interface RuntimeHarnessLogHealthOptions {
  label?: string;
  requiredRuntimeEvents?: RuntimeLogEvent["event"][];
  requiredHarnessEvents?: HarnessEventName[];
  allowedFailedRuntimeEvents?: RuntimeLogEvent["event"][];
}

export interface HarnessDebugBundleInput {
  artifactRoot: string;
  config: HarnessConfig;
  scenario: ScenarioSpec;
  workspaceState: Record<string, unknown>;
  commandTrace: Record<string, unknown>;
  outcome: HarnessRunResult["outcome"];
  failureClass?: string;
  failureMessages?: string[];
  summaryTitle?: string;
  summaryFields?: Record<string, string | number | boolean | null | undefined>;
  healthOptions?: RuntimeHarnessLogHealthOptions;
}

export interface HarnessDebugBundleWriteResult {
  logJoin: RuntimeHarnessLogJoin;
  logIndex: RuntimeHarnessLogIndex;
}

export interface VisualDebugPlan {
  shouldCaptureScreenshot: boolean;
  reason: "policy-always" | "visual-failure" | "not-required";
  captureMode: "active-window";
  screenshotsDir: string;
  screenshotPath: string;
  preferredMacosCommands: string[][];
  fallbackMacosCommands: string[][];
  macosCommands: string[][];
}

export type MacOSCommandRunner = (command: string[]) => Promise<void>;
export const MACOS_DEBUG_AID_COMMANDS = [
  "open",
  "osascript",
  "screencapture",
  "mdls",
  "plutil",
  "ps",
  "pkill",
  "log"
] as const;

export function createHarnessEvent(
  input: Omit<HarnessEvent, "ts"> & { ts?: string },
  now: () => Date = () => new Date()
): HarnessEvent {
  const event = {
    ...input,
    ts: input.ts ?? now().toISOString()
  };
  assertHarnessEvent(event);
  return event;
}

export function formatHarnessEvent(event: HarnessEvent): string {
  assertHarnessEvent(event);
  return JSON.stringify(event);
}

export function parseHarnessEvent(line: string): HarnessEvent {
  const event = JSON.parse(line) as HarnessEvent;
  assertHarnessEvent(event);
  return event;
}

export function validateHarnessEvent(value: unknown): HarnessLogValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["event must be an object"] };
  }
  const event = value as Partial<HarnessEvent>;
  requireString(event.ts, "ts", errors);
  if (typeof event.ts === "string" && Number.isNaN(Date.parse(event.ts))) {
    errors.push("ts must be an ISO-compatible timestamp");
  }
  requireEnum(event.level, "level", ["debug", "info", "warn", "error"], errors);
  requireEnum(event.event, "event", HARNESS_EVENT_NAMES, errors);
  requireString(event.runId, "runId", errors);
  requireString(event.scenarioId, "scenarioId", errors);
  optionalString(event.stepId, "stepId", errors);
  optionalEnum(event.tool, "tool", ["vscode", "computer-use", "macos"], errors);
  optionalString(event.target, "target", errors);
  optionalEnum(event.outcome, "outcome", ["started", "succeeded", "failed"], errors);
  optionalString(event.artifactPath, "artifactPath", errors);
  validateHarnessTaxonomy(event, errors);
  return { ok: errors.length === 0, errors };
}

export function assertHarnessEvent(value: unknown): asserts value is HarnessEvent {
  const result = validateHarnessEvent(value);
  if (!result.ok) {
    throw new Error(`Invalid harness event: ${result.errors.join("; ")}`);
  }
}

export function parseScenarioSpecJson(text: string): ScenarioSpec {
  const value = JSON.parse(text) as unknown;
  assertScenarioSpec(value);
  return value;
}

export function validateScenarioSpec(value: unknown): ScenarioSpecValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["scenario must be an object"] };
  }
  const scenario = value as Partial<ScenarioSpec>;
  requireString(scenario.id, "id", errors);
  requireString(scenario.fixture, "fixture", errors);
  requireEnum(scenario.expectedMode, "expectedMode", ["structured", "fallback"], errors);
  if (!Array.isArray(scenario.steps)) {
    errors.push("steps must be an array");
  } else {
    scenario.steps.forEach((step, index) => validateScenarioStep(step, `steps[${index}]`, errors));
  }
  if (!Array.isArray(scenario.assertions)) {
    errors.push("assertions must be an array");
  } else {
    scenario.assertions.forEach((assertion, index) => validateAssertionSpec(assertion, `assertions[${index}]`, errors));
  }
  return { ok: errors.length === 0, errors };
}

export function assertScenarioSpec(value: unknown): asserts value is ScenarioSpec {
  const result = validateScenarioSpec(value);
  if (!result.ok) {
    throw new Error(`Invalid scenario spec: ${result.errors.join("; ")}`);
  }
}

export function parseHarnessScenarioManifestJson(text: string): HarnessScenarioManifest {
  const value = JSON.parse(text) as unknown;
  assertHarnessScenarioManifest(value);
  return value;
}

export function validateHarnessScenarioManifest(value: unknown): HarnessScenarioManifestValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const manifest = value as Partial<HarnessScenarioManifest>;
  validateScenarioPathArray(manifest.nightlyVisual, "nightlyVisual", errors);
  return { ok: errors.length === 0, errors };
}

export function assertHarnessScenarioManifest(value: unknown): asserts value is HarnessScenarioManifest {
  const result = validateHarnessScenarioManifest(value);
  if (!result.ok) {
    throw new Error(`Invalid harness scenario manifest: ${result.errors.join("; ")}`);
  }
}

export async function loadNightlyVisualScenarioSpecs(
  manifestPath: string,
  workspacePath: string = process.cwd()
): Promise<ScenarioSpec[]> {
  const manifest = parseHarnessScenarioManifestJson(await readFile(manifestPath, "utf8"));
  return Promise.all(manifest.nightlyVisual.map(async (scenarioPath) => {
    const text = await readFile(join(workspacePath, scenarioPath), "utf8");
    return parseScenarioSpecJson(text);
  }));
}

export function createJsonlFileHarnessSink(path: string): HarnessLogSink {
  return async (event) => {
    await appendFile(path, `${formatHarnessEvent(event)}\n`, "utf8");
  };
}

export function createVSCodeHostLaunchPlan(
  config: HarnessConfig,
  options: VSCodeHostControllerOptions
): VSCodeHostLaunchPlan {
  const version = options.version ?? "1.117.0";
  const resolvedExecutable = options.vscodeExecutablePath ??
    resolveInstalledVSCodeExecutablePath(config.workspacePath, version);
  const extensionTestsEnv: Record<string, string> = {
    ...(options.extensionTestsEnv ?? {}),
    MERMAID_GANTT_RUNTIME_JSONL: config.runtimeJsonlPath,
    MERMAID_GANTT_RUN_ID: config.runId
  };
  if (options.enableTestCommands) {
    extensionTestsEnv.MERMAID_GANTT_ENABLE_TEST_COMMANDS = "1";
  }

  return {
    version,
    ...(resolvedExecutable ? { vscodeExecutablePath: resolvedExecutable } : {}),
    extensionDevelopmentPath: options.extensionDevelopmentPath,
    extensionTestsPath: options.extensionTestsPath,
    extensionTestsEnv,
    launchArgs: [
      ...(options.extraLaunchArgs ?? []),
      "--disable-extensions"
    ]
  };
}

export async function runVSCodeHostTestsWithFilteredOutput(plan: VSCodeHostLaunchPlan): Promise<number> {
  const restoreStdout = installKnownVSCodeHostNoiseFilter(process.stdout);
  const restoreStderr = installKnownVSCodeHostNoiseFilter(process.stderr);
  const releaseHostLock = await acquireFileLock("vscode-host.lock");
  try {
    return await runTests(plan);
  } finally {
    await releaseHostLock();
    restoreStdout();
    restoreStderr();
  }
}

export async function runVSCodeHostController(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id">,
  options: VSCodeHostControllerOptions,
  sink: HarnessLogSink = createJsonlFileHarnessSink(config.harnessJsonlPath),
  runner: VSCodeHostRunner = runVSCodeHostTestsWithFilteredOutput
): Promise<number> {
  const plan = createVSCodeHostLaunchPlan(config, options);
  const target = plan.vscodeExecutablePath ?? `download:${plan.version ?? "stable"}`;
  await sink(createHarnessEvent({
    level: "info",
    event: "vscode.launch.started",
    runId: config.runId,
    scenarioId: scenario.id,
    tool: "vscode",
    target,
    outcome: "started"
  }));
  let exitCode: number;
  try {
    exitCode = await runner(plan);
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "vscode.launch.failed",
      runId: config.runId,
      scenarioId: scenario.id,
      tool: "vscode",
      target,
      outcome: "failed"
    }));
    throw error;
  }
  if (exitCode !== 0) {
    await sink(createHarnessEvent({
      level: "error",
      event: "vscode.launch.failed",
      runId: config.runId,
      scenarioId: scenario.id,
      tool: "vscode",
      target,
      outcome: "failed"
    }));
    throw new Error(`VS Code host exited with code ${exitCode}.`);
  }
  await sink(createHarnessEvent({
    level: "info",
    event: "vscode.launch.ready",
    runId: config.runId,
    scenarioId: scenario.id,
    tool: "vscode",
    target,
    outcome: "succeeded"
  }));
  return exitCode;
}

export async function prepareHarnessWorkspace(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id" | "fixture">
): Promise<PreparedHarnessWorkspace> {
  const workspacePath = join(config.artifactRoot, config.runId, scenario.id, "workspace");
  const relativeFixturePath = scenario.fixture;
  const sourceFixturePath = join(config.workspacePath, scenario.fixture);
  const fixturePath = join(workspacePath, relativeFixturePath);
  const metadataPath = join(workspacePath, ".mermaid-gantt-scenario.json");

  await mkdir(dirname(fixturePath), { recursive: true });
  await copyFile(sourceFixturePath, fixturePath);
  await writeFile(metadataPath, JSON.stringify({
    runId: config.runId,
    scenarioId: scenario.id,
    fixture: relativeFixturePath
  }, null, 2), "utf8");

  return {
    workspacePath,
    fixturePath,
    relativeFixturePath,
    metadataPath
  };
}

export async function runVSCodeHarnessScenario(
  config: HarnessConfig,
  scenario: ScenarioSpec,
  options: VSCodeHostControllerOptions,
  dependencies: VSCodeHarnessScenarioControllerDependencies,
  sink: HarnessLogSink = createJsonlFileHarnessSink(config.harnessJsonlPath)
): Promise<VSCodeHarnessScenarioResult> {
  await sink(createHarnessEvent({
    level: "info",
    event: "harness.run.started",
    runId: config.runId,
    scenarioId: scenario.id,
    outcome: "started"
  }));
  try {
    const preparedWorkspace = await prepareHarnessWorkspace(config, scenario);
    await runVSCodeHostController(config, scenario, {
      ...options,
      extraLaunchArgs: [
        preparedWorkspace.workspacePath,
        ...(options.extraLaunchArgs ?? [])
      ]
    }, sink, dependencies.hostRunner ?? runVSCodeHostTestsWithFilteredOutput);

    for (const step of scenario.steps) {
      if (step.type === "open-fixture") {
        await runVSCodeCommandController(config, scenario, {
          stepId: step.id,
          command: "vscode.open",
          args: [preparedWorkspace.fixturePath],
          target: preparedWorkspace.fixturePath
        }, sink, dependencies.commandRunner);
        continue;
      }
      await runVSCodeCommandController(config, scenario, {
        stepId: step.id,
        command: step.command,
        args: step.args,
        target: step.command
      }, sink, dependencies.commandRunner);
    }

    const editorState = dependencies.editorObserver
      ? await observeVSCodeEditorStateController(config, scenario, "observe-editor-state", sink, dependencies.editorObserver)
      : undefined;

    await sink(createHarnessEvent({
      level: "info",
      event: "harness.run.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: "succeeded"
    }));

    return {
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: "passed",
      artifactRoot: join(config.artifactRoot, config.runId, scenario.id),
      preparedWorkspace,
      ...(editorState ? { editorState } : {})
    };
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "harness.run.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: "failed"
    }));
    throw error;
  }
}

export async function runNightlyVisualHarness(
  config: HarnessConfig,
  options: NightlyVisualHarnessOptions
): Promise<NightlyVisualHarnessResult> {
  if (config.mode !== "nightly-visual") {
    throw new Error("runNightlyVisualHarness requires config.mode to be nightly-visual.");
  }
  const sink = options.sink ?? createJsonlFileHarnessSink(config.harnessJsonlPath);
  const scenarios = await loadNightlyVisualScenarioSpecs(options.manifestPath, config.workspacePath);
  const results: VSCodeHarnessScenarioResult[] = [];
  const visualDebugPlans: VisualDebugPlan[] = [];

  for (const scenario of scenarios) {
    const result = await runVSCodeHarnessScenario(
      config,
      scenario,
      options.hostOptions,
      options.dependencies,
      sink
    );
    results.push(result);
    visualDebugPlans.push(await runVisualDebugIfNeeded(
      config,
      scenario,
      result,
      sink,
      options.macosRunner
    ));
  }

  return {
    runId: config.runId,
    scenarios: results,
    visualDebugPlans
  };
}

export async function runVSCodeCommandController(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id">,
  execution: VSCodeCommandExecution,
  sink: HarnessLogSink,
  runner: VSCodeCommandRunner
): Promise<unknown> {
  const target = execution.target ?? execution.command;
  await sink(createHarnessEvent({
    level: "info",
    event: "command.exec.started",
    runId: config.runId,
    scenarioId: scenario.id,
    stepId: execution.stepId,
    tool: "vscode",
    target,
    outcome: "started"
  }));
  try {
    const result = await runner(execution);
    await sink(createHarnessEvent({
      level: "info",
      event: "command.exec.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId: execution.stepId,
      tool: "vscode",
      target,
      outcome: "succeeded"
    }));
    return result;
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "command.exec.failed",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId: execution.stepId,
      tool: "vscode",
      target,
      outcome: "failed"
    }));
    throw error;
  }
}

export function createVSCodeHostScenarioBridgeDependencies(
  options: VSCodeHostScenarioBridgeOptions
): VSCodeHarnessScenarioControllerDependencies {
  return {
    ...(options.hostRunner ? { hostRunner: options.hostRunner } : {}),
    commandRunner: async (execution) => {
      const trace = await readVSCodeHostScenarioCommandTrace(options.commandTracePath);
      const match = trace.commands.find((command) => {
        return command.stepId === execution.stepId && command.command === execution.command;
      });
      if (!match) {
        throw new Error(`VS Code host scenario trace does not contain command ${execution.stepId}:${execution.command}.`);
      }
      return match;
    },
    editorObserver: async () => {
      return readVSCodeHostScenarioEditorSnapshot(options.editorSnapshotPath);
    }
  };
}

export async function readVSCodeHostScenarioCommandTrace(path: string): Promise<VSCodeHostScenarioCommandTrace> {
  const trace = JSON.parse(await readFile(path, "utf8")) as VSCodeHostScenarioCommandTrace;
  if (!trace || typeof trace !== "object" || typeof trace.scenarioId !== "string" || !Array.isArray(trace.commands)) {
    throw new Error("Invalid VS Code host scenario command trace.");
  }
  for (const [index, command] of trace.commands.entries()) {
    if (!command || typeof command !== "object" || typeof command.stepId !== "string" || typeof command.command !== "string") {
      throw new Error(`Invalid VS Code host scenario command trace entry at ${index}.`);
    }
  }
  return trace;
}

export async function readVSCodeHostScenarioEditorSnapshot(path: string): Promise<VSCodeEditorStateSnapshot> {
  const snapshot = JSON.parse(await readFile(path, "utf8")) as VSCodeEditorStateSnapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid VS Code host scenario editor snapshot.");
  }
  return snapshot;
}

export async function observeVSCodeEditorStateController(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id">,
  stepId: string,
  sink: HarnessLogSink,
  observer: VSCodeEditorStateObserver
): Promise<VSCodeEditorStateSnapshot> {
  await sink(createHarnessEvent({
    level: "info",
    event: "command.exec.started",
    runId: config.runId,
    scenarioId: scenario.id,
    stepId,
    tool: "vscode",
    target: "editor-state",
    outcome: "started"
  }));
  try {
    const snapshot = await observer();
    await sink(createHarnessEvent({
      level: "info",
      event: "command.exec.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId,
      tool: "vscode",
      target: "editor-state",
      outcome: "succeeded"
    }));
    return snapshot;
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "command.exec.failed",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId,
      tool: "vscode",
      target: "editor-state",
      outcome: "failed"
    }));
    throw error;
  }
}

export function resolveInstalledVSCodeExecutablePath(workspacePath: string, version: string): string | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidate = join(
    workspacePath,
    ".vscode-test",
    `vscode-darwin-${arch}-${version}`,
    "Visual Studio Code.app",
    "Contents",
    "MacOS",
    "Code"
  );
  return existsSync(candidate) ? candidate : undefined;
}

export function filterKnownVSCodeHostNoise(text: string): string {
  return text
    .split(/(?<=\n)/)
    .filter((line) => {
      return !line.includes("CrossAppIPC: Failed to get peer bundle ID") &&
        !line.includes("CrossAppIPCService: connecting to peer") &&
        !line.includes("[DEP0040] DeprecationWarning: The `punycode` module is deprecated.") &&
        !line.includes("Use `Code Helper (Plugin) --trace-deprecation") &&
        !line.includes("task_policy_set TASK_CATEGORY_POLICY") &&
        !line.includes("task_policy_set TASK_SUPPRESSION_POLICY") &&
        !line.includes("Blocked vscode-webview request vscode-webview://") &&
        !line.includes("Settings Sync: Account status changed from uninitialized to unavailable");
    })
    .join("");
}

export function installKnownVSCodeHostNoiseFilter(stream: NodeJS.WriteStream): () => void {
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    const filtered = filterKnownVSCodeHostNoise(text);
    if (filtered !== text) {
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (filtered.length === 0) {
        cb?.();
        return true;
      }
      if (typeof encodingOrCallback === "function") {
        return originalWrite(filtered, encodingOrCallback);
      }
      return originalWrite(filtered, encodingOrCallback, callback);
    }
    if (typeof encodingOrCallback === "function") {
      return originalWrite(chunk, encodingOrCallback);
    }
    return originalWrite(chunk, encodingOrCallback, callback);
  }) as typeof stream.write;
  return () => {
    stream.write = originalWrite as typeof stream.write;
  };
}

export async function collectRuntimeHarnessLogs(input: {
  runId: string;
  runtimeJsonlPath: string;
  harnessJsonlPath: string;
}): Promise<RuntimeHarnessLogJoin> {
  const runtimeEvents = (await readJsonlIfAvailable(input.runtimeJsonlPath, parseRuntimeLogEvent))
    .filter((event) => event.runId === input.runId);
  const harnessEvents = (await readJsonlIfAvailable(input.harnessJsonlPath, parseHarnessEvent))
    .filter((event) => event.runId === input.runId);

  return {
    runId: input.runId,
    runtimeEvents,
    harnessEvents,
    runtimeEventCounts: countByEventName(runtimeEvents),
    harnessEventCounts: countByEventName(harnessEvents),
    failedRuntimeEvents: runtimeEvents.filter((event) => event.outcome === "failed"),
    failedHarnessEvents: harnessEvents.filter((event) => event.outcome === "failed")
  };
}

export function createRuntimeHarnessLogIndex(summary: RuntimeHarnessLogJoin): RuntimeHarnessLogIndex {
  return {
    runId: summary.runId,
    runtimeEventCounts: summary.runtimeEventCounts,
    harnessEventCounts: summary.harnessEventCounts,
    failedRuntimeEvents: summary.failedRuntimeEvents.map((event) => event.event),
    failedHarnessEvents: summary.failedHarnessEvents.map((event) => event.event)
  };
}

export async function writeRuntimeHarnessLogIndex(
  artifactRoot: string,
  summary: RuntimeHarnessLogJoin
): Promise<RuntimeHarnessLogIndex> {
  const index = createRuntimeHarnessLogIndex(summary);
  await writeFile(join(artifactRoot, "log-index.json"), JSON.stringify(index, null, 2), "utf8");
  return index;
}

export async function writeHarnessDebugBundle(input: HarnessDebugBundleInput): Promise<HarnessDebugBundleWriteResult> {
  await mkdir(join(input.artifactRoot, "screenshots"), { recursive: true });
  await writeFile(join(input.artifactRoot, "scenario.json"), JSON.stringify(input.scenario, null, 2), "utf8");
  await writeFile(join(input.artifactRoot, "workspace-state.json"), JSON.stringify(input.workspaceState, null, 2), "utf8");
  await writeFile(join(input.artifactRoot, "command-trace.json"), JSON.stringify(input.commandTrace, null, 2), "utf8");
  await copyRuntimeJsonlIfAvailable(input.config.runtimeJsonlPath, join(input.artifactRoot, "runtime.jsonl"));
  await copyRuntimeJsonlIfAvailable(input.config.harnessJsonlPath, join(input.artifactRoot, "harness.jsonl"));
  const logJoin = await collectRuntimeHarnessLogs({
    runId: input.config.runId,
    runtimeJsonlPath: input.config.runtimeJsonlPath,
    harnessJsonlPath: input.config.harnessJsonlPath
  });
  const logIndex = await writeRuntimeHarnessLogIndex(input.artifactRoot, logJoin);
  await writeFile(join(input.artifactRoot, "summary.md"), formatHarnessDebugBundleSummary(input, logJoin), "utf8");
  if (input.healthOptions) {
    assertRuntimeHarnessLogJoinHealthy(logJoin, input.healthOptions);
  }
  return { logJoin, logIndex };
}

export function assertRuntimeHarnessLogJoinHealthy(
  summary: RuntimeHarnessLogJoin,
  options: RuntimeHarnessLogHealthOptions = {}
): void {
  const missingRuntimeEvents = (options.requiredRuntimeEvents ?? [])
    .filter((event) => (summary.runtimeEventCounts[event] ?? 0) === 0);
  const missingHarnessEvents = (options.requiredHarnessEvents ?? [])
    .filter((event) => (summary.harnessEventCounts[event] ?? 0) === 0);
  const allowedFailedRuntimeEvents = new Set(options.allowedFailedRuntimeEvents ?? []);
  const failedRuntimeEvents = summary.failedRuntimeEvents
    .filter((event) => !allowedFailedRuntimeEvents.has(event.event));

  if (
    failedRuntimeEvents.length === 0 &&
    summary.failedHarnessEvents.length === 0 &&
    missingRuntimeEvents.length === 0 &&
    missingHarnessEvents.length === 0
  ) {
    return;
  }

  const label = options.label ?? "Runtime/harness log join";
  throw new Error([
    `${label} recorded unhealthy events.`,
    `runtimeFailures=${failedRuntimeEvents.map((event) => event.event).join(",") || "none"}`,
    `harnessFailures=${summary.failedHarnessEvents.map((event) => event.event).join(",") || "none"}`,
    `missingRuntime=${missingRuntimeEvents.join(",") || "none"}`,
    `missingHarness=${missingHarnessEvents.join(",") || "none"}`
  ].join(" "));
}

export function createVisualDebugPlan(config: HarnessConfig, result: HarnessRunResult): VisualDebugPlan {
  const screenshotsDir = join(result.artifactRoot, "screenshots");
  const screenshotPath = join(screenshotsDir, "screen-1.png");
  const reason = visualDebugReason(config, result);
  return {
    shouldCaptureScreenshot: reason !== "not-required",
    reason,
    captureMode: "active-window",
    screenshotsDir,
    screenshotPath,
    preferredMacosCommands: reason === "not-required"
      ? []
      : [["screencapture", "-x", "-o", "-l", "<active-window-id>", screenshotPath]],
    fallbackMacosCommands: reason === "not-required"
      ? []
      : [["screencapture", "-x", screenshotPath]],
    macosCommands: reason === "not-required"
      ? []
      : [["screencapture", "-x", screenshotPath]]
  };
}

export async function collectVisualDebugArtifacts(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id">,
  plan: VisualDebugPlan,
  sink: HarnessLogSink,
  runner: MacOSCommandRunner
): Promise<void> {
  if (!plan.shouldCaptureScreenshot) {
    return;
  }
  await mkdir(plan.screenshotsDir, { recursive: true });
  await sink(createHarnessEvent({
    level: "info",
    event: "computer-use.session.started",
    runId: config.runId,
    scenarioId: scenario.id,
    tool: "computer-use",
    target: plan.reason,
    outcome: "started"
  }));
  try {
    for (const command of plan.macosCommands) {
      try {
        await runner(command);
        await sink(createHarnessEvent({
          level: "info",
          event: "artifact.screenshot.captured",
          runId: config.runId,
          scenarioId: scenario.id,
          tool: "macos",
          target: command.join(" "),
          outcome: "succeeded",
          artifactPath: plan.screenshotPath
        }));
      } catch (error) {
        await sink(createHarnessEvent({
          level: "error",
          event: "artifact.screenshot.captured",
          runId: config.runId,
          scenarioId: scenario.id,
          tool: "macos",
          target: command.join(" "),
          outcome: "failed",
          artifactPath: plan.screenshotPath
        }));
        throw error;
      }
    }
    await sink(createHarnessEvent({
      level: "info",
      event: "computer-use.session.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      tool: "computer-use",
      target: plan.reason,
      outcome: "succeeded"
    }));
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "computer-use.session.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      tool: "computer-use",
      target: plan.reason,
      outcome: "failed"
    }));
    throw error;
  }
}

export async function runVisualDebugIfNeeded(
  config: HarnessConfig,
  scenario: Pick<ScenarioSpec, "id">,
  result: HarnessRunResult,
  sink: HarnessLogSink,
  runner: MacOSCommandRunner = createMacOSDebugAidRunner()
): Promise<VisualDebugPlan> {
  const plan = createVisualDebugPlan(config, result);
  await collectVisualDebugArtifacts(config, scenario, plan, sink, runner);
  return plan;
}

export function analyzePngVisualSignal(bytes: Uint8Array): PngVisualSignal {
  const signature = Buffer.from(bytes.subarray(0, 8));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(pngSignature)) {
    throw new Error("PNG visual signal requires a PNG byte stream.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  const buffer = Buffer.from(bytes);

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error("PNG visual signal found a truncated chunk.");
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  const channels = pngChannelCount(colorType);
  if (width <= 0 || height <= 0 || bitDepth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(`PNG visual signal supports non-interlaced 8-bit PNGs only: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  if (inflated.length < (rowBytes + 1) * height) {
    throw new Error("PNG visual signal found truncated image data.");
  }

  const rows = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (rowBytes + 1);
    const filter = inflated[sourceOffset] ?? 0;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[sourceOffset + 1 + x] ?? 0;
      const left = x >= channels ? rows[rowOffset + x - channels] ?? 0 : 0;
      const up = y > 0 ? rows[rowOffset + x - rowBytes] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? rows[rowOffset + x - rowBytes - channels] ?? 0 : 0;
      rows[rowOffset + x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
  }

  const buckets = new Set<string>();
  let darkPixels = 0;
  let lightPixels = 0;
  let accentPixels = 0;
  let sampledPixels = 0;
  const totalPixels = width * height;
  const sampleStep = Math.max(1, Math.floor(totalPixels / 50_000));
  for (let pixel = 0; pixel < totalPixels; pixel += sampleStep) {
    const base = pixel * channels;
    const { red, green, blue } = pngPixelRgb(rows, base, colorType);
    const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
    if (luminance < 48) {
      darkPixels += 1;
    }
    if (luminance > 215) {
      lightPixels += 1;
    }
    const isLegacyAccentControl = green > 135 && blue > 105 && red < 130 && green - red > 35;
    const isThemedBlueControl = blue >= 100
      && green >= 55
      && red >= 20
      && blue - red > 35
      && blue - green > 20
      && luminance >= 55
      && luminance <= 145;
    if (isLegacyAccentControl || isThemedBlueControl) {
      accentPixels += 1;
    }
    buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
    sampledPixels += 1;
  }

  return {
    width,
    height,
    sampledPixels,
    uniqueColorBuckets: buckets.size,
    darkPixelRatio: ratio(darkPixels, sampledPixels),
    lightPixelRatio: ratio(lightPixels, sampledPixels),
    accentPixelRatio: ratio(accentPixels, sampledPixels)
  };
}

export function validatePngVisualSignal(
  signal: PngVisualSignal,
  thresholds: PngVisualSignalThresholds = {}
): string[] {
  const minUniqueColorBuckets = thresholds.minUniqueColorBuckets ?? 16;
  const minDarkPixelRatio = thresholds.minDarkPixelRatio ?? 0.12;
  const minLightPixelRatio = thresholds.minLightPixelRatio ?? 0.03;
  const minAccentPixelRatio = thresholds.minAccentPixelRatio ?? 0.0005;
  const errors: string[] = [];
  if (signal.uniqueColorBuckets < minUniqueColorBuckets) {
    errors.push(`expected at least ${minUniqueColorBuckets} color buckets, got ${signal.uniqueColorBuckets}`);
  }
  if (signal.darkPixelRatio < minDarkPixelRatio) {
    errors.push(`expected dark UI pixels ratio >= ${minDarkPixelRatio}, got ${formatRatio(signal.darkPixelRatio)}`);
  }
  if (signal.lightPixelRatio < minLightPixelRatio) {
    errors.push(`expected light preview pixels ratio >= ${minLightPixelRatio}, got ${formatRatio(signal.lightPixelRatio)}`);
  }
  if (signal.accentPixelRatio < minAccentPixelRatio) {
    errors.push(`expected accent control pixels ratio >= ${minAccentPixelRatio}, got ${formatRatio(signal.accentPixelRatio)}`);
  }
  return errors;
}

export async function assertNightlyVisualScreenshotArtifact(
  input: NightlyVisualScreenshotArtifactAcceptanceInput
): Promise<NightlyVisualScreenshotArtifactAcceptance> {
  const platform = input.platform ?? process.platform;
  if (platform !== "darwin") {
    return {};
  }
  const captureMetadata = await readNightlyVisualCaptureMetadata(input.captureMetadataPath);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(input.screenshotPath);
  } catch {
    throw new Error(`nightly visual screenshot was not captured: ${input.screenshotPath}`);
  }
  if (bytes.length === 0) {
    throw new Error(`nightly visual screenshot is empty: ${input.screenshotPath}`);
  }
  assertPngSignature(bytes, input.screenshotPath);
  const dimensions = readPngDimensionsFromBytes(bytes);
  if (dimensions.width < 320 || dimensions.height < 240) {
    throw new Error(`nightly visual screenshot is too small: ${dimensions.width}x${dimensions.height}`);
  }
  if (captureMetadata.captureMode === "active-window" && (dimensions.width < 800 || dimensions.height < 600)) {
    throw new Error(`nightly visual active-window screenshot is too small: ${dimensions.width}x${dimensions.height}`);
  }
  const visualSignal = analyzePngVisualSignal(bytes);
  const errors = validatePngVisualSignal(visualSignal, {
    ...(input.previewCollapsed ? { minLightPixelRatio: 0.003 } : {}),
    ...(input.visualSignalThresholds ?? {})
  });
  if (errors.length > 0) {
    throw new Error(`nightly visual screenshot signal failed: ${errors.join("; ")}`);
  }
  return {
    captureMetadata,
    visualSignal
  };
}

export function createMacOSDebugAidRunner(
  allowedCommands: readonly string[] = MACOS_DEBUG_AID_COMMANDS
): MacOSCommandRunner {
  return async (command) => {
    const [binary, ...args] = command;
    if (!binary) {
      throw new Error("macOS debug aid command must not be empty.");
    }
    if (process.platform !== "darwin") {
      throw new Error("macOS debug aid runner is only available on macOS.");
    }
    if (!allowedCommands.includes(binary)) {
      throw new Error(`macOS debug aid command is not allowed: ${binary}`);
    }
    await execFileAsync(binary, args, { timeout: 30_000 });
  };
}

export async function runHeadlessHarnessScenario(
  config: HarnessConfig,
  scenario: ScenarioSpec,
  sink: HarnessLogSink = createJsonlFileHarnessSink(config.harnessJsonlPath)
): Promise<HarnessRunResult> {
  const scenarioArtifactRoot = join(config.artifactRoot, config.runId, scenario.id);
  await mkdir(scenarioArtifactRoot, { recursive: true });
  await sink(createHarnessEvent({
    level: "info",
    event: "harness.run.started",
    runId: config.runId,
    scenarioId: scenario.id,
    outcome: "started"
  }));

  const fixturePath = join(config.workspacePath, scenario.fixture);
  await sink(createHarnessEvent({
    level: "info",
    event: "command.exec.started",
    runId: config.runId,
    scenarioId: scenario.id,
    stepId: "open-fixture",
    tool: "vscode",
    target: fixturePath,
    outcome: "started"
  }));

  try {
    const source = await readFile(fixturePath, "utf8");
    const state = createEditorState(parseGanttLossless(source));
    const failures = evaluateAssertions(state, scenario);
    const outcome = failures.length === 0 ? "passed" : "failed";

    await sink(createHarnessEvent({
      level: "info",
      event: "log.collect.started",
      runId: config.runId,
      scenarioId: scenario.id,
      target: config.runtimeJsonlPath,
      outcome: "started"
    }));
    await copyRuntimeJsonlIfAvailable(config.runtimeJsonlPath, join(scenarioArtifactRoot, "runtime.jsonl"));
    await sink(createHarnessEvent({
      level: "info",
      event: "log.collect.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      target: config.runtimeJsonlPath,
      outcome: "succeeded"
    }));
    await sink(createHarnessEvent({
      level: "info",
      event: "command.exec.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId: "open-fixture",
      tool: "vscode",
      target: fixturePath,
      outcome: "succeeded"
    }));
    await sink(createHarnessEvent({
      level: "info",
      event: "artifact.debug-bundle.created",
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: "succeeded",
      artifactPath: scenarioArtifactRoot
    }));
    await sink(createHarnessEvent({
      level: outcome === "passed" ? "info" : "error",
      event: "harness.run.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: outcome === "passed" ? "succeeded" : "failed"
    }));
    await writeHarnessDebugBundle({
      artifactRoot: scenarioArtifactRoot,
      config,
      scenario,
      workspaceState: {
        workspacePath: config.workspacePath,
        fixture: scenario.fixture,
        fixtureName: basename(scenario.fixture),
        sourceLength: source.length,
        mode: state.mode
      },
      commandTrace: {
        steps: scenario.steps
      },
      outcome,
      ...(outcome === "failed" ? { failureClass: "assertion-failed" } : {}),
      failureMessages: failures,
      summaryTitle: `Harness Summary: ${scenario.id}`,
      summaryFields: {
        mode: state.mode
      }
    });
    return {
      runId: config.runId,
      scenarioId: scenario.id,
      outcome,
      ...(outcome === "failed" ? { failureClass: "assertion-failed" } : {}),
      artifactRoot: scenarioArtifactRoot
    };
  } catch (error) {
    await sink(createHarnessEvent({
      level: "error",
      event: "command.exec.failed",
      runId: config.runId,
      scenarioId: scenario.id,
      stepId: "open-fixture",
      tool: "vscode",
      target: fixturePath,
      outcome: "failed"
    }));
    await sink(createHarnessEvent({
      level: "error",
      event: "harness.run.finished",
      runId: config.runId,
      scenarioId: scenario.id,
      outcome: "failed"
    }));
    throw error;
  }
}

const HARNESS_EVENT_NAMES: HarnessEventName[] = [
  "harness.run.started",
  "harness.run.finished",
  "vscode.launch.started",
  "vscode.launch.ready",
  "vscode.launch.failed",
  "command.exec.started",
  "command.exec.finished",
  "command.exec.failed",
  "log.collect.started",
  "log.collect.finished",
  "artifact.screenshot.captured",
  "artifact.debug-bundle.created",
  "computer-use.handoff.created",
  "computer-use.session.started",
  "computer-use.session.finished"
];

function evaluateAssertions(
  state: ReturnType<typeof createEditorState>,
  scenario: ScenarioSpec
): string[] {
  const failures: string[] = [];
  if (state.mode !== scenario.expectedMode) {
    failures.push(`expected mode ${scenario.expectedMode}, got ${state.mode}`);
  }
  for (const assertion of scenario.assertions) {
    if (assertion.type === "mode" && state.mode !== assertion.expected) {
      failures.push(`expected mode ${assertion.expected}, got ${state.mode}`);
    }
    if (assertion.type === "diagnostic") {
      const count = state.diagnostics.filter((diagnostic) => diagnostic.code === assertion.code).length;
      if (count < (assertion.minCount ?? 1)) {
        failures.push(`expected diagnostic ${assertion.code}`);
      }
    }
    if (assertion.type === "preview-source") {
      const available = state.previewSource ? "available" : "blocked";
      if (available !== assertion.expected) {
        failures.push(`expected preview source ${assertion.expected}, got ${available}`);
      }
    }
  }
  return failures;
}

async function copyRuntimeJsonlIfAvailable(source: string, target: string): Promise<void> {
  try {
    await copyFile(source, target);
  } catch {
    await writeFile(target, "", "utf8");
  }
}

async function readJsonlIfAvailable<T>(path: string, parse: (line: string) => T): Promise<T[]> {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function countByEventName(events: Array<{ event: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.event] = (counts[event.event] ?? 0) + 1;
  }
  return counts;
}

function formatHarnessDebugBundleSummary(
  input: HarnessDebugBundleInput,
  logJoin: RuntimeHarnessLogJoin
): string {
  const failedRuntimeEvents = logJoin.failedRuntimeEvents.map((event) => event.event).join(", ") || "none";
  const failedHarnessEvents = logJoin.failedHarnessEvents.map((event) => event.event).join(", ") || "none";
  const summaryFields = Object.entries(input.summaryFields ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `- ${key}: ${value ?? "none"}`);
  return [
    `# ${input.summaryTitle ?? `Harness Summary: ${input.scenario.id}`}`,
    "",
    `- runId: ${input.config.runId}`,
    `- scenarioId: ${input.scenario.id}`,
    `- outcome: ${input.outcome}`,
    `- failureClass: ${input.failureClass ?? "none"}`,
    ...summaryFields,
    `- runtimeEvents: ${logJoin.runtimeEvents.length}`,
    `- harnessEvents: ${logJoin.harnessEvents.length}`,
    `- failedRuntimeEvents: ${failedRuntimeEvents}`,
    `- failedHarnessEvents: ${failedHarnessEvents}`,
    ...(input.failureMessages ?? []).map((failure) => `- failure: ${failure}`),
    ""
  ].join("\n");
}

function visualDebugReason(
  config: HarnessConfig,
  result: HarnessRunResult
): VisualDebugPlan["reason"] {
  if (config.screenshotPolicy === "never") {
    return "not-required";
  }
  if (config.screenshotPolicy === "always" && config.mode === "nightly-visual") {
    return "policy-always";
  }
  if (
    config.screenshotPolicy === "on-failure" &&
    result.outcome === "failed" &&
    (result.failureClass === "visual-ambiguity" || result.failureClass === "ui-divergence")
  ) {
    return "visual-failure";
  }
  return "not-required";
}

async function acquireFileLock(name: string): Promise<() => Promise<void>> {
  const lockRoot = join(".tmp");
  const lockDir = join(lockRoot, name);
  await mkdir(lockRoot, { recursive: true });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      await mkdir(lockDir);
      return async () => {
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      await setTimeout(100);
    }
  }
  throw new Error(`Timed out waiting for ${name}.`);
}

function validateHarnessTaxonomy(event: Partial<HarnessEvent>, errors: string[]): void {
  if (!event.event) {
    return;
  }
  if (event.event.startsWith("vscode.") || event.event.startsWith("command.")) {
    optionalEnum(event.tool, "tool", ["vscode"], errors);
  }
  if (event.event.startsWith("computer-use.")) {
    optionalEnum(event.tool, "tool", ["computer-use"], errors);
  }
}

function validateScenarioStep(value: unknown, path: string, errors: string[]): void {
  if (!value || typeof value !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  const step = value as Partial<ScenarioStep>;
  requireString(step.id, `${path}.id`, errors);
  requireEnum(step.type, `${path}.type`, ["open-fixture", "run-command"], errors);
  if (step.type === "run-command") {
    requireString((step as Partial<Extract<ScenarioStep, { type: "run-command" }>>).command, `${path}.command`, errors);
  }
}

function pngChannelCount(colorType: number): number {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 6) {
    return 4;
  }
  return 0;
}

function pngPixelRgb(rows: Uint8Array, base: number, colorType: number): { red: number; green: number; blue: number } {
  if (colorType === 0 || colorType === 4) {
    const gray = rows[base] ?? 0;
    return { red: gray, green: gray, blue: gray };
  }
  return {
    red: rows[base] ?? 0,
    green: rows[base + 1] ?? 0,
    blue: rows[base + 2] ?? 0
  };
}

async function readNightlyVisualCaptureMetadata(path: string): Promise<NightlyVisualCaptureMetadata> {
  let metadata: NightlyVisualCaptureMetadata;
  try {
    metadata = JSON.parse(await readFile(path, "utf8")) as NightlyVisualCaptureMetadata;
  } catch {
    throw new Error(`nightly visual capture metadata was not written: ${path}`);
  }
  if (metadata.captureMode !== "active-window" && metadata.captureMode !== "full-screen-fallback") {
    throw new Error(`nightly visual capture metadata has invalid mode: ${metadata.captureMode}`);
  }
  if (!metadata.command) {
    throw new Error("nightly visual capture metadata is missing command.");
  }
  return metadata;
}

function assertPngSignature(bytes: Uint8Array, path: string): void {
  const signature = Buffer.from(bytes.subarray(0, 8));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(pngSignature)) {
    throw new Error(`nightly visual screenshot is not a PNG: ${path}`);
  }
}

function readPngDimensionsFromBytes(bytes: Uint8Array): { width: number; height: number } {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 24) {
    return { width: 0, height: 0 };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) {
    return raw;
  }
  if (filter === 1) {
    return (raw + left) & 0xff;
  }
  if (filter === 2) {
    return (raw + up) & 0xff;
  }
  if (filter === 3) {
    return (raw + Math.floor((left + up) / 2)) & 0xff;
  }
  if (filter === 4) {
    return (raw + paethPredictor(left, up, upLeft)) & 0xff;
  }
  throw new Error(`PNG visual signal found unsupported filter: ${filter}`);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function formatRatio(value: number): string {
  return value.toFixed(4);
}

function validateAssertionSpec(value: unknown, path: string, errors: string[]): void {
  if (!value || typeof value !== "object") {
    errors.push(`${path} must be an object`);
    return;
  }
  const assertion = value as Partial<AssertionSpec>;
  requireEnum(assertion.type, `${path}.type`, ["mode", "diagnostic", "preview-source"], errors);
  if (assertion.type === "mode") {
    requireEnum((assertion as Partial<Extract<AssertionSpec, { type: "mode" }>>).expected, `${path}.expected`, ["structured", "fallback"], errors);
  }
  if (assertion.type === "diagnostic") {
    requireString((assertion as Partial<Extract<AssertionSpec, { type: "diagnostic" }>>).code, `${path}.code`, errors);
  }
  if (assertion.type === "preview-source") {
    requireEnum((assertion as Partial<Extract<AssertionSpec, { type: "preview-source" }>>).expected, `${path}.expected`, ["available", "blocked"], errors);
  }
}

function validateScenarioPathArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      errors.push(`${path}[${index}] must be a non-empty string`);
      return;
    }
    if (seen.has(entry)) {
      errors.push(`${path}[${index}] must be unique`);
    }
    seen.add(entry);
  });
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

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[], errors: string[]): void {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[], errors: string[]): void {
  if (value !== undefined && (typeof value !== "string" || !allowed.includes(value as T))) {
    errors.push(`${field} must be one of: ${allowed.join(", ")} when present`);
  }
}
