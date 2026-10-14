import { Types } from 'mongoose';

import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { FileAssetRecord } from '../files/fileAsset.model.js';
import { ProjectModel, type ProjectRecord } from '../projects/project.model.js';
import { AgreementDocumentGrantModel, type AgreementDocumentGrantRecord } from './agreementDocumentGrant.model.js';
import type { AgreementOriginPort } from './agreementOrigin.port.js';
import { taskNotFound } from './task.errors.js';

export type DocumentViewerRole = 'party' | 'initiator' | 'principal' | 'grantee';

export interface DocumentStanding {
  readonly role: DocumentViewerRole;
  /** Only a relationship-holder may grant; a grantee may not pass access on. */
  readonly mayGrant: boolean;
  readonly attachments: readonly Types.ObjectId[];
}

export interface AgreementDocumentDto {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface DocumentAccessService {
  /** The viewer's standing toward one task's agreement documents, or null — rendered as not-found. */
  standingFor(userId: string, taskId: string): Promise<DocumentStanding | null>;
  list(userId: string, taskId: string): Promise<{
    documents: readonly AgreementDocumentDto[];
    viewer: { role: DocumentViewerRole; mayGrant: boolean };
    grants: readonly { userId: string; name: string; grantedAt: string }[];
  }>;
  grant(userId: string, taskId: string, granteeId: string): Promise<void>;
  revoke(userId: string, taskId: string, granteeId: string): Promise<void>;
}

export interface DocumentAccessDependencies {
  readonly origins: Pick<AgreementOriginPort, 'findDocumentsByTask'>;
  readonly access: ProjectAccessRepository;
  readonly participants: ParticipantRepository;
  readonly files: { listByIds(ids: readonly Types.ObjectId[]): Promise<FileAssetRecord[]> };
}

export const createDocumentAccessService = ({
  origins,
  access,
  participants,
  files,
}: DocumentAccessDependencies): DocumentAccessService => {
  const standingFor = async (userId: string, taskId: string): Promise<DocumentStanding | null> => {
    if (!Types.ObjectId.isValid(taskId)) return null;

    const documents = await origins.findDocumentsByTask(new Types.ObjectId(taskId));
    if (documents === null) return null;

    const attachments = documents.attachments;
    if (documents.proposer.toString() === userId || documents.accepter.toString() === userId) {
      return { role: 'party', mayGrant: true, attachments };
    }

    if (documents.project !== null) {
      const project = await ProjectModel.findById(documents.project)
        .select('createdBy')
        .lean<Pick<ProjectRecord, '_id' | 'createdBy'>>()
        .exec();
      if (project !== null && project.createdBy.toString() === userId) {
        return { role: 'initiator', mayGrant: true, attachments };
      }

      // Authority, never a displayed title: only the full-authority standing reads as principal.
      const membership = await access.findActiveMembership(documents.project, new Types.ObjectId(userId));
      if (membership !== null && membership.fullAuthority) {
        return { role: 'principal', mayGrant: true, attachments };
      }
    }

    const granted = await AgreementDocumentGrantModel.findOne({
      task: new Types.ObjectId(taskId),
      grantedTo: new Types.ObjectId(userId),
      revokedAt: { $exists: false },
    })
      .lean<AgreementDocumentGrantRecord>()
      .exec();
    if (granted !== null) return { role: 'grantee', mayGrant: false, attachments };

    return null;
  };

  const requireGrantor = async (userId: string, taskId: string): Promise<void> => {
    const standing = await standingFor(userId, taskId);
    if (standing === null || !standing.mayGrant) throw taskNotFound();
  };

  return {
    standingFor,

    async list(userId, taskId) {
      const standing = await standingFor(userId, taskId);
      if (standing === null) throw taskNotFound();

      const assets = await files.listByIds([...standing.attachments]);
      const documents = assets.map((asset) => ({
        id: asset._id.toString(),
        filename: asset.filename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      }));

      let grants: { userId: string; name: string; grantedAt: string }[] = [];
      if (standing.mayGrant) {
        const rows = await AgreementDocumentGrantModel.find({
          task: new Types.ObjectId(taskId),
          revokedAt: { $exists: false },
        })
          .lean<AgreementDocumentGrantRecord[]>()
          .exec();
        const people = await participants.findByIds(rows.map((row) => row.grantedTo));
        const names = new Map(people.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`.trim()]));
        grants = rows.map((row) => ({
          userId: row.grantedTo.toString(),
          name: names.get(row.grantedTo.toString()) ?? '',
          grantedAt: row.createdAt.toISOString(),
        }));
      }

      return { documents, viewer: { role: standing.role, mayGrant: standing.mayGrant }, grants };
    },

    async grant(userId, taskId, granteeId) {
      await requireGrantor(userId, taskId);
      if (!Types.ObjectId.isValid(granteeId) || granteeId === userId) throw taskNotFound();
      const [person] = await participants.findByIds([new Types.ObjectId(granteeId)]);
      if (person === undefined) throw taskNotFound();

      await AgreementDocumentGrantModel.findOneAndUpdate(
        { task: new Types.ObjectId(taskId), grantedTo: new Types.ObjectId(granteeId) },
        {
          $set: { grantedBy: new Types.ObjectId(userId) },
          $unset: { revokedAt: '', revokedBy: '' },
        },
        { upsert: true },
      ).exec();
    },

    async revoke(userId, taskId, granteeId) {
      await requireGrantor(userId, taskId);
      if (!Types.ObjectId.isValid(granteeId)) throw taskNotFound();

      const updated = await AgreementDocumentGrantModel.findOneAndUpdate(
        { task: new Types.ObjectId(taskId), grantedTo: new Types.ObjectId(granteeId), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokedBy: new Types.ObjectId(userId) } },
      ).exec();
      if (updated === null) throw taskNotFound();
    },
  };
};
