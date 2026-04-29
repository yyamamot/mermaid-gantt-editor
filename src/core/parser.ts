import {
  type AccDescrBlockStmt,
  type BlankLineNode,
  type ClickClauseSlice,
  type ClickStmt,
  type CommentLineNode,
  type DiagramKeywordNode,
  type DirectiveBlockNode,
  type DocumentItem,
  type FrontmatterBlockNode,
  type GanttDocument,
  type ParseError,
  type Position,
  type Range,
  type StatementNode,
  type TextSlice,
  type TokenSpan,
  type TokenKind,
  type TaskMetaPart,
  type TaskMetaSeparator,
  type TriviaSpan,
  type UnknownBlockNode,
  type UnknownStatementNode,
  type ValueStatementNode,
  type BooleanStatementNode,
  type SectionStmt,
  type TaskStmt,
  type TaskMetaSlice,
  type VertStmt,
  type ClickHrefClause,
  type ClickCallClause,
  type RawClickClause,
  type TagMetaSlice,
  type IdMetaSlice,
  type DateMetaSlice,
  type DurationMetaSlice,
  type AfterMetaSlice,
  type UntilMetaSlice,
  type RawMetaSlice,
  type Provenance
} from "./types";
import {
  RangeMapper,
  splitSourceLines,
  type SourceLine
} from "./range";

type KeywordKind =
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

const VALUE_STATEMENTS: Array<{ prefix: string; kind: KeywordKind; provenance: Provenance }> = [
  { prefix: "title ", kind: "TitleStmt", provenance: "both" },
  { prefix: "dateFormat ", kind: "DateFormatStmt", provenance: "both" },
  { prefix: "axisFormat ", kind: "AxisFormatStmt", provenance: "both" },
  { prefix: "tickInterval ", kind: "TickIntervalStmt", provenance: "both" },
  { prefix: "includes ", kind: "IncludesStmt", provenance: "source" },
  { prefix: "excludes ", kind: "ExcludesStmt", provenance: "both" },
  { prefix: "weekday ", kind: "WeekdayStmt", provenance: "both" },
  { prefix: "weekend ", kind: "WeekendStmt", provenance: "both" },
  { prefix: "todayMarker ", kind: "TodayMarkerStmt", provenance: "both" },
  { prefix: "accTitle:", kind: "AccTitleStmt", provenance: "both" },
  { prefix: "accDescr:", kind: "AccDescrLineStmt", provenance: "both" }
];

const BOOLEAN_STATEMENTS: Array<{ raw: string; kind: BooleanStatementNode["kind"]; provenance: Provenance }> = [
  { raw: "topAxis", kind: "TopAxisStmt", provenance: "source" },
  { raw: "inclusiveEndDates", kind: "InclusiveEndDatesStmt", provenance: "source" }
];

const TASK_TAGS = new Set(["active", "done", "crit", "milestone", "vert"]);

class ParseContext {
  private nodeCounter = 0;
  private itemCounter = 0;
  private readonly mapper: RangeMapper;
  public readonly tokens: TokenSpan[] = [];
  public readonly errors: ParseError[] = [];

  constructor(private readonly source: string) {
    this.mapper = new RangeMapper(source);
  }

  nextNodeId(): string {
    this.nodeCounter += 1;
    return `n${this.nodeCounter}`;
  }

  nextItemId(): string {
    this.itemCounter += 1;
    return `i${this.itemCounter}`;
  }

  position(offset: number, line: number, column: number): Position {
    return { offset, line, column };
  }

  positionAtOffset(offset: number): Position {
    return this.mapper.positionAtOffset(offset);
  }

  rangeFromOffsets(startOffset: number, endOffset: number): Range {
    return this.mapper.rangeFromOffsets(startOffset, endOffset);
  }

  rangeFromLine(line: SourceLine): Range {
    return this.mapper.rangeFromLine(line);
  }

  pushToken(kind: TokenKind, raw: string, range: Range): void {
    this.tokens.push({ kind, raw, range });
  }

  sourceSlice(startOffset: number, endOffset: number): string {
    return this.source.slice(startOffset, endOffset);
  }

  rangeFromColumns(line: SourceLine, startColumnIndex: number, endColumnIndex: number): Range {
    return this.mapper.rangeFromColumns(line, startColumnIndex, endColumnIndex);
  }
}

