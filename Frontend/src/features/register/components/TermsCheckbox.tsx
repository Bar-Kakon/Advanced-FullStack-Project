import type { Strings } from '../../../i18n/strings.types';

/**
 * The consent checkbox.
 *
 * `checked` here is a `true`/`false` in React state, and the payload builder sends that boolean.
 * A plain HTML form would have submitted the string `"on"` instead, which the server rejects — the
 * gap is invisible until the first real request, so it is worth naming.
 *
 * The two links still point at `#`: no Terms or Privacy document has been written. The version
 * being accepted is never sent from here — the server records the version it is serving, because
 * a client could claim any value.
 */
export const TermsCheckbox = ({
  terms, checked, onChange, onBlur, touched,
}: {
  terms: Strings['form']['terms'];
  checked: boolean;
  onChange: (next: boolean) => void;
  onBlur?: () => void;
  touched: boolean;
}) => (
  <label className="checkbox-field col--full">
    <input
      className={`checkbox-input${touched ? ' touched' : ''}`}
      type="checkbox"
      name="acceptedTerms"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      {...(onBlur ? { onBlur } : {})}
      required
    />
    <span className="checkbox-box" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 6" />
      </svg>
    </span>
    <span className="checkbox-label">
      {terms.before}
      <a href="#">{terms.tos}</a>
      {terms.between}
      <a href="#">{terms.privacy}</a>
    </span>
  </label>
);
