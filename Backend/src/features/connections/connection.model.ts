import { Schema, model, type Types } from 'mongoose';

/**
 * The life of one connection edge, per D17 (closed 2026-08-29):
 *
 *   pending     a request is waiting for the recipient.
 *   accepted    both sides are connected.
 *   declined    the recipient refused. Its own state, never a generic teardown, and not permanent.
 *   removed     an accepted connection was ended.
 *   withdrawn   the requester cancelled their own pending request.
 *
 * `blocked` is deliberately absent: blocking is its own domain (D19), because a block may exist
 * where no connection ever did.
 */
export const CONNECTION_STATUSES = ['pending', 'accepted', 'declined', 'removed', 'withdrawn'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** The teardown states. History is kept, so an active check must exclude them explicitly. */
export const INACTIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = ['removed', 'withdrawn'];

/**
 * The states a fresh request may reactivate. `declined` is among them: refusing a request is not a
 * permanent bar, and Block is the mechanism for that.
 */
export const REACTIVATABLE_CONNECTION_STATUSES: readonly ConnectionStatus[] = [
  'removed',
  'withdrawn',
  'declined',
];

export interface ConnectionRecord {
  readonly _id: Types.ObjectId;
  readonly requester: Types.ObjectId;
  readonly recipient: Types.ObjectId;
  /** The two ids sorted, so one edge cannot exist twice in opposite directions. */
  readonly pair: string;
  readonly status: ConnectionStatus;
  readonly requestedAt: Date;
  readonly respondedAt?: Date;
}

/** Sorted, so A→B and B→A produce the same key. */
export const pairKey = (a: Types.ObjectId | string, b: Types.ObjectId | string): string =>
  [a.toString(), b.toString()].sort().join(':');

const connectionSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pair: { type: String, required: true },
    status: { type: String, enum: CONNECTION_STATUSES, required: true, default: 'pending' },
    requestedAt: { type: Date, required: true, default: Date.now },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

// One edge per pair in either direction.
connectionSchema.index({ pair: 1 }, { unique: true, name: 'connection_pair_unique' });

// Browse resolves the viewer's edges in one read; My Network reads the same direction later.
connectionSchema.index({ requester: 1, status: 1 });
connectionSchema.index({ recipient: 1, status: 1 });

export const ConnectionModel = model('Connection', connectionSchema);