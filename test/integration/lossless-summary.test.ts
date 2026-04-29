import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDiagnosticSummary,
  createLosslessSummary,
  KNOWN_TOKEN_KINDS,
  parseGanttLossless,
  RangeMapper,
  reconstructLosslessSource,
  type GanttDocument,
  type LosslessSummary,
  type Range
} from "../../src/core";

describe("lossless integration", () => {
  it("keeps lossless fixture directories registered in the manifest", () => {
    const manifest = readLosslessManifest();
    const registered = new Set([
      ...manifest.required,
      ...manifest.planned.map((fixtureId) => normalizeManifestFixtureId(fixtureId))
    ]);
    const discovered = discoverFixtureIds(["lossless", "malformed"]);
    const unregistered = discovered.filter((fixtureId) => !registered.has(fixtureId));
    expect(unregistered).toEqual([]);
  });

  it("matches seed fixtures", () => {
    const manifest = readLosslessManifest();
    const fixtureDirs = manifest.required.map((fixtureId) => join(process.cwd(), "fixtures", fixtureId));
    const missing = fixtureDirs
      .filter((fixtureDir) => {
        return !statExists(join(fixtureDir, "source.mmd")) ||
          !statExists(join(fixtureDir, "expect.lossless.summary.json")) ||
          !statExists(join(fixtureDir, "expect.noop.mmd"));
      })
      .map((fixtureDir) => fixtureDir.replace(`${process.cwd()}/fixtures/`, ""));
    expect(missing).toEqual([]);

    for (const fixtureDir of fixtureDirs) {
      const sourcePath = join(fixtureDir, "source.mmd");
      const summaryPath = join(fixtureDir, "expect.lossless.summary.json");
      const noopPath = join(fixtureDir, "expect.noop.mmd");

      const source = readFileSync(sourcePath, "utf8");
      const fixtureId = fixtureDir.replace(`${process.cwd()}/fixtures/`, "");
      const document = parseGanttLossless(source);
      const summary = createLosslessSummary(fixtureId, document);
      const expectedSummary = JSON.parse(readFileSync(summaryPath, "utf8"));

      expect(reconstructLosslessSource(document)).toBe(source);
      assertSourcePartition(document);
      assertRangesSliceSource(document);
      assertDocumentInvariants(document);
      assertSummaryRequiredDetails(summary);
      expect(summary).toEqual(expectedSummary);
      expect(readFileSync(noopPath, "utf8")).toBe(source);
    }
  });

  it("covers the required baseline token kinds in required fixtures", () => {
    const manifest = readLosslessManifest();
    const requiredBaseline = [...KNOWN_TOKEN_KINDS];

    const seen = new Set<string>();
    for (const fixtureId of manifest.required) {
      const source = readFileSync(join(process.cwd(), "fixtures", fixtureId, "source.mmd"), "utf8");
      const document = parseGanttLossless(source);
      for (const token of document.tokens) {
        seen.add(token.kind);
      }
    }

    expect(requiredBaseline.filter((kind) => !seen.has(kind))).toEqual([]);
  });

  it("keeps AST foundation regression fixtures required", () => {
    const manifest = readLosslessManifest();
    const required = new Set(manifest.required);
    const foundationFixtures = [
      "lossless/frontmatter-config",
      "lossless/directive-above",
      "lossless/line-endings-crlf",
      "lossless/acc-descr-multiline",
      "lossless/task-after-single",
      "lossless/task-after-multi",
      "lossless/task-until",
      "lossless/top-axis-statement",
      "lossless/includes",
      "lossless/inclusive-end-dates"
    ];

    expect(foundationFixtures.filter((fixtureId) => !required.has(fixtureId))).toEqual([]);
  });

  it("has required diagnostics fixture seeds", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "diagnostics-manifest.json"), "utf8")) as { required: string[] };
    const missing = manifest.required.filter((fixtureId) => {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      return !statExists(join(fixtureDir, "source.mmd")) || !statExists(join(fixtureDir, "expect.diagnostics.json"));
    });

    expect(missing).toEqual([]);

    for (const fixtureId of manifest.required) {
      const fixtureDir = join(process.cwd(), "fixtures", fixtureId);
      const source = readFileSync(join(fixtureDir, "source.mmd"), "utf8");
      const expectedDiagnostics = JSON.parse(readFileSync(join(fixtureDir, "expect.diagnostics.json"), "utf8")) as ExpectedDiagnostic[];
      const actualDiagnostics = createDiagnosticSummary(parseGanttLossless(source));
      expect(expectedDiagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of expectedDiagnostics) {
        assertExpectedDiagnosticShape(source, diagnostic);
      }
      expect(actualDiagnostics).toEqual(expectedDiagnostics);
    }
  });
});

interface LosslessManifest {
  required: string[];
  planned: string[];
}

interface ExpectedDiagnostic {
  code: string;
  stage: string;
  severity: string;
  messageKey: string;
  primaryRange: Range;
  primaryRaw: string;
  relatedRanges?: Array<Range & { raw?: string }>;
  suggestedActions: Array<{
    kind: string;
    labelKey: string;
  }>;
}

