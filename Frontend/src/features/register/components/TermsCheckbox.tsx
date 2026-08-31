import type { Strings } from '../../../i18n/strings.types';

/**
 * The consent checkbox.
 *
 * `checked` here is a `true`/`false` in React state, and the payload builder sends that boolean.
 * A plain HTML form would have submitted the string `"on"` instead, which the server rejects — the
 * gap is invisible until the first real request, so it is worth naming.
 *
 * The version being accepted is never sent from here — the server records the version it is
 * serving, because a client could claim any value.
 */
export const TermsCheckbox = ({
  terms, checked, onChange, onBlur, touched, onOpenTerms, invalid = false, error,
}: {
  terms: Strings['form']['terms'];
  checked: boolean;
  onChange: (next: boolean) => void;
  onBlur?: () => void;
  touched: boolean;
  onOpenTerms: () => void;
  invalid?: boolean;
  error?: string;
}) => (
  <div className="col--full">
    <label className="checkbox-field">
      <input
        className={`checkbox-input${touched ? ' touched' : ''}${invalid ? ' is-invalid' : ''}`}
        aria-invalid={invalid}
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
      {/* A button, not a link: the document opens in a dialog over Register, so nothing navigates
          away and a half-filled form is never abandoned. It sits outside the checkbox's own hit
          area, so opening the terms cannot toggle consent by accident. */}
      <span className="checkbox-label">
        {terms.before}
        <button
          type="button"
          className="checkbox-label__doc"
          aria-label={terms.open}
          onClick={(e) => {
            e.preventDefault();
            onOpenTerms();
          }}
        >
          {terms.tos}
        </button>
      </span>
    </label>
    {invalid && error ? (
      <p className="field-error field-error--visible" aria-live="polite">{error}</p>
    ) : null}
  </div>
);
