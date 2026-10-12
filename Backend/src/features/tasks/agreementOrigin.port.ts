import type { Types } from 'mongoose';

/**
 * Where a task came from, when it came from an accepted work agreement. The agreement message is
 * the authoritative record of the commitment's two parties — the task row never duplicates it.
 */
export interface AgreementOrigin {
  readonly task: Types.ObjectId;
  /** The commissioning party — the work owner. */
  readonly proposer: Types.ObjectId;
  /** The responsible performer, who is also the task's assignee. */
  readonly accepter: Types.ObjectId;
}

export interface AgreementOriginPort {
  findByTaskIds(taskIds: readonly Types.ObjectId[]): Promise<AgreementOrigin[]>;
  listByProposer(proposer: Types.ObjectId): Promise<AgreementOrigin[]>;
}