export function parseGanttLossless(source: string): GanttDocument {
  const context = new ParseContext(source);
  const lines = splitSourceLines(source);
  const items: DocumentItem[] = [];

  let index = 0;
  let diagramSeen = false;

  while (index < lines.length) {
    const line = lines[index];

    if (!diagramSeen) {
      const frontmatter = scanFrontmatter(lines, index, context);
      if (frontmatter) {
        items.push(frontmatter.node);
        index = frontmatter.nextIndex;
        continue;
      }
    }

    const directive = scanDirective(lines, index, context);
    if (directive) {
      items.push(directive.node);
      index = directive.nextIndex;
      continue;
    }

    const item = parseLine(lines, index, context, diagramSeen);
    items.push(item.node);

    if (item.node.kind === "DiagramKeyword") {
      diagramSeen = (item.node as DiagramKeywordNode).targetDiagram;
      if (!(item.node as DiagramKeywordNode).targetDiagram) {
        context.errors.push(createParseError(
          "NON_TARGET_DIAGRAM",
          `Non-gantt diagram keyword: ${(item.node as DiagramKeywordNode).keywordRaw}`,
          item.node.range,
          "Switch the diagram keyword to `gantt` or choose a Mermaid block that this extension supports."
        ));
      }
    }

    if (!diagramSeen && item.node.kind !== "CommentLine" && item.node.kind !== "BlankLine" && item.node.kind !== "UnknownBlock") {
      context.errors.push(createParseError(
        "MISSING_GANTT_KEYWORD",
        "Gantt diagram keyword was not found before content.",
        item.node.range,
        "Add `gantt` before the first Gantt statement."
      ));
    }

    index = item.nextIndex;
  }

  return {
    kind: "GanttDocument",
    nodeId: "doc",
    source,
    items,
    tokens: sortTokensBySourceRange(context.tokens),
    errors: dedupeErrors(context.errors)
  };
}

function sortTokensBySourceRange(tokens: TokenSpan[]): TokenSpan[] {
  return [...tokens].sort((left, right) => {
    if (left.range.start.offset !== right.range.start.offset) {
      return left.range.start.offset - right.range.start.offset;
    }
    if (left.range.end.offset !== right.range.end.offset) {
      return left.range.end.offset - right.range.end.offset;
    }
    return left.kind.localeCompare(right.kind);
  });
}

function scanFrontmatter(lines: SourceLine[], index: number, context: ParseContext): { node: FrontmatterBlockNode | UnknownBlockNode; nextIndex: number } | null {
  const line = lines[index];
  if (line.content !== "---") {
    return null;
  }

  let nextIndex = index + 1;
  let closed = false;
  while (nextIndex < lines.length) {
    if (lines[nextIndex].content === "---") {
      closed = true;
      nextIndex += 1;
      break;
    }
    nextIndex += 1;
  }

  const raw = lines.slice(index, nextIndex).map((entry) => entry.raw).join("");
  const range = {
    start: context.positionAtOffset(line.startOffset),
    end: context.positionAtOffset(
      lines[Math.max(nextIndex - 1, index)].startOffset + lines[Math.max(nextIndex - 1, index)].raw.length
    )
  };

  context.pushToken("frontmatter-open", line.content, context.rangeFromColumns(line, 0, line.content.length));
  const bodyStartOffset = line.startOffset + line.raw.length;
  const bodyEndOffset = closed ? lines[nextIndex - 1].startOffset : range.end.offset;
  if (bodyEndOffset > bodyStartOffset) {
    context.pushToken("frontmatter-body", context.sourceSlice(bodyStartOffset, bodyEndOffset), {
      start: context.positionAtOffset(bodyStartOffset),
      end: context.positionAtOffset(bodyEndOffset)
    });
  }
  if (closed) {
    const closeLine = lines[nextIndex - 1];
    context.pushToken("frontmatter-close", closeLine.content, context.rangeFromColumns(closeLine, 0, closeLine.content.length));
  }

  const errors: ParseError[] = [];
  if (!closed) {
    errors.push(createParseError(
      "UNCLOSED_FRONTMATTER",
      "Frontmatter block is not closed.",
      range,
      "Close the frontmatter block with a standalone `---` line."
    ));
  }

  const base = createNodeBase(context, range, raw, "docs", line);
  if (closed) {
    return {
      node: {
        ...base,
        kind: "FrontmatterBlock",
        configRaw: raw,
        errors
      },
      nextIndex
    };
  }

  return {
    node: {
      ...base,
      kind: "UnknownBlock",
      errors
    },
    nextIndex
  };
}

