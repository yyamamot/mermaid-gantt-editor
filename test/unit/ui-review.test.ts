import { describe, expect, it } from "vitest";
import {
  createUiReviewReport,
  evaluateUiReviewSnapshot,
  resultForUiReviewChecks,
  type UiReviewSnapshot
} from "../../src/harness";

describe("UI review checks", () => {
  it("accepts a basic visible UI snapshot", () => {
    const checks = evaluateUiReviewSnapshot(snapshot());

    expect(resultForUiReviewChecks(checks)).toBe("pass");
  });

  it("flags clipping and detached popup geometry", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      geometry: {
        relationships: [{
          type: "popup-anchor",
          sourceReviewId: "row-menu",
          targetReviewId: "row-menu-button",
          distance: 200
        }],
        elements: [{
          reviewId: "clipped-button",
          tagName: "BUTTON",
          role: "button",
          label: "Very long label",
          visible: true,
          disabled: false,
          rect: rect(1, 1, 20, 20),
          scrollWidth: 200,
          scrollHeight: 20,
          clientWidth: 20,
          clientHeight: 20
        }]
      }
    }));

    expect(checks.map((check) => check.id)).toContain("clipping-clipped-button");
    expect(checks.map((check) => check.id)).toContain("popup-anchor-row-menu-row-menu-button");
    expect(resultForUiReviewChecks(checks)).toBe("needs-fix");
  });

  it("flags major overflow, floating viewport escape, and drawer overlap", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      geometry: {
        viewport: { width: 420, height: 320 },
        elements: [
          {
            reviewId: "workspace",
            tagName: "DIV",
            role: "region",
            label: "workspace",
            visible: true,
            disabled: false,
            rect: rect(0, 0, 420, 320),
            scrollWidth: 620,
            scrollHeight: 320,
            clientWidth: 420,
            clientHeight: 320
          },
          element("details-drawer", "ASIDE", "complementary", rect(20, 180, 340, 120)),
          element("row-action-menu-node-1", "DIV", "menu", rect(360, 20, 120, 140)),
          element("preview-mini-editor", "DIV", "region", rect(40, 220, 280, 70))
        ]
      }
    }));

    expect(checks.map((check) => check.id)).toContain("overflow-workspace");
    expect(checks.map((check) => check.id)).toContain("floating-viewport-row-action-menu-node-1");
    expect(checks.map((check) => check.id)).toContain("details-preview-mini-editor-overlap");
    expect(resultForUiReviewChecks(checks)).toBe("needs-fix");
  });

  it("flags Task Grid date clipping, excessive horizontal overflow, and clipped action buttons", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      geometry: {
        elements: [
          element("task-grid-table-wrap", "DIV", "region", rect(10, 90, 700, 320), {
            scrollWidth: 920,
            clientWidth: 700
          }),
          element("task-grid-table", "TABLE", "table", rect(10, 90, 700, 320), {
            className: "grid grid-has-tags"
          }),
          element("task-grid-start-input", "INPUT", "textbox", rect(400, 130, 80, 24), {
            action: "update-task-start",
            scrollWidth: 128,
            clientWidth: 80
          }),
          element("row-action-menu-button-node-1", "BUTTON", "button", rect(690, 130, 20, 20), {
            action: "toggle-row-action-menu"
          })
        ]
      }
    }));

    expect(checks.find((check) => check.id === "task-grid-date-inputs-fit")?.passed).toBe(false);
    expect(checks.find((check) => check.id === "task-grid-horizontal-overflow")?.passed).toBe(false);
    expect(checks.find((check) => check.id === "task-grid-actions-visible")?.passed).toBe(false);
    expect(resultForUiReviewChecks(checks)).toBe("needs-fix");
  });

  it("accepts fitted Task Grid geometry for no-tags layout", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      geometry: {
        elements: [
          element("task-grid-table-wrap", "DIV", "region", rect(10, 90, 700, 320), {
            scrollWidth: 704,
            clientWidth: 700
          }),
          element("task-grid-table", "TABLE", "table", rect(10, 90, 700, 320), {
            className: "grid grid-no-tags"
          }),
          element("task-grid-start-input", "INPUT", "textbox", rect(430, 130, 110, 24), {
            action: "update-task-start",
            scrollWidth: 110,
            clientWidth: 110
          }),
          element("task-grid-end-input", "INPUT", "textbox", rect(540, 130, 110, 24), {
            action: "update-task-end",
            scrollWidth: 110,
            clientWidth: 110
          }),
          element("row-action-menu-button-node-1", "BUTTON", "button", rect(672, 130, 30, 30), {
            action: "toggle-row-action-menu"
          })
        ]
      }
    }));

    expect(checks.find((check) => check.id === "task-grid-date-inputs-fit")?.passed).toBe(true);
    expect(checks.find((check) => check.id === "task-grid-horizontal-overflow")?.passed).toBe(true);
    expect(checks.find((check) => check.id === "task-grid-actions-visible")?.passed).toBe(true);
    expect(resultForUiReviewChecks(checks)).toBe("pass");
  });

  it("allows Task Grid to be hidden when Preview focus is active", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      selfReview: { previewFocused: true },
      geometry: {
        elements: [{
          reviewId: "task-grid",
          tagName: "SECTION",
          role: "region",
          label: "Task Grid",
          visible: false,
          disabled: false,
          rect: rect(0, 0, 0, 0),
          scrollWidth: 0,
          scrollHeight: 0,
          clientWidth: 0,
          clientHeight: 0
        }]
      }
    }));

    expect(checks.find((check) => check.id === "required-visible-task-grid")?.passed).toBe(true);
    expect(resultForUiReviewChecks(checks)).toBe("pass");
  });

  it("flags structured source actions in fallback mode", () => {
    const checks = evaluateUiReviewSnapshot(snapshot({
      selfReview: { mode: "fallback" },
      geometry: {
        elements: [{
          reviewId: "add-task",
          tagName: "BUTTON",
          role: "button",
          label: "Add task",
          visible: true,
          disabled: false,
          action: "add-task",
          rect: rect(1, 1, 80, 24),
          scrollWidth: 80,
          scrollHeight: 24,
          clientWidth: 80,
          clientHeight: 24
        }]
      }
    }));

    expect(checks.find((check) => check.id === "fallback-hides-structured-actions")?.passed).toBe(false);
  });

  it("creates an aggregate report", () => {
    const report = createUiReviewReport([{
      id: "scenario",
      result: "needs-fix",
      checks: [{ id: "bad", severity: "error", passed: false, summary: "Bad layout." }],
      artifactPaths: { screenshot: "screen.png" }
    }], { root: "/tmp/review" });

    expect(report.result).toBe("needs-fix");
    expect(report.findings[0]?.id).toBe("scenario:bad");
    expect(report.humanReviewNeeded).toContain("Animation smoothness");
  });
});

