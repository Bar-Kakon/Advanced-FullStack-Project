import { Fragment } from 'react';

/** A Latin run: a word, and the punctuation that belongs inside it rather than beside it. */
const LATIN_RUN = /([A-Za-z][A-Za-z0-9]*(?:[.'’&-][A-Za-z0-9]+)*)/g;
/** The same shape, without `g` — a global regex carries `lastIndex` and would answer alternately. */
const IS_LATIN_RUN = /^[A-Za-z]/;

/**
 * One string with its Latin words isolated, so a Hebrew sentence keeps its own direction.
 *
 * `dir="auto"` resolves an element's direction from its first strong character, so a Hebrew
 * paragraph opening with `Blokta` resolves to left-to-right and lays the whole sentence out
 * backwards — the brand name lands at the end of the first line instead of the start. `<bdi>`
 * isolates the Latin run: it is excluded from that first-strong-character decision, and it cannot
 * reorder the Hebrew around it either.
 *
 * The text is never altered — it is only split at the boundaries and put back.
 */
export const Bidi = ({ text }: { text: string }) => (
  <>
    {text.split(LATIN_RUN).map((part, index) =>
      IS_LATIN_RUN.test(part) ? (
        <bdi dir="ltr" key={index}>{part}</bdi>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    )}
  </>
);
