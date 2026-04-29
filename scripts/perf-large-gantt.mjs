#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

const build = spawnSync("pnpm", ["run", "build:test"], {
  cwd: root,
  stdio: "inherit"
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const perf = spawnSync("node", ["./out/test/performance/large-gantt.js"], {
  cwd: root,
  stdio: "inherit"
});

process.exit(perf.status ?? 1);
