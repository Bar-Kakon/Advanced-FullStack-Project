import { Types } from 'mongoose';

import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { CompanyPosition } from '../companies/companyMembership.model.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ContactVisibility } from '../users/user.model.js';
import type { PhoneVisibilityReason } from './publicProfile.dto.js';

export interface PhoneVisibilityInput {
  readonly viewerId: string;
  readonly subjectId: string;
  readonly subjectContactVisibility?: ContactVisibility;
}

export interface PhoneVisibilityService {
  decide(input: PhoneVisibilityInput): Promise<PhoneVisibilityReason>;
}

export interface PhoneVisibilityDependencies {
  readonly access: ProjectAccessRepository;
  readonly memberships: CompanyMembershipRepository;
}

/**
 * The coordinating jobs D15 names, and exactly these. `main_contractor` is answered by the project
 * role instead, because קבלן ביצוע ראשי is what somebody is on one job rather than in their company.
 */
const APPROVED_COORDINATING_POSITIONS: readonly CompanyPosition[] = [
  'site_manager',
  'construction_manager',
  'regional_construction_manager',
];

const asObjectId = (value: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;

/**
 * D15, enforced on the server.
 *
 * Automatic disclosure comes from an approved coordinating ROLE on a project both people are active
 * on. It is never read from `schedule.change.manage`, from `fullAuthority`, or from any other
 * project permission: a grant says what somebody may do, not whose number they may read.
 *
 * A delegate is deliberately not a project member, so the confidential-delegation wall is never
 * crossed by the shared-project test.
 */
export const createPhoneVisibilityService = ({
  access,
  memberships,
}: PhoneVisibilityDependencies): PhoneVisibilityService => ({
  async decide({ viewerId, subjectId, subjectContactVisibility }) {
    if (viewerId === subjectId) return 'self';

    const viewer = asObjectId(viewerId);
    const subject = asObjectId(subjectId);
    if (viewer === null || subject === null) return 'hidden_no_approved_case';

    const [viewerMemberships, subjectMemberships] = await Promise.all([
      access.listActiveMembershipsForUser(viewer),
      access.listActiveMembershipsForUser(subject),
    ]);

    const subjectProjects = new Set(subjectMemberships.map((row) => row.project.toString()));
    const shared = viewerMemberships.filter((row) => subjectProjects.has(row.project.toString()));

    if (shared.length > 0) {
      if (shared.some((row) => row.projectRole === 'main_contractor')) {
        return 'visible_shared_project_role';
      }

      const companyMembership = await memberships.findActiveByUser(viewerId);
      const position = companyMembership?.companyPosition;
      if (position !== undefined && APPROVED_COORDINATING_POSITIONS.includes(position)) {
        return 'visible_shared_project_role';
      }
    }

    // Outside the approved automatic cases the professional's own setting is the only answer, and
    // an unset one stays private. Being connected is not consulted and grants nothing.
    return subjectContactVisibility === 'public'
      ? 'visible_contact_setting'
      : 'hidden_no_approved_case';
  },
});
