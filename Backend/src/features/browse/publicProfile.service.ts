import type { BlocksService } from '../blocks/blocks.service.js';
import type { RelationshipService } from '../connections/relationship.service.js';
import type { RatingRepository } from '../ratings/rating.repository.js';
import type { CompanyRepository } from '../companies/company.repository.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { WorkEntryRepository } from '../workentries/workEntry.repository.js';
import type { PhoneVisibilityService } from './phoneVisibility.service.js';
import { contractorNotFound } from './browse.errors.js';
import type { PublicProfileDto, PublicWorkEntryDto } from './publicProfile.dto.js';

export interface PublicProfileService {
  forViewer(viewerId: string, subjectUserId: string): Promise<PublicProfileDto>;
}

export interface PublicProfileDependencies {
  readonly users: UserRepository;
  readonly companies: CompanyRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly workEntries: WorkEntryRepository;
  readonly ratings: RatingRepository;
  readonly relationships: RelationshipService;
  readonly blocks: BlocksService;
  readonly phones: PhoneVisibilityService;
}

export const createPublicProfileService = ({
  users,
  companies,
  memberships,
  workEntries,
  ratings,
  relationships,
  blocks,
  phones,
}: PublicProfileDependencies): PublicProfileService => ({
  async forViewer(viewerId, subjectUserId) {
    // A blocked person is not merely hidden from the list: their profile is not reachable either.
    const hidden = await blocks.hiddenUserIdsFor(viewerId);
    if (hidden.some((id) => id.toString() === subjectUserId)) throw contractorNotFound();

    const subject = await users.findProfileById(subjectUserId);
    if (subject === null || subject.status !== 'active') throw contractorNotFound();

    const membership = await memberships.findActiveByUser(subjectUserId);
    const company = membership ? await companies.findById(membership.company) : null;

    const [relationship, ratingSummary, entries, phoneVisibility] = await Promise.all([
      relationships.between(viewerId, subjectUserId),
      ratings.summaryFor(subjectUserId),
      workEntries.listByOwner(subject._id),
      phones.decide({ viewerId, subjectId: subjectUserId }),
    ]);

    const isSelf = viewerId === subjectUserId;
    const showPhones = phoneVisibility === 'self'
      || phoneVisibility === 'visible_shared_project_role'
      || phoneVisibility === 'visible_work_commitment';

    const work: PublicWorkEntryDto[] = entries.map((entry) => ({
      id: entry._id.toString(),
      title: entry.title,
      scope: entry.scope ?? null,
      meta: entry.meta,
      onFieldSync: entry.fieldSyncVerifiedAt !== undefined,
      imageUrl: entry.image ? `/api/users/me/assets/${entry.image.toString()}` : null,
    }));

    return {
      userId: subjectUserId,
      firstName: subject.firstName,
      lastName: subject.lastName,
      companyName: company?.name ?? null,
      specialties: subject.specialties ?? [],
      specialtyOther: subject.specialtyOther ?? null,
      city: subject.location?.city ?? null,
      region: subject.location?.region ?? null,
      avatarUrl: subject.avatar?.fileId
        ? `/api/browse/contractors/${subjectUserId}/avatar`
        : null,
      availability: company?.availability ?? null,
      relationship,
      rating: ratingSummary ? { average: ratingSummary.average, count: ratingSummary.count } : null,
      flexibility: null,
      drivingDistanceMeters: null,

      bio: subject.bio ?? null,
      companyPosition: membership?.companyPosition ?? null,
      travelRadiusKm: subject.location?.travelRadiusKm ?? null,
      basePlace: subject.location?.place ?? null,
      approvedTravelLocations: subject.approvedTravelLocations ?? [],
      schedulingPrefs: {
        delayToleranceDays: subject.schedulingPrefs?.delayToleranceDays ?? null,
        noticeRequiredDays: subject.schedulingPrefs?.noticeRequiredDays ?? null,
      },
      work,
      phones: {
        // The personal/login number is never in this shape at all.
        officePhone: showPhones ? company?.officePhone ?? null : null,
        businessPhone: showPhones ? subject.businessPhone ?? null : null,
        visibility: phoneVisibility,
      },
      rateable: isSelf
        ? { canRate: false, reason: 'self' }
        : { canRate: false, reason: 'no_shared_completed_task' },
      isSelf,
    };
  },
});