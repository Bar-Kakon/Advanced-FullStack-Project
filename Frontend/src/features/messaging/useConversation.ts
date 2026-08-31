import { useCallback, useEffect, useState } from 'react';

import {
  answerAgreement as answerAgreementCall,
  fetchHistory,
  sendMessage as sendMessageCall,
} from '../../api/messaging.api';
import type { ConversationMessage } from '../../api/messaging.types';
import { mergeMessages } from './messageGrouping';

export interface ConversationState {
  readonly messages: readonly ConversationMessage[];
  readonly loading: boolean;
  readonly failure: boolean;
  readonly hasOlder: boolean;
  readonly sending: boolean;
  send(body: string): Promise<void>;
  loadOlder(): void;
  answerAgreement(messageId: string, accept: boolean): Promise<void>;
}

export const useConversation = (conversationId: string | undefined): ConversationState => {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (conversationId === undefined) return;

    let current = true;
    setLoading(true);
    setFailure(false);

    void fetchHistory(conversationId)
      .then((page) => {
        if (!current) return;
        setMessages(page.messages);
        setCursor(page.nextCursor);
      })
      .catch(() => {
        if (current) setFailure(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [conversationId]);

  const loadOlder = useCallback(() => {
    if (conversationId === undefined || cursor === null) return;

    void fetchHistory(conversationId, cursor)
      .then((page) => {
        // Merged into one sorted list, so the separators are recomputed over the whole thread and
        // a day that already has one cannot get a second.
        setMessages((previous) => mergeMessages(page.messages, previous));
        setCursor(page.nextCursor);
      })
      .catch(() => setFailure(true));
  }, [conversationId, cursor]);

  const send = useCallback(
    async (body: string): Promise<void> => {
      if (conversationId === undefined) return;

      setSending(true);
      try {
        const message = await sendMessageCall(conversationId, body);
        setMessages((previous) => mergeMessages(previous, [message]));
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  const answerAgreement = useCallback(
    async (messageId: string, accept: boolean): Promise<void> => {
      if (conversationId === undefined) return;

      const answered = await answerAgreementCall(conversationId, messageId, accept);
      setMessages((previous) => mergeMessages(previous, [answered]));
    },
    [conversationId],
  );

  return { messages, loading, failure, hasOlder: cursor !== null, sending, send, loadOlder, answerAgreement };
};
