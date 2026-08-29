import { Types } from 'mongoose';

import { FileAssetModel, type FileAssetRecord, type FileScope } from './fileAsset.model.js';

export interface NewFileAsset {
  readonly owner: Types.ObjectId;
  readonly scope: { readonly type: FileScope; readonly id: Types.ObjectId | null };
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storage: { readonly driver: string; readonly fileId: Types.ObjectId };
}

export interface FileAssetRepository {
  create(asset: NewFileAsset): Promise<FileAssetRecord>;
  /** Scoped by owner in the query itself, so a wrong id and a wrong owner fail the same way. */
  findOwnedById(id: string, owner: Types.ObjectId): Promise<FileAssetRecord | null>;
  deleteById(id: Types.ObjectId): Promise<void>;
  attachToScopeId(id: Types.ObjectId, scopeId: Types.ObjectId): Promise<void>;
}

export const fileAssetRepository: FileAssetRepository = {
  async create(asset) {
    const created = await FileAssetModel.create({ ...asset, uploadedAt: new Date() });
    return created.toObject() as FileAssetRecord;
  },

  async findOwnedById(id, owner) {
    if (!Types.ObjectId.isValid(id)) return null;

    return FileAssetModel.findOne({ _id: new Types.ObjectId(id), owner })
      .lean<FileAssetRecord>()
      .exec();
  },

  async deleteById(id) {
    await FileAssetModel.deleteOne({ _id: id }).exec();
  },

  async attachToScopeId(id, scopeId) {
    await FileAssetModel.updateOne({ _id: id }, { $set: { 'scope.id': scopeId } }).exec();
  },
};
