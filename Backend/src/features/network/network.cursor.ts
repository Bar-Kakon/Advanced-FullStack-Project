import { Types } from 'mongoose';

/**
 * Where the previous page stopped: the row's own date plus its `_id` as the tiebreaker, so two
 * rows written in the same millisecond still have one deterministic order.
 */
export interface NetworkCursor {
  readonly at: Date;
  readonly id: Types.ObjectId;
}

export const encodeNetworkCursor = ({ at, id }: NetworkCursor): string =>
  Buffer.from(`${at.toISOString()}|${id.toString()}`, 'utf8').toString('base64url');

/** `null` for anything unreadable, so a tampered cursor starts from the beginning, never throws. */
export const decodeNetworkCursor = (raw: string | undefined): NetworkCursor | null => {
  if (!raw) return null;

  try {
    const [timestamp, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id || !Types.ObjectId.isValid(id)) return null;

    const at = new Date(timestamp);
    if (Number.isNaN(at.getTime())) return null;

    return { at, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
};
