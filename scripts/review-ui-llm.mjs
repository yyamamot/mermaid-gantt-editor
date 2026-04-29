#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const singleScenario = process.argv.includes("--single");
const runId = `ui-review-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const reviewRoot = join(root, ".tmp", "ui-review-pack", runId);
const scenariosRoot = join(reviewRoot, "scenarios");
const screenshotsRoot = join(reviewRoot, "screenshots");

const scenarioMatrix = singleScenario
  ? [{
      id: process.env.MERMAID_GANTT_UI_REVIEW_ID || "single",
      scenarioPath: process.env.MERMAID_GANTT_NIGHTLY_SCENARIO_PATH || "fixtures/harness/nightly-visual-smoke/scenario.json",
      env: envFromCurrentProcess()
    }]
  : [
      {
        id: "structured-basic",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: { MERMAID_GANTT_TEST_DETAIL_TAB: "settings" }
      },
      {
        id: "details-inspector",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "inspector"
        }
      },
      {
        id: "diagnostics-quick-fix",
        scenarioPath: "fixtures/harness/nightly-visual-diagnostics/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "diagnostics"
        }
      },
      {
        id: "fallback-mode",
        scenarioPath: "fixtures/harness/nightly-visual-fallback/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "source"
        }
      },
      {
        id: "limited-editing",
        scenarioPath: "fixtures/harness/nightly-visual-limited-editing/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "advanced"
        }
      },
      {
        id: "row-action-menu",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: {
          MERMAID_GANTT_TEST_DETAIL_TAB: "settings",
          MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU: "1"
        }
      },
      {
        id: "dependency-picker",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "inspector"
        }
      },
      {
        id: "preview-collapsed",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: { MERMAID_GANTT_TEST_DETAIL_TAB: "settings", MERMAID_GANTT_TEST_PREVIEW_COLLAPSED: "1" }
      },
      {
        id: "ja-responsive",
        scenarioPath: "fixtures/harness/nightly-visual-ja-responsive/scenario.json",
        env: {
          MERMAID_GANTT_TEST_OPEN_DETAILS: "1",
          MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU: "1",
          MERMAID_GANTT_TEST_DETAIL_TAB: "inspector",
          MERMAID_GANTT_TEST_RESPONSIVE_MODE: "narrow",
          MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU: "1"
        }
      },
      {
        id: "vertical-layout",
        scenarioPath: "fixtures/harness/nightly-visual-smoke/scenario.json",
        env: { MERMAID_GANTT_TEST_WEBVIEW_LAYOUT: "vertical", MERMAID_GANTT_TEST_DETAIL_TAB: "settings" }
      }
    ];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  mkdirSync(reviewRoot, { recursive: true });
  mkdirSync(scenariosRoot, { recursive: true });
  mkdirSync(screenshotsRoot, { recursive: true });

  run("pnpm", ["run", "build"]);
  run("pnpm", ["run", "build:test"]);
  const uiReview = await import(pathToFileURL(join(root, "out", "src", "harness", "ui-review.js")).href);

  const scenarioResults = [];
  const aggregateSelfReview = {};
  const aggregateGeometry = {};
  const aggregateWorkspaceState = {};
  const aggregateCommandTrace = {};
  const runtimeJsonl = [];
  const harnessJsonl = [];
  for (const scenario of scenarioMatrix) {
    console.log(`\n[ui-review] running ${scenario.id}`);
    const nightly = run("pnpm", ["run", "test:nightly:visual"], {
      ...process.env,
      ...scenario.env,
      MERMAID_GANTT_RUN_NIGHTLY_VISUAL: "1",
      MERMAID_GANTT_NIGHTLY_SCENARIO_PATH: scenario.scenarioPath
    });
    const artifactRoot = parseNightlyArtifactRoot(nightly.stdout);
    const actualScenarioRoot = findScenarioArtifactRoot(artifactRoot, scenario.scenarioPath);
    if (!actualScenarioRoot) {
      throw new Error(`Could not find scenario artifact for ${scenario.scenarioPath} under ${artifactRoot}`);
    }
    const targetScenarioRoot = join(scenariosRoot, scenario.id);
    rmSync(targetScenarioRoot, { recursive: true, force: true });
    cpSync(actualScenarioRoot, targetScenarioRoot, { recursive: true });

    const snapshotPath = join(targetScenarioRoot, "ui-review-snapshot.json");
    const snapshot = readJsonIfExists(snapshotPath);
    const checks = snapshot ? uiReview.evaluateUiReviewSnapshot(snapshot) : [{
      id: "missing-ui-review-snapshot",
      severity: "error",
      passed: false,
      summary: "UI review snapshot was not generated."
    }];
    const result = uiReview.resultForUiReviewChecks(checks);
    const screenshotPath = join(targetScenarioRoot, "screenshots", "screen-1.png");
    const copiedScreenshotPath = join(screenshotsRoot, `${scenario.id}.png`);
    if (existsSync(screenshotPath)) {
      cpSync(screenshotPath, copiedScreenshotPath);
    }
    const selfReview = snapshot?.selfReview ?? {};
    const geometry = snapshot?.geometry ?? {};
    appendJsonlIfExists(join(targetScenarioRoot, "runtime.jsonl"), runtimeJsonl);
    appendJsonlIfExists(join(targetScenarioRoot, "harness.jsonl"), harnessJsonl);
    aggregateWorkspaceState[scenario.id] = readJsonIfExists(join(targetScenarioRoot, "workspace-state.json")) ?? {};
    aggregateCommandTrace[scenario.id] = readJsonIfExists(join(targetScenarioRoot, "command-trace.json")) ?? {};
    writeFileSync(join(targetScenarioRoot, "llm-ui-self-review.json"), JSON.stringify(selfReview, null, 2), "utf8");
    writeFileSync(join(targetScenarioRoot, "ui-geometry.json"), JSON.stringify({ ...geometry, checks }, null, 2), "utf8");
    aggregateSelfReview[scenario.id] = selfReview;
    aggregateGeometry[scenario.id] = { ...geometry, checks };
    scenarioResults.push({
      id: scenario.id,
      result,
      checks,
      artifactPaths: {
        scenarioRoot: targetScenarioRoot,
        screenshot: existsSync(copiedScreenshotPath) ? copiedScreenshotPath : screenshotPath,
        snapshot: snapshotPath
      }
    });
  }

  writeFileSync(join(reviewRoot, "runtime.jsonl"), runtimeJsonl.join("\n") + (runtimeJsonl.length > 0 ? "\n" : ""), "utf8");
  writeFileSync(join(reviewRoot, "harness.jsonl"), harnessJsonl.join("\n") + (harnessJsonl.length > 0 ? "\n" : ""), "utf8");
  writeFileSync(join(reviewRoot, "workspace-state.json"), JSON.stringify(aggregateWorkspaceState, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "command-trace.json"), JSON.stringify(aggregateCommandTrace, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "llm-ui-self-review.json"), JSON.stringify(aggregateSelfReview, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-geometry.json"), JSON.stringify(aggregateGeometry, null, 2), "utf8");
  const report = uiReview.createUiReviewReport(scenarioResults, {
    reviewRoot,
    screenshots: screenshotsRoot,
    scenarios: scenariosRoot,
    runtimeJsonl: join(reviewRoot, "runtime.jsonl"),
    harnessJsonl: join(reviewRoot, "harness.jsonl"),
    workspaceState: join(reviewRoot, "workspace-state.json"),
    commandTrace: join(reviewRoot, "command-trace.json")
  });
  writeFileSync(join(reviewRoot, "ui-review-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(reviewRoot, "ui-review-prompt.md"), createPrompt(report), "utf8");
  console.log(`\nui review pack: ${reviewRoot}`);
  console.log(`ui review result: ${report.result}`);
  if (report.result === "needs-fix") {
    process.exitCode = 1;
  }
}

function envFromCurrentProcess() {
  const keys = [
    "MERMAID_GANTT_TEST_DETAIL_TAB",
    "MERMAID_GANTT_TEST_WEBVIEW_LAYOUT",
    "MERMAID_GANTT_TEST_PREVIEW_ZOOM",
    "MERMAID_GANTT_TEST_PREVIEW_COLLAPSED",
    "MERMAID_GANTT_TEST_PREVIEW_FOCUSED",
    "MERMAID_GANTT_TEST_RESPONSIVE_MODE",
    "MERMAID_GANTT_TEST_OPEN_DETAILS",
    "MERMAID_GANTT_TEST_OPEN_ROW_ACTION_MENU",
    "MERMAID_GANTT_TEST_OPEN_DETAILS_WITH_ROW_ACTION_MENU"
  ];
  return Object.fromEntries(keys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

function parseNightlyArtifactRoot(output) {
  const match = /nightly visual artifacts:\s*(.+)\s*$/mu.exec(output);
  if (!match?.[1]) {
    throw new Error("Could not parse nightly visual artifact root from output.");
  }
  return match[1].trim();
}

function findScenarioArtifactRoot(artifactRoot, scenarioPath) {
  const scenario = readJsonIfExists(join(root, scenarioPath));
  if (scenario?.id && existsSync(join(artifactRoot, scenario.id))) {
    return join(artifactRoot, scenario.id);
  }
  return undefined;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function appendJsonlIfExists(path, target) {
  if (!existsSync(path)) {
    return;
  }
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  target.push(...lines);
}

function createPrompt(report) {
  return [
    "# LLM UI Review Prompt",
    "",
    "Review this Mermaid Gantt Task Grid UI evidence pack.",
    "",
    "## Inputs",
    "",
    "- Read `ui-review-report.json` first.",
    "- Use `llm-ui-self-review.json` and `ui-geometry.json` for logical UI state and geometry.",
    "- Inspect screenshots under `screenshots/` for visual confirmation.",
    "- Per-scenario raw artifacts are under `scenarios/<scenario-id>/`.",
    "",
    "## Checklist",
    "",
    "- Popup / picker / menu is close to its anchor.",
    "- Text is not clipped or overlapped.",
    "- Details drawer does not hide the whole workspace.",
    "- Fallback mode does not show structured source-changing actions.",
    "- Sort/filter view-only mode does not show source-order move actions.",
    "- Preview collapsed state hides preview body and zoom controls but keeps the header.",
    "- Task Grid, Preview, Details tabs, Diagnostics, and Advanced Source Items remain readable.",
    "- Japanese labels fit and do not break the layout.",
    "",
    "## Deterministic Result",
    "",
    `- result: ${report.result}`,
    `- findings: ${report.findings.length}`,
    "",
    "## Final Response Template",
    "",
    "- Result: pass / needs-fix / human-review",
    "- Evidence: screenshots and JSON files checked",
    "- Findings: severity, area, summary, suggested fix",
    "- Human review needed: only smoothness, hover timing, native popup behavior, or long-session comfort",
    ""
  ].join("\n");
}
