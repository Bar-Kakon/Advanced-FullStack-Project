import { Types } from 'mongoose';

import {
  ConversationModel,
  pairKeyOf,
  type ConversationRecord,
  type RequestState,
} from './conversation.model.js';
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
    folder: 'inbox' | 'requests',
    page: CursorPage,
  ): Promise<ConversationRecord[]>;
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
  }): Promise<MessageRecord>;
  history(conversation: Types.ObjectId, page: CursorPage): Promise<MessageRecord[]>;
  findMessage(id: string): Promise<MessageRecord | null>;
  answerAgreement(
    messageId: Types.ObjectId,
    responder: Types.ObjectId,
    state: 'accepted' | 'declined',
    task?: Types.ObjectId,
  ): Promise<MessageRecord | null>;
  unreadCountFor(user: Types.ObjectId, conversationIds: readonly Types.ObjectId[]): Promise<number>;
}

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
      { upsert: true, new: true },
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
      { upsert: true, new: true },
    )
      .lean<ConversationRecord>()
      .exec();

    if (created === null) throw new Error('Project room upsert returned nothing.');
    return created;
  },

  async listForUser(user, folder, { limit, cursor }) {
    const after = parseCursor(cursor);

    // A pending request the person RECEIVED belongs in Requests; one they sent stays in their
    // Inbox, because it is their own outgoing thread.
    const requestFilter =
      folder === 'requests'
        ? { 'request.state': 'pending', 'request.requestedBy': { $ne: user } }
        : {
            $or: [
              { request: { $exists: false } },
              { 'request.state': { $ne: 'pending' } },
              { 'request.requestedBy': user },
            ],
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

  async history(conversation, { limit, cursor }) {
    const after = parseCursor(cursor);

    const filter: Record<string, unknown> = {
      conversation,
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
      { new: true },
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
