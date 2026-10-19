import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { projectNotFound } from './project.errors.js';
import type { ProjectRecord } from './project.model.js';
import type { ProjectRepository } from './project.repository.js';

export interface ScheduleWrites {
  /** Claims the project's schedule first, then runs `work`, all in one transaction. */
  run<T>(
    project: Types.ObjectId,
    work: (session: DbSession, claimed: ProjectRecord) => Promise<T>,
  ): Promise<T>;
  /** The same claim, inside a transaction the caller already holds. */
  claim(project: Types.ObjectId, session: DbSession): Promise<ProjectRecord>;
}

export interface ScheduleWritesDependencies {
  readonly projects: Pick<ProjectRepository, 'claimSchedule'>;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

export const createScheduleWrites = ({
  projects,
  transactions,
}: ScheduleWritesDependencies): ScheduleWrites => {
  const claim: ScheduleWrites['claim'] = async (project, session) => {
    const claimed = await projects.claimSchedule(project, session);
    if (claimed === null) throw projectNotFound();
    return claimed;
  };

  return {
    claim,
    run: (project, work) =>
      transactions.run(async (session) => work(session, await claim(project, session))),
  };
};
