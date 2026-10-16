import type { Types } from 'mongoose';

export interface WorkLink {
  readonly project?: Types.ObjectId;
  readonly task?: Types.ObjectId;
}

export interface WorkVerificationService {
  /** `null` means "not verifiable", which is every link until projects and tasks exist. */
  verify(owner: Types.ObjectId, link: WorkLink): Promise<Date | null>;
  readonly linkingSupported: boolean;
}

/**
 * Decides whether an entry may carry the `Completed on Blokta` badge, from canonical data only.
 *
 * Projects and tasks are Stage 3, so today there is nothing to look up and nothing that can be
 * proved. Refusing every link is the honest answer: guessing `true` would also risk publishing the
 * delegation D13 exists to hide. When those collections land, the checks go here and nothing else
 * changes.
 */
export const workVerificationService: WorkVerificationService = {
  linkingSupported: false,

  async verify() {
    return null;
  },
};
