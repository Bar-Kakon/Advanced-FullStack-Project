/**
 * The base working-calendar configuration. Exceptions are a separate concept with their own
 * lifecycle (D23) and are never stored inside this shape.
 */
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The sector decides the fixed holiday set — the one constant the findings call unchanging. */
export const SECTORS = ['jewish', 'arab', 'mixed'] as const;
export type Sector = (typeof SECTORS)[number];

export interface WorkingHours {
  /** Minutes from midnight, so a comparison never depends on a timezone. Default 07:00–16:00. */
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface WorkingCalendarConfig {
  readonly workingDays: readonly Weekday[];
  readonly hours: WorkingHours;
  readonly sector: Sector;
  /** Per-contractor optional non-working days named in the findings. */
  readonly worksCholHaMoed: boolean;
  readonly worksMemorialDays: boolean;
}

export const DEFAULT_WORKING_CALENDAR: WorkingCalendarConfig = {
  workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
  hours: { startMinute: 7 * 60, endMinute: 16 * 60 },
  sector: 'jewish',
  worksCholHaMoed: false,
  worksMemorialDays: false,
};

/**
 * A project override replaces whole fields of the pinned version, never merges inside one. A
 * partially-merged `workingDays` would be impossible to explain to the person reading the screen.
 */
export type WorkingCalendarOverrides = Partial<WorkingCalendarConfig>;

export const resolveEffectiveCalendar = (
  base: WorkingCalendarConfig,
  overrides: WorkingCalendarOverrides | undefined,
): WorkingCalendarConfig => ({ ...base, ...(overrides ?? {}) });
