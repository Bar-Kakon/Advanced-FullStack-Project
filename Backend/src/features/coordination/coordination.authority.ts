import type { Types } from 'mongoose';

export interface CoordinationViewer {
  readonly userId: string;
  readonly reachesProject: boolean;
  readonly managesSchedule: boolean;
  readonly mayPartialRelease: boolean;
}

export interface RequestableTask {
  readonly assignee?: Types.ObjectId;
  readonly orphanedAt?: Date;
  readonly completedAt?: Date;
}

export const isResponsibleFor = (viewer: CoordinationViewer, task: RequestableTask): boolean =>
  task.assignee?.toString() === viewer.userId;

export const mayRequestChange = (viewer: CoordinationViewer, task: RequestableTask): boolean => {
  if (task.orphanedAt !== undefined || task.completedAt !== undefined) return false;
  return isResponsibleFor(viewer, task) || (viewer.reachesProject && viewer.managesSchedule);
};

export const mayLaunch = (viewer: CoordinationViewer): boolean =>
  viewer.reachesProject && viewer.managesSchedule;

export const mayResolve = mayLaunch;
export const mayCancel = mayLaunch;
export const mayAdjustImpact = mayLaunch;
export const maySeeResponseMatrix = mayLaunch;

export const mayReleasePartially = (viewer: CoordinationViewer): boolean =>
  viewer.reachesProject && viewer.mayPartialRelease;

export const mayRespondTo = (
  viewer: CoordinationViewer,
  item: { readonly respondent: Types.ObjectId },
): boolean => item.respondent.toString() === viewer.userId;

export const mayReadFullAudit = mayLaunch;
