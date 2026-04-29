#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const scenarioAliases = new Map([
  ["smoke", { path: "fixtures/harness/nightly-visual-smoke/scenario.json" }],
  ["task-grid", { path: "fixtures/harness/nightly-visual-smoke/scenario.json" }],
  ["nightly-visual-smoke", { path: "fixtures/harness/nightly-visual-smoke/scenario.json" }],
  ["task-grid-no-tags", { path: "fixtures/harness/nightly-visual-task-grid-no-tags/scenario.json" }],
  ["nightly-visual-task-grid-no-tags", { path: "fixtures/harness/nightly-visual-task-grid-no-tags/scenario.json" }],
  ["diagnostics", { path: "fixtures/harness/nightly-visual-diagnostics/scenario.json" }],
  ["quick-fix", { path: "fixtures/harness/nightly-visual-diagnostics/scenario.json" }],
  ["nightly-visual-diagnostics", { path: "fixtures/harness/nightly-visual-diagnostics/scenario.json" }],
  ["fallback", { path: "fixtures/harness/nightly-visual-fallback/scenario.json" }],
  ["nightly-visual-fallback", { path: "fixtures/harness/nightly-visual-fallback/scenario.json" }],
  ["advanced", { path: "fixtures/harness/nightly-visual-limited-editing/scenario.json" }],
  ["limited-editing", { path: "fixtures/harness/nightly-visual-limited-editing/scenario.json" }],
  ["nightly-visual-limited-editing", { path: "fixtures/harness/nightly-visual-limited-editing/scenario.json" }],
  ["preview-resize", { path: "fixtures/harness/nightly-visual-preview-resize/scenario.json" }],
  ["nightly-visual-preview-resize", { path: "fixtures/harness/nightly-visual-preview-resize/scenario.json" }],
  ["preview-pan", {
    path: "fixtures/harness/nightly-visual-preview-pan/scenario.json",
    env: {
      MERMAID_GANTT_TEST_PREVIEW_FOCUSED: "1",
      MERMAID_GANTT_TEST_PREVIEW_ZOOM: "1.5"
    }
  }],
  ["nightly-visual-preview-pan", {
    path: "fixtures/harness/nightly-visual-preview-pan/scenario.json",
    env: {
      MERMAID_GANTT_TEST_PREVIEW_FOCUSED: "1",
      MERMAID_GANTT_TEST_PREVIEW_ZOOM: "1.5"
    }
  }],
  ["ja-responsive", {
    path: "fixtures/harness/nightly-visual-ja-responsive/scenario.json",
    env: {
      MERMAID_GANTT_TEST_RESPONSIVE_MODE: "narrow",
      MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
      MERMAID_GANTT_TEST_DETAIL_TAB: "inspector",
      MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU: "1",
      MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU: "1"
    }
  }],
  ["nightly-visual-ja-responsive", {
    path: "fixtures/harness/nightly-visual-ja-responsive/scenario.json",
    env: {
      MERMAID_GANTT_TEST_RESPONSIVE_MODE: "narrow",
      MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
      MERMAID_GANTT_TEST_DETAIL_TAB: "inspector",
      MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU: "1",
      MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU: "1"
    }
  }]
]);

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage(2);
}
if (options.help) {
  printUsage(0);
}
if (!options.scenario || !options.id) {
  printUsage(2);
}

const scenario = scenarioAliases.get(options.scenario) ?? { path: options.scenario, env: {} };
const result = spawnSync("pnpm", ["run", "review:ui:llm:scenario"], {
  cwd: root,
  env: {
    ...process.env,
    ...(scenario.env ?? {}),
    MERMAID_GANTT_NIGHTLY_SCENARIO_PATH: scenario.path,
    MERMAID_GANTT_UI_REVIEW_ID: options.id
  },
  stdio: "inherit"
});

process.exit(result.status ?? 1);

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--scenario") {
      options.scenario = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--id") {
      options.id = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function requireValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function printUsage(exitCode) {
  console.log([
    "Usage: pnpm run review:ui:feature -- --scenario <scenario-id-or-path> --id <feature-id>",
    "",
    "Scenario aliases:",
    "  task-grid | smoke | nightly-visual-smoke",
    "  task-grid-no-tags | nightly-visual-task-grid-no-tags",
    "  diagnostics | quick-fix | nightly-visual-diagnostics",
    "  fallback | nightly-visual-fallback",
    "  advanced | limited-editing | nightly-visual-limited-editing",
    "  preview-resize | nightly-visual-preview-resize",
    "  preview-pan | nightly-visual-preview-pan",
    "  ja-responsive | nightly-visual-ja-responsive",
    "",
    "Examples:",
    "  pnpm run review:ui:feature -- --scenario task-grid --id preview-pan",
    "  pnpm run review:ui:feature -- --scenario fixtures/harness/nightly-visual-smoke/scenario.json --id custom-control"
  ].join("\n"));
  process.exit(exitCode);
}
