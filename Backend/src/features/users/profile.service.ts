import { Types } from 'mongoose';

import type { CompanyRepository } from '../companies/company.repository.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { CompanyMembershipRecord } from '../companies/companyMembership.model.js';
import type { FileAssetRecord } from '../files/fileAsset.model.js';
import type { FileAssetService, StoredUpload } from '../files/fileAsset.service.js';
import type { WorkEntryRecord } from '../workentries/workEntry.model.js';
import type { WorkEntryRepository } from '../workentries/workEntry.repository.js';
import type { ProfileDto, WorkEntryDto } from './profile.dto.js';
import {
  noActiveCompany,
  notPermittedToEditCompany,
  profileNotFound,
  workEntryNotFound,
  workLinkNotVerifiable,
} from './profile.errors.js';
import type { CompanyUpdateBody, ProfileUpdateBody, WorkEntryBody } from './profile.validation.js';
import type { UserRepository } from './user.repository.js';
import type { WorkVerificationService } from './workEntryVerification.service.js';

/** The capability that governs the company's own record. Granted explicitly, never inferred. */
const COMPANY_EDIT_PERMISSION = 'company.manage';

export interface ProfileService {
  get(userId: string): Promise<ProfileDto>;
  update(userId: string, patch: ProfileUpdateBody): Promise<ProfileDto>;
  updateCompany(userId: string, patch: CompanyUpdateBody): Promise<ProfileDto>;
  addWorkEntry(userId: string, entry: WorkEntryBody, upload: StoredUpload | null): Promise<WorkEntryDto>;
  removeWorkEntry(userId: string, entryId: string): Promise<void>;
  setAvatar(userId: string, upload: StoredUpload): Promise<ProfileDto>;
  removeAvatar(userId: string): Promise<ProfileDto>;
  openAsset(userId: string, assetId: string): Promise<OpenedAsset>;
}

export interface OpenedAsset {
  readonly asset: FileAssetRecord;
  readonly stream: NodeJS.ReadableStream;
}

export interface ProfileDependencies {
  readonly users: UserRepository;
  readonly companies: CompanyRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly workEntries: WorkEntryRepository;
  readonly files: FileAssetService;
  readonly verification: WorkVerificationService;
}

const assetUrl = (fileId: Types.ObjectId | undefined): string | null =>
  fileId === undefined ? null : `/api/users/me/assets/${fileId.toString()}`;

const toWorkEntryDto = (entry: WorkEntryRecord): WorkEntryDto => ({
  id: entry._id.toString(),
  title: entry.title,
  ...(entry.scope === undefined ? {} : { scope: entry.scope }),
  meta: entry.meta,
  // Derived from stored server state, never echoed from a request.
  onFieldSync: entry.fieldSyncVerifiedAt !== undefined && entry.fieldSyncVerifiedAt !== null,
  imageUrl: assetUrl(entry.image),
});

