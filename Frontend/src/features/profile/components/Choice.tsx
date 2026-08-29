import type { ReactNode } from 'react';

/**
 * One box in a choice grid — a specialty checkbox, an availability radio, an equipment checkbox.
 *
 * The real control is visually hidden and the drawn square beside it is what a person sees, which
 * is how the prototype did it too. The input is still a real input inside a real `<label>`, so it
 * keeps its keyboard behaviour, its focus ring and its announcement; only the painting is custom.
 */
export const Choice = ({
  type, name, value, checked, onChange, children,
}: {
  type: 'checkbox' | 'radio';
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => (
  <label className="choice">
    <input
      className="choice__input"
      type={type}
      name={name}
      value={value}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="choice__box" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
    {children}
  </label>
);
