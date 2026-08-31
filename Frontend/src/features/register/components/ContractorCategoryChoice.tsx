import { CONTRACTOR_CATEGORIES, type ContractorCategory } from '../../../api/types';

/**
 * What kind of business is being registered — קבלן ביצוע ראשי or קבלן משנה.
 *
 * It is asked once, at account level, because it is a property of the business rather than of any
 * one job: the same company keeps its classification into whichever project it is invited. The
 * server gates Confidential Delegation on it, which is why it has no default — neither answer may
 * be assumed on somebody's behalf.
 */
export const ContractorCategoryChoice = ({
  legend, hint, value, onChange, labels,
}: {
  legend: string;
  hint: string;
  value: ContractorCategory | '';
  onChange: (next: ContractorCategory) => void;
  labels: Record<ContractorCategory, string>;
}) => (
  <fieldset className="form-group avail-filter col--half">
    <legend className="form-label form-label--plain">
      <span className="form-label__text">{legend}</span>
    </legend>
    {CONTRACTOR_CATEGORIES.map((category) => (
      <label className="avail-option" key={category}>
        <input
          className="avail-option__input"
          type="radio"
          name="contractorCategory"
          value={category}
          checked={value === category}
          onChange={() => onChange(category)}
        />
        <span className="avail-option__box" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <span>{labels[category]}</span>
      </label>
    ))}
    <p className="field-hint">{hint}</p>
  </fieldset>
);
