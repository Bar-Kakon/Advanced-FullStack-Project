import type { FileVisibility, WorkPlanScope } from '../files/fileAsset.model.js';
import type { TaskViewpoint } from '../tasks/taskVisibility.js';

/**
 * Everything the authority rules need about one viewer, one scope, and nothing else.
 *
 * `taskViewpoint` is `null` for a project-scoped plan, because no delegation exists at that scope.
 */
export interface WorkPlanViewer {
  readonly scopeType: WorkPlanScope;
  /** Whether the viewer may reach the owning project at all. Decided by the project grants. */
  readonly reachesProject: boolean;
  readonly holdsWorkPlanManage: boolean;
  readonly taskViewpoint: TaskViewpoint | null;
}

const isTaskParty = (viewer: WorkPlanViewer): boolean =>
  viewer.taskViewpoint === 'assignee' || viewer.taskViewpoint === 'delegate';

/** May this viewer put a plan on this scope at all, at any visibility? */
export const mayUpload = (viewer: WorkPlanViewer): boolean =>
  viewer.holdsWorkPlanManage || isTaskParty(viewer);

/**
 * Whether this viewer may publish where the party above can read it.
 *
 * A delegate may not, and that is the delegation wall made structural rather than patched into a
 * serializer: if a delegate can never write a `shared` row, no `shared` row can carry a delegate's
 * identity, filename or upload time upward. They keep the `private` channel with their delegator.
 */
export const mayUploadShared = (viewer: WorkPlanViewer): boolean =>
  viewer.holdsWorkPlanManage || viewer.taskViewpoint === 'assignee';

export const allowedVisibilityFor = (viewer: WorkPlanViewer): readonly FileVisibility[] => {
  if (viewer.scopeType === 'project') return ['shared'];
  if (mayUploadShared(viewer)) return ['shared', 'private'];
  return viewer.taskViewpoint === 'delegate' ? ['private'] : [];
};

/**
 * `private` never leaves the two parties to the delegation, whatever else the viewer holds — a
 * project grant is not a way around the wall. `shared` follows ordinary project reach.
 */
export const mayRead = (visibility: FileVisibility, viewer: WorkPlanViewer): boolean => {
  if (visibility === 'private') return isTaskParty(viewer);
  return viewer.reachesProject || isTaskParty(viewer);
};

/** Marking a version current takes the same authority that publishing at that visibility takes. */
export const mayMarkCurrent = (visibility: FileVisibility, viewer: WorkPlanViewer): boolean =>
  visibility === 'private' ? isTaskParty(viewer) : mayUploadShared(viewer);