function assertSourcePartition(document: GanttDocument): void {
  let offset = 0;
  for (const item of document.items) {
    expect(item.range.start.offset).toBe(offset);
    expect(item.range.end.offset).toBe(offset + item.raw.length);
    offset = item.range.end.offset;
  }
  expect(offset).toBe(document.source.length);
}

function assertDocumentInvariants(document: GanttDocument): void {
  const itemNodeIds = new Set<string>();
  for (const item of document.items) {
    expect(itemNodeIds.has(item.nodeId)).toBe(false);
    itemNodeIds.add(item.nodeId);
    expect(item.range.start.offset).toBeLessThanOrEqual(item.range.end.offset);
    expect(item.range.start.offset).toBeGreaterThanOrEqual(0);
    expect(item.range.end.offset).toBeLessThanOrEqual(document.source.length);
  }

  for (const token of document.tokens) {
    expect(token.range.start.offset).toBeLessThanOrEqual(token.range.end.offset);
    expect(token.range.start.offset).toBeGreaterThanOrEqual(0);
    expect(token.range.end.offset).toBeLessThanOrEqual(document.source.length);
    expect(isKnownOrNamespacedTokenKind(token.kind)).toBe(true);
  }
  assertTokenStreamInvariants(document);

  for (const item of document.items) {
    if (item.kind === "TaskStmt") {
      expect(item.metaItems).toEqual(item.metaParts.filter((part) => part.kind !== "TaskMetaSeparator"));
      assertTaskMetaPartInvariants(document, item);
    }
  }
}

function assertTokenStreamInvariants(document: GanttDocument): void {
  let previousStart = 0;
  for (const token of document.tokens) {
    expect(token.range.start.offset).toBeGreaterThanOrEqual(previousStart);
    expect(token.range.end.offset).toBeGreaterThanOrEqual(token.range.start.offset);
    previousStart = token.range.start.offset;
  }
}

function assertTaskMetaPartInvariants(
  document: GanttDocument,
  item: Extract<GanttDocument["items"][number], { kind: "TaskStmt" }>
): void {
  let previousEnd = item.colon.range.end.offset;
  for (const part of item.metaParts) {
    expect(part.range.start.offset).toBeGreaterThanOrEqual(previousEnd);
    expect(part.range.end.offset).toBeGreaterThanOrEqual(part.range.start.offset);
    previousEnd = part.range.end.offset;

    if (part.kind === "TaskMetaSeparator") {
      expect(part.raw).toContain(",");
      expect(part.comma.kind).toBe("task-comma");
      expect(part.comma.range.start.offset).toBeGreaterThanOrEqual(part.range.start.offset);
      expect(part.comma.range.end.offset).toBeLessThanOrEqual(part.range.end.offset);
      expect(document.source.slice(part.comma.range.start.offset, part.comma.range.end.offset)).toBe(part.comma.raw);
    }
  }
}

function assertRangesSliceSource(document: GanttDocument): void {
  for (const item of document.items) {
    assertRangeRaw(document.source, item.range, item.raw);
    assertNestedRangesSliceSource(document.source, item);
  }
  for (const token of document.tokens) {
    assertRangeRaw(document.source, token.range, token.raw);
  }
  for (const error of document.errors) {
    assertConversionDiagnosticShape(document.source, error);
  }
}

function isKnownOrNamespacedTokenKind(kind: string): boolean {
  return KNOWN_TOKEN_KINDS.includes(kind as never) || kind.startsWith("custom:") || kind.startsWith("unknown:");
}

function assertRangeRaw(source: string, range: Range, raw: string): void {
  assertRangePositions(source, range);
  expect(source.slice(range.start.offset, range.end.offset)).toBe(raw);
}

function assertRangePositions(source: string, range: Range): void {
  const mapper = new RangeMapper(source);
  expect(range.start).toEqual(mapper.positionAtOffset(range.start.offset));
  expect(range.end).toEqual(mapper.positionAtOffset(range.end.offset));
}

function assertNestedRangesSliceSource(source: string, value: unknown): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (hasRawRange(value)) {
    assertRangeRaw(source, value.range, value.raw);
  }

  if (hasErrors(value)) {
    for (const error of value.errors) {
      assertConversionDiagnosticShape(source, error);
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      child.forEach((entry) => assertNestedRangesSliceSource(source, entry));
      continue;
    }
    assertNestedRangesSliceSource(source, child);
  }
}

function hasRawRange(value: object): value is { raw: string; range: Range } {
  return "raw" in value && typeof value.raw === "string" && "range" in value && isRange(value.range);
}

function hasErrors(value: object): value is { errors: unknown[] } {
  return "errors" in value && Array.isArray(value.errors);
}

function isRange(value: unknown): value is Range {
  return Boolean(
    value &&
    typeof value === "object" &&
    "start" in value &&
    "end" in value
  );
}