function scanDirective(lines: SourceLine[], index: number, context: ParseContext): { node: DirectiveBlockNode | UnknownBlockNode; nextIndex: number } | null {
  const line = lines[index];
  const start = line.content.trimStart();
  if (!start.startsWith("%%{")) {
    return null;
  }

  let nextIndex = index;
  let closed = false;
  const rawLines: string[] = [];

  while (nextIndex < lines.length) {
    rawLines.push(lines[nextIndex].raw);
    if (lines[nextIndex].content.includes("}%%")) {
      closed = true;
      nextIndex += 1;
      break;
    }
    nextIndex += 1;
    if (line.lineEnding && nextIndex >= lines.length) {
      break;
    }
  }

  const raw = rawLines.join("");
  const last = lines[Math.max(index, nextIndex - 1)];
  const range = {
    start: context.positionAtOffset(line.startOffset),
    end: context.positionAtOffset(last.startOffset + last.raw.length)
  };
  const errors: ParseError[] = [];

  const openStart = line.content.indexOf("%%{");
  const openEnd = openStart + "%%{".length;
  context.pushToken("directive-open", "%%{", context.rangeFromColumns(line, openStart, openEnd));
  const closeLine = closed ? lines[nextIndex - 1] : undefined;
  const closeStart = closeLine?.content.indexOf("}%%") ?? -1;
  const bodyStartOffset = line.startOffset + openEnd;
  const bodyEndOffset = closeLine && closeStart >= 0 ? closeLine.startOffset + closeStart : range.end.offset;
  if (bodyEndOffset > bodyStartOffset) {
    context.pushToken("directive-body", context.sourceSlice(bodyStartOffset, bodyEndOffset), {
      start: context.positionAtOffset(bodyStartOffset),
      end: context.positionAtOffset(bodyEndOffset)
    });
  }
  if (closeLine && closeStart >= 0) {
    context.pushToken("directive-close", "}%%", context.rangeFromColumns(closeLine, closeStart, closeStart + "}%%".length));
  }

  if (!closed) {
    errors.push(createParseError(
      "UNCLOSED_DIRECTIVE",
      "Directive block is not closed.",
      range,
      "Close the directive with `}%%` before the next statement."
    ));
  }

  const base = createNodeBase(context, range, raw, "both", line);

  if (closed) {
    return {
      node: {
        ...base,
        kind: "DirectiveBlock",
        directiveRaw: raw,
        errors
      },
      nextIndex
    };
  }

  return {
    node: {
      ...base,
      kind: "UnknownBlock",
      errors
    },
    nextIndex
  };
}

