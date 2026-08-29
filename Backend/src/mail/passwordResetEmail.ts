import type { MailMessage } from './mailer.js';

/**
 * Both languages in one message. D10's open sub-question is which language server-side artifacts
 * use, so choosing one here would answer it by implementation; sending both cannot be wrong for the
 * recipient and collapses to one block when that closes.
 */
export interface PasswordResetEmailInput {
  readonly resetUrl: string;
  readonly expiryMinutes: number;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const buildPasswordResetEmail = (
  to: string,
  { resetUrl, expiryMinutes }: PasswordResetEmailInput,
): MailMessage => {
  const url = escapeHtml(resetUrl);

  const text = [
    'איפוס סיסמה — FieldSync',
    '',
    'התקבלה בקשה לאיפוס הסיסמה שלכם. לבחירת סיסמה חדשה:',
    resetUrl,
    `הקישור תקף ל-${expiryMinutes} דקות והוא חד-פעמי.`,
    'אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מההודעה הזו — לא בוצע שום שינוי.',
    '',
    '—',
    '',
    'Reset your password — FieldSync',
    '',
    'A password reset was requested for your account. To choose a new password:',
    resetUrl,
    `The link is valid for ${expiryMinutes} minutes and can be used once.`,
    'If you did not request a reset, you can ignore this email — nothing has changed.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1F2428;">
    <div dir="rtl" style="text-align: right;">
      <h2 style="margin: 0 0 12px;">איפוס סיסמה — FieldSync</h2>
      <p style="margin: 0 0 12px;">התקבלה בקשה לאיפוס הסיסמה שלכם. לבחירת סיסמה חדשה:</p>
      <p style="margin: 0 0 12px;"><a href="${url}">${url}</a></p>
      <p style="margin: 0 0 12px;">הקישור תקף ל-${expiryMinutes} דקות והוא חד-פעמי.</p>
      <p style="margin: 0 0 24px;">אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מההודעה הזו — לא בוצע שום שינוי.</p>
    </div>
    <hr style="border: none; border-top: 1px solid #C7B89D; margin: 0 0 24px;" />
    <div dir="ltr" style="text-align: left;">
      <h2 style="margin: 0 0 12px;">Reset your password — FieldSync</h2>
      <p style="margin: 0 0 12px;">A password reset was requested for your account. To choose a new password:</p>
      <p style="margin: 0 0 12px;"><a href="${url}">${url}</a></p>
      <p style="margin: 0 0 12px;">The link is valid for ${expiryMinutes} minutes and can be used once.</p>
      <p style="margin: 0;">If you did not request a reset, you can ignore this email — nothing has changed.</p>
    </div>
  </body>
</html>`;

  return { to, subject: 'איפוס סיסמה / Reset your password — FieldSync', text, html };
};
