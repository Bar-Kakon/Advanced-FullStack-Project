import type { Types } from 'mongoose';

import type { FileAssetRecord, FileVisibility } from '../files/fileAsset.model.js';

/**
 * What leaves the server for one version of one plan.
 *
 * There is no `owner`, no `versionGroup` beyond the id needed to ask for history, and no storage
 * id: an identifier a viewer does not need is an identifier that can be correlated later.
 */
export interface WorkPlanDto {
  readonly id: string;
  readonly planId: string;
  readonly version: number;
  readonly isCurrent: boolean;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly visibility: FileVisibility;
  /** The responsible party, never the confidential delegate. `null` when nobody can be named. */
  readonly uploadedByName: string | null;
}

/** Whose name may stand against this upload; a private row keeps its real uploader. */
export const attributableUploader = (
  asset: Pick<FileAssetRecord, 'owner' | 'visibility'>,
  responsibleParty: Types.ObjectId | null,
  delegate: Types.ObjectId | null,
): Types.ObjectId | null => {
  if ((asset.visibility ?? 'shared') === 'private') return asset.owner;
  if (delegate !== null && asset.owner.equals(delegate)) return responsibleParty;
  return asset.owner;
};

export const toWorkPlanDto = (asset: FileAssetRecord, uploadedByName: string | null): WorkPlanDto => ({
  id: asset._id.toString(),
  planId: (asset.versionGroup ?? asset._id).toString(),
  version: asset.version ?? 1,
  isCurrent: asset.isCurrent ?? false,
  filename: asset.filename,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  uploadedAt: asset.uploadedAt.toISOString(),
  visibility: asset.visibility ?? 'shared',
  uploadedByName,
});
