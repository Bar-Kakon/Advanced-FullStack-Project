import { api } from './client';
import type { ConversationMessage, ConversationSummary, HistoryPage, InboxPage } from './messaging.types';

export const fetchInbox = async (folder: 'inbox' | 'requests', cursor?: string): Promise<InboxPage> => {
  const { data } = await api.get<InboxPage>('/conversations', {
    params: { folder, ...(cursor === undefined ? {} : { cursor }) },
  });
  return data;
};

export const fetchHistory = async (conversationId: string, cursor?: string): Promise<HistoryPage> => {
  const { data } = await api.get<HistoryPage>(`/conversations/${conversationId}/messages`, {
    params: cursor === undefined ? {} : { cursor },
  });
  return data;
};

export const sendMessage = async (
  conversationId: string,
  body: string,
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/messages`,
    { body },
  );
  return data.message;
};

export const startDirect = async (userId: string, body: string): Promise<ConversationSummary> => {
  const { data } = await api.post<{ conversation: ConversationSummary }>(
    `/conversations/direct/${userId}`,
    { body },
  );
  return data.conversation;
};

export const openProjectRoom = async (projectId: string): Promise<ConversationSummary> => {
  const { data } = await api.get<{ conversation: ConversationSummary }>(
    `/conversations/project/${projectId}`,
  );
  return data.conversation;
};

export const answerRequest = async (conversationId: string, accept: boolean): Promise<void> => {
  await api.post(`/conversations/${conversationId}/${accept ? 'accept' : 'decline'}`);
};

/** Hides the conversation for this viewer. It deletes nothing. */
export const hideConversation = async (conversationId: string): Promise<void> => {
  await api.delete(`/conversations/${conversationId}`);
};

export const proposeAgreement = async (
  conversationId: string,
  input: { title: string; description?: string; startDate: string; dueDate: string },
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/agreements`,
    input,
  );
  return data.message;
};

export const answerAgreement = async (
  conversationId: string,
  messageId: string,
  accept: boolean,
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/agreements/${messageId}/${accept ? 'accept' : 'decline'}`,
  );
  return data.message;
};

export const reportMessage = async (
  conversationId: string,
  messageId: string,
  reason: string,
  note?: string,
): Promise<void> => {
  await api.post(`/conversations/${conversationId}/messages/${messageId}/report`, {
    reason,
    ...(note === undefined ? {} : { note }),
  });
};
