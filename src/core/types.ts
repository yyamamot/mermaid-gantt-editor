export type Provenance = "docs" | "source" | "both";

export interface Position {
  offset: number;
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type ConversionStage =
  | "parse"
  | "projection"
  | "resolution"
  | "lossless-write-back"
  | "normalized-emit"
  | "markdown-block-write-back";

export interface UserFixInstruction {
  summary: string;
  detail?: string;
  primaryRange: Range;
  relatedRanges?: Range[];
  suggestedActions: SuggestedAction[];
}

export type SuggestedAction =
  | ManualEditAction
  | QuickFixAction
  | FallbackAction;

export interface ManualEditAction {
  kind: "manual-edit";
  label: string;
}

export interface QuickFixAction {
  kind: "quick-fix";
  label: string;
  labelText?: string;
  replacement?: {
    range: Range;
    text: string;
  };
}

export interface FallbackAction {
  kind: "fallback";
  label: string;
}

export interface ConversionDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  stage: ConversionStage;
  instruction: UserFixInstruction;
}

export interface ParseError extends ConversionDiagnostic {
  range: Range;
}

export interface TriviaSpan {
  kind: "indentation" | "inline-space" | "line-ending";
  raw: string;
  range: Range;
}

export const KNOWN_TOKEN_KINDS = [
  "frontmatter-open",
  "frontmatter-body",
  "frontmatter-close",
  "directive-open",
  "directive-body",
  "directive-close",
  "diagram-keyword",
  "statement-keyword",
  "statement-value",
  "comment",
  "blank-line",
  "task-label",
  "task-colon",
  "task-comma",
  "task-tag",
  "task-id",
  "task-date",
  "task-duration",
  "task-after-keyword",
  "task-until-keyword",
  "click-task-id",
  "click-href-keyword",
  "click-href-value",
  "click-call-keyword",
  "click-callback",
  "click-callback-args",
  "unknown-fragment",
  "newline"
] as const;

export type KnownTokenKind = typeof KNOWN_TOKEN_KINDS[number];

export type CustomTokenKind =
  | `custom:${string}`
  | `unknown:${string}`;

export type TokenKind = KnownTokenKind | CustomTokenKind;

export interface TokenSpan {
  kind: TokenKind;
  raw: string;
  range: Range;
}

export interface TaskMetaSeparator {
  kind: "TaskMetaSeparator";
  raw: string;
  range: Range;
  comma: TokenSpan;
}

export interface NodeBase {
  kind: string;
  nodeId: string;
  range: Range;
  raw: string;
  provenance: Provenance;
  leadingTrivia: TriviaSpan[];
  trailingTrivia: TriviaSpan[];
  errors: ParseError[];
}

export interface TextSlice {
  raw: string;
  range: Range;
}

export interface GanttDocument {
  kind: "GanttDocument";
  nodeId: string;
  source: string;
  items: DocumentItem[];
  tokens: TokenSpan[];
  errors: ParseError[];
}

export interface MarkdownGanttBlockContext {
  kind: "MarkdownGanttBlockContext";
  blockId: string;
  documentUri?: string;
  blockContentRange: Range;
  gantt: GanttDocument;
  toDocumentRange(range: Range): Range;
  toBlockRange(range: Range): Range;
}

export type DocumentItem =
  | FrontmatterBlockNode
  | DirectiveBlockNode
  | DiagramKeywordNode
  | StatementNode
  | CommentLineNode
  | BlankLineNode
  | UnknownBlockNode;

export interface FrontmatterBlockNode extends NodeBase {
  kind: "FrontmatterBlock";
  configRaw: string;
}

export interface DirectiveBlockNode extends NodeBase {
  kind: "DirectiveBlock";
  directiveRaw: string;
}

export interface DiagramKeywordNode extends NodeBase {
  kind: "DiagramKeyword";
  keywordRaw: string;
  targetDiagram: boolean;
}

