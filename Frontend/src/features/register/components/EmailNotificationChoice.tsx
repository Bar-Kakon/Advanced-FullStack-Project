/**
 * Step 2: whether Blokta may send operational messages by email.
 *
 * Both options are radio buttons of the same `name` with no `defaultChecked`, so the browser opens
 * the step with neither selected and the person has to answer one. Declining is a complete answer —
 * it is not styled, ordered or worded as the lesser one, because refusing email removes nothing
 * from the platform.
 */

import { Bidi } from '../../../components/Bidi';
export const EmailNotificationChoice = ({
  copy, value, onChange,
}: {
  copy: {
    legend: string;
    body: string;
    inApp: string;
    optOut: string;
    accept: string;
    decline: string;
    changeable: string;
  };
  value: boolean | null;
  onChange: (next: boolean) => void;
}) => (
  <fieldset className="form-group email-choice col--full">
    <legend className="form-label form-label--plain">
      <span className="form-label__text">{copy.legend}</span>
    </legend>

    <p className="email-choice__body"><Bidi text={copy.body} /></p>
    <p className="email-choice__body">{copy.inApp}</p>
    <p className="email-choice__body email-choice__body--note">{copy.optOut}</p>

    {[
      { id: 'accept', on: true, label: copy.accept },
      { id: 'decline', on: false, label: copy.decline },
    ].map((option) => (
      <label className="avail-option" key={option.id} htmlFor={`operationalEmail-${option.id}`}>
        <input
          className="avail-option__input"
          id={`operationalEmail-${option.id}`}
          type="radio"
          name="operationalEmail"
          value={option.id}
          checked={value === option.on}
          onChange={() => onChange(option.on)}
        />
        <span className="avail-option__box" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <span className="email-choice__label">{option.label}</span>
      </label>
    ))}

    <p className="field-hint">{copy.changeable}</p>
  </fieldset>
);