type SnapshotOverrides = Omit<Partial<UiReviewSnapshot>, "geometry" | "selfReview"> & {
  geometry?: Partial<UiReviewSnapshot["geometry"]>;
  selfReview?: Partial<UiReviewSnapshot["selfReview"]>;
};

function snapshot(overrides: SnapshotOverrides = {}): UiReviewSnapshot {
  const baseElements = [
    element("shell", "DIV", "region", rect(0, 0, 1200, 800)),
    element("task-grid", "SECTION", "region", rect(10, 80, 700, 400)),
    element("preview-pane", "SECTION", "region", rect(10, 500, 700, 250)),
    element("details-drawer", "ASIDE", "complementary", rect(760, 80, 380, 660))
  ];
  return {
    capturedAt: "2026-04-26T00:00:00.000Z",
    reason: "test",
    selfReview: {
      mode: "structured",
      detailsOpen: true,
      previewCollapsed: false,
      isViewOnlyOrdering: false,
      ...overrides.selfReview
    },
    geometry: {
      viewport: overrides.geometry?.viewport ?? { width: 1200, height: 800 },
      elements: [...baseElements, ...(overrides.geometry?.elements ?? [])],
      relationships: overrides.geometry?.relationships ?? []
    }
  };
}

function element(
  reviewId: string,
  tagName: string,
  role: string,
  value: UiReviewSnapshot["geometry"]["elements"][number]["rect"],
  overrides: Partial<UiReviewSnapshot["geometry"]["elements"][number]> = {}
) {
  return {
    reviewId,
    tagName,
    role,
    label: reviewId,
    visible: true,
    disabled: false,
    rect: value,
    scrollWidth: value.width,
    scrollHeight: value.height,
    clientWidth: value.width,
    clientHeight: value.height,
    ...overrides
  };
}

function rect(x: number, y: number, width: number, height: number) {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x
  };
}
