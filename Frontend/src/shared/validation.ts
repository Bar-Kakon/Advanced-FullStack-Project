/**
 * The one email shape the client accepts, so Register and Login cannot disagree about what an
 * address looks like. It is deliberately the pattern the static prototypes carried in their
 * `pattern` attributes — the server's Joi `.email()` is the real check, and this only decides when
 * the screen may stop asking the person to correct the box in front of them.
 */
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
