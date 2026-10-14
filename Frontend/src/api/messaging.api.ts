import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type {
  ConversationMessage,
  ConversationSummary,
  HistoryPage,
  InboxPage,
  MessageAttachment,
  StartDirectFailure,
} from './messaging.types';

export const fetchInbox = async (folder: 'inbox' | 'requests' | 'sent', cursor?: string): Promise<InboxPage> => {
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
  input: { body?: string; attachments?: readonly string[] },
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/messages`,
    input,
  );
  return data.message;
};

/** Delete-for-everyone of the caller's own message. The reply is the placeholder state. */
export const deleteMessage = async (
  conversationId: string,
  messageId: string,
): Promise<ConversationMessage> => {
  const { data } = await api.delete<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/messages/${messageId}`,
  );
  return data.message;
};

/** Hides one message for this viewer alone. Every other participant still sees it. */
export const hideMessageForMe = async (conversationId: string, messageId: string): Promise<void> => {
  await api.post(`/conversations/${conversationId}/messages/${messageId}/hide`);
};

export const removeMessageForAll = async (
  conversationId: string,
  messageId: string,
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/messages/${messageId}/remove`,
  );
  return data.message;
};

export const keepMessage = async (
  conversationId: string,
  messageId: string,
): Promise<ConversationMessage> => {
  const { data } = await api.post<{ message: ConversationMessage }>(
    `/conversations/${conversationId}/messages/${messageId}/keep`,
  );
  return data.message;
};

export const uploadAttachment = async (
  conversationId: string,
  file: File,
): Promise<MessageAttachment> => {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ attachment: MessageAttachment }>(
    `/conversations/${conversationId}/attachments`,
    form,
  );
  return data.attachment;
};

/** The guarded path an attachment's bytes are served from; fetched as a blob, never an <img src>. */
export const attachmentPath = (conversationId: string, fileId: string): string =>
  `/conversations/${conversationId}/files/${fileId}`;

export const classifyStartDirectError = (error: unknown): StartDirectFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'CANNOT_MESSAGE_SELF':
      return 'SELF';
    case 'NO_CONTACT':
      return 'NO_CONTACT';
    case 'MESSAGE_REQUEST_AWAITING_RESPONSE':
      return 'AWAITING';
    case 'CONVERSATION_NOT_FOUND':
      return 'NOT_FOUND';
    default:
      return 'UNKNOWN';
  }
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
  input: {
    title: string;
    description?: string;
    startDate: string;
    dueDate: string;
    attachments?: readonly string[];
  },
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

/**
 * Mute is a DELIVERY preference on the canonical mute model, never access: a muted conversation
 * still reads, still receives, and still shows a blocking in-app notice.
 */
export const fetchConversationMute = async (conversationId: string): Promise<boolean> => {
  const { data } = await api.get<{ mute: { muted: boolean } }>(
    `/mutes/conversations/${conversationId}`,
  );
  return data.mute.muted;
};

export const setConversationMute = async (
  conversationId: string,
  muted: boolean,
): Promise<boolean> => {
  const { data } = await api.put<{ mute: { muted: boolean } }>(
    `/mutes/conversations/${conversationId}`,
    { muted },
  );
  return data.mute.muted;
};

export const fetchContractorMute = async (userId: string): Promise<boolean> => {
  const { data } = await api.get<{ mute: { muted: boolean } }>(`/mutes/contractors/${userId}`);
  return data.mute.muted;
};

export const setContractorMute = async (userId: string, muted: boolean): Promise<boolean> => {
  const { data } = await api.put<{ mute: { muted: boolean } }>(`/mutes/contractors/${userId}`, {
    muted,
  });
  return data.mute.muted;
};