export const createProfileService = ({
  users,
  companies,
  memberships,
  workEntries,
  files,
  verification,
}: ProfileDependencies): ProfileService => {
  /** The caller's live company relationship, or null. Never trusted for authority on its own. */
  const activeMembership = async (userId: string): Promise<CompanyMembershipRecord | null> =>
    memberships.findActiveByUser(userId);

  /** Deletes an asset the caller owns, bytes included. A missing row is already the goal. */
  const removeAsset = async (assetId: Types.ObjectId, owner: Types.ObjectId): Promise<void> => {
    const asset = await files.findOwned(assetId, owner);
    if (asset !== null) await files.remove(assetId, asset.storage.fileId);
  };

  const assemble = async (userId: string): Promise<ProfileDto> => {
    const user = await users.findProfileById(userId);
    if (user === null) throw profileNotFound();

    const membership = await activeMembership(userId);
    // Each value comes from the document that owns it. Nothing is mirrored onto the user to make
    // this read cheaper — a copy is a second place for the truth to live.
    const company = membership === null ? null : await companies.findById(membership.company);
    const entries = await workEntries.listByOwner(user._id);

    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      language: user.language,
      profileComplete: user.profileComplete,

      bio: user.bio ?? '',
      specialties: user.specialties ?? [],
      specialtyOther: user.specialtyOther ?? '',
      businessPhone: user.businessPhone ?? '',
      city: user.location?.city ?? '',
      region: user.location?.region ?? null,
      place: user.location?.place ?? null,
      travelRadiusKm: user.location?.travelRadiusKm ?? null,
      delayToleranceDays: user.schedulingPrefs?.delayToleranceDays ?? null,
      noticeRequiredDays: user.schedulingPrefs?.noticeRequiredDays ?? null,
      avatarUrl: assetUrl(user.avatar?.fileId),

      companyName: company?.name ?? null,
      officePhone: company?.officePhone ?? null,
      availability: company?.availability ?? null,

      standing: membership?.standing ?? null,
      companyPosition: membership?.companyPosition ?? null,
      companyMembershipActive: membership !== null,

      rating: null,
      flexibility: null,
      ratings: [],

      work: entries.map(toWorkEntryDto),
    };
  };

  /**
   * Company writes need company authority, and the only thing that grants it is the permission
   * recorded on the caller's own **active** membership. A pending employee has no active row and
   * so cannot reach this at all, which is the rule the lifecycle already implies.
   */
  const requireCompanyEditor = async (userId: string): Promise<Types.ObjectId> => {
    const membership = await activeMembership(userId);
    if (membership === null) throw noActiveCompany();
    if (!membership.permissions.includes(COMPANY_EDIT_PERMISSION)) throw notPermittedToEditCompany();

    return membership.company;
  };

  return {
    get: assemble,

    async update(userId, patch) {
      const user = await users.findProfileById(userId);
      if (user === null) throw profileNotFound();

      await users.updateProfile(user._id, patch);
      return assemble(userId);
    },

    async updateCompany(userId, patch) {
      const companyId = await requireCompanyEditor(userId);
      await companies.update(companyId, patch);

      return assemble(userId);
    },

    /**
     * The upload has already been written to GridFS by the time this runs, so every failure below
     * has to take the bytes with it — there is no transaction spanning a file store and a
     * collection, and pretending otherwise is how orphans are made.
     */
    async addWorkEntry(userId, entry, upload) {
      const user = await users.findProfileById(userId);
      if (user === null) {
        if (upload) await files.discardOrphan(upload.gridFsFileId);
        throw profileNotFound();
      }

      const link = {
        ...(entry.projectId ? { project: new Types.ObjectId(entry.projectId) } : {}),
        ...(entry.taskId ? { task: new Types.ObjectId(entry.taskId) } : {}),
      };
      const linked = link.project !== undefined || link.task !== undefined;

      let verifiedAt: Date | null = null;
      if (linked) {
        verifiedAt = await verification.verify(user._id, link);
        // A link the server cannot prove is refused rather than stored unverified: a silently
        // dropped link would leave an entry claiming a relationship nothing backs.
        if (verifiedAt === null) {
          if (upload) await files.discardOrphan(upload.gridFsFileId);
          throw workLinkNotVerifiable();
        }
      }

      let imageId: Types.ObjectId | undefined;
      if (upload) {
        const asset = await files.record(user._id, 'work_entry', upload);
        imageId = asset._id;
      }

      try {
        const created = await workEntries.create({
          owner: user._id,
          title: entry.title,
          ...(entry.scope === undefined ? {} : { scope: entry.scope }),
          meta: entry.meta,
          ...link,
          ...(verifiedAt === null ? {} : { fieldSyncVerifiedAt: verifiedAt }),
          ...(imageId === undefined ? {} : { image: imageId }),
        });
        return toWorkEntryDto(created);
      } catch (error) {
        // The row failed after the bytes landed. Compensate explicitly.
        if (imageId && upload) await files.remove(imageId, upload.gridFsFileId);
        throw error;
      }
    },

    async removeWorkEntry(userId, entryId) {
      const user = await users.findProfileById(userId);
      if (user === null) throw profileNotFound();

      // The owner is part of the lookup, so another person's entry is simply not found.
      const entry = await workEntries.findOwnedById(entryId, user._id);
      if (entry === null) throw workEntryNotFound();

      const removed = await workEntries.deleteOwnedById(entryId, user._id);
      if (!removed) throw workEntryNotFound();

      // The image goes with the entry that referenced it, so removal leaves nothing orphaned.
      if (entry.image) await removeAsset(entry.image, user._id);
    },

    async setAvatar(userId, upload) {
      const user = await users.findProfileById(userId);
      if (user === null) {
        await files.discardOrphan(upload.gridFsFileId);
        throw profileNotFound();
      }

      const previous = user.avatar?.fileId;
      const asset = await files.record(user._id, 'avatar', upload);

      try {
        await users.setAvatarFile(user._id, asset._id);
      } catch (error) {
        await files.remove(asset._id, upload.gridFsFileId);
        throw error;
      }

      // Replacement deletes what it replaced, so a profile never accumulates dead avatars.
      if (previous) await removeAsset(previous, user._id);

      return assemble(userId);
    },

    /** Ownership is the whole check: the asset is looked up by id **and** by this caller. */
    async openAsset(userId, assetId) {
      const user = await users.findProfileById(userId);
      if (user === null) throw profileNotFound();

      return files.openOwnedStream(assetId, user._id);
    },

    async removeAvatar(userId) {
      const user = await users.findProfileById(userId);
      if (user === null) throw profileNotFound();

      const current = user.avatar?.fileId;
      await users.setAvatarFile(user._id, null);

      if (current) await removeAsset(current, user._id);

      return assemble(userId);
    },
  };
};
