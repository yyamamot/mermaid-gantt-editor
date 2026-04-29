import type {
  ClickClauseSlice,
  DocumentItem,
  GanttDocument,
  LosslessSummary,
  LosslessSummaryItem,
  TaskMetaPart,
  TaskMetaSlice
} from "./types";

export function createLosslessSummary(
  fixtureId: string,
  document: GanttDocument
): LosslessSummary {
  return {
    fixtureId,
    items: document.items.map((item) => summarizeItem(item)),
    documentErrors: document.errors,
    tokenKindsSeen: [...new Set(document.tokens.map((token) => token.kind))]
  };
}

export function reconstructLosslessSource(document: GanttDocument): string {
  return document.items.map((item) => item.raw).join("");
}

function summarizeItem(item: DocumentItem): LosslessSummaryItem {
  return {
    nodeId: item.nodeId,
    kind: item.kind,
    raw: item.raw,
    range: item.range,
    provenance: item.provenance,
    projectable: isProjectable(item),
    errors: item.errors,
    details: summarizeDetails(item)
  };
}

function isProjectable(item: DocumentItem): boolean {
  switch (item.kind) {
    case "UnknownBlock":
    case "UnknownStatement":
    case "FrontmatterBlock":
    case "DirectiveBlock":
    case "ClickStmt":
    case "VertStmt":
      return false;
    case "DiagramKeyword":
      return item.targetDiagram;
    default:
      return true;
  }
}

function summarizeDetails(item: DocumentItem): Record<string, unknown> | undefined {
  switch (item.kind) {
    case "DiagramKeyword":
      return {
        keywordRaw: item.keywordRaw,
        targetDiagram: item.targetDiagram
      };
    case "FrontmatterBlock":
      return { configRaw: item.configRaw };
    case "DirectiveBlock":
      return { directiveRaw: item.directiveRaw };
    case "CommentLine":
      return { commentRaw: item.commentRaw };
    case "TitleStmt":
    case "DateFormatStmt":
    case "AxisFormatStmt":
    case "TickIntervalStmt":
    case "IncludesStmt":
    case "ExcludesStmt":
    case "WeekdayStmt":
    case "WeekendStmt":
    case "TodayMarkerStmt":
    case "AccTitleStmt":
    case "AccDescrLineStmt":
      return { valueRaw: item.valueRaw };
    case "SectionStmt":
      return { labelRaw: item.labelRaw };
    case "VertStmt":
      return { valueRaw: item.valueRaw };
    case "AccDescrBlockStmt":
      return { valueRaw: item.valueRaw };
    case "TaskStmt":
      return {
        label: item.label,
        colon: item.colon,
        metaParts: item.metaParts.map(summarizeTaskMetaPart),
        metaItems: item.metaItems.map(summarizeTaskMetaSlice)
      };
    case "ClickStmt":
      return {
        targetIdsRaw: item.targetIdsRaw,
        targetIds: item.targetIds,
        clauses: item.clauses.map(summarizeClickClause)
      };
    case "BlankLine":
    case "UnknownBlock":
    case "UnknownStatement":
    case "TopAxisStmt":
    case "InclusiveEndDatesStmt":
      return undefined;
  }
}

function summarizeTaskMetaPart(part: TaskMetaPart): Record<string, unknown> {
  if (part.kind === "TaskMetaSeparator") {
    return {
      kind: part.kind,
      raw: part.raw,
      range: part.range,
      comma: part.comma
    };
  }

  return summarizeTaskMetaSlice(part);
}

function summarizeTaskMetaSlice(part: TaskMetaSlice): Record<string, unknown> {
  const base = {
    kind: part.kind,
    raw: part.raw,
    range: part.range,
    valueRaw: part.valueRaw,
    errors: part.errors
  };

  if (part.kind === "AfterMetaSlice") {
    return { ...base, refs: part.refs, refsRaw: part.refsRaw };
  }
  if (part.kind === "UntilMetaSlice") {
    return { ...base, refRaw: part.refRaw };
  }

  return base;
}

function summarizeClickClause(clause: ClickClauseSlice): Record<string, unknown> {
  const base = {
    kind: clause.kind,
    raw: clause.raw,
    range: clause.range,
    errors: clause.errors
  };

  if (clause.kind === "ClickHrefClause") {
    return { ...base, hrefRaw: clause.hrefRaw };
  }
  if (clause.kind === "ClickCallClause") {
    return { ...base, callbackRaw: clause.callbackRaw, argsRaw: clause.argsRaw };
  }

  return { ...base, valueRaw: clause.valueRaw };
}
