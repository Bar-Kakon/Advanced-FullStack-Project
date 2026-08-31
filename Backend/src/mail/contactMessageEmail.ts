import type { ContactLanguage, ContactTopic } from '../features/contact/contactMessage.model.js';
import type { MailMessage } from './mailer.js';

export interface ContactNotificationInput {
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: ContactLanguage;
  readonly reference: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Read by whoever staffs the inbox, so the topic is spelled out rather than left as its code. */
const TOPIC_LABELS: Record<ContactTopic, string> = {
  general: 'General enquiry',
  support: 'Technical support',
  partnership: 'Business / partnership',
  other: 'Other',
};

/**
 * Addressed to the platform inbox, never to the sender: this is a notification that a message
 * arrived, not a confirmation to the person who sent it. The sender's address is carried as
 * `Reply-To` rather than `From`, so answering it goes to them while the envelope stays ours.
 */
export const buildContactNotificationEmail = (
  to: string,
  { name, email, topic, message, language, reference }: ContactNotificationInput,
): MailMessage => {
  const subject = `Contact form — ${TOPIC_LABELS[topic]} — FieldSync`;

  const text = [
    `From:      ${name} <${email}>`,
    `Topic:     ${TOPIC_LABELS[topic]}`,
    `Language:  ${language}`,
    `Reference: ${reference}`,
    '',
    message,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en" dir="ltr">
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F2428;">
    <h2 style="margin: 0 0 12px;">Contact form — FieldSync</h2>
    <p style="margin: 0 0 6px;"><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p style="margin: 0 0 6px;"><strong>Topic:</strong> ${escapeHtml(TOPIC_LABELS[topic])}</p>
    <p style="margin: 0 0 6px;"><strong>Language:</strong> ${escapeHtml(language)}</p>
    <p style="margin: 0 0 12px;"><strong>Reference:</strong> ${escapeHtml(reference)}</p>
    <p style="margin: 0; white-space: pre-wrap;" dir="auto">${escapeHtml(message)}</p>
  </body>
</html>`;

  return { to, subject, text, html, replyTo: email };
};
