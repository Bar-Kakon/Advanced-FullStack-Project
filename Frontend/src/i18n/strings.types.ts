import type { he } from './strings.he';

/**
 * The shape of one language's resource, derived from the Hebrew file rather than hand-written.
 *
 * `DeepMutable` strips the `as const` readonly markers so English can be an ordinary object, and
 * widens the literal types — Hebrew's `dividerOr: 'או'` becomes `string`, otherwise English would have
 * to repeat the Hebrew word to satisfy the type. Array lengths stay fixed, so an English `features`
 * list with two entries where Hebrew has three is a compile error rather than a missing bullet.
 */
type DeepMutable<T> = T extends readonly (infer E)[]
  ? { -readonly [K in keyof T]: DeepMutable<E> }
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T extends string
      ? string
      : T;

export type Strings = DeepMutable<typeof he>;

/** The two languages the product ships in. Hebrew is the default everywhere. */
export type Language = 'he' | 'en';
