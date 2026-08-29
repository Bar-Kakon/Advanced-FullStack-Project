import type { AuthenticatedUser, Availability, Region, Trade } from '../../api/types';
import type { Language } from '../../i18n/strings.types';

/**
 * What the two profile screens render, and where it comes from.
 *
 * **The API has no profile endpoint.** `features/users/` on the server is a model and a
 * repository with no controller and no route, and the router mounts `/health`, `/health-auth` and
 * `/auth` and nothing else. So there is no `GET` that returns this shape and no `PATCH` that
 * accepts it, and inventing either here would be inventing a contract.
 *
 * What the screens therefore do is state exactly which parts are real. `firstName`, `lastName`
 * and `email` come from the authenticated user Login actually returned. Everything else is the
 * representative data the static prototype rendered, carried across unchanged so the screens can
 * be reviewed against the approved design — it is a stand-in for an endpoint, not a claim.
 */

/** D14's heavy-equipment half has no schema anywhere. These are the prototype's ten codes. */
export const EQUIPMENT_CODES = [
  'excavator', 'backhoe', 'drill_rig', 'mini_excavator', 'crawler',
  'jcb', 'wheel_loader', 'bobcat', 'bulldozer', 'hooklift_truck',
] as const;

export type EquipmentCode = (typeof EQUIPMENT_CODES)[number];

export interface CompletedWorkEntry {
  readonly id: string;
  readonly title: string;
  /** Absent on a free-standing entry — D13 allows an entry that links to nothing. */
  readonly scope?: string;
  readonly meta: string;
  /** Only an entry whose linked work is itself complete carries the badge (D13, 2026-08-19). */
  readonly onFieldSync: boolean;
}

export interface ReceivedRating {
  readonly id: string;
  readonly score: number;
  /** Month and year only. The exact date and the task context are withheld deliberately. */
  readonly date: string;
  readonly body: string;
}

export interface ProfileView {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** D28: required at owner registration, public, and searchable. The professional identity. */
  readonly companyName: string;
  readonly specialties: readonly Trade[];
  readonly specialtyOther: string;
  readonly bio: string;
  readonly city: string;
  readonly region: Region;
  readonly travelRadiusKm: number;
  /** D14: the *organization's* work availability. Never any employee's personal availability. */
  readonly availability: Availability;
  /** `companies.officePhone`. Optional, and independent of `businessPhone` in both directions. */
  readonly officePhone: string;
  /** `users.businessPhone`. Optional, and independent of `officePhone` in both directions. */
  readonly businessPhone: string;
  readonly equipment: readonly EquipmentCode[];
  readonly delayToleranceDays: number;
  readonly noticeRequiredDays: number;
  /** `null` is the cold start: a neutral mark and no number, never a default score (D6). */
  readonly rating: { readonly value: number; readonly count: number } | null;
  readonly flexibility: { readonly score: number; readonly responses: number; readonly updatedMonth: string } | null;
  readonly ratings: readonly ReceivedRating[];
  readonly work: readonly CompletedWorkEntry[];
}

/** The free-text values the prototype held twice, once per language. */
const REPRESENTATIVE: Record<Language, {
  companyName: string;
  bio: string;
  city: string;
  flexibilityMonth: string;
  work: readonly CompletedWorkEntry[];
  ratings: readonly ReceivedRating[];
}> = {
  he: {
    companyName: 'כאכון בנייה בע״מ',
    bio: 'בטון ותבניות. 14 שנה, בעיקר במגדלי מגורים.',
    city: 'חיפה',
    flexibilityMonth: 'יולי 2026',
    work: [
      { id: 'w1', title: 'מגדלי הצפון', scope: 'ניהול הפרויקט', meta: 'חיפה · יולי 2026', onFieldSync: true },
      { id: 'w2', title: 'יציקת שלד', scope: 'משימה בפרויקט מגדלי הצפון', meta: 'חיפה · מאי 2026', onFieldSync: true },
      { id: 'w3', title: 'ממ״ד פרטי', meta: 'חיפה · 2024', onFieldSync: false },
    ],
    ratings: [
      { id: 'r1', score: 5, date: 'יולי 2026', body: 'יצק ביום שנקבע, והתריע על עיכוב בברזל מוקדם.' },
      { id: 'r2', score: 4, date: 'יוני 2026', body: 'עבודה טובה ונקייה. הגיע יום אחרי מה שסוכם, אבל הודיע מראש.' },
      { id: 'r3', score: 5, date: 'מאי 2026', body: 'לקח על עצמו ממ״ד בלוח זמנים לחוץ וסגר אותו בזמן.' },
    ],
  },
  en: {
    companyName: 'Kakon Construction Ltd.',
    bio: 'Concrete and formwork. 14 years, mostly residential towers.',
    city: 'Haifa',
    flexibilityMonth: 'July 2026',
    work: [
      { id: 'w1', title: 'Northern Towers', scope: 'Project lead', meta: 'Haifa · July 2026', onFieldSync: true },
      { id: 'w2', title: 'Shell pour', scope: 'Task in Northern Towers', meta: 'Haifa · May 2026', onFieldSync: true },
      { id: 'w3', title: 'Private safe room', meta: 'Haifa · 2024', onFieldSync: false },
    ],
    ratings: [
      { id: 'r1', score: 5, date: 'July 2026', body: 'Poured on the agreed day, and flagged the rebar delay early.' },
      { id: 'r2', score: 4, date: 'June 2026', body: 'Good, clean work. Arrived a day after what we agreed, but told me in advance.' },
      { id: 'r3', score: 5, date: 'May 2026', body: 'Took on a safe room on a tight schedule and closed it on time.' },
    ],
  },
};

/**
 * The real identity from Login, plus the prototype's representative values for everything the API
 * cannot answer. `users.phone` — the personal / login number — is deliberately absent from this
 * type entirely: D15 says it is never displayed anywhere, and a field that does not exist here
 * cannot be rendered by a later edit.
 */
export const representativeProfile = (user: AuthenticatedUser | null, lang: Language): ProfileView => {
  const sample = REPRESENTATIVE[lang];

  return {
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    companyName: sample.companyName,
    specialties: ['concrete', 'shell', 'saferoom'],
    specialtyOther: '',
    bio: sample.bio,
    city: sample.city,
    region: 'haifa',
    travelRadiusKm: 70,
    availability: 'open',
    officePhone: '04-8123456',
    businessPhone: '052-555-0123',
    equipment: [],
    delayToleranceDays: 3,
    noticeRequiredDays: 2,
    rating: { value: 4.6, count: 23 },
    flexibility: { score: 78, responses: 31, updatedMonth: sample.flexibilityMonth },
    ratings: sample.ratings,
    work: sample.work,
  };
};

/** Two letters for the avatar, taken from the person's own name rather than stored anywhere. */
export const initialsOf = (firstName: string, lastName: string): string =>
  `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`;
