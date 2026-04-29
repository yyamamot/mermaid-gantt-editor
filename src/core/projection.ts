import type {
  DocumentItem,
  GanttDocument,
  ParseError,
  ProjectionIssue,
  Range,
  SemanticDocument,
  SemanticSection,
  SemanticSettings,
  SemanticTask,
  TaskMetaSlice,
  TaskStmt
} from "./types";

const PREVIEW_LABEL_POLICY = "truncate-with-tooltip" as const;

export function projectGanttSemantic(document: GanttDocument): SemanticDocument {
  const settings: SemanticSettings = {};
  const projectionIssues: ProjectionIssue[] = [];
  const explicitSections: SemanticSection[] = [];
  const defaultTasks: SemanticTask[] = [];
  let currentSection: SemanticSection | undefined;
  let explicitSectionCount = 0;
  let firstSectionSeen = false;

  for (const item of document.items) {
    projectionIssues.push(...issuesFromParseErrors(item.nodeId, item.errors));

    switch (item.kind) {
      case "TitleStmt":
        settings.title = item.valueRaw;
        break;
      case "DateFormatStmt":
        settings.dateFormat = item.valueRaw;
        break;
      case "AxisFormatStmt":
        settings.axisFormat = item.valueRaw;
        break;
      case "TickIntervalStmt":
        settings.tickInterval = item.valueRaw;
        break;
      case "TopAxisStmt":
        settings.topAxis = true;
        break;
      case "InclusiveEndDatesStmt":
        settings.inclusiveEndDates = true;
        break;
      case "IncludesStmt":
        settings.includes = appendSetting(settings.includes, item.valueRaw);
        break;
      case "ExcludesStmt":
        settings.excludes = appendSetting(settings.excludes, item.valueRaw);
        break;
      case "WeekdayStmt":
        settings.weekday = item.valueRaw;
        break;
      case "WeekendStmt":
        settings.weekend = item.valueRaw;
        break;
      case "TodayMarkerStmt":
        settings.todayMarker = item.valueRaw;
        break;
      case "AccTitleStmt":
        settings.accTitle = item.valueRaw;
        break;
      case "AccDescrLineStmt":
        settings.accDescr = item.valueRaw;
        break;
      case "SectionStmt":
        firstSectionSeen = true;
        currentSection = createSemanticSection(item, explicitSectionCount);
        explicitSectionCount += 1;
        explicitSections.push(currentSection);
        break;
      case "TaskStmt": {
        const task = projectTask(item, projectionIssues);
        if (!firstSectionSeen || !currentSection) {
          defaultTasks.push(task);
        } else {
          currentSection.tasks.push(task);
          currentSection.taskNodeIds.push(task.nodeId);
        }
        break;
      }
      case "BlankLine":
      case "CommentLine":
      case "DiagramKeyword":
        if (item.kind === "DiagramKeyword" && !item.targetDiagram) {
          projectionIssues.push(createProjectionIssue(
            item.nodeId,
            "unsupported-diagram",
            "Only Mermaid Gantt diagrams can be projected to the Semantic AST.",
            item.range
          ));
        }
        break;
      case "FrontmatterBlock":
      case "DirectiveBlock":
      case "ClickStmt":
      case "VertStmt":
      case "AccDescrBlockStmt":
      case "UnknownBlock":
      case "UnknownStatement":
        projectionIssues.push(createProjectionIssue(
          item.nodeId,
          `unsupported-${item.kind}`,
          `${item.kind} is retained losslessly but is not part of the current Semantic AST projection.`,
          item.range
        ));
        break;
    }
  }

  const sections = defaultTasks.length > 0
    ? [createDefaultSection(defaultTasks), ...explicitSections]
    : explicitSections;

  return {
    kind: "SemanticDocument",
    settings,
    sections,
    projectionIssues
  };
}

