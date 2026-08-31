import type { ReactNode } from 'react';

import { InputWarning } from '../../../components/InputWarning';

/**
 * The field shapes Edit profile uses. They are separate from the auth screens' components because
 * the two designs label differently: the profile stylesheet's label is `.field-label`, drawn with
 * a small rotated square before it, where the auth stylesheet's is `.form-label`. Sharing one
 * component would have meant one of the two screens carrying a class its stylesheet never styles.
 *
 * The hard-hat warning sits inside the box, positioned with a logical inset rather than the auth
 * screens' physical `right`: these fields hold city names and bios and so follow UI direction,
 * where an email address or a phone number is always left-to-right whatever the language.
 */

export const EditText = ({
  id, label, value, onChange, onBlur, placeholder, hint, optionalText, type = 'text',
  dir, autoComplete, maxLength, required = false, touched = false, className = '',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  hint?: ReactNode;
  optionalText?: string;
  type?: 'text' | 'tel' | 'email';
  dir?: 'ltr' | 'auto';
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  touched?: boolean;
  className?: string;
}) => (
  <div className={`form-group ${className}`.trim()}>
    <label className="field-label" htmlFor={id}>
      {label}
      {optionalText ? <span className="form-label__optional">{optionalText}</span> : null}
    </label>
    <div className="input-wrapper">
      <input
        className={`form-input${touched ? ' touched' : ''}`}
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(onBlur ? { onBlur } : {})}
        {...(placeholder ? { placeholder } : {})}
        {...(dir ? { dir } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        {...(maxLength ? { maxLength } : {})}
        required={required}
      />
      <InputWarning />
    </div>
    {hint ? <p className="field-hint">{hint}</p> : null}
  </div>
);

export const EditTextarea = ({
  id, label, value, onChange, placeholder, hint, rows = 4, maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  hint?: ReactNode;
  rows?: number;
  maxLength?: number;
}) => (
  <div className="form-group">
    <label className="field-label" htmlFor={id}>{label}</label>
    {/* One textarea, so `dir="auto"` can sit on the element itself: the earlier screen needed two,
        one per language, and a shared parent would have resolved direction from the Hebrew. */}
    <textarea
      className="form-input form-textarea"
      id={id}
      name={id}
      dir="auto"
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      {...(maxLength ? { maxLength } : {})}
    />
    {hint ? <p className="field-hint">{hint}</p> : null}
  </div>
);

export const EditSelect = <T extends string>({
  id, label, value, onChange, placeholder, options, required = false, touched = false, error,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (next: T) => void;
  placeholder: string;
  options: readonly { readonly value: T; readonly label: string }[];
  required?: boolean;
  touched?: boolean;
  error?: string;
}) => (
  <div className="form-group">
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="select-wrap">
      {/* One control, its options rendered from the string resource. The earlier screen had to carry a
          whole second select per language, because option text is not a span it could hide. */}
      <select
        className={`form-select${touched ? ' touched' : ''}`}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        required={required}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className="select-chevron" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </span>
    </div>
    {touched && error ? (
      <p className="field-error field-error--visible" aria-live="polite">{error}</p>
    ) : null}
  </div>
);

export const EditNumber = ({
  id, label, value, onChange, unit, min, max, step = 1, hints, className = '',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  /** One or more hint paragraphs; the travel field swaps between two of them. */
  hints: ReactNode;
  className?: string;
}) => (
  <div className={`form-group form-group--narrow ${className}`.trim()}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="unit-field">
      <div className="input-wrapper">
        <input
          className="form-input form-input--num"
          id={id}
          name={id}
          type="number"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          required
        />
        <InputWarning />
      </div>
      <span className="unit-field__unit">{unit}</span>
    </div>
    {hints}
  </div>
);
