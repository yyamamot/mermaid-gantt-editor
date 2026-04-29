import type { TaskGridRow } from "./types";

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
const DATE_TOKEN_PATTERN = /YYYY|YY|MM|DD/g;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TIMELINE_PADDING_DAYS = 14;
const DEFAULT_MIN_TIMELINE_DAYS = 42;

export type PreviewScheduleEditTaskKind = "start-duration" | "start-end" | "milestone" | "unsupported";

export interface PreviewScheduleEditTask {
  nodeId: string;
  label: string;
  sectionLabel: string;
  sourceOrder: number;
  start?: string;
  end?: string;
  duration?: string;
  startIso?: string;
  endIso?: string;
  startDay?: number;
  endDay?: number;
  durationDays?: number;
  kind: PreviewScheduleEditTaskKind;
  editable: boolean;
  unsupportedReason?: string;
  rowIndex: number;
  leftPercent: number;
  widthPercent: number;
}

export interface PreviewScheduleEditModel {
  dateFormat: string;
  domainStartIso: string;
  domainEndIso: string;
  domainStartDay: number;
  domainEndDay: number;
  defaultDomainStartIso: string;
  defaultDomainEndIso: string;
  defaultDomainStartDay: number;
  defaultDomainEndDay: number;
  totalDays: number;
  tasks: PreviewScheduleEditTask[];
  draggableTaskCount: number;
  unsupportedTaskCount: number;
}

export interface PreviewScheduleEditViewport {
  domainStartIso?: string;
  domainEndIso?: string;
}

export interface PreviewScheduleDragPatch {
  nodeId: string;
  start: string;
  end?: string;
  dayDelta: number;
}

export type PreviewScheduleResizeEdge = "left" | "right";

export interface PreviewScheduleResizePatch {
  nodeId: string;
  edge: PreviewScheduleResizeEdge;
  start?: string;
  end?: string;
  duration?: string;
  dayDelta: number;
}

type DateFormatPart =
  | { type: "literal"; value: string }
  | { type: "token"; value: "YYYY" | "YY" | "MM" | "DD" };

export function createPreviewScheduleEditModel(
  rows: TaskGridRow[],
  dateFormat = DEFAULT_DATE_FORMAT,
  viewport: PreviewScheduleEditViewport = {}
): PreviewScheduleEditModel {
  const normalizedDateFormat = normalizeDateFormat(dateFormat);
  const classifiedTasks = rows
    .filter((row) => row.kind === "task")
    .map((row, rowIndex) => classifyTask(row, rowIndex, normalizedDateFormat));
  const timelineTasks = classifiedTasks.filter((task) => task.startDay !== undefined && task.endDay !== undefined);
  const minDay = timelineTasks.reduce<number | undefined>((candidate, task) => {
    return candidate === undefined ? task.startDay : Math.min(candidate, task.startDay ?? candidate);
  }, undefined);
  const maxDay = timelineTasks.reduce<number | undefined>((candidate, task) => {
    return candidate === undefined ? task.endDay : Math.max(candidate, task.endDay ?? candidate);
  }, undefined);
  const today = isoToUtcDay(todayIsoDate());
  const defaultDomain = paddedPreviewDomain(minDay ?? today, maxDay ?? today + 1);
  const requestedDomain = requestedPreviewDomain(viewport);
  const domainStartDay = requestedDomain?.startDay ?? defaultDomain.startDay;
  const domainEndDay = requestedDomain?.endDay ?? defaultDomain.endDay;
  const totalDays = Math.max(1, domainEndDay - domainStartDay);
  const tasks = classifiedTasks.map((task) => {
    if (task.startDay === undefined || task.endDay === undefined) {
      return {
        ...task,
        leftPercent: 0,
        widthPercent: 0
      };
    }
    return {
      ...task,
      leftPercent: ((task.startDay - domainStartDay) / totalDays) * 100,
      widthPercent: Math.max(1, ((task.endDay - task.startDay) / totalDays) * 100)
    };
  });

  return {
    dateFormat: normalizedDateFormat,
    domainStartIso: utcDayToIso(domainStartDay),
    domainEndIso: utcDayToIso(domainEndDay),
    domainStartDay,
    domainEndDay,
    defaultDomainStartIso: utcDayToIso(defaultDomain.startDay),
    defaultDomainEndIso: utcDayToIso(defaultDomain.endDay),
    defaultDomainStartDay: defaultDomain.startDay,
    defaultDomainEndDay: defaultDomain.endDay,
    totalDays,
    tasks,
    draggableTaskCount: tasks.filter((task) => task.editable).length,
    unsupportedTaskCount: tasks.filter((task) => !task.editable).length
  };
}

