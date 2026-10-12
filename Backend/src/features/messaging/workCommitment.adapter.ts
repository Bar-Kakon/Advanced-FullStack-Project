import type { WorkCommitmentPort } from '../browse/workCommitment.port.js';
import { messagingRepository } from './messaging.repository.js';

/** The persisted evidence is the accepted agreement message itself, never the task's later life. */
export const createWorkCommitmentAdapter = (): WorkCommitmentPort => ({
  async wasEstablishedBetween(a, b) {
    return messagingRepository.hasAcceptedAgreementBetween(a, b);
  },
});
