import type { UserLanguage } from '../features/users/user.model.js';
import type { MailMessage } from './mailer.js';

/**
 * Written in the account's own `users.language`, which is the same preference every screen reads.
 * No second email-language setting exists, and nothing about the language reaches the requester.
 */
export type PasswordEmailPurpose = 'reset' | 'create';

export interface PasswordResetEmailInput {
  readonly resetUrl: string;
  readonly expiryMinutes: number;
  readonly language: UserLanguage;
  readonly purpose?: PasswordEmailPurpose;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Wording {
  readonly subject: string;
  readonly heading: string;
  readonly intro: string;
  readonly expiry: (minutes: number) => string;
  readonly ignore: string;
  readonly dir: 'rtl' | 'ltr';
  readonly align: 'right' | 'left';
}

const RESET_WORDING: Record<UserLanguage, Wording> = {
  he: {
    subject: 'איפוס סיסמה — Blokta',
    heading: 'איפוס סיסמה',
    intro: 'התקבלה בקשה לאיפוס הסיסמה שלכם. לבחירת סיסמה חדשה:',
    expiry: (minutes) => `הקישור תקף ל-${minutes} דקות והוא חד-פעמי.`,
    ignore: 'אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מההודעה הזו — לא בוצע שום שינוי.',
    dir: 'rtl',
    align: 'right',
  },
  en: {
    subject: 'Reset your password — Blokta',
    heading: 'Reset your password',
    intro: 'A password reset was requested for your account. To choose a new password:',
    expiry: (minutes) => `The link is valid for ${minutes} minutes and can be used once.`,
    ignore: 'If you did not request a reset, you can ignore this email — nothing has changed.',
    dir: 'ltr',
    align: 'left',
  },
};

const CREATE_WORDING: Record<UserLanguage, Wording> = {
  he: {
    subject: 'הוספת סיסמה לחשבון — Blokta',
    heading: 'הוספת כניסה עם מייל וסיסמה',
    intro:
      'התקבלה בקשה להוסיף לחשבון כניסה עם מייל וסיסמה. הכניסה עם Google תישאר זמינה גם אחרי ההוספה. ליצירת הסיסמה:',
    expiry: (minutes) => `הקישור תקף ל-${minutes} דקות והוא חד-פעמי.`,
    ignore: 'אם הבקשה לא נשלחה ממך, אפשר להתעלם מההודעה הזו — לא בוצע שום שינוי.',
    dir: 'rtl',
    align: 'right',
  },
  en: {
    subject: 'Add a password to your account — Blokta',
    heading: 'Add email and password sign-in',
    intro:
      'A request was made to add email and password sign-in to your account. Google sign-in stays available after this. To create the password:',
    expiry: (minutes) => `The link is valid for ${minutes} minutes and can be used once.`,
    ignore: 'If you did not make this request, you can ignore this email — nothing has changed.',
    dir: 'ltr',
    align: 'left',
  },
};

export const buildPasswordResetEmail = (
  to: string,
  { resetUrl, expiryMinutes, language, purpose = 'reset' }: PasswordResetEmailInput,
): MailMessage => {
  const w = (purpose === 'create' ? CREATE_WORDING : RESET_WORDING)[language];
  const url = escapeHtml(resetUrl);

  const text = [w.heading, '', w.intro, resetUrl, w.expiry(expiryMinutes), w.ignore].join('\n');

  const html = `<!doctype html>
<html lang="${language}" dir="${w.dir}">
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F2428; text-align: ${w.align};">
    <h2 style="margin: 0 0 12px;">${w.heading} — Blokta</h2>
    <p style="margin: 0 0 12px;">${w.intro}</p>
    <p style="margin: 0 0 12px;"><a href="${url}">${url}</a></p>
    <p style="margin: 0 0 12px;">${w.expiry(expiryMinutes)}</p>
    <p style="margin: 0;">${w.ignore}</p>
  </body>
</html>`;

  return { to, subject: w.subject, text, html };
};
