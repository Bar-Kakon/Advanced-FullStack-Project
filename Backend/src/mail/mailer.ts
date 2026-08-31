import nodemailer, { type Transporter } from 'nodemailer';

import type { MailConfig } from '../config/env.js';
import { logger } from '../shared/logger.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Where a reply goes when that is not the sending address — the contact inbox uses it. */
  readonly replyTo?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  readonly mode: MailConfig['mode'];
}

const createSmtpMailer = (config: Extract<MailConfig, { mode: 'smtp' }>): Mailer => {
  // `secure` is which handshake the port speaks, not a preference: 465 is TLS from the first byte,
  // 587 opens in the clear and upgrades through STARTTLS. Derived so the two cannot disagree.
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    mode: 'smtp',
    async send({ to, subject, text, html, replyTo }) {
      await transporter.sendMail({
        from: config.from,
        to,
        subject,
        text,
        html,
        ...(replyTo === undefined ? {} : { replyTo }),
      });
    },
  };
};

/** No SMTP configured: say so on every send rather than appear to work. The body is not logged. */
const createLogMailer = (): Mailer => ({
  mode: 'log',
  async send({ to, subject }) {
    logger.warn('Mail not sent — SMTP is not configured, running in log mode', { to, subject });
  },
});

export const createMailer = (config: MailConfig): Mailer =>
  config.mode === 'smtp' ? createSmtpMailer(config) : createLogMailer();
