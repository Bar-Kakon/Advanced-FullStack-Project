import { Types } from 'mongoose';

import {
  ConversationModel,
  pairKeyOf,
  type ConversationRecord,
  type RequestState,
} from './conversation.model.js';
import type { ProjectRole } from '../projectaccess/projectMembership.model.js';
import { MessageModel, type MessageRecord } from './message.model.js';

export interface CursorPage {
  readonly limit: number;
  readonly cursor?: string;
}

/** `${date.toISOString()}|${_id}` — a compound cursor, because a timestamp alone is not unique. */
const parseCursor = (cursor?: string): { at: Date; id: Types.ObjectId } | null => {
  if (cursor === undefined) return null;

  const separator = cursor.lastIndexOf('|');
  if (separator === -1) return null;

  const at = new Date(cursor.slice(0, separator));
  const rawId = cursor.slice(separator + 1);
  if (Number.isNaN(at.getTime()) || !Types.ObjectId.isValid(rawId)) return null;

  return { at, id: new Types.ObjectId(rawId) };
};

export const encodeCursor = (at: Date, id: Types.ObjectId): string =>
  `${at.toISOString()}|${id.toString()}`;

/** One accepted, task-creating agreement: the commitment's two parties and the task it became. */
export interface AgreementTaskOrigin {
  readonly task: Types.ObjectId;
  readonly proposer: Types.ObjectId;
  readonly accepter: Types.ObjectId;
  /** The immutable company stamp; `null` only on a legacy row the backfill reported and skipped. */
  readonly company: Types.ObjectId | null;
}

export interface MessagingRepository {
  findById(id: string): Promise<ConversationRecord | null>;
  findDirectByPair(a: Types.ObjectId, b: Types.ObjectId): Promise<ConversationRecord | null>;
  findProjectRoom(project: Types.ObjectId): Promise<ConversationRecord | null>;
  createDirect(
    from: Types.ObjectId,
    to: Types.ObjectId,
    state: RequestState,
  ): Promise<ConversationRecord>;
  createProjectRoom(project: Types.ObjectId): Promise<ConversationRecord>;
  listForUser(
    user: Types.ObjectId,
    folder: 'inbox' | 'requests' | 'sent',
    page: CursorPage,
  ): Promise<ConversationRecord[]>;
  /** Re-opens a declined request as a fresh pending one from `requestedBy`. */
  reopenRequest(id: Types.ObjectId, requestedBy: Types.ObjectId): Promise<ConversationRecord | null>;
  /** An approved connection retires the gate: pending or declined becomes accepted, in place. */
  upgradeRequestToAccepted(id: Types.ObjectId): Promise<ConversationRecord | null>;
  /** Hides one message for one viewer. A kept message is never matched. */
  hideMessageFor(messageId: Types.ObjectId, user: Types.ObjectId): Promise<boolean>;
  listProjectRooms(projects: readonly Types.ObjectId[]): Promise<ConversationRecord[]>;
  setRequestState(id: Types.ObjectId, state: RequestState): Promise<boolean>;
  hideFor(id: Types.ObjectId, user: Types.ObjectId): Promise<void>;
  markRead(id: Types.ObjectId, user: Types.ObjectId): Promise<void>;
  /** Clears every hide and stamps activity, which is what brings a hidden thread back whole. */
  touchAndReveal(id: Types.ObjectId, at: Date): Promise<void>;

