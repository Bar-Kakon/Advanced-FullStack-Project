import type { UserLanguage } from '../features/users/user.model.js';
import type { MailMessage } from './mailer.js';

export interface EmailChangeVerificationInput {
  readonly confirmUrl: string;
  readonly expiryMinutes: number;
  readonly language: UserLanguage;
}

export interface EmailChangedNoticeInput {
  readonly newEmail: string;
  readonly language: UserLanguage;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LAYOUT: Record<UserLanguage, { readonly dir: 'rtl' | 'ltr'; readonly align: 'right' | 'left' }> = {
  he: { dir: 'rtl', align: 'right' },
  en: { dir: 'ltr', align: 'left' },
};

const VERIFICATION: Record<
  UserLanguage,
  {
    readonly subject: string;
    readonly heading: string;
    readonly intro: string;
    readonly expiry: (minutes: number) => string;
    readonly ignore: string;
  }
> = {
  he: {
    subject: 'אישור כתובת מייל חדשה — Blokta',
    heading: 'אישור כתובת מייל חדשה',
    intro:
      'התקבלה בקשה להעביר חשבון Blokta לכתובת הזו. כתובת המייל של החשבון תוחלף רק אחרי אישור דרך הקישור:',
    expiry: (minutes) => `הקישור תקף ל-${minutes} דקות והוא חד-פעמי.`,
    ignore: 'אם הבקשה לא נשלחה ממך, אפשר להתעלם מההודעה הזו — החשבון לא ישתנה.',
  },
  en: {
    subject: 'Confirm your new email address — Blokta',
    heading: 'Confirm your new email address',
    intro:
      'A request was made to move a Blokta account to this address. The account email changes only after confirmation through this link:',
    expiry: (minutes) => `The link is valid for ${minutes} minutes and can be used once.`,
    ignore: 'If you did not make this request, you can ignore this email — the account will not change.',
  },
};

const NOTICE: Record<
  UserLanguage,
  {
    readonly subject: string;
    readonly heading: string;
    readonly changed: string;
    readonly help: string;
  }
> = {
  he: {
    subject: 'כתובת המייל של החשבון שונתה — Blokta',
    heading: 'כתובת המייל של החשבון שונתה',
    changed: 'כתובת המייל של חשבון Blokta הוחלפה מהכתובת הזו לכתובת:',
    help: 'אם השינוי לא בוצע על ידך, יש לפנות אלינו בהקדם דרך טופס יצירת הקשר באתר Blokta.',
  },
  en: {
    subject: 'Your account email was changed — Blokta',
    heading: 'Your account email was changed',
    changed: 'The email address of a Blokta account was changed from this address to:',
    help: 'If you did not make this change, contact us as soon as possible through the contact form on the Blokta website.',
  },
};

const page = (language: UserLanguage, heading: string, paragraphs: readonly string[]): string => {
  const { dir, align } = LAYOUT[language];
  return `<!doctype html>
<html lang="${language}" dir="${dir}">
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F2428; text-align: ${align};">
    <h2 style="margin: 0 0 12px;">${heading} — Blokta</h2>
${paragraphs.map((html) => `    <p style="margin: 0 0 12px;">${html}</p>`).join('\n')}
  </body>
</html>`;
};

export const buildEmailChangeVerificationEmail = (
  to: string,
  { confirmUrl, expiryMinutes, language }: EmailChangeVerificationInput,
): MailMessage => {
  const w = VERIFICATION[language];
  const url = escapeHtml(confirmUrl);

  return {
    to,
    subject: w.subject,
    text: [w.heading, '', w.intro, confirmUrl, w.expiry(expiryMinutes), w.ignore].join('\n'),
    html: page(language, w.heading, [
      w.intro,
      `<a href="${url}">${url}</a>`,
      w.expiry(expiryMinutes),
      w.ignore,
    ]),
  };
};

export const buildEmailChangedNoticeEmail = (
  to: string,
  { newEmail, language }: EmailChangedNoticeInput,
): MailMessage => {
  const w = NOTICE[language];

  return {
    to,
    subject: w.subject,
    text: [w.heading, '', w.changed, newEmail, w.help].join('\n'),
    html: page(language, w.heading, [
      w.changed,
      `<span dir="ltr">${escapeHtml(newEmail)}</span>`,
      w.help,
    ]),
  };
};
