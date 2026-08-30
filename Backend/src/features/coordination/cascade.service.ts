import { Types } from 'mongoose';

import { configOrDefault } from '../calendar/companyCalendar.repository.js';
import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import {
  dueFromWorkingDays,
  nextWorkingDayOnOrAfter,
  workingDaysBetween,
} from '../calendar/workingDay.js';
import { resolveEffectiveCalendar, type WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';
import type { ProjectRecord } from '../projects/project.model.js';
import { formatCalendarDate, overrunCeiling } from '../projects/projectDates.js';
import { ProjectStageModel, type ProjectStageRecord } from '../tasks/projectStage.model.js';
import { TaskModel, type TaskRecord } from '../tasks/task.model.js';
import { computeCascade, type CascadeResult, type CascadeStage, type CascadeTask } from './cascade.js';
import type { CeilingDto } from './coordination.dto.js';
import type { RequestedChanges } from './proposal.model.js';

export interface ProjectGraph {
  readonly project: ProjectRecord;
  readonly config: WorkingCalendarConfig;
  readonly stages: readonly ProjectStageRecord[];
  readonly tasks: readonly TaskRecord[];
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
  const [pinned, stages, tasks] = await Promise.all([
    calendars.findById(project.calendarVersion),
    ProjectStageModel.find({ project: project._id }).lean<ProjectStageRecord[]>().exec(),
    TaskModel.find({ project: project._id }).lean<TaskRecord[]>().exec(),
  ]);

  return {
    project,
    config: resolveEffectiveCalendar(configOrDefault(pinned), project.calendarOverrides),
    stages,
    tasks,
  };
};

export const proposedWindowFor = (
  task: TaskRecord,
  changes: RequestedChanges,
  config: WorkingCalendarConfig,
): { readonly startDate: Date; readonly dueDate: Date } => {
  const span = Math.max(1, workingDaysBetween(config, task.startDate, task.dueDate));
  const start = nextWorkingDayOnOrAfter(config, changes.alternativeStart ?? task.startDate);

  if (changes.alternativeDue !== undefined) {
    return { startDate: start, dueDate: nextWorkingDayOnOrAfter(config, changes.alternativeDue) };
  }

  const extended = Math.max(1, span + (changes.deltaWorkingDays ?? 0));
  return { startDate: start, dueDate: dueFromWorkingDays(config, start, extended) };
};

export const computeImpact = (
  graph: ProjectGraph,
  requested: TaskRecord,
  changes: RequestedChanges,
): ComputedImpact => {
  const task = graph.tasks.find((row) => row._id.equals(requested._id)) ?? requested;
  const window = proposedWindowFor(task, changes, graph.config);
  const result = computeCascade({
    stages: graph.stages.map(toCascadeStage),
    tasks: graph.tasks.map(toCascadeTask),
    config: graph.config,
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
