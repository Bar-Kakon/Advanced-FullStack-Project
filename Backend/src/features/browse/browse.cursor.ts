import { Types } from 'mongoose';

/**
 * Where the previous page stopped. The default sort is `createdAt` descending with `_id` as the
 * tiebreaker, so two accounts created in the same millisecond still have one deterministic order
 * and neither is skipped nor repeated.
 */
export interface DiscoveryCursor {
  readonly kind: 'discovery';
  readonly createdAt: Date;
  readonly id: Types.ObjectId;
}

/** The rating sort orders on a computed average, so its cursor carries that number instead. */
export interface RatingCursor {
  readonly kind: 'rating';
  readonly score: number;
  readonly id: Types.ObjectId;
}

export type BrowseCursor = DiscoveryCursor | RatingCursor;

export const encodeCursor = (cursor: BrowseCursor): string => {
  const raw = cursor.kind === 'discovery'
    ? `d|${cursor.createdAt.toISOString()}|${cursor.id.toString()}`
    : `r|${String(cursor.score)}|${cursor.id.toString()}`;

  return Buffer.from(raw, 'utf8').toString('base64url');
};

/** `null` for anything unreadable, so a tampered cursor starts from the beginning, never throws. */
export const decodeCursor = (raw: string | undefined): BrowseCursor | null => {
  if (!raw) return null;

  try {
    const [kind, value, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!kind || !value || !id || !Types.ObjectId.isValid(id)) return null;

    if (kind === 'r') {
      const score = Number(value);
      return Number.isFinite(score) ? { kind: 'rating', score, id: new Types.ObjectId(id) } : null;
    }
    if (kind !== 'd') return null;

    const createdAt = new Date(value);
    if (Number.isNaN(createdAt.getTime())) return null;

    return { kind: 'discovery', createdAt, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
};