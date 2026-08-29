import { Schema, model, type Types } from 'mongoose';

/** What a stored file is attached to. Filtered on, never joined through. */
export const FILE_SCOPES = ['avatar', 'work_entry'] as const;
export type FileScope = (typeof FILE_SCOPES)[number];

/** Images only for now: the profile screens upload nothing else. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** The bytes live in GridFS; this row is the business record pointing at them. */
export interface FileAssetRecord {
  readonly _id: Types.ObjectId;
  readonly owner: Types.ObjectId;
  readonly scope: { readonly type: FileScope; readonly id: Types.ObjectId | null };
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storage: { readonly driver: string; readonly fileId: Types.ObjectId };
  readonly uploadedAt: Date;
}

const fileAssetSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: {
      type: { type: String, enum: FILE_SCOPES, required: true },
      // Null while the asset exists but its owner row does not yet — an avatar has no second id.
      id: { type: Schema.Types.ObjectId, default: null },
    },
    filename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storage: {
      driver: { type: String, required: true },
      fileId: { type: Schema.Types.ObjectId, required: true },
    },
    uploadedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

fileAssetSchema.index({ 'scope.type': 1, 'scope.id': 1 });

export const FileAssetModel = model('FileAsset', fileAssetSchema);
