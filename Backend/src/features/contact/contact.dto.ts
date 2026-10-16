import type { ContactMessageRecord } from './contactMessage.model.js';

/**
 * Everything a sender is told back: the message exists and when it arrived. Nothing about the
 * inbox, whether a notification was delivered, or what happens next.
 */
export interface ContactReceiptDto {
  readonly id: string;
  readonly createdAt: string;
}

export const toContactReceipt = (message: ContactMessageRecord): ContactReceiptDto => ({
  id: message._id.toString(),
  createdAt: message.createdAt.toISOString(),
});
