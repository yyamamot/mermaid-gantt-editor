import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyLosslessTextPatch,
  emitNormalizedGantt,
  parseGanttLossless,
  projectGanttSemantic
} from "../../src/core";
import type { DocumentItem } from "../../src/core";

describe("emit integration", () => {
  it("keeps emit fixture directories registered in the manifest", () => {
    const manifest = readEmitManifest();
    const registered = new Set([
      ...manifest.required,
      ...manifest.planned.map((fixtureId) => normalizeManifestFixtureId(fixtureId))
    ]);
    const discovered = discoverEmitFixtureIds();
    const unregistered = discovered.filter((fixtureId) => !registered.has(fixtureId));
    expect(unregistered).toEqual([]);
  });

  it("matches normalized emit fixtures", () => {
    const manifest = readEmitManifest();
    const missing = manifest.required.filter((fixtureId) => {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      return !statExists(join(fixtureDir, "source.mmd")) ||
        (
          !statExists(join(fixtureDir, "expect.normalized.mmd")) &&
          !statExists(join(fixtureDir, "expect.writeback.mmd"))
        );
    });
    expect(missing).toEqual([]);

    for (const fixtureId of manifest.required.filter(hasNormalizedExpectation)) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const expected = readFileSync(join(fixtureDir, "expect.normalized.mmd"), "utf8");
      const result = emitNormalizedGantt(projectGanttSemantic(parseGanttLossless(source)));
      expect(result.diagnostics).toEqual([]);
      expect(result.source).toBe(expected);
    }
  });

  it("matches lossless write-back fixtures", () => {
    const manifest = readEmitManifest();
    for (const fixtureId of manifest.required.filter(hasWriteBackExpectation)) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const patch = JSON.parse(readFileSync(join(fixtureDir, "patch.json"), "utf8")) as WriteBackPatchFixture;
      const expected = readFileSync(join(fixtureDir, "expect.writeback.mmd"), "utf8");
      const document = parseGanttLossless(source);
      const target = findPatchTarget(document.items, patch);
      const result = applyLosslessTextPatch(document, {
        range: target.range,
        text: patch.text
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.source).toBe(expected);
    }
  });
});

interface EmitManifest {
  required: string[];
  planned: string[];
}

interface WriteBackPatchFixture {
  targetKind: "TaskStmt";
  targetField: "label";
  text: string;
}

function findPatchTarget(
  items: DocumentItem[],
  patch: WriteBackPatchFixture
): { range: DocumentItem["range"] } {
  const item = items.find((candidate) => candidate.kind === patch.targetKind);
  expect(item?.kind).toBe(patch.targetKind);
  if (item?.kind === "TaskStmt" && patch.targetField === "label") {
    return item.label;
  }
  throw new Error(`Unsupported write-back patch fixture target: ${patch.targetKind}.${patch.targetField}`);
}

function hasNormalizedExpectation(fixtureId: string): boolean {
  return statExists(join(process.cwd(), "fixtures", fixtureId, "expect.normalized.mmd"));
}

function hasWriteBackExpectation(fixtureId: string): boolean {
  return statExists(join(process.cwd(), "fixtures", fixtureId, "expect.writeback.mmd"));
}

function readEmitManifest(): EmitManifest {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "emit-manifest.json"), "utf8")) as EmitManifest;
}

function discoverEmitFixtureIds(): string[] {
  const groupDir = join(process.cwd(), "fixtures", "emit");
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `emit/${entry.name}`)
    .sort();
}

function normalizeManifestFixtureId(fixtureId: string): string {
  if (fixtureId.includes("/")) {
    return fixtureId;
  }
  return `emit/${fixtureId}`;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
