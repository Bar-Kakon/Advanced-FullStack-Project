/** The four storage codes the API accepts. The UI never renders one — it renders its own wording. */
export const CONTACT_TOPICS = ['general', 'support', 'partnership', 'other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export interface SubmitContactPayload {
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: 'he' | 'en';
}

/** Everything the sender is told back: the message exists, and when. */
export interface ContactReceipt {
  readonly id: string;
  readonly createdAt: string;
}

export interface SubmitContactResponse {
  readonly message: ContactReceipt;
}

/** The submission failures the form answers individually. */
export type SubmitContactFailure =
  | 'REQUEST_VALIDATION_FAILED'
  | 'TOO_MANY_REQUESTS'
  | 'NETWORK'
  | 'UNKNOWN';
