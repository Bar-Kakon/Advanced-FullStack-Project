import { Types } from 'mongoose';

import { muteRepository } from './mute.repository.js';

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
