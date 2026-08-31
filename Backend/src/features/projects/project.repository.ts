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
  readonly projectType: ProjectRecord['projectType'];
  readonly projectTypeOther?: string;
  readonly size: string;
  readonly calendarVersion: Types.ObjectId;
}

export interface ProjectUpdate {
  readonly name?: string;
  readonly description?: string;
  readonly location?: ProjectRecord['location'];
  readonly startDate?: Date;
  readonly targetEndDate?: Date;
  readonly projectType?: ProjectRecord['projectType'];
  readonly projectTypeOther?: string;
  readonly size?: string;
  readonly calendarOverrides?: ProjectRecord['calendarOverrides'];
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
  /** Reachable means owned by the caller's company OR one they participate in. */
  findAccessibleById(id: string, company: Types.ObjectId, memberOf: readonly Types.ObjectId[]): Promise<ProjectRecord | null>;
  listAccessible(
    company: Types.ObjectId,
    memberOf: readonly Types.ObjectId[],
    cursor: ProjectCursor | null,
    limit: number,
  ): Promise<ProjectRecord[]>;
  listByCompany(company: Types.ObjectId, cursor: ProjectCursor | null, limit: number): Promise<ProjectRecord[]>;
  /** How many projects the business owns. What the plan's project capacity is measured against. */
  countByCompany(company: Types.ObjectId): Promise<number>;
  countOnOutdatedCalendar(company: Types.ObjectId, currentVersion: Types.ObjectId): Promise<number>;
  listOnOutdatedCalendar(company: Types.ObjectId, currentVersion: Types.ObjectId): Promise<ProjectRecord[]>;
  adoptCalendarVersion(
    id: Types.ObjectId,
    toVersion: Types.ObjectId,
    adoption: ProjectRecord['calendarAdoptions'][number],
    clearOverrides: boolean,
  ): Promise<ProjectRecord | null>;
  update(
    id: Types.ObjectId,
    update: ProjectUpdate,
    targetChange: TargetChangeRecord | null,
    options?: ProjectUpdateOptions,
  ): Promise<ProjectRecord | null>;
  deleteOwnedById(id: string, company: Types.ObjectId): Promise<boolean>;
  /** Unfiltered by design — the caller already holds the rows that named these projects. */
  listByIds(ids: readonly Types.ObjectId[]): Promise<ProjectRecord[]>;
}

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const projectRepository: ProjectRepository = {
  async create(project) {
    const created = new ProjectModel(project);
    await created.save();
    return created.toObject() as ProjectRecord;
  },

  async listByIds(ids) {
    if (ids.length === 0) return [];
    return ProjectModel.find({ _id: { $in: [...ids] } }).lean<ProjectRecord[]>().exec();
  },

  async findOwnedById(id, company) {
    const projectId = toObjectId(id);
    if (projectId === null) return null;

    return ProjectModel.findOne({ _id: projectId, company }).lean<ProjectRecord>().exec();
  },

  async findAccessibleById(id, company, memberOf) {
    const projectId = toObjectId(id);
    if (projectId === null) return null;

    return ProjectModel.findOne({
      _id: projectId,
      $or: [{ company }, { _id: { $in: [...memberOf] } }],
    })
      .lean<ProjectRecord>()
      .exec();
  },

  async listAccessible(company, memberOf, cursor, limit) {
    const reach: Record<string, unknown>[] = [{ company }];
    if (memberOf.length > 0) reach.push({ _id: { $in: [...memberOf] } });

    const conditions: Record<string, unknown>[] = [{ $or: reach }];
    if (cursor !== null) {
      conditions.push({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ],
      });
    }

    return ProjectModel.find({ $and: conditions })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<ProjectRecord[]>()
      .exec();
  },

  async countByCompany(company) {
    return ProjectModel.countDocuments({ company }).exec();
  },

  async countOnOutdatedCalendar(company, currentVersion) {
    return ProjectModel.countDocuments({ company, calendarVersion: { $ne: currentVersion } }).exec();
  },

  async listOnOutdatedCalendar(company, currentVersion) {
    return ProjectModel.find({ company, calendarVersion: { $ne: currentVersion } })
      .sort({ createdAt: -1 })
      .lean<ProjectRecord[]>()
      .exec();
  },

  /** The only path that moves a pin. Always explicit, always recorded. */
  async adoptCalendarVersion(id, toVersion, adoption, clearOverrides) {
    const operation: Record<string, unknown> = {
      $set: { calendarVersion: toVersion },
      $push: { calendarAdoptions: adoption },
    };
    if (clearOverrides) operation['$unset'] = { calendarOverrides: '' };

    return ProjectModel.findByIdAndUpdate(id, operation, { new: true }).lean<ProjectRecord>().exec();
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
