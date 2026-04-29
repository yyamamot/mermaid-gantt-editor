export type UiReviewResult = "pass" | "needs-fix" | "human-review";
export type UiReviewSeverity = "error" | "warning" | "info";

export interface UiReviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface UiReviewElement {
  reviewId: string;
  tagName: string;
  role: string;
  label: string;
  visible: boolean;
  disabled: boolean;
  action?: string;
  rect: UiReviewRect;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  className?: string;
}

export interface UiReviewRelationship {
  type: "popup-anchor" | "picker-anchor";
  sourceReviewId: string;
  targetReviewId: string;
  distance: number;
}

export interface UiReviewGeometry {
  viewport: {
    width: number;
    height: number;
  };
  elements: UiReviewElement[];
  relationships: UiReviewRelationship[];
}

export interface UiReviewSnapshot {
  capturedAt: string;
  reason: string;
  selfReview: {
    mode?: "structured" | "fallback";
    layout?: "horizontal" | "vertical";
    detailsOpen?: boolean;
    detailsTab?: string;
    previewCollapsed?: boolean;
    isViewOnlyOrdering?: boolean;
    [key: string]: unknown;
  };
  geometry: UiReviewGeometry;
}

export interface UiReviewCheck {
  id: string;
  severity: UiReviewSeverity;
  passed: boolean;
  summary: string;
  evidence?: string;
}

export interface UiReviewScenarioResult {
  id: string;
  result: UiReviewResult;
  checks: UiReviewCheck[];
  artifactPaths: Record<string, string>;
}

export interface UiReviewReport {
  result: UiReviewResult;
  scenarioResults: UiReviewScenarioResult[];
  findings: UiReviewCheck[];
  humanReviewNeeded: string[];
  artifactPaths: Record<string, string>;
}

const STRUCTURED_SOURCE_ACTIONS = new Set([
  "add-task",
  "add-section",
  "duplicate-task",
  "move-task",
  "move-task-to-section",
  "move-section",
  "request-delete-task",
  "request-delete-section",
  "toggle-task-tag",
  "update-task-label",
  "update-task-id",
  "update-task-start",
  "update-task-end",
  "update-task-duration",
  "update-task-dependencies",
  "update-task-until",
  "update-task-tags",
  "update-section-label",
  "update-setting"
]);

const SOURCE_ORDER_ACTIONS = new Set([
  "move-task",
  "move-task-to-section",
  "move-section"
]);

const MAJOR_OVERFLOW_REVIEW_IDS = new Set([
  "shell",
  "workspace",
  "task-grid",
  "preview-pane",
  "details-drawer",
  "preview-mini-editor"
]);

const TASK_GRID_DATE_ACTIONS = new Set(["update-task-start", "update-task-end"]);
const TASK_GRID_HORIZONTAL_REVIEW_IDS = ["task-grid-table-wrap", "task-grid-table"] as const;