function paddedPreviewDomain(contentStartDay: number, contentEndDay: number): { startDay: number; endDay: number } {
  let startDay = contentStartDay - DEFAULT_TIMELINE_PADDING_DAYS;
  let endDay = Math.max(contentStartDay + 1, contentEndDay) + DEFAULT_TIMELINE_PADDING_DAYS;
  const missingDays = DEFAULT_MIN_TIMELINE_DAYS - (endDay - startDay);
  if (missingDays > 0) {
    startDay -= Math.floor(missingDays / 2);
    endDay += Math.ceil(missingDays / 2);
  }
  return { startDay, endDay };
}

function requestedPreviewDomain(viewport: PreviewScheduleEditViewport): { startDay: number; endDay: number } | undefined {
  if (!viewport.domainStartIso || !viewport.domainEndIso) {
    return undefined;
  }
  if (!isValidIsoDate(viewport.domainStartIso) || !isValidIsoDate(viewport.domainEndIso)) {
    return undefined;
  }
  const startDay = isoToUtcDay(viewport.domainStartIso);
  const endDay = isoToUtcDay(viewport.domainEndIso);
  return endDay > startDay ? { startDay, endDay } : undefined;
}

export function parsePreviewDateLiteral(value: string, dateFormat = DEFAULT_DATE_FORMAT): string | undefined {
  const literal = value.trim();
  if (literal === "") {
    return undefined;
  }
  const parts = dateFormatParts(dateFormat);
  if (parts.length === 0) {
    return undefined;
  }
  let cursor = 0;
  const parsed: Partial<Record<"YYYY" | "YY" | "MM" | "DD", string>> = {};
  for (const part of parts) {
    if (part.type === "literal") {
      if (!literal.startsWith(part.value, cursor)) {
        return undefined;
      }
      cursor += part.value.length;
      continue;
    }
    const width = part.value === "YYYY" ? 4 : 2;
    const segment = literal.slice(cursor, cursor + width);
    if (!new RegExp(`^\\d{${width}}$`).test(segment)) {
      return undefined;
    }
    parsed[part.value] = segment;
    cursor += width;
  }
  if (cursor !== literal.length) {
    return undefined;
  }
  const year = parsed.YYYY ?? (parsed.YY ? `20${parsed.YY}` : undefined);
  if (!year || !parsed.MM || !parsed.DD) {
    return undefined;
  }
  const iso = `${year}-${parsed.MM}-${parsed.DD}`;
  return isValidIsoDate(iso) ? iso : undefined;
}

export function formatPreviewDateLiteral(isoDate: string, dateFormat = DEFAULT_DATE_FORMAT): string | undefined {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match || !isValidIsoDate(isoDate)) {
    return undefined;
  }
  const format = normalizeDateFormat(dateFormat);
  const tokens = dateFormatTokens(format);
  const hasYear = tokens.includes("YYYY") || tokens.includes("YY");
  if (!hasYear || !tokens.includes("MM") || !tokens.includes("DD")) {
    return undefined;
  }
  return format
    .replace(/YYYY/g, match[1])
    .replace(/YY/g, match[1].slice(2))
    .replace(/MM/g, match[2])
    .replace(/DD/g, match[3]);
}

export function previewSchedulePixelDeltaToDays(
  deltaPixels: number,
  widthPixels: number,
  model: Pick<PreviewScheduleEditModel, "totalDays">
): number {
  if (!Number.isFinite(deltaPixels) || !Number.isFinite(widthPixels) || widthPixels <= 0 || model.totalDays <= 0) {
    return 0;
  }
  const rawDays = (deltaPixels / widthPixels) * model.totalDays;
  const snapped = Math.round(rawDays);
  if (snapped !== 0) {
    return snapped;
  }
  const intentionalDragThreshold = Math.min(Math.max(widthPixels / (model.totalDays * 4), 8), 24);
  return Math.abs(deltaPixels) >= intentionalDragThreshold
    ? deltaPixels > 0 ? 1 : -1
    : 0;
}

export function createPreviewScheduleDragPatch(
  model: PreviewScheduleEditModel,
  nodeId: string,
  dayDelta: number
): PreviewScheduleDragPatch | undefined {
  if (!Number.isInteger(dayDelta) || dayDelta === 0) {
    return undefined;
  }
  const task = model.tasks.find((candidate) => candidate.nodeId === nodeId);
  if (!task?.editable || task.startIso === undefined) {
    return undefined;
  }
  const nextStartIso = addPreviewUtcDays(task.startIso, dayDelta);
  const nextStart = formatPreviewDateLiteral(nextStartIso, model.dateFormat);
  if (!nextStart) {
    return undefined;
  }
  if (task.kind === "start-end") {
    if (!task.endIso) {
      return undefined;
    }
    const nextEndIso = addPreviewUtcDays(task.endIso, dayDelta);
    const nextEnd = formatPreviewDateLiteral(nextEndIso, model.dateFormat);
    return nextEnd ? { nodeId, start: nextStart, end: nextEnd, dayDelta } : undefined;
  }
  return { nodeId, start: nextStart, dayDelta };
}

