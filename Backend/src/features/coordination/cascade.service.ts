import { Types } from 'mongoose';

import { configOrDefault } from '../calendar/companyCalendar.repository.js';
import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import {
  dueFromWorkingDays,
  isWorkingDay,
  nextWorkingDayOnOrAfter,
  workingDaysBetween,
  type ScheduleCalendar,
} from '../calendar/workingDay.js';
import { resolveEffectiveCalendar, type WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';
import type { ProjectRecord } from '../projects/project.model.js';
import { formatCalendarDate, overrunCeiling } from '../projects/projectDates.js';
import { calendarFor as buildCalendar } from '../scheduleexceptions/exceptionCalendar.js';
import { scheduleExceptionRepository } from '../scheduleexceptions/scheduleException.repository.js';
import type { ScheduleExceptionRecord } from '../scheduleexceptions/scheduleException.model.js';
import { ProjectStageModel, type ProjectStageRecord } from '../tasks/projectStage.model.js';
import { TaskModel, type TaskRecord } from '../tasks/task.model.js';
import { computeCascade, type CascadeResult, type CascadeStage, type CascadeTask } from './cascade.js';
import type { CeilingDto } from './coordination.dto.js';
import type { RequestedChanges } from './proposal.model.js';

export interface ProjectGraph {
  readonly project: ProjectRecord;
  readonly config: WorkingCalendarConfig;
  /** Every approved exception on this project, already loaded so no arithmetic re-reads them. */
  readonly exceptions: readonly ScheduleExceptionRecord[];
  readonly stages: readonly ProjectStageRecord[];
  readonly tasks: readonly TaskRecord[];
  /** The calendar one task is scheduled by, weekly pattern and approved exceptions together. */
  calendarFor(taskId: string): ScheduleCalendar;
  /** The project-wide calendar, for arithmetic that belongs to no single task. */
  readonly projectCalendar: ScheduleCalendar;
}

export interface ComputedImpact {
  readonly result: CascadeResult;
  readonly ceiling: CeilingDto;
}

const frozen = (task: TaskRecord): boolean =>
  task.completedAt !== undefined || task.orphanedAt !== undefined;

export const toCascadeStage = (stage: ProjectStageRecord): CascadeStage => ({
  id: stage._id.toString(),
  dependsOn: stage.dependsOn.map((id) => id.toString()),
  isGate: stage.isGate,
  releasedTasks: (stage.partialReleaseTasks ?? []).map((id) => id.toString()),
});

export const toCascadeTask = (task: TaskRecord): CascadeTask => ({
  id: task._id.toString(),
  stageId: task.stage?.toString() ?? null,
  startDate: task.startDate,
  dueDate: task.dueDate,
  frozen: frozen(task),
});

export const loadProjectGraph = async (
  project: ProjectRecord,
  calendars: CompanyCalendarRepository,
): Promise<ProjectGraph> => {
  const [pinned, stages, tasks, exceptions] = await Promise.all([
    calendars.findById(project.calendarVersion),
    ProjectStageModel.find({ project: project._id }).lean<ProjectStageRecord[]>().exec(),
    TaskModel.find({ project: project._id }).lean<TaskRecord[]>().exec(),
    scheduleExceptionRepository.listApproved(project._id),
  ]);

  const config = resolveEffectiveCalendar(configOrDefault(pinned), project.calendarOverrides);
  const assigneeOf = new Map(
    tasks.map((task) => [task._id.toString(), task.assignee?.toString()]),
  );
  // Built once per graph rather than per arithmetic call: a cascade over a whole project asks for
  // the same handful of calendars repeatedly.
  const cache = new Map<string, ScheduleCalendar>();

  return {
    project,
    config,
    exceptions,
    stages,
    tasks,
    projectCalendar: buildCalendar(config, exceptions, {}),
    calendarFor(taskId) {
      const held = cache.get(taskId);
      if (held !== undefined) return held;

      const professionalId = assigneeOf.get(taskId);
      const built = buildCalendar(config, exceptions, {
        taskId,
        ...(professionalId === undefined ? {} : { professionalId }),
      });
      cache.set(taskId, built);
      return built;
    },
  };
};

export const proposedWindowFor = (
  task: TaskRecord,
  changes: RequestedChanges,
  calendar: ScheduleCalendar,
): { readonly startDate: Date; readonly dueDate: Date } => {
  const span = Math.max(1, workingDaysBetween(calendar, task.startDate, task.dueDate));
  const start = nextWorkingDayOnOrAfter(calendar, changes.alternativeStart ?? task.startDate);

  if (changes.alternativeDue !== undefined) {
    return { startDate: start, dueDate: nextWorkingDayOnOrAfter(calendar, changes.alternativeDue) };
  }

  const extended = Math.max(1, span + (changes.deltaWorkingDays ?? 0));
  return { startDate: start, dueDate: dueFromWorkingDays(calendar, start, extended) };
};

export const computeImpact = (
  graph: ProjectGraph,
  requested: TaskRecord,
  changes: RequestedChanges,
): ComputedImpact => {
  const task = graph.tasks.find((row) => row._id.equals(requested._id)) ?? requested;
  const window = proposedWindowFor(task, changes, graph.calendarFor(task._id.toString()));
  const result = computeCascade({
    stages: graph.stages.map(toCascadeStage),
    tasks: graph.tasks.map(toCascadeTask),
    calendarFor: (taskId) => graph.calendarFor(taskId),
    initiating: { taskId: task._id.toString(), ...window },
  });

  const ceilingDate = overrunCeiling(
    graph.project.originalTargetEndDate,
    graph.project.overrunAllowanceDays,
  );
  let latest: Date | null = null;
  for (const item of result.items) {
    if (latest === null || item.proposedDue.getTime() > latest.getTime()) latest = item.proposedDue;
  }

  return {
    result,
    ceiling: {
      ceilingDate: formatCalendarDate(ceilingDate),
      latestProposedDue: latest === null ? null : formatCalendarDate(latest),
      exceeded: latest !== null && latest.getTime() > ceilingDate.getTime(),
    },
  };
};

export const respondentFor = (task: TaskRecord | undefined): Types.ObjectId | null =>
  task?.assignee ?? null;

export interface AlternativesConstraints {
  readonly earliestStart?: Date;
  readonly latestFinishForWork?: Date;
  readonly latestFinishForChain?: Date;
  readonly mustNotMove: readonly string[];
}

export const EXPLANATION_CODES = [
  'earliest_start',
  'latest_finish_work',
  'latest_finish_chain',
  'project_ceiling',
  'must_not_move',
  'stage_dependency',
  'working_calendar',
  'frozen_work',
  'pending_commitments',
  'single_duration',
  'equivalent_outcomes',
] as const;
export type ExplanationCode = (typeof EXPLANATION_CODES)[number];

export interface ExplanationEntry {
  readonly code: ExplanationCode;
  readonly anchorsUnavailable?: number;
  readonly candidatesEliminated?: number;
  readonly outcomesCollapsed?: number;
  readonly arrangementsForced?: number;
  readonly taskIds?: readonly string[];
  readonly date?: string;
}

export interface ScheduleCandidate {
  readonly token: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly affectedTaskCount: number;
  readonly affectedProfessionalCount: number;
  readonly onlyInitiatingWorkMoves: boolean;
  readonly latestFinishInArrangement: string;
  readonly equivalentAnchorCount: number;
}

export interface AlternativesResult {
  readonly candidates: readonly ScheduleCandidate[];
  readonly explanation: readonly ExplanationEntry[];
  readonly sweepTruncated: boolean;
  readonly anchorsEvaluated: number;
}

const SWEEP_LIMIT = 60;
const MS_PER_DAY = 86_400_000;

const distinctSpans = (
  task: TaskRecord,
  changes: RequestedChanges,
  calendar: ScheduleCalendar,
): readonly number[] => {
  const committed = Math.max(1, workingDaysBetween(calendar, task.startDate, task.dueDate));
  const spans = new Set<number>([committed]);

  if (changes.deltaWorkingDays !== undefined) {
    spans.add(Math.max(1, committed + changes.deltaWorkingDays));
  }
  if (changes.alternativeStart !== undefined && changes.alternativeDue !== undefined) {
    spans.add(Math.max(1, workingDaysBetween(calendar, changes.alternativeStart, changes.alternativeDue)));
  }
  return [...spans].sort((a, b) => a - b);
};

export const candidateSchedules = (
  graph: ProjectGraph,
  requested: TaskRecord,
  changes: RequestedChanges,
  constraints: AlternativesConstraints,
): AlternativesResult => {
  const task = graph.tasks.find((row) => row._id.equals(requested._id)) ?? requested;
  // Alternatives are arrangements for THIS work, so they are swept against this task's calendar —
  // the same one the cascade will use if one of them is chosen.
  const calendar = graph.calendarFor(task._id.toString());
  const spans = distinctSpans(task, changes, calendar);
  const shortest = spans[0] ?? 1;

  const ceilingDate = overrunCeiling(graph.project.originalTargetEndDate, graph.project.overrunAllowanceDays);
  const upperLimit =
    constraints.latestFinishForWork !== undefined &&
    constraints.latestFinishForWork.getTime() < ceilingDate.getTime()
      ? constraints.latestFinishForWork
      : ceilingDate;

  const floor =
    constraints.earliestStart !== undefined &&
    constraints.earliestStart.getTime() > task.startDate.getTime()
      ? constraints.earliestStart
      : task.startDate;
  const lower = nextWorkingDayOnOrAfter(calendar, floor);

  const anchors: Date[] = [];
  let unavailableDays = 0;
  let cursor = lower;
  let truncated = false;

  while (anchors.length < SWEEP_LIMIT) {
    if (dueFromWorkingDays(calendar, cursor, shortest).getTime() > upperLimit.getTime()) break;
    if (isWorkingDay(calendar, cursor)) anchors.push(cursor);
    else unavailableDays += 1;
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  if (anchors.length === SWEEP_LIMIT) {
    let boundary: Date | null = null;
    let probe = cursor;
    for (let i = 0; i < 3650; i += 1) {
      if (dueFromWorkingDays(calendar, probe, shortest).getTime() > upperLimit.getTime()) break;
      if (isWorkingDay(calendar, probe)) boundary = probe;
      probe = new Date(probe.getTime() + MS_PER_DAY);
    }
    if (boundary !== null) {
      anchors.push(boundary);
      truncated = true;
    }
  }

  let eliminatedByWorkFinish = 0;
  let eliminatedByChainFinish = 0;
  let eliminatedByCeiling = 0;
  const blockedTasks = new Set<string>();
  let forcedArrangements = 0;

  interface Evaluated {
    readonly start: Date;
    readonly due: Date;
    readonly signature: string;
    readonly affectedIds: readonly string[];
    readonly professionals: number;
    readonly latest: Date;
  }
  const kept: Evaluated[] = [];

  for (const anchor of anchors) {
    for (const span of spans) {
      const due = dueFromWorkingDays(calendar, anchor, span);
      if (
        constraints.latestFinishForWork !== undefined &&
        due.getTime() > constraints.latestFinishForWork.getTime()
      ) {
        eliminatedByWorkFinish += 1;
        continue;
      }

      const { result } = computeImpact(graph, task, { alternativeStart: anchor, alternativeDue: due });
      let latest = due;
      for (const item of result.items) {
        if (item.proposedDue.getTime() > latest.getTime()) latest = item.proposedDue;
      }

      if (latest.getTime() > ceilingDate.getTime()) {
        eliminatedByCeiling += 1;
        continue;
      }
      if (
        constraints.latestFinishForChain !== undefined &&
        latest.getTime() > constraints.latestFinishForChain.getTime()
      ) {
        eliminatedByChainFinish += 1;
        continue;
      }

      const moved = result.items
        .filter((item) => item.reason !== 'initiating')
        .map((item) => item.taskId);
      const blocked = moved.filter((id) => constraints.mustNotMove.includes(id));
      if (blocked.length > 0) {
        for (const id of blocked) blockedTasks.add(id);
        continue;
      }
      if (moved.length > 0) forcedArrangements += 1;

      const professionals = new Set(
        moved
          .map((id) => graph.tasks.find((row) => row._id.toString() === id)?.assignee?.toString())
          .filter((id): id is string => id !== undefined),
      );
      kept.push({
        start: anchor,
        due,
        signature: `${[...moved].sort().join(',')}|${formatCalendarDate(latest)}`,
        affectedIds: moved,
        professionals: professionals.size,
        latest,
      });
    }
  }

  const groups = new Map<string, Evaluated[]>();
  for (const row of kept) {
    groups.set(row.signature, [...(groups.get(row.signature) ?? []), row]);
  }

  const candidates: ScheduleCandidate[] = [...groups.values()]
    .map((group) => {
      const representative = group.reduce((earliest, row) =>
        row.start.getTime() < earliest.start.getTime() ? row : earliest,
      );
      return {
        token: `${formatCalendarDate(representative.start)}_${formatCalendarDate(representative.due)}`,
        startDate: formatCalendarDate(representative.start),
        dueDate: formatCalendarDate(representative.due),
        affectedTaskCount: representative.affectedIds.length + 1,
        affectedProfessionalCount: representative.professionals,
        onlyInitiatingWorkMoves: representative.affectedIds.length === 0,
        latestFinishInArrangement: formatCalendarDate(representative.latest),
        equivalentAnchorCount: group.length,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const explanation: ExplanationEntry[] = [];
  const add = (entry: ExplanationEntry): void => {
    explanation.push(entry);
  };

  if (constraints.earliestStart !== undefined && constraints.earliestStart.getTime() > task.startDate.getTime()) {
    add({ code: 'earliest_start', date: formatCalendarDate(lower) });
  }
  if (anchors.length === 0) {
    const bindingIsWorkFinish =
      constraints.latestFinishForWork !== undefined &&
      constraints.latestFinishForWork.getTime() === upperLimit.getTime();
    add({
      code: bindingIsWorkFinish ? 'latest_finish_work' : 'project_ceiling',
      date: formatCalendarDate(upperLimit),
    });
  }
  if (unavailableDays > 0) add({ code: 'working_calendar', anchorsUnavailable: unavailableDays });
  if (spans.length === 1) add({ code: 'single_duration' });
  if (eliminatedByWorkFinish > 0) {
    add({ code: 'latest_finish_work', candidatesEliminated: eliminatedByWorkFinish });
  }
  if (eliminatedByChainFinish > 0) {
    add({ code: 'latest_finish_chain', candidatesEliminated: eliminatedByChainFinish });
  }
  if (eliminatedByCeiling > 0) add({ code: 'project_ceiling', candidatesEliminated: eliminatedByCeiling });
  if (blockedTasks.size > 0) add({ code: 'must_not_move', taskIds: [...blockedTasks] });
  if (forcedArrangements > 0) add({ code: 'stage_dependency', arrangementsForced: forcedArrangements });

  const frozenCount = graph.tasks.filter((row) => frozen(row)).length;
  if (frozenCount > 0) add({ code: 'frozen_work', arrangementsForced: frozenCount });

  const collapsed = kept.length - candidates.length;
  if (collapsed > 0) add({ code: 'equivalent_outcomes', outcomesCollapsed: collapsed });

  return { candidates, explanation, sweepTruncated: truncated, anchorsEvaluated: anchors.length };
};
