import type { PhoneVisibilityReason } from './publicProfile.dto.js';

export interface PhoneVisibilityInput {
  readonly viewerId: string;
  readonly subjectId: string;
}

export interface PhoneVisibilityService {
  decide(input: PhoneVisibilityInput): Promise<PhoneVisibilityReason>;
}

/**
 * D15, enforced on the server. The two approved automatic cases are a shared project role
 * (GC / Site Manager / Construction Manager) and the two parties to a Work Commitment. Neither can
 * be evaluated yet: Projects, Tasks and Work Commitments are unbuilt, and the professional's own
 * visibility control has no storage.
 *
 * So every viewer but the subject is refused. That is the safe direction — it withholds a number
 * that might have been showable, rather than exposing one that must not be.
 */
export const createPhoneVisibilityService = (): PhoneVisibilityService => ({
  async decide({ viewerId, subjectId }) {
    if (viewerId === subjectId) return 'self';

    return 'hidden_no_approved_case';
  },
});