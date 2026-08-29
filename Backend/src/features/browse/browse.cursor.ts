import { Types } from 'mongoose';

/**
 * Where the previous page stopped. The sort is `createdAt` descending with `_id` as the
 * tiebreaker, so two accounts created in the same millisecond still have one deterministic order
 * and neither is skipped nor repeated.
 */
export interface BrowseCursor {
  readonly createdAt: Date;
  readonly id: Types.ObjectId;
}

export const encodeCursor = ({ createdAt, id }: BrowseCursor): string =>
  Buffer.from(`${createdAt.toISOString()}|${id.toString()}`, 'utf8').toString('base64url');

/** `null` for anything unreadable, so a tampered cursor starts from the beginning, never throws. */
export const decodeCursor = (raw: string | undefined): BrowseCursor | null => {
  if (!raw) return null;

  try {
    const [timestamp, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id || !Types.ObjectId.isValid(id)) return null;

    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime())) return null;

    return { createdAt, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
};