export interface CommentLineNode extends NodeBase {
  kind: "CommentLine";
  commentRaw: string;
}

export interface BlankLineNode extends NodeBase {
  kind: "BlankLine";
}

export interface UnknownBlockNode extends NodeBase {
  kind: "UnknownBlock";
}

export type StatementNode =
  | ValueStatementNode
  | BooleanStatementNode
  | AccDescrBlockStmt
  | SectionStmt
  | TaskStmt
  | VertStmt
  | ClickStmt
  | UnknownStatementNode;

export interface ValueStatementNode extends NodeBase {
  kind:
    | "TitleStmt"
    | "DateFormatStmt"
    | "AxisFormatStmt"
    | "TickIntervalStmt"
    | "IncludesStmt"
    | "ExcludesStmt"
    | "WeekdayStmt"
    | "WeekendStmt"
    | "TodayMarkerStmt"
    | "AccTitleStmt"
    | "AccDescrLineStmt";
  valueRaw: string;
}

export interface BooleanStatementNode extends NodeBase {
  kind: "TopAxisStmt" | "InclusiveEndDatesStmt";
}

export interface AccDescrBlockStmt extends NodeBase {
  kind: "AccDescrBlockStmt";
  valueRaw: string;
}

export interface SectionStmt extends NodeBase {
  kind: "SectionStmt";
  labelRaw: string;
}

export interface VertStmt extends NodeBase {
  kind: "VertStmt";
  valueRaw: string;
}

export interface ClickHrefClause extends NodeBase {
  kind: "ClickHrefClause";
  hrefRaw: string;
}

export interface ClickCallClause extends NodeBase {
  kind: "ClickCallClause";
  callbackRaw: string;
  argsRaw?: string;
}

export interface RawClickClause extends NodeBase {
  kind: "RawClickClause";
  valueRaw: string;
}

export type ClickClauseSlice =
  | ClickHrefClause
  | ClickCallClause
  | RawClickClause;

export interface ClickStmt extends NodeBase {
  kind: "ClickStmt";
  targetIdsRaw: string;
  targetIds: TextSlice[];
  clauses: ClickClauseSlice[];
}

export interface TagMetaSlice extends NodeBase {
  kind: "TagMetaSlice";
  valueRaw: string;
}

export interface IdMetaSlice extends NodeBase {
  kind: "IdMetaSlice";
  valueRaw: string;
}

export interface DateMetaSlice extends NodeBase {
  kind: "DateMetaSlice";
  valueRaw: string;
}

export interface DurationMetaSlice extends NodeBase {
  kind: "DurationMetaSlice";
  valueRaw: string;
}

export interface AfterMetaSlice extends NodeBase {
  kind: "AfterMetaSlice";
  valueRaw: string;
  refs: TextSlice[];
  refsRaw: string[];
}

export interface UntilMetaSlice extends NodeBase {
  kind: "UntilMetaSlice";
  valueRaw: string;
  refRaw: string;
}

export interface RawMetaSlice extends NodeBase {
  kind: "RawMetaSlice";
  valueRaw: string;
}

export type TaskMetaSlice =
  | TagMetaSlice
  | IdMetaSlice
  | DateMetaSlice
  | DurationMetaSlice
  | AfterMetaSlice
  | UntilMetaSlice
  | RawMetaSlice;

export type TaskMetaPart = TaskMetaSlice | TaskMetaSeparator;

export interface TaskStmt extends NodeBase {
  kind: "TaskStmt";
  label: TextSlice;
  colon: TokenSpan;
  metaParts: TaskMetaPart[];
  metaItems: TaskMetaSlice[];
}

export type PreviewLabelPolicy =
  | "single-line"
  | "truncate-with-tooltip"
  | "viewer-postprocess";

export interface PreviewLabel {
  sourceLabelRaw: string;
  displayLabel: string;
  previewLabelPolicy: PreviewLabelPolicy;
}