function parseLine(lines: SourceLine[], index: number, context: ParseContext, diagramSeen: boolean): { node: DocumentItem; nextIndex: number } {
  const line = lines[index];
  const trimmed = line.content.trim();
  const range = context.rangeFromLine(line);

  if (trimmed === "") {
    const node: BlankLineNode = {
      ...createNodeBase(context, range, line.raw, "source", line),
      kind: "BlankLine"
    };
    context.pushToken("blank-line", line.raw, range);
    return { node, nextIndex: index + 1 };
  }

  if (/^\s*%%(?!\{)/.test(line.content)) {
    const commentRaw = line.content.trimStart();
    const commentStart = line.content.indexOf(commentRaw);
    const node: CommentLineNode = {
      ...createNodeBase(context, range, line.raw, "both", line),
      kind: "CommentLine",
      commentRaw
    };
    context.pushToken("comment", commentRaw, context.rangeFromColumns(line, commentStart, commentStart + commentRaw.length));
    return { node, nextIndex: index + 1 };
  }

  if (!diagramSeen) {
    const keywordMatch = /^([A-Za-z]+)(?:\s+.+)?$/.exec(trimmed);
    if (keywordMatch) {
      const keywordRaw = keywordMatch[1];
      const keywordStart = line.content.indexOf(keywordRaw);
      const keywordRange = context.rangeFromColumns(line, keywordStart, keywordStart + keywordRaw.length);
      const node: DiagramKeywordNode = {
        ...createNodeBase(context, range, line.raw, "both", line),
        kind: "DiagramKeyword",
        keywordRaw,
        targetDiagram: keywordRaw.toLowerCase() === "gantt"
      };
      context.pushToken("diagram-keyword", keywordRaw, keywordRange);
      return { node, nextIndex: index + 1 };
    }
  }

  if (trimmed.startsWith("accDescr {")) {
    return parseAccDescrBlock(lines, index, context);
  }

  const statement = parseValueOrBooleanStatement(line, context);
  if (statement) {
    return { node: statement, nextIndex: index + 1 };
  }

  if (trimmed.startsWith("section ")) {
    const keywordStart = line.content.indexOf("section");
    const labelRaw = trimmed.slice("section ".length).trim();
    const labelStart = line.content.indexOf(labelRaw, keywordStart + "section ".length);
    const node: SectionStmt = {
      ...createNodeBase(context, range, line.raw, "both", line),
      kind: "SectionStmt",
      labelRaw
    };
    context.pushToken("statement-keyword", "section", context.rangeFromColumns(line, keywordStart, keywordStart + "section".length));
    context.pushToken("statement-value", labelRaw, context.rangeFromColumns(line, labelStart, labelStart + labelRaw.length));
    return { node, nextIndex: index + 1 };
  }

  if (trimmed.startsWith("vert ")) {
    const keywordStart = line.content.indexOf("vert");
    const valueRaw = trimmed.slice("vert ".length).trim();
    const valueStart = line.content.indexOf(valueRaw, keywordStart + "vert ".length);
    const node: VertStmt = {
      ...createNodeBase(context, range, line.raw, "docs", line),
      kind: "VertStmt",
      valueRaw
    };
    context.pushToken("statement-keyword", "vert", context.rangeFromColumns(line, keywordStart, keywordStart + "vert".length));
    context.pushToken("statement-value", valueRaw, context.rangeFromColumns(line, valueStart, valueStart + valueRaw.length));
    return { node, nextIndex: index + 1 };
  }

  if (trimmed.startsWith("click ")) {
    const node = parseClickStatement(line, context);
    return { node, nextIndex: index + 1 };
  }

  if (trimmed.includes(":")) {
    const node = parseTaskStatement(line, context);
    return { node, nextIndex: index + 1 };
  }

  const node: UnknownStatementNode = {
    ...createNodeBase(context, range, line.raw, "source", line),
    kind: "UnknownStatement",
    errors: [
      createParseError(
        "UNKNOWN_STATEMENT",
        "Statement was not recognized.",
        range,
        "Edit this line to a supported Mermaid Gantt statement or keep it in raw/fallback mode."
      )
    ]
  };
  const unknownStart = line.content.indexOf(trimmed);
  context.pushToken("unknown-fragment", trimmed, context.rangeFromColumns(line, unknownStart, unknownStart + trimmed.length));
  return { node, nextIndex: index + 1 };
}

function parseValueOrBooleanStatement(line: SourceLine, context: ParseContext): StatementNode | null {
  const trimmed = line.content.trim();
  const range = context.rangeFromLine(line);

  for (const statement of BOOLEAN_STATEMENTS) {
    if (trimmed === statement.raw) {
      const node: BooleanStatementNode = {
        ...createNodeBase(context, range, line.raw, statement.provenance, line),
        kind: statement.kind
      };
      const keywordStart = line.content.indexOf(statement.raw);
      context.pushToken("statement-keyword", statement.raw, context.rangeFromColumns(line, keywordStart, keywordStart + statement.raw.length));
      return node;
    }
  }

  for (const statement of VALUE_STATEMENTS) {
    if (trimmed.startsWith(statement.prefix)) {
      const prefixStart = line.content.indexOf(statement.prefix);
      const valueStartInTrimmed = statement.prefix.length;
      const valueRawWithSpace = trimmed.slice(valueStartInTrimmed);
      const valueTrimOffset = valueRawWithSpace.length - valueRawWithSpace.trimStart().length;
      const valueRaw = valueRawWithSpace.trim();
      const keywordRaw = statement.prefix.trimEnd();
      const keywordRange = context.rangeFromColumns(line, prefixStart, prefixStart + keywordRaw.length);
      const valueStart = prefixStart + valueStartInTrimmed + valueTrimOffset;
      const valueRange = context.rangeFromColumns(line, valueStart, valueStart + valueRaw.length);
      const errors: ParseError[] = [];
      if (statement.kind === "WeekdayStmt" && !["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(valueRaw)) {
        errors.push(createParseError(
          "INVALID_WEEKDAY",
          `Invalid weekday option: ${valueRaw}`,
          valueRange,
          "Use one of monday, tuesday, wednesday, thursday, friday, saturday, or sunday."
        ));
      }
      if (statement.kind === "WeekendStmt" && !["friday", "saturday"].includes(valueRaw)) {
        errors.push(createParseError(
          "INVALID_WEEKEND",
          `Invalid weekend option: ${valueRaw}`,
          valueRange,
          "Use friday or saturday as the weekend start."
        ));
      }
      if (statement.kind === "TickIntervalStmt" && !/^\d+(millisecond|second|minute|hour|day|week|month|year|ms|s|m|h|d|w|M|y)s?$/i.test(valueRaw)) {
        errors.push(createParseError(
          "INVALID_TICK_INTERVAL",
          `Invalid tickInterval value: ${valueRaw}`,
          valueRange,
          "Use a numeric interval such as `1day`, `1week`, or `1month`."
        ));
      }
      if (statement.kind === "ExcludesStmt" && valueRaw.trim().toLowerCase() === "weekdays") {
        errors.push(createParseError(
          "INVALID_EXCLUDES_VALUE",
          "excludes weekdays is not supported.",
          valueRange,
          "Use `excludes weekends`, a weekday name, or explicit date values."
        ));
      }

      const node: ValueStatementNode = {
        ...createNodeBase(context, range, line.raw, statement.provenance, line),
        kind: statement.kind,
        valueRaw,
        errors
      };
      context.pushToken("statement-keyword", keywordRaw, keywordRange);
      context.pushToken("statement-value", valueRaw, valueRange);
      return node;
    }
  }

  if (trimmed.startsWith("accDescription:")) {
    const node: UnknownStatementNode = {
      ...createNodeBase(context, range, line.raw, "source", line),
      kind: "UnknownStatement",
      errors: [
        createParseError(
          "UNSUPPORTED_ACC_DESCRIPTION_ALIAS",
          "accDescription is treated as recovery-only input.",
          range,
          "Use `accDescr:` for a single-line accessible description or `accDescr { ... }` for a multiline description."
        )
      ]
    };
    return node;
  }

  return null;
}

function parseAccDescrBlock(lines: SourceLine[], index: number, context: ParseContext): { node: AccDescrBlockStmt | UnknownStatementNode; nextIndex: number } {
  const startLine = lines[index];
  let nextIndex = index + 1;
  let closed = false;
  const rawLines = [startLine.raw];

  while (nextIndex < lines.length) {
    if (lines[nextIndex].content.trim() === "}") {
      rawLines.push(lines[nextIndex].raw);
      closed = true;
      nextIndex += 1;
      break;
    }
    if (/^\s*(section |click |vert |title |dateFormat |axisFormat |tickInterval |weekday |weekend |todayMarker |includes |excludes |gantt\b|[^:\n]+:)/.test(lines[nextIndex].content)) {
      break;
    }
    rawLines.push(lines[nextIndex].raw);
    nextIndex += 1;
  }

  const raw = rawLines.join("");
  const last = lines[Math.max(index, nextIndex - 1)];
  const range = {
    start: context.positionAtOffset(startLine.startOffset),
    end: context.positionAtOffset(last.startOffset + last.raw.length)
  };
  const base = createNodeBase(context, range, raw, "both", startLine);

  if (closed) {
    const node: AccDescrBlockStmt = {
      ...base,
      kind: "AccDescrBlockStmt",
      valueRaw: raw
    };
    return { node, nextIndex };
  }

  const node: UnknownStatementNode = {
    ...base,
    kind: "UnknownStatement",
    errors: [
      createParseError(
        "UNCLOSED_ACC_DESCR",
        "accDescr block is not closed.",
        range,
        "Close the accessible description block with a standalone `}` line."
      )
    ]
  };
  return { node, nextIndex };
}

function parseClickStatement(line: SourceLine, context: ParseContext): ClickStmt {
  const trimmed = line.content.trim();
  const range = context.rangeFromLine(line);
  const clickStart = line.content.indexOf("click");
  const bodyStart = clickStart + "click ".length;
  const body = line.content.slice(bodyStart).trim();
  const firstSpace = body.indexOf(" ");
  const targetIdsRaw = firstSpace >= 0 ? body.slice(0, firstSpace).trim() : body.trim();
  const remainder = firstSpace >= 0 ? body.slice(firstSpace + 1).trim() : "";
  const targetStart = bodyStart + line.content.slice(bodyStart).indexOf(targetIdsRaw);
  context.pushToken("statement-keyword", "click", context.rangeFromColumns(line, clickStart, clickStart + "click".length));
  const targetIds = targetIdsRaw
    .split(",")
    .map((raw, partIndex, parts) => {
      const before = parts.slice(0, partIndex).join(",");
      const rawStart = targetStart + before.length + (partIndex > 0 ? 1 : 0);
      const leftTrim = raw.length - raw.trimStart().length;
      const value = raw.trim();
      if (!value) {
        return null;
      }
      const valueStart = rawStart + leftTrim;
      const slice = { raw: value, range: context.rangeFromColumns(line, valueStart, valueStart + value.length) };
      context.pushToken("click-task-id", value, slice.range);
      return slice;
    })
    .filter((slice): slice is TextSlice => slice !== null);

  const remainderStart = remainder ? line.content.indexOf(remainder, targetStart + targetIdsRaw.length) : line.content.length;
  const clauses = parseClickClauses(remainder, line, remainderStart, context);
  const errors: ParseError[] = [];
  if (clauses.length === 0) {
    errors.push(createParseError(
      "INVALID_CLICK_CLAUSE",
      "click statement does not contain a valid clause.",
      range,
      "Add an `href` or `call` clause after the target task ID."
    ));
  }

  return {
    ...createNodeBase(context, range, line.raw, "both", line),
    kind: "ClickStmt",
    targetIdsRaw,
    targetIds,
    clauses,
    errors
  };
}

function parseClickClauses(remainder: string, line: SourceLine, remainderStart: number, context: ParseContext): ClickClauseSlice[] {
  const clauses: ClickClauseSlice[] = [];
  let rest = remainder;
  let restStart = remainderStart;

  while (rest.length > 0) {
    if (rest.startsWith("href ")) {
      const hrefMatch = /^href\s+"([^"]+)"/.exec(rest);
      const raw = hrefMatch ? hrefMatch[1] : rest;
      const clauseRaw = hrefMatch ? `href "${raw}"` : rest;
      const clauseRange = context.rangeFromColumns(line, restStart, restStart + clauseRaw.length);
      context.pushToken("click-href-keyword", "href", context.rangeFromColumns(line, restStart, restStart + "href".length));
      if (hrefMatch) {
        const hrefValueStart = restStart + hrefMatch[0].indexOf(raw);
        context.pushToken("click-href-value", raw, context.rangeFromColumns(line, hrefValueStart, hrefValueStart + raw.length));
      }
      const clause: ClickHrefClause = {
        ...createAnonymousNode(context, clauseRange, clauseRaw, "both"),
        kind: "ClickHrefClause",
        hrefRaw: raw,
        errors: hrefMatch ? [] : [createParseError(
          "INVALID_CLICK_HREF",
          "click href clause is malformed.",
          clauseRange,
          "Use `href \"https://example.com\"` with a quoted URL."
        )]
      };
      clauses.push(clause);
      if (!hrefMatch) {
        rest = "";
      } else {
        const consumed = hrefMatch[0].length;
        restStart += consumed;
        const trim = rest.slice(consumed).length - rest.slice(consumed).trimStart().length;
        rest = rest.slice(consumed).trimStart();
        restStart += trim;
      }
      continue;
    }

    if (rest.startsWith("call ")) {
      const callMatch = /^call\s+([^( ]+)\(([^)]*)\)/.exec(rest) ?? /^call\s+([^( ]+)\(\)/.exec(rest) ?? /^call\s+([^\s]+)/.exec(rest);
      const callbackRaw = callMatch?.[1] ?? rest;
      const argsRaw = callMatch && callMatch.length > 2 ? callMatch[2] : undefined;
      const clauseRaw = callMatch ? callMatch[0] : rest;
      const clauseRange = context.rangeFromColumns(line, restStart, restStart + clauseRaw.length);
      context.pushToken("click-call-keyword", "call", context.rangeFromColumns(line, restStart, restStart + "call".length));
      if (callMatch) {
        const callbackStart = restStart + callMatch[0].indexOf(callbackRaw);
        context.pushToken("click-callback", callbackRaw, context.rangeFromColumns(line, callbackStart, callbackStart + callbackRaw.length));
        if (argsRaw !== undefined) {
          const argsStart = restStart + callMatch[0].indexOf(argsRaw);
          context.pushToken("click-callback-args", argsRaw, context.rangeFromColumns(line, argsStart, argsStart + argsRaw.length));
        }
      }
      const clause: ClickCallClause = {
        ...createAnonymousNode(context, clauseRange, clauseRaw, "both"),
        kind: "ClickCallClause",
        callbackRaw,
        argsRaw,
        errors: callMatch ? [] : [createParseError(
          "INVALID_CLICK_CALL",
          "click call clause is malformed.",
          clauseRange,
          "Use `call callbackName()` or `call callbackName(args)`."
        )]
      };
      clauses.push(clause);
      if (!callMatch) {
        rest = "";
      } else {
        const consumed = callMatch[0].length;
        restStart += consumed;
        const trim = rest.slice(consumed).length - rest.slice(consumed).trimStart().length;
        rest = rest.slice(consumed).trimStart();
        restStart += trim;
      }
      continue;
    }

    const rawRange = context.rangeFromColumns(line, restStart, restStart + rest.length);
    const clause: RawClickClause = {
      ...createAnonymousNode(context, rawRange, rest, "source"),
      kind: "RawClickClause",
      valueRaw: rest,
      errors: [createParseError(
        "UNKNOWN_CLICK_CLAUSE",
        "click clause was not recognized.",
        rawRange,
        "Use a supported click clause: `href` or `call`."
      )]
    };
    clauses.push(clause);
    break;
  }

  return clauses;
}

function parseTaskStatement(line: SourceLine, context: ParseContext): TaskStmt {
  const range = context.rangeFromLine(line);
  const colonIndex = line.content.indexOf(":");
  const labelRaw = colonIndex >= 0 ? line.content.slice(0, colonIndex).trimEnd() : line.content;
  const labelValue = labelRaw.trim();
  const labelStartOffset = line.content.indexOf(labelValue);
  const labelRange = {
    start: context.positionAtOffset(line.startOffset + labelStartOffset),
    end: context.positionAtOffset(line.startOffset + labelStartOffset + labelValue.length)
  };
  const colonRange = {
    start: context.positionAtOffset(line.startOffset + colonIndex),
    end: context.positionAtOffset(line.startOffset + colonIndex + 1)
  };
  context.pushToken("task-label", labelValue, labelRange);
  context.pushToken("task-colon", ":", colonRange);
  const metaParts = scanTaskMetaParts(line, colonIndex + 1, context);
  const metaItems = metaParts.filter(isTaskMetaSlice);
  const nonTagMetaItems = metaItems.filter((item) => item.kind !== "TagMetaSlice");

  const errors: ParseError[] = [];
  if (nonTagMetaItems.length > 3) {
    errors.push(createParseError(
      "EXTRA_TASK_METADATA",
      "Task metadata contains more than three non-tag items.",
      range,
      "Review the comma-separated task metadata and remove unsupported extra fields."
    ));
  }
  if (metaItems.some((item) => item.kind === "TagMetaSlice") && metaItems.findIndex((item) => item.kind === "TagMetaSlice") > 0) {
    errors.push(createParseError(
      "TAG_NOT_FIRST",
      "Task tag appeared after another metadata item.",
      range,
      "Move task tags such as `crit`, `done`, or `milestone` before ID/date metadata."
    ));
  }

  return {
    ...createNodeBase(context, range, line.raw, "both", line),
    kind: "TaskStmt",
    label: {
      raw: labelValue,
      range: labelRange
    },
    colon: {
      kind: "task-colon",
      raw: ":",
      range: colonRange
    },
    metaParts,
    metaItems,
    errors
  };
}

function scanTaskMetaParts(line: SourceLine, dataStart: number, context: ParseContext): TaskMetaPart[] {
  const parts: TaskMetaPart[] = [];
  let segmentStart = dataStart;

  for (let index = dataStart; index <= line.content.length; index += 1) {
    const isEnd = index === line.content.length;
    if (!isEnd && line.content[index] !== ",") {
      continue;
    }

    const segmentRaw = line.content.slice(segmentStart, index);
    const leftTrim = segmentRaw.length - segmentRaw.trimStart().length;
    const value = segmentRaw.trim();
    const valueStart = segmentStart + leftTrim;
    const valueRange = context.rangeFromColumns(line, valueStart, valueStart + value.length);
    const valueEnd = valueStart + value.length;
    if (value.length > 0) {
      parts.push(parseTaskMeta(value, valueRange, context));
    } else if (!isEnd || segmentRaw.length > 0) {
      parts.push(parseTaskMeta("", context.rangeFromColumns(line, segmentStart, index), context));
    }

    if (!isEnd) {
      let separatorEnd = index + 1;
      while (separatorEnd < line.content.length && /\s/.test(line.content[separatorEnd]) && line.content[separatorEnd] !== ",") {
        separatorEnd += 1;
      }
      const separatorStart = value.length > 0 ? valueEnd : segmentStart;
      const separatorRaw = line.content.slice(separatorStart, separatorEnd);
      const separatorRange = context.rangeFromColumns(line, separatorStart, separatorEnd);
      const commaRange = context.rangeFromColumns(line, index, index + 1);
      const comma: TokenSpan = { kind: "task-comma", raw: ",", range: commaRange };
      context.pushToken("task-comma", ",", commaRange);
      const separator: TaskMetaSeparator = {
        kind: "TaskMetaSeparator",
        raw: separatorRaw,
        range: separatorRange,
        comma
      };
      parts.push(separator);
      segmentStart = separatorEnd;
    }
  }

  return parts;
}

function isTaskMetaSlice(part: TaskMetaPart): part is TaskMetaSlice {
  return part.kind !== "TaskMetaSeparator";
}

function parseTaskMeta(raw: string, range: Range, context: ParseContext): TaskMetaSlice {
  if (TASK_TAGS.has(raw)) {
    context.pushToken("task-tag", raw, range);
    const node: TagMetaSlice = {
      ...createAnonymousNode(context, range, raw, raw === "vert" ? "source" : "both"),
      kind: "TagMetaSlice",
      valueRaw: raw
    };
    return node;
  }

  if (/^after\s+/.test(raw)) {
    const refs: TextSlice[] = [];
    const refsStart = "after ".length;
    const refsRawPart = raw.slice(refsStart);
    const refPattern = /\S+/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refPattern.exec(refsRawPart)) !== null) {
      const refRaw = refMatch[0];
      const refStartOffset = range.start.offset + refsStart + refMatch.index;
      refs.push({
        raw: refRaw,
        range: {
          start: context.positionAtOffset(refStartOffset),
          end: context.positionAtOffset(refStartOffset + refRaw.length)
        }
      });
    }
    const refsRaw = refs.map((ref) => ref.raw);
    context.pushToken("task-after-keyword", "after", {
      start: range.start,
      end: context.positionAtOffset(range.start.offset + "after".length)
    });
    for (const ref of refs) {
      context.pushToken("task-id", ref.raw, ref.range);
    }
    const node: AfterMetaSlice = {
      ...createAnonymousNode(context, range, raw, "both"),
      kind: "AfterMetaSlice",
      valueRaw: raw,
      refs,
      refsRaw,
      errors: refsRaw.length === 0 ? [createParseError(
        "INVALID_AFTER_META",
        "after metadata did not include a reference.",
        range,
        "Add one or more task IDs after `after`."
      )] : []
    };
    return node;
  }

  if (/^until\s+/.test(raw)) {
    const refRaw = raw.slice("until ".length).trim();
    const refStartOffset = refRaw.length > 0
      ? range.start.offset + raw.indexOf(refRaw, "until ".length)
      : range.end.offset;
    context.pushToken("task-until-keyword", "until", {
      start: range.start,
      end: context.positionAtOffset(range.start.offset + "until".length)
    });
    if (refRaw.length > 0) {
      context.pushToken("task-id", refRaw, {
        start: context.positionAtOffset(refStartOffset),
        end: context.positionAtOffset(refStartOffset + refRaw.length)
      });
    }
    const node: UntilMetaSlice = {
      ...createAnonymousNode(context, range, raw, "both"),
      kind: "UntilMetaSlice",
      valueRaw: raw,
      refRaw,
      errors: refRaw.length === 0 ? [createParseError(
        "INVALID_UNTIL_META",
        "until metadata did not include a reference.",
        range,
        "Add a task ID after `until`."
      )] : []
    };
    return node;
  }

  if (/^\d+(?:\.\d+)?(?:millisecond|second|minute|hour|day|week|month|year|ms|s|m|h|d|w|M|y)s?$/i.test(raw)) {
    context.pushToken("task-duration", raw, range);
    const node: DurationMetaSlice = {
      ...createAnonymousNode(context, range, raw, "docs"),
      kind: "DurationMetaSlice",
      valueRaw: raw
    };
    return node;
  }

  if (isTaskDateLiteral(raw)) {
    context.pushToken("task-date", raw, range);
    const node: DateMetaSlice = {
      ...createAnonymousNode(context, range, raw, "docs"),
      kind: "DateMetaSlice",
      valueRaw: raw
    };
    return node;
  }

  if (/^\d/.test(raw) && /[A-Za-z]/.test(raw)) {
    context.pushToken("unknown-fragment", raw, range);
    const node: RawMetaSlice = {
      ...createAnonymousNode(context, range, raw, "docs"),
      kind: "RawMetaSlice",
      valueRaw: raw,
      errors: [createParseError(
        "INVALID_DURATION_TOKEN",
        `Duration-like metadata is invalid: ${raw}`,
        range,
        "Use a valid duration such as `3d`, `2w`, `1month`, or keep the value as raw text."
      )]
    };
    return node;
  }

  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    context.pushToken("task-id", raw, range);
    const node: IdMetaSlice = {
      ...createAnonymousNode(context, range, raw, "docs"),
      kind: "IdMetaSlice",
      valueRaw: raw
    };
    return node;
  }

  const node: RawMetaSlice = {
    ...createAnonymousNode(context, range, raw, "source"),
    kind: "RawMetaSlice",
    valueRaw: raw
  };
  return node;
}