export function evaluateUiReviewSnapshot(snapshot: UiReviewSnapshot): UiReviewCheck[] {
  const checks: UiReviewCheck[] = [];
  const visibleElements = snapshot.geometry.elements.filter((element) => element.visible);
  const byReviewId = new Map(snapshot.geometry.elements.map((element) => [element.reviewId, element]));

  for (const id of ["shell", "task-grid", "preview-pane"]) {
    const element = byReviewId.get(id);
    const intentionallyHidden = id === "task-grid" && snapshot.selfReview.previewFocused === true;
    checks.push({
      id: `required-visible-${id}`,
      severity: "error",
      passed: intentionallyHidden || Boolean(element?.visible && element.rect.width > 0 && element.rect.height > 0),
      summary: intentionallyHidden
        ? `${id} may be hidden while Preview focus is active.`
        : `${id} must be visible and non-empty.`
    });
  }

  if (snapshot.selfReview.detailsOpen) {
    const drawer = byReviewId.get("details-drawer");
    const viewportWidth = snapshot.geometry.viewport.width;
    checks.push({
      id: "drawer-visible-when-open",
      severity: "error",
      passed: Boolean(drawer?.visible && drawer.rect.width > 0 && drawer.rect.width < viewportWidth * 0.9),
      summary: "Details drawer must be visible without covering almost the whole viewport."
    });
  }

  for (const element of visibleElements) {
    if (element.rect.width <= 0 || element.rect.height <= 0) {
      checks.push({
        id: `nonzero-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Visible element ${element.reviewId} has zero size.`
      });
    }
    const outOfViewport = element.rect.right < -1 ||
      element.rect.bottom < -1 ||
      element.rect.left > snapshot.geometry.viewport.width + 1 ||
      element.rect.top > snapshot.geometry.viewport.height + 1;
    if (outOfViewport) {
      checks.push({
        id: `viewport-${element.reviewId}`,
        severity: "warning",
        passed: false,
        summary: `Visible element ${element.reviewId} is outside the viewport.`
      });
    }
    if (isClippingCandidate(element) && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2)) {
      checks.push({
        id: `clipping-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Text or content may be clipped in ${element.reviewId}.`
      });
    }
    if (isMajorOverflowCandidate(element) && hasScrollableOverflow(element)) {
      checks.push({
        id: `overflow-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Major UI region ${element.reviewId} overflows its own bounds.`,
        evidence: `scroll=${element.scrollWidth}x${element.scrollHeight}, client=${element.clientWidth}x${element.clientHeight}`
      });
    }
    if (isFloatingViewportCandidate(element) && isOutsideViewport(element, snapshot.geometry.viewport)) {
      checks.push({
        id: `floating-viewport-${element.reviewId}`,
        severity: "error",
        passed: false,
        summary: `Floating UI ${element.reviewId} must stay inside the viewport.`
      });
    }
  }

  const detailsDrawer = byReviewId.get("details-drawer");
  const previewMiniEditor = byReviewId.get("preview-mini-editor");
  if (detailsDrawer?.visible && previewMiniEditor?.visible && rectsOverlap(detailsDrawer.rect, previewMiniEditor.rect)) {
    checks.push({
      id: "details-preview-mini-editor-overlap",
      severity: "error",
      passed: false,
      summary: "Details drawer must not overlap the Preview mini editor."
    });
  }

  for (const relationship of snapshot.geometry.relationships) {
    const limit = relationship.type === "popup-anchor" ? 96 : 48;
    checks.push({
      id: `${relationship.type}-${relationship.sourceReviewId}-${relationship.targetReviewId}`,
      severity: "error",
      passed: relationship.distance <= limit,
      summary: `${relationship.type} distance must stay near its anchor.`
    });
  }

  checks.push(...evaluateTaskGridGeometry(snapshot, visibleElements, byReviewId));

  if (snapshot.selfReview.mode === "fallback") {
    const structuredActions = visibleElements
      .map((element) => element.action)
      .filter((action): action is string => Boolean(action && STRUCTURED_SOURCE_ACTIONS.has(action)));
    checks.push({
      id: "fallback-hides-structured-actions",
      severity: "error",
      passed: structuredActions.length === 0,
      summary: "Fallback mode must not expose structured source-changing actions.",
      ...(structuredActions.length > 0 ? { evidence: structuredActions.join(", ") } : {})
    });
  }

  if (snapshot.selfReview.isViewOnlyOrdering) {
    const sourceOrderActions = visibleElements
      .map((element) => element.action)
      .filter((action): action is string => Boolean(action && SOURCE_ORDER_ACTIONS.has(action)));
    checks.push({
      id: "view-only-ordering-hides-source-order-actions",
      severity: "error",
      passed: sourceOrderActions.length === 0,
      summary: "Sort/filter view-only ordering must hide source-order move actions.",
      ...(sourceOrderActions.length > 0 ? { evidence: sourceOrderActions.join(", ") } : {})
    });
  }

  if (snapshot.selfReview.previewCollapsed) {
    const previewBox = byReviewId.get("preview-box");
    const previewControls = byReviewId.get("preview-controls");
    checks.push({
      id: "preview-collapsed-hides-body",
      severity: "error",
      passed: previewBox?.visible === false,
      summary: "Collapsed preview must hide the preview body."
    });
    checks.push({
      id: "preview-collapsed-hides-zoom-controls",
      severity: "error",
      passed: previewControls?.visible === false,
      summary: "Collapsed preview must hide zoom controls."
    });
  }

  return checks.length === 0
    ? [{ id: "ui-review-no-findings", severity: "info", passed: true, summary: "No deterministic UI review findings." }]
    : checks;
}