export interface ProjectionIssue {
  nodeId: string;
  reasonCode: string;
  message: string;
  range: Range;
  severity: "error" | "warning" | "info";
  stage: ConversionStage;
  instruction: UserFixInstruction;
}

export interface SemanticDocument {
  kind: "SemanticDocument";
  settings: SemanticSettings;
  sections: SemanticSection[];
  projectionIssues: ProjectionIssue[];
}

export interface SemanticSettings {
  title?: string;
  dateFormat?: string;
  axisFormat?: string;
  tickInterval?: string;
  topAxis?: boolean;
  inclusiveEndDates?: boolean;
  includes?: string[];
  excludes?: string[];
  weekday?: string;
  weekend?: string;
  todayMarker?: string;
  accTitle?: string;
  accDescr?: string;
}

export interface SemanticSection {
  id: string;
  label: string;
  sourceNodeId?: string;
  implicit?: boolean;
  sourceLabelRaw: string;
  displayLabel: string;
  previewLabelPolicy: PreviewLabelPolicy;
  taskNodeIds: string[];
  tasks: SemanticTask[];
}

export interface SemanticTask {
  nodeId: string;
  id?: string;
  label: string;
  sourceLabelRaw: string;
  displayLabel: string;
  previewLabelPolicy: PreviewLabelPolicy;
  tags: string[];
  start?: string;
  end?: string;
  duration?: string;
  after?: string[];
  until?: string;
  milestone?: boolean;
}

export interface ResolvedDocument {
  kind: "ResolvedDocument";
  semantic: SemanticDocument;
  diagnostics: ResolvedDiagnostic[];
  tasks: ResolvedTask[];
}

export interface ResolvedTask {
  key: string;
  nodeId: string;
  mermaidId?: string;
  label: string;
  normalizedStart?: string;
  normalizedEnd?: string;
  dependencyKeys: string[];
}

export interface ResolvedDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  stage: ConversionStage;
  instruction: UserFixInstruction;
}

export interface DiagnosticSummaryItem {
  code: string;
  stage: ConversionStage;
  severity: "error" | "warning" | "info";
  messageKey: string;
  summary?: string;
  primaryRange: Range;
  primaryRaw: string;
  suggestedActions: Array<{
    kind: SuggestedAction["kind"];
    labelKey: string;
    labelText?: string;
    replacement?: {
      range: Range;
      text: string;
    };
  }>;
  relatedRanges?: Array<Range & { raw?: string }>;
}

export type EmitMode = "lossless-write-back" | "normalized-emit";

export type EditorMode = "structured" | "fallback";

export type TaskGridField =
  | "section"
  | "label"
  | "id"
  | "start"
  | "end"
  | "duration"
  | "dependencies"
  | "until"
  | "tags"
  | "clickHref";

export type TaskGridSortField =
  | "sourceOrder"
  | "section"
  | "label"
  | "id"
  | "start"
  | "end"
  | "duration";

export interface TaskGridSort {
  field: TaskGridSortField;
  direction: "asc" | "desc";
}

export interface TaskGridFilter {
  text?: string;
  sectionId?: string;
  severity?: "error" | "warning" | "info";
}

export interface TaskGridRow {
  kind: "task" | "section";
  rowId: string;
  nodeId: string;
  sourceOrder: number;
  sectionId: string;
  sectionLabel: string;
  label: string;
  id?: string;
  start?: string;
  end?: string;
  duration?: string;
  dependencies: string[];
  until?: string;
  tags: string[];
  clickHref?: string;
  milestone?: boolean;
  sourceLabelRaw: string;
  displayLabel: string;
  previewLabelPolicy: PreviewLabelPolicy;
  diagnostics: DiagnosticSummaryItem[];
  projectionIssues: ProjectionIssue[];
  editableFields: TaskGridField[];
}

