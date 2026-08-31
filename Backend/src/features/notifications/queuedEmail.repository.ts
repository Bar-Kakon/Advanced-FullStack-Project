import { Types } from 'mongoose';

import {
  QueuedEmailModel,
  type CancelReason,
  type QueuedEmailRecord,
} from './queuedEmail.model.js';

const DUPLICATE_KEY_CODE = 11000;

export interface QueuedEmailRepository {
  queue(
    notification: Types.ObjectId,
    user: Types.ObjectId,
    sendAfter: Date,
  ): Promise<QueuedEmailRecord | null>;
  /** Cancels the queued emails of notifications that have just been seen. */
  cancelFor(notifications: readonly Types.ObjectId[], reason: CancelReason): Promise<number>;
  due(now: Date, limit: number): Promise<QueuedEmailRecord[]>;
  markSent(id: Types.ObjectId): Promise<void>;
  markFailed(id: Types.ObjectId): Promise<void>;
  findForNotification(notification: Types.ObjectId): Promise<QueuedEmailRecord | null>;
}

export const queuedEmailRepository: QueuedEmailRepository = {
  async queue(notification, user, sendAfter) {
    try {
      const created = new QueuedEmailModel({ notification, user, sendAfter });
      await created.save();
      return created.toObject() as QueuedEmailRecord;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async cancelFor(notifications, reason) {
    if (notifications.length === 0) return 0;

    const result = await QueuedEmailModel.updateMany(
      { notification: { $in: [...notifications] }, status: 'queued' },
      { $set: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date() } },
    ).exec();
    return result.modifiedCount;
  },

  async due(now, limit) {
    return QueuedEmailModel.find({ status: 'queued', sendAfter: { $lte: now } })
      .sort({ sendAfter: 1 })
      .limit(limit)
      .lean<QueuedEmailRecord[]>()
      .exec();
  },

  async markSent(id) {
    await QueuedEmailModel.updateOne(
      { _id: id },
      { $set: { status: 'sent', sentAt: new Date() }, $inc: { attempts: 1 } },
    ).exec();
  },

  /** A send that threw is recorded rather than retried forever against a broken address. */
  async markFailed(id) {
    await QueuedEmailModel.updateOne(
      { _id: id },
      { $set: { status: 'failed' }, $inc: { attempts: 1 } },
    ).exec();
  },

  async findForNotification(notification) {
    return QueuedEmailModel.findOne({ notification }).lean<QueuedEmailRecord>().exec();
  },
};
