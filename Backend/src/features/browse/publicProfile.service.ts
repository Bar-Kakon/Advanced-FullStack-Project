import type { BlocksService } from '../blocks/blocks.service.js';
import type { RelationshipService } from '../connections/relationship.service.js';
import type { RatingRepository } from '../ratings/rating.repository.js';
import type { CompanyRepository } from '../companies/company.repository.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { WorkEntryRepository } from '../workentries/workEntry.repository.js';
import type { FileAssetRecord } from '../files/fileAsset.model.js';
import type { FileAssetService } from '../files/fileAsset.service.js';
import type { PhoneVisibilityService } from './phoneVisibility.service.js';
import { contractorNotFound } from './browse.errors.js';
import type { PublicProfileDto, PublicWorkEntryDto } from './publicProfile.dto.js';

export interface OpenedPublicAsset {
  readonly asset: FileAssetRecord;
  readonly stream: NodeJS.ReadableStream;
}

export interface PublicProfileService {
  forViewer(viewerId: string, subjectUserId: string): Promise<PublicProfileDto>;
  openAvatar(viewerId: string, subjectUserId: string): Promise<OpenedPublicAsset>;
  openWorkImage(viewerId: string, subjectUserId: string, entryId: string): Promise<OpenedPublicAsset>;
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
  readonly files: FileAssetService;
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
  files,
}: PublicProfileDependencies): PublicProfileService => {
  /** The subject a viewer is allowed to read at all, or nothing they can tell apart from missing. */
  const visibleSubject = async (viewerId: string, subjectUserId: string) => {
    const hidden = await blocks.hiddenUserIdsFor(viewerId);
    if (hidden.some((id) => id.toString() === subjectUserId)) throw contractorNotFound();

    const subject = await users.findProfileById(subjectUserId);
    if (subject === null || subject.status !== 'active') throw contractorNotFound();

    return subject;
  };

  return {
  async forViewer(viewerId, subjectUserId) {
    const subject = await visibleSubject(viewerId, subjectUserId);

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
      imageUrl: entry.image
        ? `/api/browse/contractors/${subjectUserId}/work-entries/${entry._id.toString()}/image`
        : null,
    }));

    return {
      userId: subjectUserId,
      firstName: subject.firstName,
      lastName: subject.lastName,
      companyName: company?.name ?? null,
      registrationCategory: subject.registrationCategory,
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

  async openAvatar(viewerId, subjectUserId) {
    const subject = await visibleSubject(viewerId, subjectUserId);
    const fileId = subject.avatar?.fileId;
    if (fileId === undefined) throw contractorNotFound();

    return files.openOwnedStream(fileId.toString(), subject._id);
  },

  async openWorkImage(viewerId, subjectUserId, entryId) {
    const subject = await visibleSubject(viewerId, subjectUserId);

    const entry = await workEntries.findOwnedById(entryId, subject._id);
    if (entry === null || entry.image === undefined) throw contractorNotFound();

    return files.openOwnedStream(entry.image.toString(), subject._id);
  },
  };
};