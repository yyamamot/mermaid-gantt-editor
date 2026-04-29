import { spawn } from "node:child_process";

if (process.env.MERMAID_GANTT_RUN_NIGHTLY_VISUAL !== "1") {
  console.log("nightly visual skipped: set MERMAID_GANTT_RUN_NIGHTLY_VISUAL=1 to run.");
  process.exit(0);
}

await run("pnpm", ["run", "build"]);
await run("pnpm", ["run", "build:test"]);
await run("node", ["./out/test/nightly-visual/run.js"]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
  });
}