  appendMessage(message: {
    conversation: Types.ObjectId;
    sender: Types.ObjectId;
    kind: 'text' | 'agreement';
    body?: string;
    agreement?: MessageRecord['agreement'];
    attachments?: readonly Types.ObjectId[];
  }): Promise<MessageRecord>;
  /** Author deletion, conditional in the query: a kept or already-deleted row is never matched. */
  setAuthorDeleted(messageId: Types.ObjectId, sender: Types.ObjectId): Promise<MessageRecord | null>;
  /** Moderation removal, refused by the filter itself on a kept or already-removed row. */
  setRemoved(
    messageId: Types.ObjectId,
    moderator: Types.ObjectId,
    moderatorRole?: ProjectRole,
  ): Promise<MessageRecord | null>;
  setKept(messageId: Types.ObjectId, moderator: Types.ObjectId): Promise<MessageRecord | null>;
  removeAllFromSender(
    conversation: Types.ObjectId,
    sender: Types.ObjectId,
    moderator: Types.ObjectId,
    moderatorRole?: ProjectRole,
  ): Promise<number>;
  /** Whether an accepted, task-creating agreement ever bound these two people — in either
   *  direction, and regardless of what later happened to the work (D15: history persists). */
  hasAcceptedAgreementBetween(a: Types.ObjectId, b: Types.ObjectId): Promise<boolean>;
  listAgreementOriginsByTask(tasks: readonly Types.ObjectId[]): Promise<AgreementTaskOrigin[]>;
  listAgreementOriginsByProposer(proposer: Types.ObjectId): Promise<AgreementTaskOrigin[]>;
  /** Everything ever commissioned on this company's behalf, by the stamp alone. */
  listAgreementOriginsByCompany(company: Types.ObjectId): Promise<AgreementTaskOrigin[]>;
  /** Whether a proposed agreement from somebody else still waits in this conversation. */
  hasProposedAgreementAwaiting(conversation: Types.ObjectId, viewer: Types.ObjectId): Promise<boolean>;
  /** The migration safeguard's question: accepted, task-creating agreements with no stamp. */
  countUnstampedAcceptedAgreements(): Promise<number>;
  findMessageWithAttachment(
    conversation: Types.ObjectId,
    attachment: Types.ObjectId,
  ): Promise<MessageRecord | null>;
  history(
    conversation: Types.ObjectId,
    page: CursorPage,
    viewer?: Types.ObjectId,
  ): Promise<MessageRecord[]>;
  findMessage(id: string): Promise<MessageRecord | null>;
  answerAgreement(
    messageId: Types.ObjectId,
    responder: Types.ObjectId,
    state: 'accepted' | 'declined',
    task?: Types.ObjectId,
  ): Promise<MessageRecord | null>;
  unreadCountFor(user: Types.ObjectId, conversationIds: readonly Types.ObjectId[]): Promise<number>;
}

const toOrigins = (
  rows: readonly Pick<MessageRecord, 'sender' | 'agreement'>[],
): AgreementTaskOrigin[] =>
  rows.flatMap((row) =>
    row.agreement?.task === undefined || row.agreement.respondedBy === undefined
      ? []
      : [
          {
            task: row.agreement.task,
            proposer: row.sender,
            accepter: row.agreement.respondedBy,
            company: row.agreement.commissioningCompany ?? null,
          },
        ],
  );

