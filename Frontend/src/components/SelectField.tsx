import { FieldLabel } from './FieldLabel';
import { Chevron } from './Chevron';

/**
 * One dropdown, its options rendered from the string resource.
 *
 * The empty first option is the placeholder. Keeping its value as `''` is what makes a required
 * select count as invalid until a real choice is made, which is how the existing `.touched` red
 * border still works with no change to the stylesheet.
 */
export const SelectField = <T extends string>({
  id, label, value, onChange, onBlur, placeholder, options, required = false, hint, error, children, className = '', touched = false,
}: {
  id: string;
  label: string;
  value: T | '';
  onChange: (next: T | '') => void;
  onBlur?: () => void;
  placeholder: string;
  options: readonly { readonly value: T; readonly label: string }[];
  required?: boolean;
  hint?: string;
  error?: string;
  /** Anything revealed by this select's own value, such as the free-text trade field. */
  children?: React.ReactNode;
  className?: string;
  touched?: boolean;
}) => (
  <div className={`form-group ${className}`.trim()}>
    <FieldLabel htmlFor={id} text={label} />
    <div className="select-wrap">
      <select
        className={`form-select${touched ? ' touched' : ''}`}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        {...(onBlur ? { onBlur } : {})}
        required={required}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Chevron />
    </div>
    {children}
    {hint ? <p className="field-hint">{hint}</p> : null}
    {error && touched ? (
      <p className="field-error field-error--visible" aria-live="polite">{error}</p>
    ) : null}
  </div>
);
