import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseGanttLossless,
  resolveGanttDocument,
  type ResolvedDocument
} from "../../src/core";

describe("resolved model integration", () => {
  it("keeps resolved fixture directories registered in the manifest", () => {
    const manifest = readResolvedManifest();
    const registered = new Set([
      ...manifest.required,
      ...manifest.planned.map((fixtureId) => normalizeManifestFixtureId(fixtureId))
    ]);
    const discovered = discoverResolvedFixtureIds();
    const unregistered = discovered.filter((fixtureId) => !registered.has(fixtureId));
    expect(unregistered).toEqual([]);
  });

  it("matches resolved model fixtures", () => {
    const manifest = readResolvedManifest();
    const missing = manifest.required.filter((fixtureId) => {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      return !statExists(join(fixtureDir, "source.mmd")) ||
        !statExists(join(fixtureDir, "expect.resolved.json"));
    });
    expect(missing).toEqual([]);

    for (const fixtureId of manifest.required) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const expected = JSON.parse(readFileSync(join(fixtureDir, "expect.resolved.json"), "utf8")) as ResolvedDocument;
      const resolved = resolveGanttDocument(parseGanttLossless(source));
      assertResolvedInvariants(resolved);
      expect(resolved).toEqual(expected);
    }
  });
});

interface ResolvedManifest {
  required: string[];
  planned: string[];
}

function assertResolvedInvariants(resolved: ResolvedDocument): void {
  expect(resolved.kind).toBe("ResolvedDocument");
  const keys = new Set<string>();
  const nodeIds = new Set<string>();
  for (const task of resolved.tasks) {
    expect(task.key).toBe(`task:${task.nodeId}`);
    expect(keys.has(task.key)).toBe(false);
    expect(nodeIds.has(task.nodeId)).toBe(false);
    keys.add(task.key);
    nodeIds.add(task.nodeId);
    for (const dependencyKey of task.dependencyKeys) {
      expect(keys.has(dependencyKey) || resolved.tasks.some((candidate) => candidate.key === dependencyKey)).toBe(true);
    }
  }
  for (const diagnostic of resolved.diagnostics) {
    expect(diagnostic).toMatchObject({
      code: expect.any(String),
      severity: expect.stringMatching(/^(error|warning|info)$/),
      stage: expect.stringMatching(/^(parse|projection|resolution)$/),
      instruction: {
        primaryRange: expect.any(Object),
        suggestedActions: expect.any(Array)
      }
    });
  }
}

function readResolvedManifest(): ResolvedManifest {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "resolved-manifest.json"), "utf8")) as ResolvedManifest;
}

function discoverResolvedFixtureIds(): string[] {
  const groupDir = join(process.cwd(), "fixtures", "resolved");
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `resolved/${entry.name}`)
    .sort();
}

function normalizeManifestFixtureId(fixtureId: string): string {
  if (fixtureId.includes("/")) {
    return fixtureId;
  }
  return `resolved/${fixtureId}`;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
