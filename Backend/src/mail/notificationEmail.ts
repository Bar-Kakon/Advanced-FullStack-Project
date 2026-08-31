import type { NotificationPayload, NotificationType } from '../features/notifications/notification.model.js';
import type { UserLanguage } from '../features/users/user.model.js';
import type { MailMessage } from './mailer.js';

/**
 * The two operational emails: one blocking notice whose grace window expired unread, and the daily
 * digest of what did not need immediate attention.
 *
 * Both are delivery only. Neither carries an approve, a decline or any other response — every
 * operational action happens inside FieldSync, so the only control an email offers is a link back
 * to the screen that owns the decision.
 *
 * Written in the account's own `users.language`, the same preference every screen reads.
 */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Wording {
  readonly dir: 'rtl' | 'ltr';
  readonly align: 'right' | 'left';
  readonly brand: string;
  readonly openLabel: string;
  readonly digestSubject: string;
  readonly digestHeading: string;
  readonly digestIntro: (count: number) => string;
  readonly settingsNote: string;
  readonly noActionNote: string;
  readonly titles: Readonly<Record<NotificationType, string>>;
}

const WORDING: Record<UserLanguage, Wording> = {
  he: {
    dir: 'rtl',
    align: 'right',
    brand: 'FieldSync',
    openLabel: 'פתיחה ב-FieldSync',
    digestSubject: 'סיכום יומי — FieldSync',
    digestHeading: 'הסיכום היומי',
    digestIntro: (count) =>
      count === 1 ? 'עדכון אחד מהיום שטרם נצפה:' : `${count} עדכונים מהיום שטרם נצפו:`,
    settingsNote: 'אפשר לשנות את העדפות ההתראות בהגדרות החשבון.',
    noActionNote: 'ההודעה הזו נועדה ליידע בלבד. כל פעולה מתבצעת במערכת.',
    titles: {
      'project.invitation': 'הזמנה לפרויקט',
      'task.assigned': 'משימה חדשה באחריותך',
      'task.updated': 'עודכנו פרטים במשימה',
      'task.early_completion': 'עבודה בפרויקט הסתיימה מוקדם',
      'proposal.awaiting_response': 'בקשת שינוי מועד ממתינה לתשובתך',
      'proposal.returned_to_management': 'בקשת שינוי מועד חזרה להכרעת הניהול',
      'schedule.change_resolved': 'שינוי מועד שנקבע נוגע לעבודה שלך',
      'schedule.partial_release': 'שוחררה עבודה לפני השלב שהיא ממתינה לו',
      'schedule.exception.awaiting_approval': 'בקשת חריג בלוח הזמנים ממתינה לאישורך',
      'schedule.exception.modified': 'בקשת החריג שלך שונתה וממתינה לאישורך',
      'schedule.exception.decided': 'התקבלה החלטה בבקשת החריג שלך',
      'schedule.exception.affects_you': 'חריג מאושר בלוח הזמנים נוגע לעבודה שלך',
      'responsibility.transfer_invited': 'הוצעה לך העברת אחריות על עבודה',
      'responsibility.transfer_accepted': 'העברת אחריות אושרה',
      'workplan.version_added': 'נוספה גרסה לתוכנית עבודה',
    },
  },
  en: {
    dir: 'ltr',
    align: 'left',
    brand: 'FieldSync',
    openLabel: 'Open in FieldSync',
    digestSubject: 'Daily summary — FieldSync',
    digestHeading: 'Your daily summary',
    digestIntro: (count) =>
      count === 1 ? 'One update from today that you have not seen:' : `${count} updates from today that you have not seen:`,
    settingsNote: 'Notification preferences can be changed in account settings.',
    noActionNote: 'This message is for information only. Every action happens in the platform.',
    titles: {
      'project.invitation': 'Project invitation',
      'task.assigned': 'A task is now your responsibility',
      'task.updated': 'A task’s details were updated',
      'task.early_completion': 'Work on the project finished early',
      'proposal.awaiting_response': 'A date change is waiting for your answer',
      'proposal.returned_to_management': 'A date change went back to management to resolve',
      'schedule.change_resolved': 'A resolved date change affects your work',
      'schedule.partial_release': 'Work was released ahead of the stage it waits on',
      'schedule.exception.awaiting_approval': 'A schedule exception is waiting for your approval',
      'schedule.exception.modified': 'Your exception request was changed and needs your confirmation',
      'schedule.exception.decided': 'Your exception request was decided',
      'schedule.exception.affects_you': 'An approved schedule exception affects your work',
      'responsibility.transfer_invited': 'A responsibility transfer was offered to you',
      'responsibility.transfer_accepted': 'A responsibility transfer was accepted',
      'workplan.version_added': 'A work plan version was added',
    },
  },
};

