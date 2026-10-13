import { useCallback, useEffect, useState } from 'react';

import {
  answerAgreement as answerAgreementCall,
  deleteMessage as deleteMessageCall,
  fetchHistory,
  hideMessageForMe,
  keepMessage as keepMessageCall,
  proposeAgreement as proposeAgreementCall,
  removeMessageForAll,
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
  readonly canModerate: boolean;
  readonly canProposeAgreement: boolean;
  readonly requestState: 'pending' | 'accepted' | 'declined' | null;
  readonly awaitingMyAnswer: boolean;
  reload(): void;
  hideForMe(messageId: string): Promise<void>;
  send(input: { body?: string; attachments?: readonly string[] }): Promise<void>;
  loadOlder(): void;
  answerAgreement(messageId: string, accept: boolean): Promise<void>;
  propose(input: {
    title: string;
    description?: string;
    startDate: string;
    dueDate: string;
  }): Promise<void>;
  deleteOwn(messageId: string): Promise<void>;
  removeForAll(messageId: string): Promise<void>;
  keep(messageId: string): Promise<void>;
}

export const useConversation = (conversationId: string | undefined): ConversationState => {
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [sending, setSending] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [canProposeAgreement, setCanProposeAgreement] = useState(false);
  const [requestState, setRequestState] = useState<'pending' | 'accepted' | 'declined' | null>(null);
  const [awaitingMyAnswer, setAwaitingMyAnswer] = useState(false);
  const [revision, setRevision] = useState(0);

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
        setCanModerate(page.canModerate);
        setCanProposeAgreement(page.canProposeAgreement);
        setRequestState(page.requestState);
        setAwaitingMyAnswer(page.awaitingMyAnswer);
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
  }, [conversationId, revision]);

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
    async (input: { body?: string; attachments?: readonly string[] }): Promise<void> => {
      if (conversationId === undefined) return;

      setSending(true);
      try {
        const message = await sendMessageCall(conversationId, input);
        setMessages((previous) => mergeMessages(previous, [message]));
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  // Each action merges the answered row back in, so the placeholder state is the server's word.
  const applyUpdated = useCallback((message: ConversationMessage): void => {
    setMessages((previous) => mergeMessages(previous, [message]));
  }, []);

  const propose = useCallback(
    async (input: {
      title: string;
      description?: string;
      startDate: string;
      dueDate: string;
    }): Promise<void> => {
      if (conversationId === undefined) return;
      applyUpdated(await proposeAgreementCall(conversationId, input));
    },
    [conversationId, applyUpdated],
  );

  const deleteOwn = useCallback(
    async (messageId: string): Promise<void> => {
      if (conversationId === undefined) return;
      applyUpdated(await deleteMessageCall(conversationId, messageId));
    },
    [conversationId, applyUpdated],
  );

  const removeForAll = useCallback(
    async (messageId: string): Promise<void> => {
      if (conversationId === undefined) return;
      applyUpdated(await removeMessageForAll(conversationId, messageId));
    },
    [conversationId, applyUpdated],
  );

  const keep = useCallback(
    async (messageId: string): Promise<void> => {
      if (conversationId === undefined) return;
      applyUpdated(await keepMessageCall(conversationId, messageId));
    },
    [conversationId, applyUpdated],
  );

  const reload = useCallback((): void => setRevision((current) => current + 1), []);

  const hideForMe = useCallback(
    async (messageId: string): Promise<void> => {
      if (conversationId === undefined) return;
      await hideMessageForMe(conversationId, messageId);
      setMessages((previous) => previous.filter((row) => row.id !== messageId));
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

  return {
    messages,
    loading,
    failure,
    hasOlder: cursor !== null,
    sending,
    canModerate,
    canProposeAgreement,
    requestState,
    awaitingMyAnswer,
    reload,
    hideForMe,
    send,
    loadOlder,
    answerAgreement,
    propose,
    deleteOwn,
    removeForAll,
    keep,
  };
};
