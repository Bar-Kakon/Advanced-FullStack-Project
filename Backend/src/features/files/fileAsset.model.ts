import { Schema, model, type Types } from 'mongoose';

/** What a stored file is attached to. Filtered on, never joined through. */
export const FILE_SCOPES = ['avatar', 'work_entry', 'task', 'project'] as const;
export type FileScope = (typeof FILE_SCOPES)[number];

/** The two scopes a versioned work plan may hang from. */
export const WORK_PLAN_SCOPES = ['task', 'project'] as const;
export type WorkPlanScope = (typeof WORK_PLAN_SCOPES)[number];

/** Images only for now: the profile screens upload nothing else. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Work plans are documents, not pictures. */
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

/**
 * `private` is a delegation-private upload: a file the delegator and delegate exchange that the
 * party above never sees. `shared` reaches everybody who can already reach the scope.
 */
export const FILE_VISIBILITIES = ['shared', 'private'] as const;
export type FileVisibility = (typeof FILE_VISIBILITIES)[number];

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
  /** Work plans only. An avatar and a Completed Work photo have no history: replacing deletes. */
  readonly versionGroup?: Types.ObjectId;
  readonly version?: number;
  readonly isCurrent?: boolean;
  readonly visibility?: FileVisibility;
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
    versionGroup: { type: Schema.Types.ObjectId },
    version: { type: Number, min: 1 },
    isCurrent: { type: Boolean },
    visibility: { type: String, enum: FILE_VISIBILITIES },
  },
  { timestamps: true },
);

fileAssetSchema.index({ 'scope.type': 1, 'scope.id': 1, isCurrent: 1 });

// Partial, because every avatar and Completed Work row leaves both keys missing — without the
// filter they would all collide on the same null pair.
fileAssetSchema.index(
  { versionGroup: 1, version: -1 },
  { unique: true, partialFilterExpression: { versionGroup: { $exists: true } } },
);

export const FileAssetModel = model('FileAsset', fileAssetSchema);
