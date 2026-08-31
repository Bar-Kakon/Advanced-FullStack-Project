import { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectNotFound } from '../projects/project.errors.js';
import type { ProjectRecord } from '../projects/project.model.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  hasProjectPermission,
  requireActiveCompany,
  resolveProjectAccess,
  type ResolvedProjectAccess,
} from '../projects/projectAuthorization.js';
import { ProjectStageModel, type ProjectStageRecord } from './projectStage.model.js';
import { stageNotFound } from './stages.service.js';
import { TaskModel, type TaskRecord } from './task.model.js';
import { taskNotFound } from './task.errors.js';
import { dueBeforeStart } from './taskCreation.errors.js';

/**
 * The fields Edit Task may write directly, audited against the Task schema.
 *
 * Everything absent from this list is absent for a reason, and each reason is a rule that already
 * exists rather than a restriction invented here:
 *
 *   startDate / dueDate   on project work these are schedule-affecting, so they go through the
 *                         date-change proposal and its cascade. Never PATCHed around it.
 *   assignee              moving responsibility is the handoff flow, which asks the incoming party
 *                         and records the transfer. A silent reassignment is not an edit.
 *   startedAt/completedAt progress is reported by the start and complete endpoints, and is derived
 *                         on read. There is no state field here to correct.
 *   delegation            its own flow, with its own confidentiality rules.
 *   kind/project/company/createdBy  provenance. Rewriting it would make the record lie about where
 *                         the work came from.
 *   orphanedAt/previousAssignee     system state the orphan rule owns.
 */
export const DIRECTLY_EDITABLE_FIELDS = [
  'title',
  'description',
  'ownCrewOnly',
  'delegatorOnSiteRequired',
  'stageId',
] as const;

export interface EditTaskInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly ownCrewOnly?: boolean;
  readonly delegatorOnSiteRequired?: boolean;
  readonly stageId?: string;
  /** Only ever accepted on standalone work, where no other professional and no stage is involved. */
  readonly startDate?: Date;
  readonly dueDate?: Date;
}

export interface EditableFieldsDto {
  readonly canEditDetails: boolean;
  readonly canMoveStage: boolean;
  /** True only on standalone work. Project dates are the proposal flow's, never this one's. */
  readonly canEditDatesDirectly: boolean;
  /** Why a date control sends the viewer to the proposal flow instead of editing in place. */
  readonly datesGoThroughProposal: boolean;
}

export interface EditedTaskDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly stageId: string | null;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;
  readonly startDate: string;
  readonly dueDate: string;
}

export interface TaskEditService {
  editableFields(userId: string, taskId: string): Promise<EditableFieldsDto>;
  edit(userId: string, taskId: string, input: EditTaskInput): Promise<EditedTaskDto>;
}

export interface TaskEditDependencies {
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly companyContext: CompanyContextService;
  readonly notifications: NotificationDispatchService;
}

export const notPermittedToEdit = (): AppError =>
  new AppError('Editing this work is not permitted.', 403, 'TASK_EDIT_NOT_PERMITTED');

export const notPermittedToMoveStage = (): AppError =>
  new AppError(
    'Moving work between stages is sequencing, and needs project.stage.manage.',
    403,
    'TASK_EDIT_STAGE_NOT_PERMITTED',
  );

/**
 * The rule this whole service exists to hold. A committed date on project work is never written
 * here — it is proposed, its impact is computed, the affected professionals answer, and the
 * authorised decision-maker resolves it.
 */
export const datesNeedProposal = (): AppError =>
  new AppError(
    'A date on project work changes through the date-change flow, not through an edit.',
    409,
    'TASK_EDIT_DATES_NEED_PROPOSAL',
  );

export const editedNothing = (): AppError =>
  new AppError('That edit changes nothing.', 422, 'TASK_EDIT_EMPTY');

const iso = (value: Date): string => value.toISOString().slice(0, 10);