export function createPreviewScheduleDragPatchFromPixels(
  model: PreviewScheduleEditModel,
  nodeId: string,
  deltaPixels: number,
  widthPixels: number
): PreviewScheduleDragPatch | undefined {
  return createPreviewScheduleDragPatch(
    model,
    nodeId,
    previewSchedulePixelDeltaToDays(deltaPixels, widthPixels, model)
  );
}

export function createPreviewScheduleResizePatch(
  model: PreviewScheduleEditModel,
  nodeId: string,
  edge: PreviewScheduleResizeEdge,
  dayDelta: number
): PreviewScheduleResizePatch | undefined {
  if (!Number.isInteger(dayDelta) || dayDelta === 0) {
    return undefined;
  }
  const task = model.tasks.find((candidate) => candidate.nodeId === nodeId);
  if (!task?.editable || task.startDay === undefined || task.endDay === undefined || !task.startIso) {
    return undefined;
  }

  if (task.kind === "start-duration") {
    if (!task.duration || task.durationDays === undefined) {
      return undefined;
    }
    if (edge === "right") {
      const nextDurationDays = task.durationDays + dayDelta;
      return nextDurationDays >= 1
        ? {
            nodeId,
            edge,
            duration: formatDurationDays(nextDurationDays, task.duration),
            dayDelta
          }
        : undefined;
    }
    const nextDurationDays = task.durationDays - dayDelta;
    const nextStartIso = addPreviewUtcDays(task.startIso, dayDelta);
    const nextStart = formatPreviewDateLiteral(nextStartIso, model.dateFormat);
    return nextDurationDays >= 1 && nextStart
      ? {
          nodeId,
          edge,
          start: nextStart,
          duration: formatDurationDays(nextDurationDays, task.duration),
          dayDelta
        }
      : undefined;
  }

  if (task.kind === "start-end") {
    if (!task.endIso) {
      return undefined;
    }
    if (edge === "right") {
      const nextEndDay = task.endDay + dayDelta;
      const nextEndIso = addPreviewUtcDays(task.endIso, dayDelta);
      const nextEnd = formatPreviewDateLiteral(nextEndIso, model.dateFormat);
      return nextEndDay - task.startDay >= 1 && nextEnd
        ? { nodeId, edge, end: nextEnd, dayDelta }
        : undefined;
    }
    const nextStartDay = task.startDay + dayDelta;
    const nextStartIso = addPreviewUtcDays(task.startIso, dayDelta);
    const nextStart = formatPreviewDateLiteral(nextStartIso, model.dateFormat);
    return task.endDay - nextStartDay >= 1 && nextStart
      ? { nodeId, edge, start: nextStart, dayDelta }
      : undefined;
  }

  return undefined;
}

export function createPreviewScheduleResizePatchFromPixels(
  model: PreviewScheduleEditModel,
  nodeId: string,
  edge: PreviewScheduleResizeEdge,
  deltaPixels: number,
  widthPixels: number
): PreviewScheduleResizePatch | undefined {
  return createPreviewScheduleResizePatch(
    model,
    nodeId,
    edge,
    previewSchedulePixelDeltaToDays(deltaPixels, widthPixels, model)
  );
}

export function addPreviewUtcDays(isoDate: string, days: number): string {
  return utcDayToIso(isoToUtcDay(isoDate) + days);
}

export function previewUtcDayDiff(startIso: string, endIso: string): number {
  return isoToUtcDay(endIso) - isoToUtcDay(startIso);
}

