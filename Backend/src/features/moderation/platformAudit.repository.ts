import { Types } from 'mongoose';

import {
  PlatformAuditEntryModel,
  type PlatformAuditAction,
  type PlatformAuditEntryRecord,
  type PlatformAuditTargetType,
} from './platformAuditEntry.model.js';

export interface NewPlatformAuditEntry {
  readonly actor: Types.ObjectId;
  readonly action: PlatformAuditAction;
  readonly targetType: PlatformAuditTargetType;
  readonly target: Types.ObjectId;
  readonly metadata?: Record<string, unknown>;
}

export interface PlatformAuditPage {
  readonly action?: PlatformAuditAction;
  readonly targetType?: PlatformAuditTargetType;
  readonly limit: number;
  /** `${at.toISOString()}|${_id}` from the previous page's last row. */
  readonly cursor?: string;
}

export interface PlatformAuditRepository {
  append(entry: NewPlatformAuditEntry): Promise<void>;
  list(page: PlatformAuditPage): Promise<PlatformAuditEntryRecord[]>;
}

/** A tampered or malformed cursor restarts the listing rather than throwing. */
const parseCursor = (cursor?: string): { at: Date; id: Types.ObjectId } | null => {
  if (cursor === undefined) return null;

  const separator = cursor.lastIndexOf('|');
  if (separator === -1) return null;

  const at = new Date(cursor.slice(0, separator));
  const rawId = cursor.slice(separator + 1);
  if (Number.isNaN(at.getTime()) || !Types.ObjectId.isValid(rawId)) return null;

  return { at, id: new Types.ObjectId(rawId) };
};

export const encodePlatformAuditCursor = (row: PlatformAuditEntryRecord): string =>
  `${row.at.toISOString()}|${row._id.toString()}`;

/** Append-only: there is deliberately no update and no delete on this collection. */
export const platformAuditRepository: PlatformAuditRepository = {
  async append(entry) {
    await PlatformAuditEntryModel.create([{ ...entry, metadata: entry.metadata ?? {} }]);
  },

  async list({ action, targetType, limit, cursor }) {
    const after = parseCursor(cursor);

    const filter = {
      ...(action === undefined ? {} : { action }),
      ...(targetType === undefined ? {} : { targetType }),
      ...(after === null
        ? {}
        : { $or: [{ at: { $lt: after.at } }, { at: after.at, _id: { $lt: after.id } }] }),
    };

    return PlatformAuditEntryModel.find(filter)
      .sort({ at: -1, _id: -1 })
      .limit(limit)
      .lean<PlatformAuditEntryRecord[]>()
      .exec();
  },
};
