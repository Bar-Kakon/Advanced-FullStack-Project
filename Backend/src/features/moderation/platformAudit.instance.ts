import { userRepository } from '../users/user.repository.js';
import { platformAuditRepository } from './platformAudit.repository.js';
import { createPlatformAuditService } from './platformAudit.service.js';

/** One instance, so every writer appends to the same trail. */
export const platformAuditService = createPlatformAuditService({
  entries: platformAuditRepository,
  users: userRepository,
});
