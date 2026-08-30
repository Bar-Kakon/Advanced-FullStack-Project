/**
 * The construction types the domain names, and nothing else. `וילה` and `בית פרטי` are separate
 * values by owner decision, not synonyms. The findings end with `וכדומה`, so the list is open —
 * which `other` plus its free text is how the model represents rather than by guessing more values.
 */
export const PROJECT_TYPES = ['villa', 'private_house', 'building', 'other'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const OTHER_PROJECT_TYPE: ProjectType = 'other';
