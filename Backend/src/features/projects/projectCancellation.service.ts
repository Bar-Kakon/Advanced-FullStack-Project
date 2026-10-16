import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { logger } from '../../shared/logger.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import type { ProjectRecord } from './project.model.js';
import type { ProjectRepository } from './project.repository.js';
import type { ProjectExecutionPort } from './projectLifecycle.service.js';

/** A stamp this old with no completed cancellation behind it is an interruption, not an in-flight one. */
export const STALE_CANCELLATION_MS = 10 * 60_000;

/** What a cancellation needs from each neighbouring domain: take the project's rows, nothing else. */
export interface ProjectCascadePort {
  deleteByProject(project: Types.ObjectId, session?: DbSession): Promise<number>;
}

export interface CancellationSweepResult {
  readonly resumed: number;
  readonly released: number;
}

export interface ProjectCancellationService {
  /**
   * Phase two, behind an already-standing stamp: the one transaction that makes the project
   * «נעלם כאילו לא היה», then the participants' notice. Shared verbatim by the live cancel and
   * by the recovery sweep, so an interrupted run finishes exactly as an uninterrupted one would.
   */
  complete(project: ProjectRecord): Promise<void>;
  /** Finds stamps a crash left behind: resumes the eligible ones, releases the ineligible. */
  resumeInterrupted(staleAfterMs?: number): Promise<CancellationSweepResult>;
}

export interface ProjectCancellationDependencies {
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly tasks: ProjectCascadePort;
  readonly proposals: ProjectCascadePort;
  readonly exceptions: ProjectCascadePort;
  readonly notificationRows: ProjectCascadePort;
  readonly notifications: NotificationDispatchService;
  readonly execution: ProjectExecutionPort;
  readonly users: { findDisplayNames(ids: readonly Types.ObjectId[]): Promise<Map<string, string>> };
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

export const createProjectCancellationService = ({
  projects,
  access,
  grants,
  tasks,
  proposals,
  exceptions,
  notificationRows,
  notifications,
  execution,
  users,
  transactions,
}: ProjectCancellationDependencies): ProjectCancellationService => {
  const complete = async (project: ProjectRecord): Promise<void> => {
    const actor = project.cancellingBy ?? null;
    const members = (await access.listMembers(project._id)).filter(
      (member) =>
        member.status === 'active' &&
        (actor === null || member.user.toString() !== actor.toString()),
    );

    await transactions.run(async (session) => {
      await projects.deleteOwnedById(project._id.toString(), project.company, session);
      await access.deleteByProject(project._id, session);
      await grants.deleteByProject(project._id, session);
      await tasks.deleteByProject(project._id, session);
      await proposals.deleteByProject(project._id, session);
      await exceptions.deleteByProject(project._id, session);
      await notificationRows.deleteByProject(project._id, session);
    });

    // The GC's duty to inform the expected participants, carried by the platform. No projectId
    // rides along — there is no project left to navigate into. The dedupe key makes a resumed
    // run after a crash re-send nothing to anyone the first run already reached.
    const actorName =
      actor === null ? '' : (await users.findDisplayNames([actor])).get(actor.toString()) ?? '';
    await notifications.emitMany(
      members.map((member) => ({
        userId: member.user,
        type: 'project.cancelled' as const,
        payload: { projectName: project.name, actorName },
        dedupeKey: `project-cancelled:${project._id.toString()}:${member.user.toString()}`,
      })),
    );
  };

  return {
    complete,

    async resumeInterrupted(staleAfterMs = STALE_CANCELLATION_MS) {
      const stale = await projects.listStaleCancelling(new Date(Date.now() - staleAfterMs), 20);

      let resumed = 0;
      let released = 0;
      for (const project of stale) {
        // The father's rule outranks the stamp: work that began before the barrier completed
        // means this project was never cancellable, so the stamp is released, never resumed.
        if (await execution.hasFirstTaskStarted(project._id.toString())) {
          await projects.clearCancelling(project._id.toString());
          released += 1;
          logger.info('Interrupted project cancellation released — work had begun', {
            projectId: project._id.toString(),
          });
          continue;
        }

        await complete(project);
        resumed += 1;
        logger.info('Interrupted project cancellation resumed and completed', {
          projectId: project._id.toString(),
        });
      }

      return { resumed, released };
    },
  };
};
