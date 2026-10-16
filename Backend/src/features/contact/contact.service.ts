import { buildContactNotificationEmail } from '../../mail/contactMessageEmail.js';
import type { Mailer } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import { toContactReceipt, type ContactReceiptDto } from './contact.dto.js';
import type { ContactLanguage, ContactTopic } from './contactMessage.model.js';
import type { ContactMessageRepository } from './contactMessage.repository.js';

export interface SubmitContactMessageInput {
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: ContactLanguage;
}

export interface ContactService {
  submitMessage(input: SubmitContactMessageInput): Promise<ContactReceiptDto>;
}

export interface ContactDependencies {
  readonly messages: ContactMessageRepository;
  readonly mailer: Mailer;
  /** Where the notification goes. Absent is supported: the message is stored either way. */
  readonly inbox: string | undefined;
}

export const createContactService = ({ messages, mailer, inbox }: ContactDependencies): ContactService => ({
  /**
   * The stored document is the submission, and the email is only a notification about it. Storing
   * first is what makes the success state honest: a deployment with no SMTP still receives the
   * message, so the form never reports a delivery that did not happen.
   */
  async submitMessage(input) {
    const stored = await messages.create(input);
    const reference = stored._id.toString();

    if (inbox === undefined) {
      logger.warn('Contact message stored but not notified — no inbox is configured', { reference });
      return toContactReceipt(stored);
    }

    try {
      await mailer.send(buildContactNotificationEmail(inbox, { ...input, reference }));
      // Only in `smtp` mode did anything actually leave the server; the log mailer resolves too.
      if (mailer.mode === 'smtp') await messages.markNotified(stored._id, new Date());
    } catch (error) {
      // The sender is not told: their message is stored, so their submission genuinely succeeded.
      logger.error('Contact notification email failed to send', {
        reference,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    return toContactReceipt(stored);
  },
});
