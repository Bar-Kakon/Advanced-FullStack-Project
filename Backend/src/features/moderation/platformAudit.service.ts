import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import {
  encodePlatformAuditCursor,
  type PlatformAuditRepository,
} from './platformAudit.repository.js';
import type {
  PlatformAuditAction,
  PlatformAuditTargetType,
} from './platformAuditEntry.model.js';

export interface PlatformAuditRowDto {
  readonly id: string;
  readonly action: PlatformAuditAction;
  readonly actor: { readonly userId: string; readonly name: string | null };
  readonly targetType: PlatformAuditTargetType;
  readonly targetId: string;
  readonly metadata: Record<string, unknown>;
  readonly at: string;
}

export interface PlatformAuditPageDto {
  readonly rows: readonly PlatformAuditRowDto[];
  readonly nextCursor: string | null;
}

export interface PlatformAuditListOptions {
  readonly action?: PlatformAuditAction;
  readonly targetType?: PlatformAuditTargetType;
  readonly limit: number;
  readonly cursor?: string;
}

export interface PlatformAuditService {
  record(input: {
    actorId: string;
    action: PlatformAuditAction;
    targetType: PlatformAuditTargetType;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  list(options: PlatformAuditListOptions): Promise<PlatformAuditPageDto>;
}

export interface PlatformAuditDependencies {
  readonly entries: PlatformAuditRepository;
  readonly users: UserRepository;
}

export const createPlatformAuditService = ({
  entries,
  users,
}: PlatformAuditDependencies): PlatformAuditService => ({
  /**
   * Writing the trail must never be able to fail the action it records, so an unparseable id is
   * dropped rather than thrown. Every caller has already done its own validation.
   */
  async record({ actorId, action, targetType, targetId, metadata }) {
    if (!Types.ObjectId.isValid(actorId) || !Types.ObjectId.isValid(targetId)) return;

    await entries.append({
      actor: new Types.ObjectId(actorId),
      action,
      targetType,
      target: new Types.ObjectId(targetId),
      ...(metadata === undefined ? {} : { metadata }),
    });
  },

  async list(options) {
    const rows = await entries.list(options);

    // One query, and an id with no row is simply absent — a deleted actor renders as the neutral
    // identity rather than failing the page.
    const names = await users.findDisplayNames([...new Set(rows.map((row) => row.actor))]);

    const last = rows.at(-1);

    return {
      rows: rows.map((row) => ({
        id: row._id.toString(),
        action: row.action,
        actor: {
          userId: row.actor.toString(),
          name: names.get(row.actor.toString()) ?? null,
        },
        targetType: row.targetType,
        targetId: row.target.toString(),
        metadata: row.metadata,
        at: row.at.toISOString(),
      })),
      nextCursor:
        last !== undefined && rows.length === options.limit
          ? encodePlatformAuditCursor(last)
          : null,
    };
  },
});
