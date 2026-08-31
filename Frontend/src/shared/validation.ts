/**
 * The one email shape the client accepts, so Register and Login cannot disagree about what an
 * address looks like. It is deliberately the pattern the earlier static screens carried in their
 * `pattern` attributes — the server's Joi `.email()` is the real check, and this only decides when
 * the screen may stop asking the person to correct the box in front of them.
 */
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** A value that is absent once its surrounding whitespace is discounted. */
export const isBlank = (value: string): boolean => value.trim().length === 0;

/** Characters that only ever arrive as an injection attempt, never as part of a real answer. */
export const MARKUP_CHARACTERS = /[<>{}\\|^~`]/;

/** True when the value carries a letter in any script, so Hebrew and Latin count equally. */
export const hasLetter = (value: string): boolean => /\p{L}/u.test(value.trim());

/**
 * The rule behind every prose field the person types: a name, a company name, a city, a free-text
 * specialty. It has to say something — a letter, not only digits or punctuation — and it may not
 * carry markup. It is deliberately permissive about the rest, because `Smith & Sons (2019) Ltd.`,
 * `ישראלי בנייה בע״מ` and `O'Brien` are all real answers.
 */
export const isValidText = (value: string): boolean => {
  const trimmed = value.trim();
  return hasLetter(trimmed) && !MARKUP_CHARACTERS.test(trimmed);
};

/**
 * The structural phone guard, and only that. It refuses input that cannot be a number at all —
 * letters, punctuation, too few digits — and takes no position on which numbers are valid, because
 * D27 has not settled that. `+`, spaces, hyphens and parentheses are the separators the approved
 * placeholders already use.
 */
export const PHONE_PATTERN = /^[+(\d][\d\s()\-]*$/;

export const MIN_PHONE_DIGITS = 7;

export const MAX_PHONE_LENGTH = 30;

export const isValidPhone = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length > MAX_PHONE_LENGTH) return false;
  if (!PHONE_PATTERN.test(trimmed)) return false;
  return (trimmed.match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS;
};

/** A credential made only of spaces is an empty one, whatever its length. */
export const isValidPassword = (value: string, minLength: number): boolean =>
  value.length >= minLength && value.trim().length > 0;
