/**
 * The hard-hat warning that appears inside an invalid field on the auth screens.
 *
 * It sits in the field rather than under it because an inline message reflows everything beneath
 * it the moment it appears, and a form that jumps while it is being corrected is harder to
 * correct. The stylesheet reveals it only for a field the person has left in an invalid state.
 */
export const InputWarning = () => (
  <span className="input-warn" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 18h19" />
      <path d="M5 18v-2.5a7 7 0 0 1 14 0V18" />
      <line x1="12" y1="9" x2="12" y2="12.7" />
      <circle cx="12" cy="15.4" r="0.5" fill="currentColor" />
    </svg>
  </span>
);
