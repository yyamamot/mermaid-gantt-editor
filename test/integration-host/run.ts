import { resolve } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVSCodeHostController,
  type HarnessConfig
} from "../../src/harness";

async function main(): Promise<void> {
  const extensionDevelopmentPath = resolve(__dirname, "../../..");
  const extensionTestsPath = resolve(__dirname, "suite");
  const runtimeLogDir = mkdtempSync(join(tmpdir(), "mermaid-gantt-host-"));
  const config: HarnessConfig = {
    workspacePath: extensionDevelopmentPath,
    runId: "host-test",
    mode: "headless",
    artifactRoot: join(runtimeLogDir, "artifacts"),
    runtimeJsonlPath: join(runtimeLogDir, "runtime.jsonl"),
    harnessJsonlPath: join(runtimeLogDir, "harness.jsonl"),
    vscodeLaunchProfile: "debug-f5",
    screenshotPolicy: "never"
  };

  await runVSCodeHostController(config, { id: "integration-host" }, {
    extensionDevelopmentPath,
    extensionTestsPath,
    enableTestCommands: true,
    extensionTestsEnv: {
      MERMAID_GANTT_EXTENSION_ROOT: extensionDevelopmentPath,
      MERMAID_GANTT_HARNESS_MANIFEST: join(extensionDevelopmentPath, "fixtures", "harness-manifest.json")
    }
  });
  assertHarnessLaunchEvents(config.harnessJsonlPath);
}

function assertHarnessLaunchEvents(harnessJsonlPath: string): void {
  const text = readFileSync(harnessJsonlPath, "utf8");
  if (!text.includes("vscode.launch.started") || !text.includes("vscode.launch.ready")) {
    throw new Error("VS Code host controller did not write launch events to harness JSONL.");
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
