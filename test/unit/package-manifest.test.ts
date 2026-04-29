import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  name?: string;
  displayName?: string;
  publisher?: string;
  description?: string;
  version?: string;
  license?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  bugs?: {
    url?: string;
  };
  homepage?: string;
  icon?: string;
  categories?: string[];
  keywords?: string[];
  main?: string;
  l10n?: string;
  activationEvents?: string[];
  contributes?: {
    languages?: Array<{ id?: string; aliases?: string[]; extensions?: string[] }>;
    commands?: Array<{ command?: string; title?: string }>;
  };
  scripts?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
}

describe("package manifest", () => {
  it("keeps marketplace-facing metadata explicit", () => {
    const manifest = readPackageJson();

    expect(manifest.name).toBe("mermaid-gantt-editor");
    expect(manifest.displayName).toBe("Mermaid Gantt Editor");
    expect(manifest.publisher).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(manifest.description).toContain("Mermaid Gantt");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.license).toBe("MIT");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/yyamamot/mermaid-gantt-editor.git",
    });
    expect(manifest.bugs).toEqual({
      url: "https://github.com/yyamamot/mermaid-gantt-editor/issues",
    });
    expect(manifest.homepage).toBe("https://github.com/yyamamot/mermaid-gantt-editor#readme");
    expect(manifest.icon).toBe("assets/icon.png");
    const icon = manifest.icon;
    expect(icon).toBeDefined();
    expect(existsSync(join(process.cwd(), icon ?? ""))).toBe(true);
    expect(manifest.categories).toEqual(expect.arrayContaining(["Visualization"]));
    expect(manifest.keywords).toEqual(expect.arrayContaining(["mermaid", "gantt", "markdown", "task-grid"]));
    expect(manifest.l10n).toBe("./l10n");
    expect(manifest.contributes?.languages).toEqual([
      {
        id: "mermaid",
        aliases: ["Mermaid", "mermaid"],
        extensions: [".mmd", ".mermaid"],
      },
    ]);
  });

  it("activates on production commands, Markdown CodeLens, and standalone Mermaid files", () => {
    const manifest = readPackageJson();
    const commands = (manifest.contributes?.commands ?? []).map((command) => command.command);

    expect(commands).toEqual(["mermaidGantt.showParserInfo", "mermaidGantt.openTaskGrid"]);
    expect(manifest.activationEvents).toEqual([
      ...commands.map((command) => `onCommand:${command}`),
      "onLanguage:markdown",
      "onLanguage:mermaid"
    ]);
  });

  it("ships all required VSIX files and local docs", () => {
    const manifest = readPackageJson();
    const requiredFiles = [
      "assets/**",
      "dist/**",
      "l10n/**",
      "package.nls.json",
      "package.nls.ja.json",
      "README.md",
      "README.ja.md",
      "CHANGELOG.md",
      "LICENSE",
      "package.json",
    ];

    expect(manifest.files).toEqual(requiredFiles);
    for (const file of requiredFiles.filter((entry) => !entry.endsWith("/**") && !entry.includes("*"))) {
      expect(existsSync(join(process.cwd(), file))).toBe(true);
    }
  });

  it("keeps release smoke scripts wired", () => {
    const manifest = readPackageJson();

    expect(manifest.main).toBe("./dist/extension.js");
    expect(manifest.scripts?.["package:vsix"]).toBe("node ./scripts/vsix.mjs package");
    expect(manifest.scripts?.["test:package"]).toBe("node ./scripts/vsix.mjs smoke");
    expect(manifest.scripts?.["check:l10n"]).toBe("node ./scripts/check-l10n.mjs");
    expect(manifest.scripts?.verify).toContain("check:l10n");
    expect(manifest.scripts?.verify).toContain("test:integration:host");
  });

  it("keeps bundled Mermaid version review explicit", () => {
    const manifest = readPackageJson();

    expect(manifest.dependencies?.mermaid).toBe("11.14.0");
    expect(manifest.scripts?.["check:mermaid-compat"]).toBe("pnpm run build:test && node ./out/test/compatibility/mermaid-runtime.js");
  });
});

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}
