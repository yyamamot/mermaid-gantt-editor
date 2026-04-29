import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_DIAGNOSTIC_MESSAGE_KEYS = [
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

const REQUIRED_DIAGNOSTIC_ACTION_KEYS = [
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

describe("l10n resources", () => {
  it("activates on every contributed production command, markdown CodeLens, and Mermaid files", () => {
    const packageJson = readJson("package.json") as {
      activationEvents?: string[];
      contributes?: { commands?: Array<{ command?: string }> };
    };
    const commands = (packageJson.contributes?.commands ?? [])
      .map((command) => command.command)
      .filter((command): command is string => command !== undefined);

    expect(commands.length).toBeGreaterThan(0);
    expect(packageJson.activationEvents?.sort()).toEqual([
      ...commands.map((command) => `onCommand:${command}`),
      "onLanguage:markdown",
      "onLanguage:mermaid"
    ].sort());
  });

  it("covers package command titles in English and Japanese", () => {
    const packageJson = readJson("package.json") as {
      contributes?: { commands?: Array<{ title?: string }> };
    };
    const english = readJson("package.nls.json") as Record<string, string>;
    const japanese = readJson("package.nls.ja.json") as Record<string, string>;
    const keys = (packageJson.contributes?.commands ?? [])
      .map((command) => /^%(.+)%$/.exec(command.title ?? "")?.[1])
      .filter((key): key is string => key !== undefined);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => english[key] === undefined)).toEqual([]);
    expect(keys.filter((key) => japanese[key] === undefined)).toEqual([]);
  });

  it("covers extension vscode.l10n.t string literals in English and Japanese bundles", () => {
    const packageJson = readJson("package.json") as { l10n?: string };
    const source = readExtensionSourceText();
    const english = readJson("l10n/bundle.l10n.json") as Record<string, string>;
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;
    const keys = extractL10nLiteralKeys(source);

    expect(packageJson.l10n).toBe("./l10n");
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => english[key] === undefined)).toEqual([]);
    expect(keys.filter((key) => japanese[key] === undefined)).toEqual([]);
  });

  it("keeps English and Japanese Webview bundles aligned", () => {
    const english = readJson("l10n/bundle.l10n.json") as Record<string, string>;
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(Object.keys(japanese).sort()).toEqual(Object.keys(english).sort());
  });

  it("covers known diagnostic message and action labels", () => {
    const source = readText("src/extension/index.ts");

    for (const key of REQUIRED_DIAGNOSTIC_MESSAGE_KEYS) {
      expect(source).toContain(`"${key}"`);
    }
    for (const key of REQUIRED_DIAGNOSTIC_ACTION_KEYS) {
      expect(source).toContain(`"${key}"`);
    }
  });

  it("localizes advanced source item labels in Japanese UI strings", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese["Advanced Source Items"]).toBe("ソース項目");
    expect(japanese["No advanced source items."]).not.toContain("Advanced Source Items");
    expect(japanese["Preview source is unavailable. Structured editing is limited; review diagnostics and Advanced Source Items before writing back."]).not.toContain("Advanced Source Items");
    expect(japanese["Preview source is blocked by projection issues. Review diagnostics or advanced source items."]).not.toContain("Advanced Source Items");
  });

  it("uses user-facing Japanese wording for the task detail tab", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese.Inspector).toBe("タスク詳細");
  });

  it("keeps Mermaid dependency terminology as source-facing text in Japanese", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese.Depends).toBe("Depends");
    expect(japanese.Until).toBe("Until");
  });

  it("keeps Today Marker as source-facing text in Japanese", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese["Today Marker"]).toBe("Today Marker");
  });

  it("keeps Top Axis as source-facing text in Japanese", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese["Top Axis"]).toBe("Top Axis");
  });

  it("localizes remaining user-facing Japanese labels", () => {
    const japanese = readJson("l10n/bundle.l10n.ja.json") as Record<string, string>;

    expect(japanese["Source range"]).toBe("ソース範囲");
    expect(japanese["Task Grid action failed."]).toBe("Task Grid の操作に失敗しました。");
    expect(japanese["Use dependency {0}"]).toBe("依存先に {0} を使う");
  });
});

function readText(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readText(path));
}

function readExtensionSourceText(): string {
  return listTypeScriptFiles("src/extension")
    .map((path) => readText(path))
    .join("\n");
}

function listTypeScriptFiles(path: string): string[] {
  const entries = readdirSync(join(process.cwd(), path), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const childPath = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      return listTypeScriptFiles(childPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [childPath] : [];
  }).sort();
}

function extractL10nLiteralKeys(source: string): string[] {
  const keys = new Set<string>();
  const regex = /vscode\.l10n\.t\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const raw = match[2] ?? "";
    keys.add(raw.replace(/\\(["'`\\])/g, "$1"));
  }
  return [...keys].sort();
}
