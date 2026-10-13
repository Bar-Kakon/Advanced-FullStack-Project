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
  /** The immutable company stamp; `null` only on a legacy row the backfill reported and skipped. */
  readonly company: Types.ObjectId | null;
}

/** The files an accepted agreement carried, with the two parties entitled to them. */
export interface AgreementDocuments {
  readonly proposer: Types.ObjectId;
  readonly accepter: Types.ObjectId;
  readonly attachments: readonly Types.ObjectId[];
}

export interface AgreementOriginPort {
  findByTaskIds(taskIds: readonly Types.ObjectId[]): Promise<AgreementOrigin[]>;
  findDocumentsByTask(taskId: Types.ObjectId): Promise<AgreementDocuments | null>;
  listByProposer(proposer: Types.ObjectId): Promise<AgreementOrigin[]>;
  listByCompany(company: Types.ObjectId): Promise<AgreementOrigin[]>;
  /** The migration safeguard's question: how many accepted agreements still carry no stamp. */
  countUnstamped(): Promise<number>;
}
