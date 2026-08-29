import { Types } from 'mongoose';

import { ProjectModel, type ProjectRecord, type TargetChangeRecord } from './project.model.js';

export interface NewProject {
  readonly company: Types.ObjectId;
  readonly createdBy: Types.ObjectId;
  readonly name: string;
  readonly description?: string;
  readonly location?: ProjectRecord['location'];
  readonly startDate: Date;
  readonly targetEndDate: Date;
  readonly originalTargetEndDate: Date;
  readonly overrunAllowanceDays: number;
}

export interface ProjectUpdate {
  readonly name?: string;
  readonly description?: string;
  readonly location?: ProjectRecord['location'];
  readonly startDate?: Date;
  readonly targetEndDate?: Date;
}

/**
 * Absent and cleared are different requests. Omitting `location` leaves the stored one alone;
 * asking to clear it removes the whole sub-document, so no legacy city or region survives as a
 * silent fallback under a place that is gone.
 */
export interface ProjectUpdateOptions {
  readonly clearLocation?: boolean;
}

export interface ProjectCursor {
  readonly createdAt: Date;
  readonly id: Types.ObjectId;
}

export interface ProjectRepository {
  create(project: NewProject): Promise<ProjectRecord>;
  /** Company is part of the filter, so another company's project is simply not found. */
  findOwnedById(id: string, company: Types.ObjectId): Promise<ProjectRecord | null>;
  listByCompany(company: Types.ObjectId, cursor: ProjectCursor | null, limit: number): Promise<ProjectRecord[]>;
  update(
    id: Types.ObjectId,
    update: ProjectUpdate,
    targetChange: TargetChangeRecord | null,
    options?: ProjectUpdateOptions,
  ): Promise<ProjectRecord | null>;
  deleteOwnedById(id: string, company: Types.ObjectId): Promise<boolean>;
}

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const projectRepository: ProjectRepository = {
  async create(project) {
    const created = new ProjectModel(project);
    await created.save();
    return created.toObject() as ProjectRecord;
  },

  async findOwnedById(id, company) {
    const projectId = toObjectId(id);
    if (projectId === null) return null;

    return ProjectModel.findOne({ _id: projectId, company }).lean<ProjectRecord>().exec();
  },

  async listByCompany(company, cursor, limit) {
    const filter: Record<string, unknown> = { company };
    if (cursor !== null) {
      filter['$or'] = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    return ProjectModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<ProjectRecord[]>()
      .exec();
  },

  /**
   * Only the fields the screen sent are written. Anything absent from `update` is left exactly as
   * it was, so a screen that does not render a field can never blank it.
   */
  async update(id, update, targetChange, options) {
    const set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) set[key] = value;
    }

    const operation: Record<string, unknown> = {};
    if (Object.keys(set).length > 0) operation['$set'] = set;
    if (options?.clearLocation === true) operation['$unset'] = { location: '' };
    if (targetChange !== null) operation['$push'] = { targetChanges: targetChange };

    if (Object.keys(operation).length === 0) {
      return ProjectModel.findById(id).lean<ProjectRecord>().exec();
    }

    return ProjectModel.findByIdAndUpdate(id, operation, { new: true }).lean<ProjectRecord>().exec();
  },

  /** D24: a pre-start cancellation leaves no record, so the row goes rather than gaining a flag. */
  async deleteOwnedById(id, company) {
    const projectId = toObjectId(id);
    if (projectId === null) return false;

    const result = await ProjectModel.deleteOne({ _id: projectId, company }).exec();
    return result.deletedCount === 1;
  },
};
