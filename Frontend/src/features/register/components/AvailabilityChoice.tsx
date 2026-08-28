import { AVAILABILITY_STATUSES, type Availability } from '../../../api/types';

/**
 * The three approved availability states, as radio buttons.
 *
 * The values sent to the server are the codes `open` / `limited` / `closed`; only the words beside
 * them come from the language resource. That separation is the rule the whole project follows —
 * an enum travels as a language-neutral code, never as the text a person happens to be reading —
 * and it is why switching language mid-form cannot change what gets submitted.
 */
export const AvailabilityChoice = ({
  legend, hint, value, onChange, labels,
}: {
  legend: string;
  hint: string;
  value: Availability;
  onChange: (next: Availability) => void;
  labels: Record<Availability, string>;
}) => (
  <fieldset className="form-group avail-filter col--half">
    <legend className="form-label form-label--plain">
      <span className="form-label__text">{legend}</span>
    </legend>
    {AVAILABILITY_STATUSES.map((status) => (
      <label className="avail-option" key={status}>
        <input
          className="avail-option__input"
          type="radio"
          name="availability"
          value={status}
          checked={value === status}
          onChange={() => onChange(status)}
        />
        <span className="avail-option__box" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <span className={`avail avail--${status}`}>
          <span className="avail__dot" aria-hidden="true" />
          {labels[status]}
        </span>
      </label>
    ))}
    <p className="field-hint">{hint}</p>
  </fieldset>
);
