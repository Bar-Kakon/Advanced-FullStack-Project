import { Types } from 'mongoose';

import { PermissionTemplateModel, type PermissionTemplateRecord } from './permissionTemplate.model.js';
import type { ProjectPermission } from './projectPermission.js';

export interface PermissionTemplateRepository {
  listByCompany(company: Types.ObjectId): Promise<PermissionTemplateRecord[]>;
  findOwnedById(id: string, company: Types.ObjectId): Promise<PermissionTemplateRecord | null>;
  create(input: {
    company: Types.ObjectId;
    name: string;
    permissions: readonly ProjectPermission[];
    fullAuthority: boolean;
    createdBy: Types.ObjectId;
  }): Promise<PermissionTemplateRecord | null>;
  remove(id: string, company: Types.ObjectId): Promise<boolean>;
}

const DUPLICATE_KEY_CODE = 11000;

export const permissionTemplateRepository: PermissionTemplateRepository = {
  async listByCompany(company) {
    return PermissionTemplateModel.find({ company })
      .sort({ name: 1 })
      .lean<PermissionTemplateRecord[]>()
      .exec();
  },

  async findOwnedById(id, company) {
    if (!Types.ObjectId.isValid(id)) return null;
    return PermissionTemplateModel.findOne({ _id: new Types.ObjectId(id), company })
      .lean<PermissionTemplateRecord>()
      .exec();
  },

  /** `null` when the company already has a template by that name. */
  async create(input) {
    try {
      const created = new PermissionTemplateModel({ ...input, permissions: [...input.permissions] });
      await created.save();
      return created.toObject() as PermissionTemplateRecord;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async remove(id, company) {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await PermissionTemplateModel.deleteOne({
      _id: new Types.ObjectId(id),
      company,
    }).exec();
    return result.deletedCount === 1;
  },
};