export interface AdvancedSourceItem {
  nodeId: string;
  kind: DocumentItem["kind"];
  raw: string;
  range: Range;
  displayName: string;
  reasonCodes: string[];
}

export type EditorSelection =
  | { kind: "document" }
  | { kind: "section"; sectionId: string }
  | { kind: "task"; nodeId: string }
  | { kind: "advanced-source-item"; nodeId: string }
  | { kind: "diagnostic"; code: string; primaryRange: Range };

export interface TaskGridState {
  rows: TaskGridRow[];
  viewOrder: string[];
  sort?: TaskGridSort;
  filter?: TaskGridFilter;
  isViewOnlyOrdering: boolean;
}

export interface EditorState {
  mode: EditorMode;
  documentId: string;
  source: string;
  semantic?: SemanticDocument;
  resolved?: ResolvedDocument;
  selected: EditorSelection;
  grid: TaskGridState;
  advancedSourceItems: AdvancedSourceItem[];
  diagnostics: DiagnosticSummaryItem[];
  projectionIssues: ProjectionIssue[];
  previewSource?: string;
}

export type EditorAction =
  | { type: "select-document" }
  | { type: "select-section"; sectionId: string }
  | { type: "select-task"; nodeId: string }
  | { type: "select-advanced-source-item"; nodeId: string }
  | { type: "select-diagnostic"; code: string; primaryRange: Range }
  | { type: "update-setting"; key: keyof SemanticSettings; value: string | boolean | string[] | undefined }
  | { type: "update-grid-view"; sort?: TaskGridSort; filter?: TaskGridFilter }
  | { type: "update-section-label"; sectionId: string; label: string }
  | { type: "update-task-label"; nodeId: string; label: string }
  | { type: "update-task-id"; nodeId: string; id: string; dependencyPatchPolicy: "none" | "confirm" }
  | { type: "update-task-schedule"; nodeId: string; start?: string; end?: string; duration?: string }
  | { type: "update-task-dependencies"; nodeId: string; refs: string[] }
  | { type: "update-task-until"; nodeId: string; ref?: string }
  | { type: "update-task-tags"; nodeId: string; tags: string[] }
  | { type: "update-task-click-href"; nodeId: string; href?: string }
  | { type: "add-section"; afterSectionId?: string }
  | { type: "add-task"; sectionId?: string; afterNodeId?: string; beforeNodeId?: string; position?: "section-start" | "section-end" }
  | { type: "duplicate-task"; nodeId: string }
  | { type: "delete-task"; nodeId: string }
  | { type: "delete-section"; sectionId: string }
  | { type: "move-task"; nodeId: string; direction: "up" | "down" }
  | { type: "move-task-to-section"; nodeId: string; sectionId: string }
  | { type: "move-section"; sectionId: string; direction: "up" | "down" }
  | { type: "replace-source"; source: string }
  | { type: "enter-fallback"; reasonCode: string }
  | { type: "apply-diagnostic-action"; code: string; primaryRange: Range; actionIndex: number };

export interface EditorActionResult {
  state: EditorState;
  sourceChanged: boolean;
  diagnostics: ConversionDiagnostic[];
}

export interface LosslessTextPatch {
  range: Range;
  text: string;
}

export interface EmitResult {
  mode: EmitMode;
  source: string;
  changed: boolean;
  diagnostics: ConversionDiagnostic[];
}

export interface UnknownStatementNode extends NodeBase {
  kind: "UnknownStatement";
}

export interface LosslessSummaryItem {
  nodeId: string;
  kind: string;
  raw: string;
  range: Range;
  provenance: Provenance;
  projectable: boolean;
  errors: ParseError[];
  details?: Record<string, unknown>;
}

export interface LosslessSummary {
  fixtureId: string;
  items: LosslessSummaryItem[];
  documentErrors: ParseError[];
  tokenKindsSeen: TokenKind[];
  resyncBoundary?: {
    nodeId: string;
    afterLine: number;
  };
}
