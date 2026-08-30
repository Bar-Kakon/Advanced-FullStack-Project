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

/**
 * Whose name may stand against this upload.
 *
 * A delegate performs work the party above is never told about, so their identity may not travel
 * with a file. Where the uploader IS the delegate, the row is attributed to the responsible party
 * — the delegator — which is the same rule Flexibility and the task counterparty already follow.
 *
 * This is the second of two guards. The first is structural: `mayUploadShared` refuses a delegate
 * a `shared` row at all, so no upward-facing row can carry a delegate's identity in the first
 * place. This one holds even if that rule is ever loosened.
 */
export const attributableUploader = (
  owner: Types.ObjectId,
  responsibleParty: Types.ObjectId | null,
  delegate: Types.ObjectId | null,
): Types.ObjectId | null => {
  if (delegate !== null && owner.equals(delegate)) return responsibleParty;
  return owner;
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
