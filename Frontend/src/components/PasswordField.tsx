import { useState, type ReactNode } from 'react';

import { FieldLabel } from './FieldLabel';
import { InputWarning } from './InputWarning';

/**
 * A password box with the show/hide eye. The earlier screen drew the button and left it inert with a
 * note saying it needed JavaScript; this is that JavaScript.
 *
 * `revealed` is local state rather than form state: whether the characters are visible is a
 * property of this one box on this one screen, and nothing outside it — certainly not the request
 * body — has any business knowing.
 */
export const PasswordField = ({
  id, name, label, value, onChange, onBlur, placeholder, hint, error, touched = false, toggleLabel,
  minLength, maxLength, className = '', autoComplete = 'new-password', withWarning = false, children,
}: {
  id: string;
  /** The wire field name, which is not always the element id — `confirmPassword` vs the
      `password-confirm` id the stylesheet and the label already use. */
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder: string;
  hint?: string;
  error?: string;
  touched?: boolean;
  toggleLabel: string;
  minLength?: number;
  maxLength?: number;
  /** The grid placement the screen wants for this field; Register's form is a column grid. */
  className?: string;
  autoComplete?: 'new-password' | 'current-password';
  /** Renders the in-field hard-hat the auth screens position beside the reveal toggle. */
  withWarning?: boolean;
  /** Anything that belongs under the field, such as login's forgot-password link. */
  children?: ReactNode;
}) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={`form-group ${className}`.trim()}>
      <FieldLabel htmlFor={id} text={label} />
      <div className="input-wrapper">
        <input
          className={`form-input${touched ? ' touched' : ''}`}
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...(onBlur ? { onBlur } : {})}
          placeholder={placeholder}
          autoComplete={autoComplete}
          dir="ltr"
          required
          {...(minLength ? { minLength } : {})}
          {...(maxLength ? { maxLength } : {})}
        />
        {withWarning ? <InputWarning /> : null}
        {/* Both icons are rendered and the stylesheet shows one, which is the arrangement it
            already had — swapping which element exists instead would mean rewriting rules that
            work. `is-revealed` is the only thing React adds. */}
        <button
          type="button"
          className={`input-action${revealed ? ' is-revealed' : ''}`}
          aria-label={toggleLabel}
          aria-pressed={revealed}
          onClick={() => setRevealed((r) => !r)}
        >
          <svg className="icon-eye" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg className="icon-eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        </button>
      </div>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {error && touched ? (
        <p className="field-error field-error--visible" aria-live="polite">{error}</p>
      ) : null}
      {children}
    </div>
  );
};
