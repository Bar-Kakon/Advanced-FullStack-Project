import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { AuditEntryModel, type AuditAction, type AuditEntryRecord } from './auditEntry.model.js';

export interface NewAuditEntry {
  readonly project: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly proposal?: Types.ObjectId;
  readonly actor: Types.ObjectId;
  readonly actorName: string;
  readonly action: AuditAction;
  readonly parties: readonly Types.ObjectId[];
  readonly details: Record<string, unknown>;
  readonly partyDetails: Record<string, unknown>;
  readonly at?: Date;
}

export interface AuditRepository {
  append(entries: readonly NewAuditEntry[], session?: DbSession): Promise<void>;
  listForProject(project: Types.ObjectId, limit: number): Promise<AuditEntryRecord[]>;
  listForParty(project: Types.ObjectId, party: Types.ObjectId, limit: number): Promise<AuditEntryRecord[]>;
  countForProposal(proposal: Types.ObjectId, action: AuditAction): Promise<number>;
  neutralizeActor(actor: Types.ObjectId, neutralName: string): Promise<number>;
}

export const auditRepository: AuditRepository = {
  async append(entries, session) {
    if (entries.length === 0) return;

    const rows = entries.map((entry) => ({ ...entry, at: entry.at ?? new Date() }));
    await AuditEntryModel.insertMany(rows, session ? { session } : {});
  },

  async listForProject(project, limit) {
    return AuditEntryModel.find({ project })
      .sort({ at: -1, _id: -1 })
      .limit(limit)
      .lean<AuditEntryRecord[]>()
      .exec();
  },

  async listForParty(project, party, limit) {
    return AuditEntryModel.find({ project, parties: party })
      .sort({ at: -1, _id: -1 })
      .limit(limit)
      .lean<AuditEntryRecord[]>()
      .exec();
  },

  async countForProposal(proposal, action) {
    return AuditEntryModel.countDocuments({ proposal, action }).exec();
  },

  async neutralizeActor(actor, neutralName) {
    const result = await AuditEntryModel.updateMany(
      { actor },
      { $set: { actorName: neutralName } },
    ).exec();
    return result.modifiedCount;
  },
};
