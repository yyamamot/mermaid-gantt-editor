import { spawn } from "node:child_process";
import { resolve } from "node:path";

const workspacePath = resolve(import.meta.dirname, "..");
const profileName = process.env.MERMAID_GANTT_VSCODE_PROFILE || "mermaid-gantt-f5";
const disabledExtensions = (process.env.MERMAID_GANTT_DISABLED_EXTENSIONS || "openai.chatgpt")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const args = [
  "--profile",
  profileName,
  ...disabledExtensions.flatMap((id) => ["--disable-extension", id]),
  workspacePath
];

const child = spawn("code", args, {
  stdio: "inherit",
  detached: true
});

child.on("error", (error) => {
  console.error(`failed to launch VS Code: ${error.message}`);
  process.exitCode = 1;
});

child.on("spawn", () => {
  child.unref();
});