function classifyTask(row: TaskGridRow, rowIndex: number, dateFormat: string): PreviewScheduleEditTask {
  const base = {
    nodeId: row.nodeId,
    label: row.displayLabel || row.label,
    sectionLabel: row.sectionLabel,
    sourceOrder: row.sourceOrder,
    start: row.start,
    end: row.end,
    duration: row.duration,
    rowIndex,
    leftPercent: 0,
    widthPercent: 0
  };
  const startIso = row.start ? parsePreviewDateLiteral(row.start, dateFormat) : undefined;
  if (!startIso) {
    return unsupported(base, "start date is not parseable with dateFormat", dateFormat);
  }
  const startDay = isoToUtcDay(startIso);
  if (row.dependencies.length > 0 || row.until) {
    return unsupported({
      ...base,
      startIso,
      startDay,
      endIso: row.end ? parsePreviewDateLiteral(row.end, dateFormat) : undefined
    }, "dependency or until anchor is retained", dateFormat);
  }
  if (row.milestone && (row.duration === undefined || isZeroDuration(row.duration))) {
    return {
      ...base,
      startIso,
      startDay,
      endIso: utcDayToIso(startDay + 1),
      endDay: startDay + 1,
      durationDays: 0,
      kind: "milestone",
      editable: true
    };
  }
  if (row.end) {
    const endIso = parsePreviewDateLiteral(row.end, dateFormat);
    if (!endIso) {
      return unsupported({ ...base, startIso, startDay }, "end date is not parseable with dateFormat", dateFormat);
    }
    const endDay = isoToUtcDay(endIso);
    if (endDay < startDay) {
      return unsupported({ ...base, startIso, endIso, startDay, endDay }, "end date is before start date", dateFormat);
    }
    return {
      ...base,
      startIso,
      endIso,
      startDay,
      endDay: Math.max(startDay + 1, endDay),
      durationDays: Math.max(1, endDay - startDay),
      kind: "start-end",
      editable: true
    };
  }
  if (row.duration) {
    const durationDays = parseDurationDays(row.duration);
    if (durationDays === undefined) {
      return unsupported({ ...base, startIso, startDay }, "duration is not day-snappable", dateFormat);
    }
    return {
      ...base,
      startIso,
      startDay,
      endIso: utcDayToIso(startDay + durationDays),
      endDay: startDay + durationDays,
      durationDays,
      kind: "start-duration",
      editable: true
    };
  }
  return unsupported({ ...base, startIso, startDay }, "task has no editable schedule span", dateFormat);
}

function unsupported(
  task: Omit<PreviewScheduleEditTask, "kind" | "editable" | "unsupportedReason">,
  reason: string,
  dateFormat: string
): PreviewScheduleEditTask {
  const startDay = task.startDay;
  const parsedEndIso = task.end ? parsePreviewDateLiteral(task.end, dateFormat) : undefined;
  const endDay = task.endDay ?? (parsedEndIso ? isoToUtcDay(parsedEndIso) : startDay !== undefined ? startDay + 1 : undefined);
  return {
    ...task,
    endIso: task.endIso ?? parsedEndIso,
    endDay,
    kind: "unsupported",
    editable: false,
    unsupportedReason: reason
  };
}

function parseDurationDays(value: string): number | undefined {
  return parseDuration(value)?.days;
}

function isZeroDuration(value: string): boolean {
  return /^\s*0+(?:\.0+)?\s*(d|day|days|w|week|weeks|month|months|y|year|years)\s*$/i.test(value);
}

function parseDuration(value: string): { days: number; unit: string } | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|week|weeks|month|months|y|year|years)\s*$/i.exec(value);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith("w")
    ? 7
    : unit.startsWith("month")
      ? 30
      : unit.startsWith("y")
        ? 365
        : 1;
  return {
    days: Math.max(1, Math.round(amount * multiplier)),
    unit
  };
}

function formatDurationDays(days: number, sourceDuration: string): string {
  const roundedDays = Math.max(1, Math.round(days));
  const parsed = parseDuration(sourceDuration);
  if (parsed?.unit.startsWith("w") && roundedDays % 7 === 0) {
    return `${roundedDays / 7}w`;
  }
  if (parsed?.unit.startsWith("month") && roundedDays % 30 === 0) {
    const amount = roundedDays / 30;
    return `${amount}${amount === 1 ? "month" : "months"}`;
  }
  if (parsed?.unit.startsWith("y") && roundedDays % 365 === 0) {
    return `${roundedDays / 365}y`;
  }
  return `${roundedDays}d`;
}

function normalizeDateFormat(value: string | undefined): string {
  return value?.trim() || DEFAULT_DATE_FORMAT;
}

function dateFormatTokens(format: string): Array<"YYYY" | "YY" | "MM" | "DD"> {
  return Array.from(normalizeDateFormat(format).matchAll(DATE_TOKEN_PATTERN)).map((match) => match[0] as "YYYY" | "YY" | "MM" | "DD");
}

function dateFormatParts(format: string): DateFormatPart[] {
  const source = normalizeDateFormat(format);
  const parts: DateFormatPart[] = [];
  let cursor = 0;
  for (const match of source.matchAll(DATE_TOKEN_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    if (match.index > cursor) {
      parts.push({ type: "literal", value: source.slice(cursor, match.index) });
    }
    parts.push({ type: "token", value: match[0] as "YYYY" | "YY" | "MM" | "DD" });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) {
    parts.push({ type: "literal", value: source.slice(cursor) });
  }
  return parts;
}

function isValidIsoDate(isoDate: string): boolean {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isoToUtcDay(isoDate: string): number {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match || !isValidIsoDate(isoDate)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY);
}

function utcDayToIso(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function todayIsoDate(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