export const createTaskEditService = ({
  projects,
  access,
  companyContext,
  notifications,
}: TaskEditDependencies): TaskEditService => {
  const loadTask = async (taskId: string): Promise<TaskRecord> => {
    if (!Types.ObjectId.isValid(taskId)) throw taskNotFound();
    const task = await TaskModel.findById(taskId).lean<TaskRecord>().exec();
    if (task === null) throw taskNotFound();
    return task;
  };

  const reachProject = async (
    userId: string,
    projectId: Types.ObjectId,
  ): Promise<{ project: ProjectRecord; resolved: ResolvedProjectAccess }> => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await access.listActiveProjectIdsForUser(new Types.ObjectId(userId));
    const project = await projects.findAccessibleById(
      projectId.toString(),
      new Types.ObjectId(authority.companyId),
      memberOf,
    );
    if (project === null) throw projectNotFound();

    const resolved = await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: new Types.ObjectId(userId),
      authority,
      access,
    });
    return { project, resolved };
  };

  /**
   * What this viewer may edit.
   *
   * On project work the authority is `task.edit`, plus Full Authority through the existing flag.
   * It is deliberately NOT `task.create`: opening new work and changing work that already exists
   * are different capabilities, and one grant must not imply the other. Nothing branches on a
   * project role or a company position, which are descriptive and never read.
   *
   * On standalone work there is no project and no grant to hold: it is the owner's own, and the
   * owner is the only person who may touch it.
   */
  const authorityFor = async (
    userId: string,
    task: TaskRecord,
  ): Promise<EditableFieldsDto> => {
    if (task.kind === 'standalone') {
      const own = task.assignee?.toString() === userId || task.createdBy.toString() === userId;
      return {
        canEditDetails: own,
        canMoveStage: false,
        canEditDatesDirectly: own,
        datesGoThroughProposal: false,
      };
    }

    if (task.project === undefined) throw taskNotFound();
    const { resolved } = await reachProject(userId, task.project);

    return {
      canEditDetails: hasProjectPermission(resolved, 'task.edit'),
      canMoveStage: hasProjectPermission(resolved, 'project.stage.manage'),
      canEditDatesDirectly: false,
      datesGoThroughProposal: true,
    };
  };

  return {
    async editableFields(userId, taskId) {
      return authorityFor(userId, await loadTask(taskId));
    },

    async edit(userId, taskId, input) {
      const task = await loadTask(taskId);
      const authority = await authorityFor(userId, task);

      const wantsDates = input.startDate !== undefined || input.dueDate !== undefined;
      // Checked before the permission, so the answer names the real reason: this is not a matter
      // of who may edit, it is that the field does not change this way at all.
      if (wantsDates && authority.datesGoThroughProposal) throw datesNeedProposal();
      if (!authority.canEditDetails) throw notPermittedToEdit();
      if (input.stageId !== undefined && !authority.canMoveStage) throw notPermittedToMoveStage();

      const $set: Record<string, unknown> = {};
      const $unset: Record<string, ''> = {};

      if (input.title !== undefined) $set['title'] = input.title;
      if (input.description !== undefined) {
        if (input.description === null) $unset['description'] = '';
        else $set['description'] = input.description;
      }
      if (input.ownCrewOnly !== undefined) $set['ownCrewOnly'] = input.ownCrewOnly;
      if (input.delegatorOnSiteRequired !== undefined) {
        $set['delegatorOnSiteRequired'] = input.delegatorOnSiteRequired;
      }

      let stage: ProjectStageRecord | null = null;
      if (input.stageId !== undefined && task.project !== undefined) {
        if (!Types.ObjectId.isValid(input.stageId)) throw stageNotFound();
        stage = await ProjectStageModel.findOne({ _id: input.stageId, project: task.project })
          .lean<ProjectStageRecord>()
          .exec();
        if (stage === null) throw stageNotFound();
        $set['stage'] = stage._id;
      }

      if (wantsDates) {
        const startDate = input.startDate ?? task.startDate;
        const dueDate = input.dueDate ?? task.dueDate;
        if (dueDate < startDate) throw dueBeforeStart();
        $set['startDate'] = startDate;
        $set['dueDate'] = dueDate;
      }

      if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) throw editedNothing();

      const updated = await TaskModel.findOneAndUpdate(
        { _id: task._id },
        {
          ...(Object.keys($set).length === 0 ? {} : { $set }),
          ...(Object.keys($unset).length === 0 ? {} : { $unset }),
        },
        { new: true },
      )
        .lean<TaskRecord>()
        .exec();
      if (updated === null) throw taskNotFound();

      // The responsible party is told what changed about work they are carrying — unless they made
      // the change themselves, in which case telling them would be noise.
      if (
        task.kind === 'project' &&
        task.project !== undefined &&
        updated.assignee !== undefined &&
        updated.assignee.toString() !== userId
      ) {
        const { project } = await reachProject(userId, task.project);
        await notifications.emit({
          userId: updated.assignee,
          type: 'task.updated',
          projectId: task.project,
          taskId: task._id,
          payload: { projectName: project.name, taskTitle: updated.title },
          // Keyed on the update stamp, so a later edit is a new notice rather than swallowed by
          // the first one's dedupe.
          dedupeKey: `task.updated:${task._id.toString()}:${updated.updatedAt.getTime()}`,
        });
      }

      return {
        id: updated._id.toString(),
        title: updated.title,
        description: updated.description ?? null,
        stageId: updated.stage?.toString() ?? null,
        ownCrewOnly: updated.ownCrewOnly,
        delegatorOnSiteRequired: updated.delegatorOnSiteRequired,
        startDate: iso(updated.startDate),
        dueDate: iso(updated.dueDate),
      };
    },
  };
};
