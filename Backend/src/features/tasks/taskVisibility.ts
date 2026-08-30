import type { Types } from 'mongoose';

import type { TaskRecord } from './task.model.js';

/**
 * Where every "what may this viewer see" question about a task is answered, once.
 *
 * The delegation wall is asymmetric on purpose: the party above sees the delegator and never the
 * delegate, and the delegate sees the delegator and never the party above or the wider project.
 * Any surface that reads a task goes through here, so the wall cannot be forgotten in one place.
 */
export const TASK_VIEWPOINTS = ['assignee', 'delegate', 'observer', 'none'] as const;
export type TaskViewpoint = (typeof TASK_VIEWPOINTS)[number];

export interface TaskViewer {
  readonly userId: string;
  /** Whether the viewer may see this project at all, decided by the project grants, not here. */
  readonly reachesProject: boolean;
}

/**
 * Which side of the wall this viewer stands on.
 *
 *   assignee  the responsible party — the delegator when the work is delegated
 *   delegate  the hidden performer, who sees a deliberately narrower task
 *   observer  somebody on the project who is neither
 *   none      no standing at all
 */
export const viewpointOf = (task: TaskRecord, viewer: TaskViewer): TaskViewpoint => {
  if (task.assignee?.toString() === viewer.userId) return 'assignee';
  if (task.delegation?.delegate.toString() === viewer.userId) return 'delegate';
  return viewer.reachesProject ? 'observer' : 'none';
};

export interface CounterpartyRef {
  readonly userId: string;
  readonly name: string;
}

/**
 * Who this viewer answers to on this task, resolved per viewer.
 *
 * D21's identity half is closed: an ordinary assignee answers to whoever opened the work, and a
 * DELEGATE answers to the delegator — never to the party above, whose identity `createdBy` would
 * otherwise leak. `null` means there is genuinely nobody, which the client renders as its own line
 * rather than an empty slot.
 */
export const counterpartyIdFor = (
  task: TaskRecord,
  viewpoint: TaskViewpoint,
  viewerId: string,
): Types.ObjectId | null => {
  if (viewpoint === 'delegate') return task.assignee ?? null;
  if (task.createdBy.toString() === viewerId) return null;
  return task.createdBy;
};

/**
 * What a delegate is allowed to be told about the work itself.
 *
 * The project is withheld entirely: naming it would place the delegate inside the wider job and
 * identify the party above indirectly. When only part of the work was handed over, the delegate
 * sees that part's description and not the parent task's.
 */
export interface DelegateProjection {
  readonly title: string;
  readonly description: string | null;
  readonly showProject: false;
}

export const projectForDelegate = (task: TaskRecord): DelegateProjection => ({
  title: task.title,
  description:
    task.delegation?.scope === 'part'
      ? task.delegation.partDescription ?? null
      : task.description ?? null,
  showProject: false,
});

/** Whether the delegation itself may be disclosed to this viewer. Only the two parties to it. */
export const maySeeDelegation = (viewpoint: TaskViewpoint): boolean =>
  viewpoint === 'assignee' || viewpoint === 'delegate';
