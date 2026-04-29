import { build } from "esbuild";
import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
const enableSourcemap = process.env.MERMAID_GANTT_SOURCEMAP === "1";

const releaseBuildLock = await acquireBuildLock();
try {
  await build({
    entryPoints: ["src/extension/index.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: "dist/extension.js",
    external: ["vscode"],
    sourcemap: enableSourcemap,
    target: "node22"
  });
  if (!enableSourcemap) {
    await rm("dist/extension.js.map", { force: true });
  }

  const mermaidSource = require.resolve("mermaid/dist/mermaid.esm.min.mjs");
  const mermaidTarget = join("dist", "webview", "mermaid.esm.min.mjs");
  await mkdir(dirname(mermaidTarget), { recursive: true });
  await copyFile(mermaidSource, mermaidTarget);

  const mermaidChunksSource = join(dirname(mermaidSource), "chunks", "mermaid.esm.min");
  const mermaidChunksTarget = join("dist", "webview", "chunks", "mermaid.esm.min");
  await rm(mermaidChunksTarget, { recursive: true, force: true });
  await mkdir(dirname(mermaidChunksTarget), { recursive: true });
  await cp(mermaidChunksSource, mermaidChunksTarget, {
    recursive: true,
    filter: (source) => !source.endsWith(".map")
  });
} finally {
  await releaseBuildLock();
}

async function acquireBuildLock() {
  const lockRoot = join(".tmp");
  const lockDir = join(lockRoot, "build.lock");
  await mkdir(lockRoot, { recursive: true });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await mkdir(lockDir);
      return async () => {
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      await setTimeout(100);
    }
  }
  throw new Error("Timed out waiting for build lock.");
}