function isTaskDateLiteral(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{2}-\d{2}-\d{4}$/.test(raw);
}

function createNodeBase(context: ParseContext, range: Range, raw: string, provenance: Provenance, line: SourceLine): Omit<FrontmatterBlockNode, "kind" | "configRaw"> {
  const leadingTrivia: TriviaSpan[] = [];
  const trailingTrivia: TriviaSpan[] = [];
  if (line.indentLength > 0) {
    leadingTrivia.push({
      kind: "indentation",
      raw: line.content.slice(0, line.indentLength),
      range: {
        start: context.position(line.startOffset, line.line, 1),
        end: context.positionAtOffset(line.startOffset + line.indentLength)
      }
    });
  }
  if (line.lineEnding) {
    trailingTrivia.push({
      kind: "line-ending",
      raw: line.lineEnding,
      range: {
        start: context.positionAtOffset(line.startOffset + line.content.length),
        end: context.positionAtOffset(line.startOffset + line.raw.length)
      }
    });
    context.pushToken("newline", line.lineEnding, trailingTrivia[trailingTrivia.length - 1].range);
  }

  return {
    nodeId: context.nextItemId(),
    range,
    raw,
    provenance,
    leadingTrivia,
    trailingTrivia,
    errors: []
  };
}

function createAnonymousNode(context: ParseContext, range: Range, raw: string, provenance: Provenance) {
  return {
    nodeId: context.nextNodeId(),
    range,
    raw,
    provenance,
    leadingTrivia: [],
    trailingTrivia: [],
    errors: []
  };
}

function createParseError(
  code: string,
  message: string,
  range: Range,
  instructionSummary: string,
  severity: ParseError["severity"] = "error"
): ParseError {
  return {
    severity,
    code,
    message,
    range,
    stage: "parse",
    instruction: {
      summary: instructionSummary,
      primaryRange: range,
      suggestedActions: [{
        kind: "manual-edit",
        label: instructionSummary
      }]
    }
  };
}

function dedupeErrors(errors: ParseError[]): ParseError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.code}:${error.range.start.offset}:${error.range.end.offset}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
