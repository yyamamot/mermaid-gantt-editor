import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEditorState,
  parseGanttLossless,
  type EditorState
} from "../../src/core";

describe("product editor state fixtures", () => {
  it("keeps required product fixtures registered", () => {
    const manifest = readManifest();
    const missing = manifest.required.filter((fixtureId) => {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      return !exists(join(fixtureDir, "source.mmd")) ||
        !exists(join(fixtureDir, "expect.editor-state.json"));
    });

    expect(missing).toEqual([]);
  });

  it("matches Task Grid, limited editing, and fallback product state", () => {
    const manifest = readManifest();
    for (const fixtureId of manifest.required) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const expected = JSON.parse(readFileSync(join(fixtureDir, "expect.editor-state.json"), "utf8"));
      const state = createEditorState(parseGanttLossless(source));

      expect(summarizeEditorState(state)).toEqual(expected);
    }
  });
});

interface ProductManifest {
  required: string[];
}

function summarizeEditorState(state: EditorState): object {
  return {
    mode: state.mode,
    source: state.source,
    previewAvailable: state.previewSource !== undefined,
    rowLabels: state.grid.rows.map((row) => row.label),
    rowIds: state.grid.rows.map((row) => row.id ?? null),
    rowDependencies: state.grid.rows.map((row) => row.dependencies),
    advancedKinds: state.advancedSourceItems.map((item) => item.kind),
    diagnosticCodes: state.diagnostics.map((diagnostic) => diagnostic.code),
    projectionIssueCodes: state.projectionIssues.map((issue) => issue.reasonCode)
  };
}

function readManifest(): ProductManifest {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "product-manifest.json"), "utf8")) as ProductManifest;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
