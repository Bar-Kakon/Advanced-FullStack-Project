export interface ConversationSummary {
  readonly id: string;
  readonly kind: 'direct' | 'project_room';
  readonly title: string;
  readonly counterpartyId: string | null;
  readonly projectId: string | null;
  readonly requestState: string | null;
  readonly awaitingMyAnswer: boolean;
  readonly lastMessageAt: string | null;
}

export interface MessageAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface ConversationMessage {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly mine: boolean;
  readonly kind: 'text' | 'agreement';
  readonly body: string | null;
  readonly removed: boolean;
  /** The remover's project role at removal time, for the attribution placeholder. */
  readonly removedByRole: string | null;
  readonly deleted: boolean;
  readonly kept: boolean;
  readonly attachments: readonly MessageAttachment[];
  readonly agreement: {
    readonly title: string;
    readonly description: string | null;
    readonly startDate: string;
    readonly dueDate: string;
    readonly state: string;
    readonly taskId: string | null;
    readonly mine: boolean;
  } | null;
  /** The persisted send time. Every clock and date separator is derived from this. */
  readonly sentAt: string;
}

export interface InboxPage {
  readonly conversations: readonly ConversationSummary[];
  readonly nextCursor: string | null;
}

export interface HistoryPage {
  readonly messages: readonly ConversationMessage[];
  readonly nextCursor: string | null;
  /** Whether the viewer holds the unified Project-Room moderation authority here. */
  readonly canModerate: boolean;
  /** Whether the viewer may commission work — the company capability, read live. */
  readonly canProposeAgreement: boolean;
  /** The direct thread's request state, carried by the thread itself. */
  readonly requestState: 'pending' | 'accepted' | 'declined' | null;
  /** Whether this viewer is the one a pending request waits on. */
  readonly awaitingMyAnswer: boolean;
}

export type StartDirectFailure = 'SELF' | 'NO_CONTACT' | 'AWAITING' | 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN';
