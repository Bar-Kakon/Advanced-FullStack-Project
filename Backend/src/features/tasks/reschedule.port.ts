/**
 * The entry point Task Detail offers for asking to move a date, and the seam the cascade will
 * plug into.
 *
 * The cascade policy is closed — every dependent date moves with per-affected approval, a 72-hour
 * window, the GC resolving partial answers — but the proposal domain that carries it is not built.
 * So the port answers `available: false` and the screen says the request cannot be raised yet,
 * rather than accepting a request nothing would ever act on.
 */
export interface RescheduleRequestPort {
  readonly available: boolean;
  /** How many other pieces of work a move would touch. `null` while nothing can compute it. */
  impactOf(taskId: string): Promise<number | null>;
}

export const unbuiltReschedulePort: RescheduleRequestPort = {
  available: false,
  async impactOf() {
    return null;
  },
};
