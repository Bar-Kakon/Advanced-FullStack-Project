import type { ReactNode } from 'react';

/**
 * One label, in one language. The `.form-label__text` span is what carries the no-wrap rule the
 * earlier screen hung on its duplicated language spans — without it a long label wraps, and a wrapped
 * label makes its column one line taller than the field beside it, which knocks the two inputs
 * out of alignment.
 */
export const FieldLabel = ({
  htmlFor,
  text,
  optionalText,
  plain = false,
}: {
  htmlFor?: string;
  text: string;
  optionalText?: string;
  /** `legend` styling for a fieldset, or a bare span where no control can own the label. */
  plain?: boolean;
}) => {
  const content: ReactNode = (
    <>
      <span className="form-label__text">{text}</span>
      {optionalText ? <span className="form-label__optional">{optionalText}</span> : null}
    </>
  );

  if (plain) return <span className="form-label form-label--plain">{content}</span>;
  return (
    <label className="form-label" htmlFor={htmlFor}>
      {content}
    </label>
  );
};
