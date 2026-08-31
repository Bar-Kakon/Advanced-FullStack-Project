import { Types } from 'mongoose';

import {
  FileAssetModel,
  type FileAssetRecord,
  type FileVisibility,
  type WorkPlanScope,
} from '../files/fileAsset.model.js';

export interface NewWorkPlanVersion {
  readonly owner: Types.ObjectId;
  readonly scope: { readonly type: WorkPlanScope; readonly id: Types.ObjectId };
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storage: { readonly driver: string; readonly fileId: Types.ObjectId };
  readonly versionGroup: Types.ObjectId;
  readonly version: number;
  readonly visibility: FileVisibility;
}

export interface WorkPlanRepository {
  create(version: NewWorkPlanVersion): Promise<FileAssetRecord>;
  /** Every version in one group, newest first. */
  listVersions(versionGroup: Types.ObjectId): Promise<FileAssetRecord[]>;
  /** The current version of every plan on one scope. */
  listCurrentForScope(type: WorkPlanScope, id: Types.ObjectId): Promise<FileAssetRecord[]>;
  findById(id: string): Promise<FileAssetRecord | null>;
  findVersion(versionGroup: Types.ObjectId, version: number): Promise<FileAssetRecord | null>;
  highestVersion(versionGroup: Types.ObjectId): Promise<number>;
  /** Moves the marker within one group, so exactly one row can carry it. */
  setCurrent(versionGroup: Types.ObjectId, version: number): Promise<void>;
}

const WORK_PLAN = { versionGroup: { $exists: true } } as const;

export const workPlanRepository: WorkPlanRepository = {
  async create(version) {
    const created = await FileAssetModel.create({ ...version, isCurrent: true, uploadedAt: new Date() });
    return created.toObject() as FileAssetRecord;
  },

  async listVersions(versionGroup) {
    return FileAssetModel.find({ versionGroup }).sort({ version: -1 }).lean<FileAssetRecord[]>().exec();
  },

  async listCurrentForScope(type, id) {
    return FileAssetModel.find({ ...WORK_PLAN, 'scope.type': type, 'scope.id': id, isCurrent: true })
      .sort({ uploadedAt: -1 })
      .lean<FileAssetRecord[]>()
      .exec();
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    return FileAssetModel.findOne({ _id: new Types.ObjectId(id), ...WORK_PLAN })
      .lean<FileAssetRecord>()
      .exec();
  },

  async findVersion(versionGroup, version) {
    return FileAssetModel.findOne({ versionGroup, version }).lean<FileAssetRecord>().exec();
  },

  async highestVersion(versionGroup) {
    const newest = await FileAssetModel.findOne({ versionGroup })
      .sort({ version: -1 })
      .select('version')
      .lean<{ version?: number }>()
      .exec();
    return newest?.version ?? 0;
  },

  async setCurrent(versionGroup, version) {
    await FileAssetModel.updateMany({ versionGroup }, { $set: { isCurrent: false } }).exec();
    await FileAssetModel.updateOne({ versionGroup, version }, { $set: { isCurrent: true } }).exec();
  },
};