export function resultForUiReviewChecks(checks: UiReviewCheck[]): UiReviewResult {
  if (checks.some((check) => !check.passed && check.severity === "error")) {
    return "needs-fix";
  }
  return "pass";
}

export function createUiReviewReport(
  scenarioResults: UiReviewScenarioResult[],
  artifactPaths: Record<string, string> = {}
): UiReviewReport {
  const findings = scenarioResults.flatMap((scenario) => {
    return scenario.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        ...check,
        id: `${scenario.id}:${check.id}`
      }));
  });
  const result: UiReviewResult = findings.some((finding) => finding.severity === "error")
    ? "needs-fix"
    : "pass";
  return {
    result,
    scenarioResults,
    findings,
    humanReviewNeeded: [
      "Animation smoothness",
      "Hover tooltip timing",
      "Native popup behavior",
      "Long-session visual fatigue"
    ],
    artifactPaths
  };
}

function isClippingCandidate(element: UiReviewElement): boolean {
  return element.tagName === "BUTTON" ||
    element.tagName === "SELECT" ||
    element.role === "tab" ||
    element.role === "menuitem";
}

function isMajorOverflowCandidate(element: UiReviewElement): boolean {
  return MAJOR_OVERFLOW_REVIEW_IDS.has(element.reviewId) ||
    element.reviewId === "detail-tabs" ||
    element.reviewId.startsWith("row-action-menu-") ||
    element.reviewId.startsWith("dependency-picker-") ||
    element.reviewId.startsWith("preview-mini-calendar");
}

function hasScrollableOverflow(element: UiReviewElement): boolean {
  return element.scrollWidth > element.clientWidth + 2;
}

function evaluateTaskGridGeometry(
  snapshot: UiReviewSnapshot,
  visibleElements: UiReviewElement[],
  byReviewId: Map<string, UiReviewElement>
): UiReviewCheck[] {
  const taskGrid = byReviewId.get("task-grid");
  if (!taskGrid?.visible || taskGrid.rect.width <= 0 || taskGrid.rect.height <= 0) {
    return [];
  }
  const tableWrap = byReviewId.get("task-grid-table-wrap") ?? taskGrid;

  return [
    ...checkTaskGridDateInputs(visibleElements, tableWrap),
    ...checkTaskGridHorizontalOverflow(byReviewId, snapshot.geometry.viewport.width),
    ...checkTaskGridActionButtons(visibleElements, tableWrap, byReviewId, snapshot.geometry.viewport.width)
  ];
}

function checkTaskGridDateInputs(visibleElements: UiReviewElement[], tableWrap: UiReviewElement): UiReviewCheck[] {
  const dateInputs = visibleElements.filter((element) => {
    return element.tagName === "INPUT" &&
      Boolean(element.action && TASK_GRID_DATE_ACTIONS.has(element.action)) &&
      rectsOverlap(element.rect, tableWrap.rect);
  });

  if (dateInputs.length === 0) {
    return [];
  }

  const clipped = dateInputs.filter((element) => {
    return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
  });

  return [{
    id: "task-grid-date-inputs-fit",
    severity: "error",
    passed: clipped.length === 0,
    summary: "Task Grid Start and End date text inputs must fully show their value.",
    ...(clipped.length > 0 ? { evidence: summarizeElements(clipped) } : {})
  }];
}