export const messagingRepository: MessagingRepository = {
  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return ConversationModel.findById(id).lean<ConversationRecord>().exec();
  },

  async findDirectByPair(a, b) {
    return ConversationModel.findOne({ pairKey: pairKeyOf(a, b) })
      .lean<ConversationRecord>()
      .exec();
  },

  async findProjectRoom(project) {
    return ConversationModel.findOne({ project }).lean<ConversationRecord>().exec();
  },

  async createDirect(from, to, state) {
    const created = await ConversationModel.findOneAndUpdate(
      { pairKey: pairKeyOf(from, to) },
      {
        $setOnInsert: {
          kind: 'direct',
          participants: [from, to],
          pairKey: pairKeyOf(from, to),
          request: { state, requestedBy: from },
          participantStates: [{ user: from }, { user: to }],
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
      .lean<ConversationRecord>()
      .exec();

    if (created === null) throw new Error('Conversation upsert returned nothing.');
    return created;
  },

  async createProjectRoom(project) {
    const created = await ConversationModel.findOneAndUpdate(
      { project },
      { $setOnInsert: { kind: 'project_room', project, participants: [], participantStates: [] } },
      { upsert: true, returnDocument: 'after' },
    )
      .lean<ConversationRecord>()
      .exec();

    if (created === null) throw new Error('Project room upsert returned nothing.');
    return created;
  },

  async listForUser(user, folder, { limit, cursor }) {
    const after = parseCursor(cursor);

    // The owner's final split: Requests holds ONLY what waits on this person, Sent holds their
    // own pending asks, the Inbox holds only accepted conversations, and a declined thread is
    // listed nowhere until it is re-asked.
    const requestFilter =
      folder === 'requests'
        ? { 'request.state': 'pending', 'request.requestedBy': { $ne: user } }
        : folder === 'sent'
          ? { 'request.state': 'pending', 'request.requestedBy': user }
          : {
              $or: [{ request: { $exists: false } }, { 'request.state': 'accepted' }],
            };

    const filter: Record<string, unknown> = {
      participants: user,
      // Hidden is per-user and never destructive: it only removes the row from this listing.
      participantStates: { $not: { $elemMatch: { user, hiddenAt: { $exists: true } } } },
      ...requestFilter,
      ...(after === null
        ? {}
        : {
            $and: [
              {
                $or: [
                  { lastMessageAt: { $lt: after.at } },
                  { lastMessageAt: after.at, _id: { $lt: after.id } },
                ],
              },
            ],
          }),
    };

    return ConversationModel.find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit)
      .lean<ConversationRecord[]>()
      .exec();
  },

  async listProjectRooms(projects) {
    if (projects.length === 0) return [];
    return ConversationModel.find({ project: { $in: projects } })
      .sort({ lastMessageAt: -1, _id: -1 })
      .lean<ConversationRecord[]>()
      .exec();
  },

  async upgradeRequestToAccepted(id) {
    return ConversationModel.findOneAndUpdate(
      { _id: id, 'request.state': { $in: ['pending', 'declined'] } },
      { $set: { 'request.state': 'accepted' } },
      { returnDocument: 'after' },
    )
      .lean<ConversationRecord>()
      .exec();
  },

  async reopenRequest(id, requestedBy) {
    return ConversationModel.findOneAndUpdate(
      { _id: id, 'request.state': 'declined' },
      { $set: { 'request.state': 'pending', 'request.requestedBy': requestedBy } },
      { returnDocument: 'after' },
    )
      .lean<ConversationRecord>()
      .exec();
  },

  async hideMessageFor(messageId, user) {
    const result = await MessageModel.updateOne(
      { _id: messageId, keptAt: { $exists: false } },
      { $addToSet: { hiddenFor: user } },
    ).exec();
    return result.matchedCount === 1;
  },

  async setRequestState(id, state) {
    const result = await ConversationModel.updateOne(
      { _id: id, 'request.state': 'pending' },
      { $set: { 'request.state': state } },
    ).exec();

    return result.modifiedCount === 1;
  },

  async hideFor(id, user) {
    await ConversationModel.updateOne(
      { _id: id, 'participantStates.user': user },
      { $set: { 'participantStates.$.hiddenAt': new Date() } },
    ).exec();
  },

  async markRead(id, user) {
    await ConversationModel.updateOne(
      { _id: id, 'participantStates.user': user },
      { $set: { 'participantStates.$.lastReadAt': new Date() } },
    ).exec();
  },

  /**
   * One update does both halves of the closed rule: the thread rises to the top of both inboxes,
   * and EVERY hide is cleared — so a conversation one side deleted comes back with all of its
   * history rather than a blank replacement being created beside it.
   */
  async touchAndReveal(id, at) {
    await ConversationModel.updateOne(
      { _id: id },
      { $set: { lastMessageAt: at }, $unset: { 'participantStates.$[].hiddenAt': '' } },
    ).exec();
  },

  async appendMessage(message) {
    const created = await MessageModel.create(message as never);
    if (created === undefined) throw new Error('Message insert returned no document.');

    return created.toObject() as unknown as MessageRecord;
  },

  async setAuthorDeleted(messageId, sender) {
    return MessageModel.findOneAndUpdate(
      { _id: messageId, sender, keptAt: { $exists: false }, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date(), deletedBy: sender } },
      { returnDocument: 'after' },
    )
      .lean<MessageRecord>()
      .exec();
  },

  async setRemoved(messageId, moderator, moderatorRole) {
    return MessageModel.findOneAndUpdate(
      { _id: messageId, keptAt: { $exists: false }, removedAt: { $exists: false } },
      {
        $set: {
          removedAt: new Date(),
          removedBy: moderator,
          ...(moderatorRole === undefined ? {} : { removedByRole: moderatorRole }),
        },
      },
      { returnDocument: 'after' },
    )
      .lean<MessageRecord>()
      .exec();
  },

  async setKept(messageId, moderator) {
    return MessageModel.findOneAndUpdate(
      { _id: messageId, keptAt: { $exists: false } },
      { $set: { keptAt: new Date(), keptBy: moderator } },
      { returnDocument: 'after' },
    )
      .lean<MessageRecord>()
      .exec();
  },

  async removeAllFromSender(conversation, sender, moderator, moderatorRole) {
    const result = await MessageModel.updateMany(
      { conversation, sender, keptAt: { $exists: false }, removedAt: { $exists: false } },
      {
        $set: {
          removedAt: new Date(),
          removedBy: moderator,
          ...(moderatorRole === undefined ? {} : { removedByRole: moderatorRole }),
        },
      },
    ).exec();
    return result.modifiedCount;
  },

  async hasAcceptedAgreementBetween(a, b) {
    const found = await MessageModel.exists({
      kind: 'agreement',
      'agreement.state': 'accepted',
      'agreement.task': { $exists: true },
      $or: [
        { sender: a, 'agreement.respondedBy': b },
        { sender: b, 'agreement.respondedBy': a },
      ],
    }).exec();
    return found !== null;
  },

  async listAgreementOriginsByTask(taskIds) {
    if (taskIds.length === 0) return [];

    const rows = await MessageModel.find({
      kind: 'agreement',
      'agreement.state': 'accepted',
      'agreement.task': { $in: taskIds },
    })
      .select('sender agreement.task agreement.respondedBy agreement.commissioningCompany')
      .lean<Pick<MessageRecord, 'sender' | 'agreement'>[]>()
      .exec();

    return toOrigins(rows);
  },

  async listAgreementOriginsByProposer(proposer) {
    const rows = await MessageModel.find({
      kind: 'agreement',
      sender: proposer,
      'agreement.state': 'accepted',
      'agreement.task': { $exists: true },
    })
      .select('sender agreement.task agreement.respondedBy agreement.commissioningCompany')
      .lean<Pick<MessageRecord, 'sender' | 'agreement'>[]>()
      .exec();

    return toOrigins(rows);
  },

  async listAgreementOriginsByCompany(company) {
    const rows = await MessageModel.find({
      kind: 'agreement',
      'agreement.commissioningCompany': company,
      'agreement.state': 'accepted',
      'agreement.task': { $exists: true },
    })
      .select('sender agreement.task agreement.respondedBy agreement.commissioningCompany')
      .lean<Pick<MessageRecord, 'sender' | 'agreement'>[]>()
      .exec();

    return toOrigins(rows);
  },

  async hasProposedAgreementAwaiting(conversation, viewer) {
    const found = await MessageModel.exists({
      conversation,
      kind: 'agreement',
      'agreement.state': 'proposed',
      sender: { $ne: viewer },
    }).exec();
    return found !== null;
  },

  async countUnstampedAcceptedAgreements() {
    return MessageModel.countDocuments({
      kind: 'agreement',
      'agreement.state': 'accepted',
      'agreement.task': { $exists: true },
      'agreement.commissioningCompany': { $exists: false },
    }).exec();
  },

  async findMessageWithAttachment(conversation, attachment) {
    return MessageModel.findOne({ conversation, attachments: attachment })
      .lean<MessageRecord>()
      .exec();
  },

  async history(conversation, { limit, cursor }, viewer) {
    const after = parseCursor(cursor);

    const filter: Record<string, unknown> = {
      conversation,
      ...(viewer === undefined ? {} : { hiddenFor: { $ne: viewer } }),
      ...(after === null
        ? {}
        : {
            $or: [
              { createdAt: { $lt: after.at } },
              { createdAt: after.at, _id: { $lt: after.id } },
            ],
          }),
    };

    return MessageModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<MessageRecord[]>()
      .exec();
  },

  async findMessage(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return MessageModel.findById(id).lean<MessageRecord>().exec();
  },

  /**
   * Filtered on the agreement still being `proposed`, so two clicks cannot both succeed — which is
   * what makes "exactly one Task per accepted agreement" true under a race rather than by hope.
   */
  async answerAgreement(messageId, responder, state, task) {
    return MessageModel.findOneAndUpdate(
      { _id: messageId, 'agreement.state': 'proposed' },
      {
        $set: {
          'agreement.state': state,
          'agreement.respondedBy': responder,
          'agreement.respondedAt': new Date(),
          ...(task === undefined ? {} : { 'agreement.task': task }),
        },
      },
      { returnDocument: 'after' },
    )
      .lean<MessageRecord>()
      .exec();
  },

  async unreadCountFor(user, conversationIds) {
    if (conversationIds.length === 0) return 0;

    return MessageModel.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: user },
    }).exec();
  },
};
