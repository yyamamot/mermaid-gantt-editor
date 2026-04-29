#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const extensionSourceRoot = join(root, "src", "extension");
const englishBundlePath = join(root, "l10n", "bundle.l10n.json");
const japaneseBundlePath = join(root, "l10n", "bundle.l10n.ja.json");
const packageNlsPath = join(root, "package.nls.json");
const packageNlsJaPath = join(root, "package.nls.ja.json");

const requiredDiagnosticMessageKeys = [
  "diagnostics.dateFormatMismatch",
  "diagnostics.duplicateTaskId",
  "diagnostics.circularDependency",
  "diagnostics.hostVersionSensitiveSyntax",
  "diagnostics.includeExcludeConflict",
  "diagnostics.invalidTickInterval",
  "diagnostics.keywordLikeTaskLabel",
  "diagnostics.longLabelReadability",
  "diagnostics.selfDependency",
  "diagnostics.undefinedDependency",
  "diagnostics.topAxisPreviewUnsupported",
  "diagnostics.editorTaskDeleteReferenced",
  "diagnostics.editorSectionDeleteReferenced",
  "diagnostics.editorInvalidTickInterval"
];

const requiredDiagnosticActionKeys = [
  "diagnostics.action.alignDateFormat",
  "diagnostics.action.renameTaskId",
  "diagnostics.action.changeDependency",
  "diagnostics.action.checkMermaidHostVersion",
  "diagnostics.action.reviewIncludeExclude",
  "diagnostics.action.useValidTickInterval",
  "diagnostics.action.renameKeywordLikeLabel",
  "diagnostics.action.reviewPreviewLabel",
  "diagnostics.action.chooseExistingTaskId",
  "diagnostics.action.reviewSource",
  "diagnostics.action.useOneWeekTickInterval",
  "diagnostics.action.convertDateToConfiguredFormat",
  "diagnostics.action.renameDuplicateTaskId",
  "diagnostics.action.prefixKeywordLikeLabel",
  "diagnostics.action.commentOutCompactDisplayMode",
  "diagnostics.action.useExistingTaskId"
];

const failures = [];

const [englishBundle, japaneseBundle, packageJson, packageNls, packageNlsJa] = await Promise.all([
  readJson(englishBundlePath),
  readJson(japaneseBundlePath),
  readJson(join(root, "package.json")),
  readJson(packageNlsPath),
  readJson(packageNlsJaPath)
]);

assertSameKeys("l10n/bundle.l10n.json", englishBundle, "l10n/bundle.l10n.ja.json", japaneseBundle);
assertPackageNls(packageJson, packageNls, packageNlsJa);

const extensionFiles = await listTypeScriptFiles(extensionSourceRoot);
const extensionSources = await Promise.all(extensionFiles.map(async (file) => ({
  file,
  source: await readFile(file, "utf8")
})));
const extensionSourceText = extensionSources.map((item) => item.source).join("\n");
const l10nKeys = Array.from(new Set(extensionSources.flatMap((item) => extractL10nLiteralKeys(item.source)))).sort();

assertKeysPresent("English l10n bundle", englishBundle, l10nKeys);
assertKeysPresent("Japanese l10n bundle", japaneseBundle, l10nKeys);
assertSourceContainsObjectKeys("diagnosticMessages", extensionSourceText, requiredDiagnosticMessageKeys);
assertSourceContainsObjectKeys("diagnosticActionLabels", extensionSourceText, requiredDiagnosticActionKeys);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`l10n check failed: ${failure}`);
  }
  process.exit(1);
}

console.log(`l10n check passed: ${l10nKeys.length} extension strings, ${Object.keys(englishBundle).length} bundle entries.`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  }));
  return files.flat().sort();
}

function extractL10nLiteralKeys(source) {
  const keys = [];
  const regex = /vscode\.l10n\.t\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const raw = match[2] ?? "";
    keys.push(raw.replace(/\\(["'`\\])/g, "$1"));
  }
  return keys;
}

function assertSameKeys(leftName, left, rightName, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  const missingRight = leftKeys.filter((key) => right[key] === undefined);
  const missingLeft = rightKeys.filter((key) => left[key] === undefined);
  if (missingRight.length > 0) {
    failures.push(`${rightName} is missing keys from ${leftName}: ${missingRight.join(", ")}`);
  }
  if (missingLeft.length > 0) {
    failures.push(`${leftName} is missing keys from ${rightName}: ${missingLeft.join(", ")}`);
  }
}

function assertPackageNls(manifest, english, japanese) {
  const keys = (manifest.contributes?.commands ?? [])
    .map((command) => /^%(.+)%$/.exec(command.title ?? "")?.[1])
    .filter((key) => key !== undefined);
  assertKeysPresent("package.nls.json", english, keys);
  assertKeysPresent("package.nls.ja.json", japanese, keys);
}

function assertKeysPresent(name, object, keys) {
  const missing = keys.filter((key) => object[key] === undefined);
  if (missing.length > 0) {
    failures.push(`${name} is missing keys: ${missing.join(", ")}`);
  }
}

function assertSourceContainsObjectKeys(objectName, source, keys) {
  const missing = keys.filter((key) => !source.includes(`"${key}"`));
  if (missing.length > 0) {
    failures.push(`${objectName} is missing keys: ${missing.join(", ")}`);
  }
}
