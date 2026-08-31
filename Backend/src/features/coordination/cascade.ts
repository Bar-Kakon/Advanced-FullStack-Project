import {
  addWorkingDays,
  dueFromWorkingDays,
  workingDaysBetween,
} from '../calendar/workingDay.js';
import type { WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';

export interface CascadeStage {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly isGate: boolean;
  readonly releasedTasks: readonly string[];
}

export interface CascadeTask {
  readonly id: string;
  readonly stageId: string | null;
  readonly startDate: Date;
  readonly dueDate: Date;
  readonly frozen: boolean;
}

export const HOLD_REASONS = ['initiating', 'gate', 'sequence'] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface CascadeImpactItem {
  readonly taskId: string;
  readonly currentStart: Date;
  readonly currentDue: Date;
  readonly proposedStart: Date;
  readonly proposedDue: Date;
  readonly reason: HoldReason;
  readonly viaStageId: string | null;
}

export interface CascadeResult {
  readonly items: readonly CascadeImpactItem[];
  readonly unaffected: readonly string[];
  readonly pressuredStages: readonly string[];
}

export interface CascadeInput {
  readonly stages: readonly CascadeStage[];
  readonly tasks: readonly CascadeTask[];
  readonly config: WorkingCalendarConfig;
  readonly initiating: { readonly taskId: string; readonly startDate: Date; readonly dueDate: Date };
}

interface Window {
  readonly start: Date;
  readonly due: Date;
}

const latest = (a: Date | null, b: Date): Date => (a === null || b.getTime() > a.getTime() ? b : a);

const topologicalOrder = (stages: readonly CascadeStage[]): readonly CascadeStage[] => {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const remaining = new Map(
    stages.map((stage) => [stage.id, stage.dependsOn.filter((id) => byId.has(id)).length]),
  );
  const dependents = new Map<string, string[]>();
  for (const stage of stages) {
    for (const upstream of stage.dependsOn) {
      if (!byId.has(upstream)) continue;
      dependents.set(upstream, [...(dependents.get(upstream) ?? []), stage.id]);
    }
  }

  const ready = stages.filter((stage) => remaining.get(stage.id) === 0).map((stage) => stage.id);
  const ordered: CascadeStage[] = [];

  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;

    const stage = byId.get(id);
    if (stage !== undefined) ordered.push(stage);

    for (const next of dependents.get(id) ?? []) {
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  return ordered;
};

export const computeCascade = ({
  stages,
  tasks,
  config,
  initiating,
}: CascadeInput): CascadeResult => {
  const source = tasks.find((task) => task.id === initiating.taskId);
  if (source === undefined) {
    return { items: [], unaffected: [], pressuredStages: [] };
  }

  const byStage = new Map<string, CascadeTask[]>();
  for (const task of tasks) {
    if (task.stageId === null) continue;
    byStage.set(task.stageId, [...(byStage.get(task.stageId) ?? []), task]);
  }

  const moved = new Map<string, Window>([
    [source.id, { start: initiating.startDate, due: initiating.dueDate }],
  ]);
  const items: CascadeImpactItem[] = [
    {
      taskId: source.id,
      currentStart: source.startDate,
      currentDue: source.dueDate,
      proposedStart: initiating.startDate,
      proposedDue: initiating.dueDate,
      reason: 'initiating',
      viaStageId: null,
    },
  ];
  const unaffected: string[] = [];
  const pressuredStages: string[] = [];

  const dueOf = (task: CascadeTask): Date => moved.get(task.id)?.due ?? task.dueDate;

  const pressureOf = (stage: CascadeStage): Date | null => {
    const inStage = byStage.get(stage.id) ?? [];
    const contributors = stage.isGate ? inStage : inStage.filter((task) => moved.has(task.id));
    if (contributors.length === 0) return null;

    let after: Date | null = null;
    let before: Date | null = null;
    for (const task of contributors) {
      after = latest(after, dueOf(task));
      before = latest(before, task.dueDate);
    }
    if (after === null || before === null) return null;
    return after.getTime() > before.getTime() ? after : null;
  };

  for (const stage of topologicalOrder(stages)) {
    const inStage = (byStage.get(stage.id) ?? []).filter(
      (task) => !task.frozen && !moved.has(task.id),
    );
    if (inStage.length === 0) continue;

    const upstream = stage.dependsOn
      .map((id) => stages.find((row) => row.id === id))
      .filter((row): row is CascadeStage => row !== undefined);

    let sawPressure = false;
    for (const task of inStage) {
      let required: Date | null = null;
      let via: string | null = null;
      let reason: HoldReason = 'sequence';

      for (const up of upstream) {
        if (up.releasedTasks.includes(task.id)) continue;

        const pressure = pressureOf(up);
        if (pressure === null) continue;

        const earliest = addWorkingDays(config, pressure, 1);
        if (required === null || earliest.getTime() > required.getTime()) {
          required = earliest;
          via = up.id;
          reason = up.isGate ? 'gate' : 'sequence';
        }
      }

      if (required === null) continue;
      sawPressure = true;

      if (task.startDate.getTime() >= required.getTime()) {
        unaffected.push(task.id);
        continue;
      }

      const span = workingDaysBetween(config, task.startDate, task.dueDate);
      const proposedStart = required;
      const proposedDue = dueFromWorkingDays(config, proposedStart, span);

      moved.set(task.id, { start: proposedStart, due: proposedDue });
      items.push({
        taskId: task.id,
        currentStart: task.startDate,
        currentDue: task.dueDate,
        proposedStart,
        proposedDue,
        reason,
        viaStageId: via,
      });
    }

    if (sawPressure) pressuredStages.push(stage.id);
  }

  return { items, unaffected, pressuredStages };
};
