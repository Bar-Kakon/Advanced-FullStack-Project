import { Schema, model, type Types } from 'mongoose';

/**
 * A direct conversation is between exactly two people. A project room belongs to one project and
 * its members are read from the project, never copied here — a membership that ends must not leave
 * a stale participant behind.
 */
export const CONVERSATION_KINDS = ['direct', 'project_room'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/**
 * First contact goes through a request. Connections do NOT gate it: two people who have never met
 * may write to each other, and the recipient decides whether the thread opens.
 */
export const REQUEST_STATES = ['pending', 'accepted', 'declined'] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

/**
 * One person's own view of a conversation.
 *
 * `hiddenAt` is what "delete this chat" writes. It is per-user and it removes nothing: the
 * conversation and every message stay exactly as they are, the other participant's view is
 * untouched, and the next message clears it so the whole history comes back.
 */
export interface ParticipantStateRecord {
  readonly user: Types.ObjectId;
  readonly hiddenAt?: Date;
  readonly lastReadAt?: Date;
}

export interface ConversationRecord {
  readonly _id: Types.ObjectId;
  readonly kind: ConversationKind;
  /** Direct only, and always exactly two. A project room reads its people from the project. */
  readonly participants: readonly Types.ObjectId[];
  /**
   * The two participant ids, sorted and joined. Its unique index is the whole guarantee that one
   * pair can never end up with a second conversation, however either side hid the first.
   */
  readonly pairKey?: string;
  readonly project?: Types.ObjectId;
  readonly request?: { readonly state: RequestState; readonly requestedBy: Types.ObjectId };
  readonly participantStates: readonly ParticipantStateRecord[];
  readonly lastMessageAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Sorted, so the same pair produces the same key whichever side opened the conversation. */
export const pairKeyOf = (a: Types.ObjectId | string, b: Types.ObjectId | string): string =>
  [a.toString(), b.toString()].sort().join(':');

const participantStateSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    hiddenAt: { type: Date },
    lastReadAt: { type: Date },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    kind: { type: String, enum: CONVERSATION_KINDS, required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    pairKey: { type: String, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    request: {
      state: { type: String, enum: REQUEST_STATES },
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    participantStates: { type: [participantStateSchema], required: true, default: [] },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

// One direct conversation per pair, for ever. This is what makes a hidden chat come back rather
// than a blank second one being opened beside it.
conversationSchema.index(
  { pairKey: 1 },
  { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } },
);

// One room per project.
conversationSchema.index(
  { project: 1 },
  { unique: true, partialFilterExpression: { project: { $exists: true } } },
);

// The Inbox: this person's conversations, most recently active first.
conversationSchema.index({ participants: 1, lastMessageAt: -1, _id: -1 });

export const ConversationModel = model('Conversation', conversationSchema);
