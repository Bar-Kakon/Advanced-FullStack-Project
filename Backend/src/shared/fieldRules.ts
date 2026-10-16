import Joi from 'joi';

/**
 * The field rules every screen answers to, written once. Register and the profile edit collect the
 * same values, and two copies of these rules is two rules the moment one of them is changed.
 */

export const MAX_PHONE_LENGTH = 30;
const MIN_PHONE_DIGITS = 7;

/** Digits and the separators the approved placeholders use, and nothing else. */
const PHONE_CHARACTERS = /^[+(\d][\d\s()-]*$/;
/** Prose has to say something rather than being digits or punctuation alone. */
const HAS_LETTER = /\p{L}/u;
/** Characters that only ever arrive as an injection attempt, never as part of a real answer. */
const MARKUP_CHARACTERS = /[<>{}\\|^~`]/;
const HAS_NON_SPACE = /\S/;

/**
 * Free prose the person typed — a name, a company, a city, a free-text specialty.
 *
 * It stops short of "letters and separators only", which would refuse a name carrying a digit.
 * That is a stricter rule than the product has ever held and is not taken here unasked.
 */
export const prose = (max: number): Joi.StringSchema =>
  Joi.string()
    .trim()
    .min(1)
    .max(max)
    .pattern(HAS_LETTER, { name: 'letter' })
    .pattern(MARKUP_CHARACTERS, { name: 'markup', invert: true })
    .messages({
      'string.pattern.name': 'must contain at least one letter',
      'string.pattern.invert.name': 'must not contain markup characters',
    });

/**
 * A structural guard, not a numbering plan. It refuses input that cannot be a phone number at all
 * and takes no position on which numbers are valid, because D27 has not settled that.
 */
export const phone = (): Joi.StringSchema =>
  Joi.string()
    .trim()
    .max(MAX_PHONE_LENGTH)
    .pattern(PHONE_CHARACTERS)
    .custom((value: string, helpers) =>
      (value.match(/\d/g) ?? []).length >= MIN_PHONE_DIGITS ? value : helpers.error('any.invalid'),
    )
    .messages({
      'string.pattern.base': 'must contain digits, spaces, hyphens, parentheses or + only',
      'any.invalid': `must contain at least ${MIN_PHONE_DIGITS} digits`,
    });

/**
 * The approved policy — eight characters — with the one addition that eight spaces is not eight
 * characters. The value is never trimmed: altering a credential on the way in would mean the
 * password stored is not the password typed.
 */
export const password = (min: number, max: number): Joi.StringSchema =>
  Joi.string()
    .min(min)
    .max(max)
    .pattern(HAS_NON_SPACE, { name: 'content' })
    .messages({ 'string.pattern.name': 'must contain more than whitespace' });
