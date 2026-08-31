import { useCallback, useEffect, useState } from 'react';

import { answerRequest, fetchInbox, hideConversation } from '../../api/messaging.api';
import type { ConversationSummary } from '../../api/messaging.types';

export interface InboxState {
  readonly folder: 'inbox' | 'requests';
  readonly conversations: readonly ConversationSummary[];
  readonly loading: boolean;
  readonly failure: boolean;
  setFolder(next: 'inbox' | 'requests'): void;
  answer(conversationId: string, accept: boolean): Promise<void>;
  hide(conversationId: string): Promise<void>;
  reload(): void;
}

export const useInbox = (): InboxState => {
  const [folder, setFolder] = useState<'inbox' | 'requests'>('inbox');
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailure(false);

    void fetchInbox(folder)
      .then((page) => {
        if (current) setConversations(page.conversations);
      })
      .catch(() => {
        if (current) setFailure(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    // A superseded folder's answer is discarded rather than rendered over the current one.
    return () => {
      current = false;
    };
  }, [folder, revision]);

  const answer = useCallback(
    async (conversationId: string, accept: boolean): Promise<void> => {
      await answerRequest(conversationId, accept);
      reload();
    },
    [reload],
  );

  const hide = useCallback(
    async (conversationId: string): Promise<void> => {
      await hideConversation(conversationId);
      reload();
    },
    [reload],
  );

  return { folder, conversations, loading, failure, setFolder, answer, hide, reload };
};
