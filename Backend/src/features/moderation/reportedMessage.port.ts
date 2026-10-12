import type { Types } from 'mongoose';

export interface ReportedMessageView {
  readonly body: string | null;
  readonly sender: Types.ObjectId;
  readonly sentAt: Date;
  readonly conversationId: Types.ObjectId;
  readonly conversationKind: string | null;
  readonly projectId: Types.ObjectId | null;
  readonly removed: boolean;
  readonly deleted: boolean;
  readonly kept: boolean;
}

/** Administrative review of a message report keeps access to the reported content. */
export interface ReportedMessagePort {
  findForModeration(messageId: Types.ObjectId): Promise<ReportedMessageView | null>;
}
