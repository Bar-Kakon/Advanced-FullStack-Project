import { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import { ProjectStageModel, type ProjectStageRecord } from './projectStage.model.js';

export const stageNotFound = (): AppError =>
  new AppError('Stage not found.', 404, 'STAGE_NOT_FOUND');

export const dependencyCycle = (): AppError =>
  new AppError('That dependency would create a loop.', 409, 'STAGE_DEPENDENCY_CYCLE');

export const dependencyOutsideProject = (): AppError =>
  new AppError('A stage can only depend on stages in the same project.', 409, 'STAGE_DEPENDENCY_FOREIGN');

export const selfDependency = (): AppError =>
  new AppError('A stage cannot depend on itself.', 409, 'STAGE_SELF_DEPENDENCY');

export interface StagesService {
  list(project: Types.ObjectId): Promise<ProjectStageRecord[]>;
  setDependencies(
    project: Types.ObjectId,
    stageId: string,
    dependsOn: readonly string[],
  ): Promise<ProjectStageRecord>;
}

/**
 * Whether following `dependsOn` edges from `from` can reach `target`.
 *
 * Depth-first, with a visited set, so a graph that already contains a loop cannot spin here. This
 * is the whole of cycle prevention: an edge is refused when the stage it points at can already
 * reach the stage being edited.
 */
const reaches = (
  from: string,
  target: string,
  edges: ReadonlyMap<string, readonly string[]>,
): boolean => {
  const seen = new Set<string>();
  const stack = [from];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    if (current === target) return true;
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
};

export const createStagesService = (): StagesService => ({
  async list(project) {
    return ProjectStageModel.find({ project })
      .sort({ order: 1 })
      .lean<ProjectStageRecord[]>()
      .exec();
  },

  async setDependencies(project, stageId, dependsOn) {
    if (!Types.ObjectId.isValid(stageId)) throw stageNotFound();

    const all = await ProjectStageModel.find({ project }).lean<ProjectStageRecord[]>().exec();
    const stage = all.find((row) => row._id.toString() === stageId);
    if (stage === undefined) throw stageNotFound();

    const known = new Set(all.map((row) => row._id.toString()));
    for (const id of dependsOn) {
      if (id === stageId) throw selfDependency();
      if (!known.has(id)) throw dependencyOutsideProject();
    }

    // Walk the graph as it WOULD be, so the refusal happens before anything is written.
    const edges = new Map<string, readonly string[]>(
      all.map((row) => [
        row._id.toString(),
        row._id.toString() === stageId ? [...dependsOn] : row.dependsOn.map((id) => id.toString()),
      ]),
    );
    for (const id of dependsOn) {
      if (reaches(id, stageId, edges)) throw dependencyCycle();
    }

    const updated = await ProjectStageModel.findByIdAndUpdate(
      stage._id,
      { $set: { dependsOn: dependsOn.map((id) => new Types.ObjectId(id)) } },
      { new: true },
    )
      .lean<ProjectStageRecord>()
      .exec();

    if (updated === null) throw stageNotFound();
    return updated;
  },
});
