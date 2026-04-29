import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseGanttLossless,
  projectGanttSemantic,
  RangeMapper,
  type ProjectionIssue,
  type SemanticDocument
} from "../../src/core";

describe("semantic projection integration", () => {
  it("keeps semantic fixture directories registered in the manifest", () => {
    const manifest = readSemanticManifest();
    const registered = new Set([
      ...manifest.required,
      ...manifest.planned.map((fixtureId) => normalizeManifestFixtureId(fixtureId))
    ]);
    const discovered = discoverSemanticFixtureIds();
    const unregistered = discovered.filter((fixtureId) => !registered.has(fixtureId));
    expect(unregistered).toEqual([]);
  });

  it("matches semantic projection fixtures", () => {
    const manifest = readSemanticManifest();
    const missing = manifest.required.filter((fixtureId) => {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      return !statExists(join(fixtureDir, "source.mmd")) ||
        !statExists(join(fixtureDir, "expect.semantic.json"));
    });
    expect(missing).toEqual([]);

    for (const fixtureId of manifest.required) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const expected = JSON.parse(readFileSync(join(fixtureDir, "expect.semantic.json"), "utf8")) as SemanticDocument;
      const semantic = projectGanttSemantic(parseGanttLossless(source));
      assertSemanticInvariants(source, semantic);
      expect(semantic).toEqual(expected);
    }
  });
});

interface SemanticManifest {
  required: string[];
  planned: string[];
}

function assertSemanticInvariants(source: string, semantic: SemanticDocument): void {
  expect(semantic.kind).toBe("SemanticDocument");
  const sectionIds = new Set<string>();
  const taskNodeIds = new Set<string>();

  semantic.sections.forEach((section, sectionIndex) => {
    expect(sectionIds.has(section.id)).toBe(false);
    sectionIds.add(section.id);
    if (section.id === "__default__") {
      expect(sectionIndex).toBe(0);
      expect(section.implicit).toBe(true);
    } else {
      expect(section.id).toMatch(/^section-\d+$/);
      expect(section.sourceNodeId).toEqual(expect.any(String));
    }
    expect(section.taskNodeIds).toEqual(section.tasks.map((task) => task.nodeId));
    for (const task of section.tasks) {
      expect(taskNodeIds.has(task.nodeId)).toBe(false);
      taskNodeIds.add(task.nodeId);
      expect(task.sourceLabelRaw).toBe(task.label);
      expect(task.displayLabel).toBe(task.label);
      expect(task.previewLabelPolicy).toBe("truncate-with-tooltip");
    }
  });

  for (const issue of semantic.projectionIssues) {
    assertProjectionIssueShape(source, issue);
  }
}

function assertProjectionIssueShape(source: string, issue: ProjectionIssue): void {
  expect(issue).toMatchObject({
    nodeId: expect.any(String),
    reasonCode: expect.any(String),
    message: expect.any(String),
    severity: expect.stringMatching(/^(error|warning|info)$/),
    stage: "projection",
    instruction: {
      primaryRange: issue.range,
      suggestedActions: expect.any(Array)
    }
  });
  expect(issue.instruction.suggestedActions.length).toBeGreaterThan(0);
  const mapper = new RangeMapper(source);
  expect(issue.range.start).toEqual(mapper.positionAtOffset(issue.range.start.offset));
  expect(issue.range.end).toEqual(mapper.positionAtOffset(issue.range.end.offset));
  expect(issue.instruction.primaryRange).toEqual(issue.range);
}

function readSemanticManifest(): SemanticManifest {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "semantic-manifest.json"), "utf8")) as SemanticManifest;
}

function discoverSemanticFixtureIds(): string[] {
  const groupDir = join(process.cwd(), "fixtures", "semantic");
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `semantic/${entry.name}`)
    .sort();
}

function normalizeManifestFixtureId(fixtureId: string): string {
  if (fixtureId.includes("/")) {
    return fixtureId;
  }
  return `semantic/${fixtureId}`;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
