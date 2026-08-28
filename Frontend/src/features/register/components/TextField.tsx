import { FieldLabel } from './FieldLabel';

/**
 * One text input with its label, hint and error.
 *
 * `value` + `onChange` together make this a *controlled* input: the box on screen shows whatever
 * React is holding, and typing asks React to hold something new. That is what lets one component
 * feed both the screen and the request body — with an uncontrolled input the browser would own
 * the value and the payload builder would have to go digging through the DOM for it.
 *
 * `touched` reproduces the shared `validation.js` behaviour: the red state appears only after the
 * user has left the field, so a form nobody has filled in yet is never shown as wrong.
 */
export const TextField = ({
  id, label, value, onChange, onBlur, placeholder, type = 'text', autoComplete, maxLength,
  required = false, dir, optionalText, hint, error, touched = false, className = '',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  /** Email and phone numbers are always left-to-right, whichever language the page is in. */
  dir?: 'ltr';
  optionalText?: string;
  hint?: string;
  error?: string;
  touched?: boolean;
  className?: string;
}) => (
  <div className={`form-group ${className}`.trim()}>
    <FieldLabel htmlFor={id} text={label} {...(optionalText ? { optionalText } : {})} />
    <input
      className={`form-input${touched ? ' touched' : ''}`}
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...(onBlur ? { onBlur } : {})}
      {...(placeholder ? { placeholder } : {})}
      {...(autoComplete ? { autoComplete } : {})}
      {...(maxLength ? { maxLength } : {})}
      {...(dir ? { dir } : {})}
      required={required}
    />
    {hint ? <p className="field-hint">{hint}</p> : null}
    {/* aria-live so a screen reader announces the message when it appears, not only on focus. */}
    {error && touched ? (
      <p className="field-error field-error--visible" aria-live="polite">{error}</p>
    ) : null}
  </div>
);