/** The one line of context a notification carries, built only from the stored scalars. */
const contextLine = (payload: NotificationPayload): string => {
  const parts = [payload.projectName, payload.taskTitle].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  const dates =
    payload.fromDate !== undefined && payload.toDate !== undefined && payload.fromDate !== payload.toDate
      ? `${payload.fromDate} – ${payload.toDate}`
      : payload.fromDate;
  if (dates !== undefined) parts.push(dates);
  return parts.join(' · ');
};

const shell = (wording: Wording, body: string): string => `
<div dir="${wording.dir}" style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;
     background:#f7f5f0;padding:24px;text-align:${wording.align};">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e4ddcd;
       border-radius:14px;padding:24px;">
    <div style="font-weight:700;letter-spacing:.02em;color:#1f2a37;margin-bottom:16px;">${wording.brand}</div>
    ${body}
    <p style="color:#6b7280;font-size:12px;margin-top:20px;">${escapeHtml(wording.settingsNote)}</p>
  </div>
</div>`;

const button = (url: string, label: string): string => `
<p style="margin:20px 0 0;">
  <a href="${escapeHtml(url)}"
     style="display:inline-block;background:#1f2a37;color:#fffdf8;text-decoration:none;
            padding:10px 18px;border-radius:9px;font-weight:600;">${escapeHtml(label)}</a>
</p>`;

export interface NotificationEmailInput {
  readonly type: NotificationType;
  readonly payload: NotificationPayload;
  readonly language: UserLanguage;
  readonly url: string;
}

export const buildNotificationEmail = (
  to: string,
  { type, payload, language, url }: NotificationEmailInput,
): MailMessage => {
  const wording = WORDING[language];
  const title = wording.titles[type];
  const context = contextLine(payload);

  const text = [title, context, '', wording.openLabel, url, '', wording.noActionNote]
    .filter((line) => line.length > 0 || line === '')
    .join('\n');

  return {
    to,
    subject: `${title} — ${wording.brand}`,
    text,
    html: shell(
      wording,
      `<h1 style="font-size:18px;color:#1f2a37;margin:0 0 8px;">${escapeHtml(title)}</h1>
       ${context.length > 0 ? `<p style="color:#4b5563;margin:0;">${escapeHtml(context)}</p>` : ''}
       ${button(url, wording.openLabel)}
       <p style="color:#6b7280;font-size:12px;margin-top:16px;">${escapeHtml(wording.noActionNote)}</p>`,
    ),
  };
};

export interface DigestItem {
  readonly type: NotificationType;
  readonly payload: NotificationPayload;
}

export interface DigestEmailInput {
  readonly items: readonly DigestItem[];
  readonly language: UserLanguage;
  readonly url: string;
}

export const buildDigestEmail = (
  to: string,
  { items, language, url }: DigestEmailInput,
): MailMessage => {
  const wording = WORDING[language];
  const lines = items.map((item) => {
    const context = contextLine(item.payload);
    return context.length > 0 ? `${wording.titles[item.type]} — ${context}` : wording.titles[item.type];
  });

  return {
    to,
    subject: wording.digestSubject,
    text: [wording.digestHeading, wording.digestIntro(items.length), '', ...lines, '', url].join('\n'),
    html: shell(
      wording,
      `<h1 style="font-size:18px;color:#1f2a37;margin:0 0 8px;">${escapeHtml(wording.digestHeading)}</h1>
       <p style="color:#4b5563;margin:0 0 12px;">${escapeHtml(wording.digestIntro(items.length))}</p>
       <ul style="margin:0;padding-${wording.align === 'right' ? 'right' : 'left'}:18px;color:#1f2a37;">
         ${lines.map((line) => `<li style="margin:6px 0;">${escapeHtml(line)}</li>`).join('')}
       </ul>
       ${button(url, wording.openLabel)}`,
    ),
  };
};
