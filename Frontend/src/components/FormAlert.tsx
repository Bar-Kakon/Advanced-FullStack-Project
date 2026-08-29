/**
 * The error banner above the form. The prototype drew it permanently hidden with a note that a
 * class would reveal it once validation was real; React renders it only when there is something
 * to say, so `.alert--visible` is applied at the same moment the text exists.
 *
 * `role="alert"` is what makes a screen reader announce it the moment it appears. Without it the
 * message is on screen but silent, so a blind user submits, hears nothing, and has no idea why
 * nothing happened.
 */
export const FormAlert = ({ message }: { message: string }) => (
  <div className="alert alert--error alert--visible" role="alert" aria-live="polite">
    <svg className="alert__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.8" />
      <line x1="10" y1="6" x2="10" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1" fill="currentColor" />
    </svg>
    <span>{message}</span>
  </div>
);