function checkTaskGridHorizontalOverflow(
  byReviewId: Map<string, UiReviewElement>,
  viewportWidth: number
): UiReviewCheck[] {
  const regions = TASK_GRID_HORIZONTAL_REVIEW_IDS
    .map((id) => byReviewId.get(id))
    .filter((element): element is UiReviewElement => Boolean(element?.visible && element.clientWidth > 0));

  if (regions.length === 0) {
    return [];
  }

  const overflow = regions.map((element) => ({
    element,
    amount: Math.max(0, element.scrollWidth - element.clientWidth)
  }));
  const excessive = overflow.filter(({ element, amount }) => amount > allowedTaskGridHorizontalOverflow(element, viewportWidth));

  return [{
    id: "task-grid-horizontal-overflow",
    severity: "error",
    passed: excessive.length === 0,
    summary: "Task Grid horizontal overflow must stay within the deterministic layout tolerance.",
    evidence: overflow
      .map(({ element, amount }) => `${element.reviewId}: overflow=${amount}, scrollWidth=${element.scrollWidth}, clientWidth=${element.clientWidth}`)
      .join("; ")
  }];
}

function checkTaskGridActionButtons(
  visibleElements: UiReviewElement[],
  tableWrap: UiReviewElement,
  byReviewId: Map<string, UiReviewElement>,
  viewportWidth: number
): UiReviewCheck[] {
  const container = byReviewId.get("task-grid-table-wrap") ?? tableWrap;
  const actionButtons = visibleElements.filter((element) => {
    return element.tagName === "BUTTON" &&
      element.action === "toggle-row-action-menu" &&
      rectsOverlap(element.rect, tableWrap.rect);
  });

  if (actionButtons.length === 0) {
    return [];
  }

  const failures = actionButtons.filter((element) => {
    const viewportRightGap = viewportWidth - element.rect.right;
    const containerRightGap = container.rect.right - element.rect.right;
    return element.rect.width < 24 ||
      element.rect.height < 24 ||
      element.scrollWidth > element.clientWidth + 2 ||
      element.scrollHeight > element.clientHeight + 2 ||
      viewportRightGap < 2 ||
      containerRightGap < 4;
  });

  return [{
    id: "task-grid-actions-visible",
    severity: "error",
    passed: failures.length === 0,
    summary: "Task Grid row action kebab buttons must remain visible, clickable, and inset from the right edge.",
    ...(failures.length > 0 ? { evidence: summarizeElements(failures) } : {})
  }];
}

function allowedTaskGridHorizontalOverflow(element: UiReviewElement, viewportWidth: number): number {
  const responsiveAllowance = viewportWidth < 700 ? 0.2 : 0.05;
  const minimumAllowance = viewportWidth < 700 ? 80 : 32;
  return Math.max(minimumAllowance, Math.round(element.clientWidth * responsiveAllowance));
}

function summarizeElements(elements: UiReviewElement[]): string {
  return elements
    .map((element) => {
      return `${element.reviewId} action=${element.action ?? "-"} rect=${Math.round(element.rect.width)}x${Math.round(element.rect.height)} scroll=${element.scrollWidth}x${element.scrollHeight} client=${element.clientWidth}x${element.clientHeight}`;
    })
    .join("; ");
}

function isFloatingViewportCandidate(element: UiReviewElement): boolean {
  return element.reviewId.startsWith("row-action-menu-") ||
    element.reviewId.startsWith("dependency-picker-") ||
    element.reviewId.startsWith("preview-mini-calendar");
}

function isOutsideViewport(element: UiReviewElement, viewport: UiReviewGeometry["viewport"]): boolean {
  const margin = 1;
  return element.rect.left < -margin ||
    element.rect.top < -margin ||
    element.rect.right > viewport.width + margin ||
    element.rect.bottom > viewport.height + margin;
}

function rectsOverlap(left: UiReviewRect, right: UiReviewRect): boolean {
  return left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top;
}
