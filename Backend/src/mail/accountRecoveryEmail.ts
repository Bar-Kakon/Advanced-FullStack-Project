import type { UserLanguage } from '../features/users/user.model.js';
import type { MailMessage } from './mailer.js';

export interface AccountRecoveryEmailInput {
  readonly restoreUrl: string;
  readonly expiryMinutes: number;
  readonly language: UserLanguage;
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

const WORDING: Record<UserLanguage, Wording> = {
  he: {
    subject: 'שחזור חשבון — Blokta',
    heading: 'שחזור חשבון שנמחק',
    intro: 'התקבלה בקשה לשחזור החשבון בתוך תקופת השחזור. להשלמת השחזור:',
    expiry: (minutes) => `הקישור תקף ל-${minutes} דקות והוא חד-פעמי.`,
    ignore: 'אם הבקשה לא יצאה ממך, אפשר להתעלם מההודעה הזו — החשבון נשאר כפי שהוא.',
    dir: 'rtl',
    align: 'right',
  },
  en: {
    subject: 'Restore your account — Blokta',
    heading: 'Restore your deleted account',
    intro: 'A restoration was requested within the recovery window. To complete it:',
    expiry: (minutes) => `The link is valid for ${minutes} minutes and can be used once.`,
    ignore: 'If this request was not yours, you can ignore this email — the account stays as it is.',
    dir: 'ltr',
    align: 'left',
  },
};

export const buildAccountRecoveryEmail = (
  to: string,
  { restoreUrl, expiryMinutes, language }: AccountRecoveryEmailInput,
): MailMessage => {
  const w = WORDING[language];
  const url = escapeHtml(restoreUrl);

  const text = [w.heading, '', w.intro, restoreUrl, w.expiry(expiryMinutes), w.ignore].join('\n');
  const html = `<!doctype html>
<html dir="${w.dir}" lang="${language}">
  <body style="font-family: Arial, Helvetica, sans-serif; direction: ${w.dir}; text-align: ${w.align};">
    <h2>${w.heading}</h2>
    <p>${w.intro}</p>
    <p><a href="${url}">${url}</a></p>
    <p>${w.expiry(expiryMinutes)}</p>
    <p>${w.ignore}</p>
  </body>
</html>`;

  return { to, subject: w.subject, text, html };
};
