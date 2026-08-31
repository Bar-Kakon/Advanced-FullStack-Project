import { Schema, model, type Types } from 'mongoose';

/**
 * The PLATFORM-level trail, for administrative actions that belong to no project.
 *
 * `auditEntries` is the project trail and is untouched: every row there names a project, and none
 * of these do. The two never merge — a moderator restricting an account is not a project event, and
 * a cascade is not an administrative one.
 *
 * Only actions the product actually performs are listed. There is no terminal-ban code, because
 * terminal ban is not implemented.
 */
export const PLATFORM_AUDIT_ACTIONS = [
  'report.claimed',
  'report.dismissed',
  'report.actioned',
  'report.note_redacted',
  'account.restricted',
  'account.unrestricted',
  'account.deleted',
  'account.restored',
] as const;
export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number];

export const PLATFORM_AUDIT_TARGET_TYPES = ['report', 'user'] as const;
export type PlatformAuditTargetType = (typeof PLATFORM_AUDIT_TARGET_TYPES)[number];

export interface PlatformAuditEntryRecord {
  readonly _id: Types.ObjectId;
  readonly actor: Types.ObjectId;
  readonly action: PlatformAuditAction;
  readonly targetType: PlatformAuditTargetType;
  readonly target: Types.ObjectId;
  /**
   * Safe scalars only. No secret, no token, no password, no message body, no delegate identity and
   * no private data unrelated to the action.
   */
  readonly metadata: Record<string, unknown>;
  readonly at: Date;
}

const platformAuditEntrySchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: PLATFORM_AUDIT_ACTIONS, required: true },
    targetType: { type: String, enum: PLATFORM_AUDIT_TARGET_TYPES, required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    metadata: { type: Schema.Types.Mixed, required: true, default: {} },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

// The log itself, newest first, and the same index the action filter narrows.
platformAuditEntrySchema.index({ at: -1, _id: -1 });
platformAuditEntrySchema.index({ action: 1, at: -1, _id: -1 });
platformAuditEntrySchema.index({ targetType: 1, target: 1, at: -1, _id: -1 });
platformAuditEntrySchema.index({ actor: 1, at: -1, _id: -1 });

export const PlatformAuditEntryModel = model('PlatformAuditEntry', platformAuditEntrySchema);
