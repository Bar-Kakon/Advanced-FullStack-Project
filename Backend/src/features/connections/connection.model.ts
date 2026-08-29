import { Schema, model, type Types } from 'mongoose';

/**
 * The life of one connection edge. `blocked` is deliberately absent: blocking is its own domain
 * (D19, closed 2026-08-29), because a block may exist where no connection ever did.
 *
 * There is no `removed` and no `withdrawn` — how an edge is torn down is D17, still open, so this
 * model does not invent one.
 */
export const CONNECTION_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

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