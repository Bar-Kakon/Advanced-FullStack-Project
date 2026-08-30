import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  RescheduleProposalModel,
  type ItemResolution,
  type ItemResponse,
  type JustifiedDeclineReason,
  type ProposalRecord,
  type ProposalStatus,
} from './proposal.model.js';

export interface NewProposal {
  readonly project: Types.ObjectId;
  readonly initiatingTask: Types.ObjectId;
  readonly requestedBy: Types.ObjectId;
  readonly reason?: string;
  readonly changes: ProposalRecord['changes'];
  readonly responseHours: number;
  readonly parentProposal?: Types.ObjectId;
  readonly items: readonly Omit<ProposalRecord['items'][number], '_id'>[];
}

export interface RecordedResponse {
  readonly response: Exclude<ItemResponse, 'pending'>;
  readonly declineReason?: JustifiedDeclineReason;
  readonly counterStart?: Date;
  readonly counterDue?: Date;
}

export interface ItemDecision {
  readonly itemId: string;
  readonly resolution: ItemResolution;
}

export interface ProposalRepository {
  create(proposal: NewProposal): Promise<ProposalRecord>;
  findById(id: string): Promise<ProposalRecord | null>;
  listOpenForRespondent(respondent: Types.ObjectId): Promise<ProposalRecord[]>;
  listForProject(project: Types.ObjectId, limit: number): Promise<ProposalRecord[]>;
  listResolvedForRespondent(respondent: Types.ObjectId): Promise<ProposalRecord[]>;
  launch(id: Types.ObjectId, by: Types.ObjectId, expiresAt: Date): Promise<ProposalRecord | null>;
  expire(id: Types.ObjectId, at: Date): Promise<ProposalRecord | null>;
  cancel(id: Types.ObjectId, by: Types.ObjectId, at: Date): Promise<ProposalRecord | null>;
  recordResponse(
    id: Types.ObjectId,
    itemId: Types.ObjectId,
    respondent: Types.ObjectId,
    recorded: RecordedResponse,
    at: Date,
  ): Promise<ProposalRecord | null>;
  setExcluded(
    id: Types.ObjectId,
    itemId: Types.ObjectId,
    excluded: boolean,
    by: Types.ObjectId,
  ): Promise<ProposalRecord | null>;
  resolve(
    id: Types.ObjectId,
    by: Types.ObjectId,
    at: Date,
    note: string | undefined,
    decisions: readonly ItemDecision[],
    session?: DbSession,
  ): Promise<ProposalRecord | null>;
}

const RESOLVABLE: readonly ProposalStatus[] = ['open', 'expired'];
const CANCELLABLE: readonly ProposalStatus[] = ['requested', 'open', 'expired'];
const ADJUSTABLE: readonly ProposalStatus[] = ['requested', 'open', 'expired'];

export const proposalRepository: ProposalRepository = {
  async create(proposal) {
    const created = new RescheduleProposalModel({
      ...proposal,
      items: [...proposal.items],
      status: 'requested',
    });
    await created.save();
    return created.toObject() as unknown as ProposalRecord;
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return RescheduleProposalModel.findById(new Types.ObjectId(id)).lean<ProposalRecord>().exec();
  },

  async listOpenForRespondent(respondent) {
    return RescheduleProposalModel.find({ 'items.respondent': respondent, status: 'open' })
      .lean<ProposalRecord[]>()
      .exec();
  },

  async listForProject(project, limit) {
    return RescheduleProposalModel.find({ project })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<ProposalRecord[]>()
      .exec();
  },

  async listResolvedForRespondent(respondent) {
    return RescheduleProposalModel.find({ 'items.respondent': respondent, status: 'resolved' })
      .sort({ 'resolution.at': 1 })
      .lean<ProposalRecord[]>()
      .exec();
  },

  async launch(id, by, expiresAt) {
    return RescheduleProposalModel.findOneAndUpdate(
      { _id: id, status: 'requested' },
      { $set: { status: 'open', launchedBy: by, launchedAt: new Date(), expiresAt } },
      { new: true },
    )
      .lean<ProposalRecord>()
      .exec();
  },

  async expire(id, at) {
    return RescheduleProposalModel.findOneAndUpdate(
      { _id: id, status: 'open', expiresAt: { $lte: at } },
      { $set: { status: 'expired', expiredAt: at } },
      { new: true },
    )
      .lean<ProposalRecord>()
      .exec();
  },

  async cancel(id, by, at) {
    return RescheduleProposalModel.findOneAndUpdate(
      { _id: id, status: { $in: [...CANCELLABLE] } },
      { $set: { status: 'cancelled', cancelledBy: by, cancelledAt: at } },
      { new: true },
    )
      .lean<ProposalRecord>()
      .exec();
  },

  async recordResponse(id, itemId, respondent, recorded, at) {
    const set: Record<string, unknown> = {
      'items.$[row].response': recorded.response,
      'items.$[row].respondedAt': at,
    };
    const unset: Record<string, ''> = {};

    if (recorded.declineReason === undefined) unset['items.$[row].declineReason'] = '';
    else set['items.$[row].declineReason'] = recorded.declineReason;

    if (recorded.counterStart === undefined) unset['items.$[row].counterStart'] = '';
    else set['items.$[row].counterStart'] = recorded.counterStart;

    if (recorded.counterDue === undefined) unset['items.$[row].counterDue'] = '';
    else set['items.$[row].counterDue'] = recorded.counterDue;

    return RescheduleProposalModel.findOneAndUpdate(
      {
        _id: id,
        status: 'open',
        items: { $elemMatch: { _id: itemId, respondent, response: 'pending', excluded: false } },
      },
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      {
        new: true,
        arrayFilters: [
          { 'row._id': itemId, 'row.respondent': respondent, 'row.response': 'pending', 'row.excluded': false },
        ],
      },
    )
      .lean<ProposalRecord>()
      .exec();
  },

  async setExcluded(id, itemId, excluded, by) {
    return RescheduleProposalModel.findOneAndUpdate(
      { _id: id, status: { $in: [...ADJUSTABLE] }, items: { $elemMatch: { _id: itemId } } },
      { $set: { 'items.$[row].excluded': excluded, 'items.$[row].excludedBy': by } },
      { new: true, arrayFilters: [{ 'row._id': itemId }] },
    )
      .lean<ProposalRecord>()
      .exec();
  },

  async resolve(id, by, at, note, decisions, session) {
    const set: Record<string, unknown> = {
      status: 'resolved',
      resolution: { by, at, ...(note === undefined ? {} : { note }) },
    };
    const filters: Record<string, unknown>[] = [];

    decisions.forEach((decision, index) => {
      const alias = `row${index}`;
      set[`items.$[${alias}].resolution`] = decision.resolution;
      filters.push({ [`${alias}._id`]: new Types.ObjectId(decision.itemId) });
    });

    return RescheduleProposalModel.findOneAndUpdate(
      { _id: id, status: { $in: [...RESOLVABLE] } },
      { $set: set },
      {
        new: true,
        ...(filters.length > 0 ? { arrayFilters: filters } : {}),
        ...(session ? { session } : {}),
      },
    )
      .lean<ProposalRecord>()
      .exec();
  },
};