function assertConversionDiagnosticShape(source: string, error: unknown): void {
  expect(error).toMatchObject({
    code: expect.any(String),
    message: expect.any(String),
    severity: expect.stringMatching(/^(error|warning|info)$/),
    stage: "parse",
    instruction: {
      summary: expect.any(String),
      primaryRange: expect.any(Object),
      suggestedActions: expect.any(Array)
    }
  });
  if (error && typeof error === "object") {
    if ("code" in error) {
      expect(String(error.code).length).toBeGreaterThan(0);
    }
    if ("message" in error) {
      expect(String(error.message).length).toBeGreaterThan(0);
    }
  }
  if (error && typeof error === "object" && "range" in error && isRange(error.range)) {
    assertRangePositions(source, error.range);
  }
  if (!error || typeof error !== "object" || !("instruction" in error) || !error.instruction || typeof error.instruction !== "object") {
    return;
  }
  const instruction = error.instruction as { primaryRange?: unknown; relatedRanges?: unknown[]; suggestedActions?: unknown[] };
  expect(isRange(instruction.primaryRange)).toBe(true);
  if (isRange(instruction.primaryRange)) {
    assertRangePositions(source, instruction.primaryRange);
    if ("range" in error && isRange(error.range)) {
      expect(instruction.primaryRange).toEqual(error.range);
    }
  }
  for (const relatedRange of instruction.relatedRanges ?? []) {
    if (isRange(relatedRange)) {
      assertRangePositions(source, relatedRange);
    }
  }
  expect(Array.isArray(instruction.suggestedActions)).toBe(true);
  expect(instruction.suggestedActions?.length ?? 0).toBeGreaterThan(0);
}

function assertExpectedDiagnosticShape(source: string, diagnostic: ExpectedDiagnostic): void {
  expect(diagnostic).toMatchObject({
    code: expect.any(String),
    stage: expect.stringMatching(/^(parse|projection|resolution|lossless-write-back|normalized-emit|markdown-block-write-back)$/),
    severity: expect.stringMatching(/^(error|warning|info)$/),
    messageKey: expect.any(String),
    primaryRange: expect.any(Object),
    primaryRaw: expect.any(String),
    suggestedActions: expect.any(Array)
  });
  expect(isRange(diagnostic.primaryRange)).toBe(true);
  assertRangeRaw(source, diagnostic.primaryRange, diagnostic.primaryRaw);
  expect(diagnostic.suggestedActions.length).toBeGreaterThan(0);
  for (const action of diagnostic.suggestedActions) {
    expect(action.kind).toMatch(/^(manual-edit|quick-fix|fallback)$/);
    expect(action.labelKey).toEqual(expect.any(String));
  }
  for (const relatedRange of diagnostic.relatedRanges ?? []) {
    expect(isRange(relatedRange)).toBe(true);
    if (relatedRange.raw !== undefined) {
      assertRangeRaw(source, relatedRange, relatedRange.raw);
    }
  }
}

function assertSummaryRequiredDetails(summary: LosslessSummary): void {
  for (const item of summary.items) {
    if (item.kind === "TaskStmt") {
      expect(item.details).toMatchObject({
        label: expect.any(Object),
        colon: expect.any(Object),
        metaParts: expect.any(Array),
        metaItems: expect.any(Array)
      });
      for (const part of getDetailsArray(item.details, "metaParts")) {
        assertTaskMetaSummaryShape(part);
      }
      for (const part of getDetailsArray(item.details, "metaItems")) {
        assertTaskMetaSummaryShape(part);
      }
    }
    if (item.kind === "ClickStmt") {
      expect(item.details).toMatchObject({
        targetIdsRaw: expect.any(String),
        targetIds: expect.any(Array),
        clauses: expect.any(Array)
      });
    }
  }
}

function assertTaskMetaSummaryShape(part: unknown): void {
  if (!part || typeof part !== "object" || !("kind" in part)) {
    return;
  }
  if (part.kind === "AfterMetaSlice") {
    expect(part).toMatchObject({
      valueRaw: expect.any(String),
      refs: expect.any(Array),
      refsRaw: expect.any(Array)
    });
  }
  if (part.kind === "UntilMetaSlice") {
    expect(part).toMatchObject({
      valueRaw: expect.any(String),
      refRaw: expect.any(String)
    });
  }
}

function getDetailsArray(details: Record<string, unknown> | undefined, key: string): unknown[] {
  if (!details || !Array.isArray(details[key])) {
    return [];
  }
  return details[key];
}

function readLosslessManifest(): LosslessManifest {
  return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "lossless-manifest.json"), "utf8")) as LosslessManifest;
}

function discoverFixtureIds(groups: string[]): string[] {
  return groups.flatMap((group) => {
    const groupDir = join(process.cwd(), "fixtures", group);
    return readdirSync(groupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`);
  }).sort();
}

function normalizeManifestFixtureId(fixtureId: string): string {
  if (fixtureId.includes("/")) {
    return fixtureId;
  }
  return `lossless/${fixtureId}`;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
