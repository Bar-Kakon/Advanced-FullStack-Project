import { Types } from 'mongoose';

import {
  NotificationModel,
  type NotificationClass,
  type NotificationPayload,
  type NotificationRecord,
  type NotificationType,
} from './notification.model.js';

const DUPLICATE_KEY_CODE = 11000;

export interface NewNotification {
  readonly user: Types.ObjectId;
  readonly type: NotificationType;
  readonly class: NotificationClass;
  readonly project?: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly proposal?: Types.ObjectId;
  readonly scheduleException?: Types.ObjectId;
  readonly payload: NotificationPayload;
  readonly mutedAtCreation: boolean;
  readonly dedupeKey: string;
}

export interface NotificationPage {
  readonly rows: readonly NotificationRecord[];
  readonly nextCursor: string | null;
}

export interface NotificationRepository {
  /** `null` when the same event already reached this person — a no-op, never a second row. */
  create(input: NewNotification): Promise<NotificationRecord | null>;
  findById(id: string): Promise<NotificationRecord | null>;
  page(
    user: Types.ObjectId,
    limit: number,
    cursor: string | null,
    unreadOnly: boolean,
  ): Promise<NotificationPage>;
  unreadCount(user: Types.ObjectId): Promise<number>;
  markSeen(user: Types.ObjectId, ids: readonly Types.ObjectId[]): Promise<readonly Types.ObjectId[]>;
  markAllSeen(user: Types.ObjectId): Promise<readonly Types.ObjectId[]>;
  /** Unseen non-blocking rows in a window, for the digest. */
  digestCandidates(user: Types.ObjectId, since: Date): Promise<NotificationRecord[]>;
  usersWithDigestCandidates(since: Date): Promise<Types.ObjectId[]>;
}

/**
 * Cursor is `createdAt.getTime()_id`, so a page boundary cannot repeat or skip a row when two
 * notifications share a millisecond.
 */
const encodeCursor = (row: NotificationRecord): string =>
  `${row.createdAt.getTime()}_${row._id.toString()}`;

const decodeCursor = (cursor: string): { at: Date; id: Types.ObjectId } | null => {
  const [at, id] = cursor.split('_');
  if (at === undefined || id === undefined || !Types.ObjectId.isValid(id)) return null;
  const millis = Number(at);
  if (!Number.isFinite(millis)) return null;
  return { at: new Date(millis), id: new Types.ObjectId(id) };
};

export const notificationRepository: NotificationRepository = {
  async create(input) {
    try {
      const created = new NotificationModel(input);
      await created.save();
      return created.toObject() as NotificationRecord;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return NotificationModel.findById(id).lean<NotificationRecord>().exec();
  },

  async page(user, limit, cursor, unreadOnly) {
    const filter: Record<string, unknown> = { user };
    if (unreadOnly) filter['seenAt'] = { $exists: false };

    const decoded = cursor === null ? null : decodeCursor(cursor);
    if (decoded !== null) {
      filter['$or'] = [
        { createdAt: { $lt: decoded.at } },
        { createdAt: decoded.at, _id: { $lt: decoded.id } },
      ];
    }

    // One more than asked for, so "is there another page" is answered without a count query.
    const rows = await NotificationModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<NotificationRecord[]>()
      .exec();

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page,
      nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last) : null,
    };
  },

  async unreadCount(user) {
    return NotificationModel.countDocuments({ user, seenAt: { $exists: false } }).exec();
  },

  /**
   * Returns the ids that actually moved from unseen to seen. The email queue is cancelled from
   * that list, so marking an already-seen row again cancels nothing a second time.
   */
  async markSeen(user, ids) {
    if (ids.length === 0) return [];

    const pending = await NotificationModel.find({
      user,
      _id: { $in: [...ids] },
      seenAt: { $exists: false },
    })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    if (pending.length === 0) return [];

    const moved = pending.map((row) => row._id);
    await NotificationModel.updateMany(
      { user, _id: { $in: moved } },
      { $set: { seenAt: new Date() } },
    ).exec();
    return moved;
  },

  async markAllSeen(user) {
    const pending = await NotificationModel.find({ user, seenAt: { $exists: false } })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    if (pending.length === 0) return [];

    const moved = pending.map((row) => row._id);
    await NotificationModel.updateMany({ user, _id: { $in: moved } }, { $set: { seenAt: new Date() } }).exec();
    return moved;
  },

  /**
   * Seen rows are excluded, which is the closed rule that the digest carries only what is still
   * relevant: something already handled in-app is not resurfaced by email that evening.
   */
  async digestCandidates(user, since) {
    return NotificationModel.find({
      user,
      class: 'nonblocking',
      seenAt: { $exists: false },
      mutedAtCreation: false,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: 1 })
      .lean<NotificationRecord[]>()
      .exec();
  },

  async usersWithDigestCandidates(since) {
    return NotificationModel.distinct('user', {
      class: 'nonblocking',
      seenAt: { $exists: false },
      mutedAtCreation: false,
      createdAt: { $gte: since },
    }).exec() as Promise<Types.ObjectId[]>;
  },
};
