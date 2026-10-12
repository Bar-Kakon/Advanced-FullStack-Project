import type { AgreementOriginPort } from '../tasks/agreementOrigin.port.js';
import { messagingRepository } from './messaging.repository.js';

export const createAgreementOriginAdapter = (): AgreementOriginPort => ({
  async findByTaskIds(taskIds) {
    return messagingRepository.listAgreementOriginsByTask(taskIds);
  },

  async listByProposer(proposer) {
    return messagingRepository.listAgreementOriginsByProposer(proposer);
  },
});
