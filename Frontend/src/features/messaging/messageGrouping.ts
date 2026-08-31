import type { ConversationMessage } from '../../api/messaging.types';

export interface DaySeparator {
  readonly kind: 'day';
  readonly key: string;
  /** The day itself, so the caller formats it in the viewer's own locale. */
  readonly at: Date;
}

export interface MessageRow {
  readonly kind: 'message';
  readonly key: string;
  readonly message: ConversationMessage;
}

export type ConversationRow = DaySeparator | MessageRow;

/** The viewer's own calendar day, which is what decides where a separator belongs. */
const dayKeyOf = (iso: string): string => {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
};

/**
 * Turns a conversation's messages into the rows a thread renders.
 *
 * The date is emitted ONCE, before the first message of each calendar day, and every message keeps
 * its own time. Because the rows are derived from the whole merged list on every render rather
 * than appended per page, loading an older page cannot produce a second separator for a day that
 * already has one — two pages meeting on the same date yield exactly one.
 *
 * The input must be oldest-first, which is the order the API returns within a page.
 */
export const toConversationRows = (
  messages: readonly ConversationMessage[],
): readonly ConversationRow[] => {
  const rows: ConversationRow[] = [];
  let currentDay: string | null = null;

  for (const message of messages) {
    const day = dayKeyOf(message.sentAt);
    if (day !== currentDay) {
      rows.push({ kind: 'day', key: `day:${day}`, at: new Date(message.sentAt) });
      currentDay = day;
    }
    rows.push({ kind: 'message', key: message.id, message });
  }

  return rows;
};

/** Oldest-first, de-duplicated by id, so a re-fetched page cannot double a message. */
export const mergeMessages = (
  older: readonly ConversationMessage[],
  newer: readonly ConversationMessage[],
): readonly ConversationMessage[] => {
  const byId = new Map<string, ConversationMessage>();
  for (const message of [...older, ...newer]) byId.set(message.id, message);

  return [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
};