function projectTask(task: TaskStmt, issues: ProjectionIssue[]): SemanticTask {
  const semanticTask: SemanticTask = {
    nodeId: task.nodeId,
    label: task.label.raw,
    sourceLabelRaw: task.label.raw,
    displayLabel: task.label.raw,
    previewLabelPolicy: PREVIEW_LABEL_POLICY,
    tags: []
  };

  let dateCount = 0;
  for (const meta of task.metaItems) {
    issues.push(...issuesFromParseErrors(task.nodeId, meta.errors));
    applyTaskMeta(semanticTask, meta, task.nodeId, issues);
    if (meta.kind === "DateMetaSlice") {
      dateCount += 1;
      if (dateCount === 1) {
        semanticTask.start = meta.valueRaw;
      } else if (dateCount === 2) {
        semanticTask.end = meta.valueRaw;
      } else {
        issues.push(createProjectionIssue(
          task.nodeId,
          "extra-date-metadata",
          "Task has more than two date metadata fields.",
          meta.range
        ));
      }
    }
  }

  return semanticTask;
}

function applyTaskMeta(
  task: SemanticTask,
  meta: TaskMetaSlice,
  nodeId: string,
  issues: ProjectionIssue[]
): void {
  switch (meta.kind) {
    case "TagMetaSlice":
      task.tags.push(meta.valueRaw);
      if (meta.valueRaw === "milestone") {
        task.milestone = true;
      }
      break;
    case "IdMetaSlice":
      if (task.id === undefined) {
        task.id = meta.valueRaw;
      } else {
        issues.push(createProjectionIssue(
          nodeId,
          "duplicate-task-id-metadata",
          "Task has multiple ID metadata fields.",
          meta.range
        ));
      }
      break;
    case "DurationMetaSlice":
      if (task.duration === undefined) {
        task.duration = meta.valueRaw;
      } else {
        issues.push(createProjectionIssue(
          nodeId,
          "duplicate-duration-metadata",
          "Task has multiple duration metadata fields.",
          meta.range
        ));
      }
      break;
    case "AfterMetaSlice":
      task.after = meta.refsRaw;
      break;
    case "UntilMetaSlice":
      task.until = meta.refRaw;
      break;
    case "DateMetaSlice":
      break;
    case "RawMetaSlice":
      issues.push(createProjectionIssue(
        nodeId,
        "raw-task-metadata",
        "Raw task metadata is retained losslessly but cannot be projected safely.",
        meta.range
      ));
      break;
  }
}

function createSemanticSection(item: Extract<DocumentItem, { kind: "SectionStmt" }>, index: number): SemanticSection {
  return {
    id: `section-${index}`,
    label: item.labelRaw,
    sourceNodeId: item.nodeId,
    sourceLabelRaw: item.labelRaw,
    displayLabel: item.labelRaw,
    previewLabelPolicy: PREVIEW_LABEL_POLICY,
    taskNodeIds: [],
    tasks: []
  };
}

function createDefaultSection(tasks: SemanticTask[]): SemanticSection {
  return {
    id: "__default__",
    label: "",
    implicit: true,
    sourceLabelRaw: "",
    displayLabel: "",
    previewLabelPolicy: PREVIEW_LABEL_POLICY,
    taskNodeIds: tasks.map((task) => task.nodeId),
    tasks
  };
}

function appendSetting(current: string[] | undefined, value: string): string[] {
  return [...(current ?? []), value];
}

function issuesFromParseErrors(nodeId: string, errors: ParseError[]): ProjectionIssue[] {
  return errors.map((error) => ({
    nodeId,
    reasonCode: `parse-${error.code}`,
    message: error.message,
    range: error.range,
    severity: error.severity,
    stage: "projection",
    instruction: {
      ...error.instruction,
      summary: error.instruction.summary || error.message,
      primaryRange: error.range,
      suggestedActions: [
        ...error.instruction.suggestedActions,
        {
          kind: "fallback" as const,
          label: "Keep this source in raw/fallback mode."
        }
      ]
    }
  }));
}

function createProjectionIssue(
  nodeId: string,
  reasonCode: string,
  message: string,
  range: Range,
  severity: ProjectionIssue["severity"] = "warning"
): ProjectionIssue {
  return {
    nodeId,
    reasonCode,
    message,
    range,
    severity,
    stage: "projection",
    instruction: {
      summary: message,
      primaryRange: range,
      suggestedActions: [
        {
          kind: "fallback",
          label: "Keep this source in raw/fallback mode."
        }
      ]
    }
  };
}
