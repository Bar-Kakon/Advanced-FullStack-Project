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

export interface ConversationMessage {
  readonly id: string;
  readonly senderId: string;
  readonly senderName: string;
  readonly mine: boolean;
  readonly kind: 'text' | 'agreement';
  readonly body: string | null;
  readonly removed: boolean;
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
}
