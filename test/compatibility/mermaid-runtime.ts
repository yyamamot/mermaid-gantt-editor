import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createEditorState, parseGanttLossless } from "../../src/core";

const REVIEWED_BUNDLED_MERMAID_VERSION = "11.14.0";

interface CaseResult {
  id: string;
  result: "pass" | "fail";
  summary: string;
  detail?: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
}

interface MermaidPackageJson {
  version?: string;
}

const requireFromHere = createRequire(__filename);

async function main(): Promise<void> {
  const packageJson = await readJson<PackageJson>(join(process.cwd(), "package.json"));
  const mermaidPackageJson = await readJson<MermaidPackageJson>(requireFromHere.resolve("mermaid/package.json"));
  const cases: CaseResult[] = [];

  cases.push(runCase("bundled-mermaid-version-reviewed", () => {
    const declaredVersion = packageJson.dependencies?.mermaid;
    assert.equal(declaredVersion, REVIEWED_BUNDLED_MERMAID_VERSION);
    assert.equal(mermaidPackageJson.version, REVIEWED_BUNDLED_MERMAID_VERSION);
  }, `package.json and installed Mermaid are pinned to ${REVIEWED_BUNDLED_MERMAID_VERSION}.`));

  cases.push(runCase("top-axis-preview-policy", () => {
    const state = createEditorState(parseGanttLossless([
      "gantt",
      "topAxis",
      "Task A : a1, 2026-05-01, 1d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "TOP_AXIS_PREVIEW_UNSUPPORTED");
    assert.equal(state.mode, "structured");
    assert.equal(state.previewSource, undefined);
    assert.ok(diagnostic);
    assert.equal(diagnostic.primaryRaw, "topAxis");
    assert.match(diagnostic.summary ?? "", /Mermaid 11\.14\.0/);
  }, "topAxis remains lossless and structured, but blocks bundled preview until the reviewed runtime supports it."));

  cases.push(runCase("display-mode-compact-warning", () => {
    const state = createEditorState(parseGanttLossless([
      "---",
      "config:",
      "  gantt:",
      "    displayMode: compact",
      "---",
      "gantt",
      "Task A : a1, 2026-05-01, 1d"
    ].join("\n") + "\n"));
    const diagnostic = state.diagnostics.find((item) => item.code === "HOST_VERSION_SENSITIVE_SYNTAX");
    assert.equal(state.mode, "structured");
    assert.ok(diagnostic);
    assert.equal(diagnostic.primaryRaw, "displayMode: compact");
    assert.ok(diagnostic.suggestedActions.some((action) => {
      return action.kind === "quick-fix" && action.replacement?.text === "# displayMode: compact";
    }));
  }, "displayMode compact remains retained source with host-version guidance and a safe comment-out quick fix."));

  cases.push(runCase("vertical-milestone-tag-roundtrip", () => {
    const source = [
      "gantt",
      "Task A : vert, a1, 2026-05-01, 1d"
    ].join("\n") + "\n";
    const state = createEditorState(parseGanttLossless(source));
    const row = state.grid.rows[0];
    assert.equal(state.mode, "structured");
    assert.equal(state.previewSource, source);
    assert.deepEqual(state.projectionIssues, []);
    assert.ok(row);
    assert.deepEqual(row.tags, ["vert"]);
  }, "vert task metadata remains structured and previewable."));

  const result = cases.every((item) => item.result === "pass") ? "pass" : "fail";
  const artifactRoot = join(
    process.cwd(),
    ".tmp",
    "compat",
    "mermaid-runtime",
    `mermaid-runtime-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  await mkdir(artifactRoot, { recursive: true });
  const summary = {
    result,
    reviewedBundledMermaidVersion: REVIEWED_BUNDLED_MERMAID_VERSION,
    installedMermaidVersion: mermaidPackageJson.version ?? "unknown",
    cases
  };
  await writeFile(join(artifactRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(artifactRoot, "summary.md"), renderSummaryMarkdown(summary));
  console.log(`mermaid compatibility result: ${result}`);
  console.log(`mermaid compatibility summary: ${artifactRoot}`);
  if (result !== "pass") {
    process.exitCode = 1;
  }
}

function runCase(id: string, run: () => void, summary: string): CaseResult {
  try {
    run();
    return { id, result: "pass", summary };
  } catch (error) {
    return {
      id,
      result: "fail",
      summary,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function renderSummaryMarkdown(summary: {
  result: string;
  reviewedBundledMermaidVersion: string;
  installedMermaidVersion: string;
  cases: CaseResult[];
}): string {
  const rows = summary.cases.map((item) => {
    return `| ${item.id} | ${item.result} | ${item.detail ? item.detail.replace(/\|/g, "\\|") : item.summary.replace(/\|/g, "\\|")} |`;
  });
  return [
    "# Mermaid Runtime Compatibility",
    "",
    `Result: ${summary.result}`,
    `Reviewed bundled Mermaid: ${summary.reviewedBundledMermaidVersion}`,
    `Installed Mermaid: ${summary.installedMermaidVersion}`,
    "",
    "| Case | Result | Notes |",
    "| --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
