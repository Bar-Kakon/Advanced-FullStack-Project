import { Types } from 'mongoose';

import { muteRepository } from './mute.repository.js';

/**
 * CLOSED PRODUCT RULE — mute is a delivery preference and nothing more.
 *
 * For a muted project, conversation or contractor:
 *   the domain event is still written;
 *   a BLOCKING in-app notification is still shown — mute never suppresses one;
 *   email may be suppressed;
 *   non-blocking digest delivery may be suppressed.
 *
 * Mute never changes access, authority or domain state. This is the owner's decision, not an
 * engineering judgement, so no caller may widen it into a filter over events or authority.
 */
export interface NotificationPreferencePort {
  isProjectMuted(userId: string, projectId: string): Promise<boolean>;
  mutedProjectIdsFor(userId: string, projectIds: readonly string[]): Promise<ReadonlySet<string>>;
}

export const notificationPreferencePort: NotificationPreferencePort = {
  async isProjectMuted(userId, projectId) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(projectId)) return false;

    return muteRepository.isMuted(
      new Types.ObjectId(userId),
      'project',
      new Types.ObjectId(projectId),
    );
  },

  async mutedProjectIdsFor(userId, projectIds) {
    if (!Types.ObjectId.isValid(userId)) return new Set<string>();

    return muteRepository.mutedTargets(
      new Types.ObjectId(userId),
      'project',
      projectIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)),
    );
  },
};
