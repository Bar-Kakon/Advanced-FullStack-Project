import { Types } from 'mongoose';

import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { CompanyPosition } from '../companies/companyMembership.model.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { normalizeVisibilityChoice, type ContactVisibility } from '../users/user.model.js';
import type { PhoneVisibilityReason } from './publicProfile.dto.js';
import type { WorkCommitmentPort } from './workCommitment.port.js';

export interface PhoneVisibilityInput {
  readonly viewerId: string;
  readonly subjectId: string;
  readonly subjectContactVisibility?: ContactVisibility;
}

/** One answer per field: the two numbers are decided independently and never ride together. */
export interface PhoneVisibilityDecision {
  readonly businessPhone: PhoneVisibilityReason;
  readonly officePhone: PhoneVisibilityReason;
}

export interface PhoneVisibilityService {
  decide(input: PhoneVisibilityInput): Promise<PhoneVisibilityDecision>;
}

export interface PhoneVisibilityDependencies {
  readonly access: ProjectAccessRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly commitments: WorkCommitmentPort;
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
 * D15, enforced on the server, in the owner's final precedence: self · explicit hidden · explicit
 * always · approved project role · recognized Work Commitment · otherwise hidden. The explicit
 * choice always beats the relationship defaults, and each field answers for itself.
 *
 * Automatic disclosure comes from an approved coordinating ROLE on a project both people are active
 * on, or from a Work Commitment the two once established — never from `schedule.change.manage`,
 * from `fullAuthority`, or from any other grant. Being connected is not consulted and grants
 * nothing. A delegate is deliberately not a project member, so the confidential-delegation wall is
 * never crossed by the shared-project test.
 */
export const createPhoneVisibilityService = ({
  access,
  memberships,
  commitments,
}: PhoneVisibilityDependencies): PhoneVisibilityService => {
  const relationshipCase = async (
    viewer: Types.ObjectId,
    subject: Types.ObjectId,
    viewerId: string,
  ): Promise<PhoneVisibilityReason | null> => {
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

    // Once established, a commitment stays a recognized basis — the work ending never revokes it.
    if (await commitments.wasEstablishedBetween(viewer, subject)) {
      return 'visible_work_commitment';
    }

    return null;
  };

  return {
    async decide({ viewerId, subjectId, subjectContactVisibility }) {
      if (viewerId === subjectId) return { businessPhone: 'self', officePhone: 'self' };

      const viewer = asObjectId(viewerId);
      const subject = asObjectId(subjectId);
      if (viewer === null || subject === null) {
        return {
          businessPhone: 'hidden_no_approved_case',
          officePhone: 'hidden_no_approved_case',
        };
      }

      const business = normalizeVisibilityChoice(subjectContactVisibility?.businessPhone);
      const office = normalizeVisibilityChoice(subjectContactVisibility?.officePhone);

      // The relationship cases are read once, and only when some field actually defers to them.
      const automatic =
        business === 'default' || office === 'default'
          ? await relationshipCase(viewer, subject, viewerId)
          : null;

      const forField = (choice: typeof business): PhoneVisibilityReason =>
        choice === 'hidden'
          ? 'hidden_no_approved_case'
          : choice === 'always'
            ? 'visible_contact_setting'
            : automatic ?? 'hidden_no_approved_case';

      return { businessPhone: forField(business), officePhone: forField(office) };
    },
  };
};
