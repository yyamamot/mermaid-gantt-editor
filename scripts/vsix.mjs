import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");

const [, , command] = process.argv;
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageName = packageJson.name;
const packageVersion = packageJson.version;
const publisher = packageJson.publisher;

if (!command) {
  throw new Error("Usage: node ./scripts/vsix.mjs <package|install|uninstall|smoke>");
}

const vsixPath = `${packageName}-${packageVersion}.vsix`;
const argsByCommand = {
  package: ["package", "--no-dependencies"],
  smoke: ["package", "--no-dependencies"],
  install: ["--install-extension", vsixPath],
  uninstall: ["--uninstall-extension", `${publisher}.${packageName}`]
};

const args = argsByCommand[command];

if (!args) {
  throw new Error(`Unknown vsix command: ${command}`);
}

if (command === "package" || command === "smoke") {
  execFileSync("pnpm", ["run", "build"], { stdio: "inherit" });
  execFileSync("pnpm", ["exec", "vsce", ...args], { stdio: "inherit" });
  if (command === "smoke") {
    rmSync(vsixPath, { force: true });
  }
} else {
  execFileSync("code", ...[args], { stdio: "inherit" });
}
