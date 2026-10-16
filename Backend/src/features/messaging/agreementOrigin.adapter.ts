import type { AgreementOriginPort } from '../tasks/agreementOrigin.port.js';
import { messagingRepository } from './messaging.repository.js';

export const createAgreementOriginAdapter = (): AgreementOriginPort => ({
  async findByTaskIds(taskIds) {
    return messagingRepository.listAgreementOriginsByTask(taskIds);
  },

  async findDocumentsByTask(taskId) {
    return messagingRepository.findAgreementDocumentsByTask(taskId);
  },

  async listByProposer(proposer) {
    return messagingRepository.listAgreementOriginsByProposer(proposer);
  },

  async listByCompany(company) {
    return messagingRepository.listAgreementOriginsByCompany(company);
  },

  async countUnstamped() {
    return messagingRepository.countUnstampedAcceptedAgreements();
  },
});
