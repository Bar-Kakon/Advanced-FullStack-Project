import { Types } from 'mongoose';

import { configOrDefault, type CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { isWorkingDay } from '../calendar/workingDay.js';
import { resolveEffectiveCalendar } from '../calendar/workingCalendar.types.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import { projectNotFound } from '../projects/project.errors.js';
import { overrunCeiling } from '../projects/projectDates.js';
import type { ProjectRecord } from '../projects/project.model.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  hasProjectPermission,
  requireActiveCompany,
  resolveProjectAccess,
  type ResolvedProjectAccess,
} from '../projects/projectAuthorization.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import { ProjectStageModel, type ProjectStageRecord } from './projectStage.model.js';
import { stageNotFound } from './stages.service.js';
import type { TaskRepository } from './task.repository.js';
import type { CreatedTaskDto, CreateOptionsDto, ProjectCreateOptionsDto, TaskWarning } from './task.dto.js';
import {
  assigneeNotMember,
  dueBeforeStart,
  notPermittedToAssign,
  notPermittedToCreateStandalone,
  notPermittedToCreateTask,
  outsideProjectWindow,
} from './taskCreation.errors.js';

export interface CreateProjectTaskInput {
  readonly kind: 'project';
  readonly projectId: string;
  readonly stageId: string;
  readonly title: string;
  readonly description?: string;
  readonly assigneeId: string;
  readonly startDate: Date;
  readonly dueDate: Date;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;
}

export interface CreateStandaloneTaskInput {
  readonly kind: 'standalone';
  readonly title: string;
  readonly description?: string;
  readonly startDate: Date;
  readonly dueDate: Date;
}

export type CreateTaskInput = CreateProjectTaskInput | CreateStandaloneTaskInput;

export interface CreateTaskResult {
  readonly task: CreatedTaskDto;
  readonly warnings: readonly TaskWarning[];
}

export interface TaskCreationService {
  create(userId: string, input: CreateTaskInput): Promise<CreateTaskResult>;
  options(userId: string): Promise<CreateOptionsDto>;
  projectOptions(userId: string, projectId: string): Promise<ProjectCreateOptionsDto>;
}

export interface TaskCreationDependencies {
  readonly tasks: TaskRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly participants: ParticipantRepository;
  readonly calendars: CompanyCalendarRepository;
  readonly companyContext: CompanyContextService;
}

const iso = (value: Date): string => value.toISOString().slice(0, 10);

export const createTaskCreationService = ({
  tasks,
  projects,
  access,
  participants,
  calendars,
  companyContext,
}: TaskCreationDependencies): TaskCreationService => {
  const reachProject = async (
    userId: string,
    projectId: string,
  ): Promise<{ project: ProjectRecord; resolved: ResolvedProjectAccess; companyId: string }> => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await access.listActiveProjectIdsForUser(new Types.ObjectId(userId));
    const project = await projects.findAccessibleById(
      projectId,
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
    return { project, resolved, companyId: authority.companyId };
  };

  /**
   * The project window is the hard constraint: the closed rule is that the overrun date can never
   * be passed, so the ceiling is the end of it rather than the target.
   */
  const requireInsideWindow = (project: ProjectRecord, start: Date, due: Date): void => {
    const ceiling = overrunCeiling(project.originalTargetEndDate, project.overrunAllowanceDays);
    if (start < project.startDate || due > ceiling) throw outsideProjectWindow();
  };

  /** Advisory only, and only from the weekly pattern the project already stores. */
  const nonWorkingWarnings = async (
    project: ProjectRecord,
    start: Date,
    due: Date,
  ): Promise<TaskWarning[]> => {
    const version = await calendars.findById(project.calendarVersion);
    const calendar = resolveEffectiveCalendar(configOrDefault(version), project.calendarOverrides);

    const warnings: TaskWarning[] = [];
    if (!isWorkingDay(calendar, start)) {
      warnings.push({ code: 'NON_WORKING_DAY', field: 'startDate', date: iso(start) });
    }
    if (!isWorkingDay(calendar, due)) {
      warnings.push({ code: 'NON_WORKING_DAY', field: 'dueDate', date: iso(due) });
    }
    return warnings;
  };

  const requireStage = async (
    project: ProjectRecord,
    stageId: string,
  ): Promise<ProjectStageRecord> => {
    if (!Types.ObjectId.isValid(stageId)) throw stageNotFound();
    const stage = await ProjectStageModel.findOne({ _id: stageId, project: project._id })
      .lean<ProjectStageRecord>()
      .exec();
    if (stage === null) throw stageNotFound();
    return stage;
  };

  const toDto = (task: {
    _id: Types.ObjectId;
    kind: 'project' | 'standalone';
    project?: Types.ObjectId;
    stage?: Types.ObjectId;
    title: string;
    description?: string;
    assignee?: Types.ObjectId;
    startDate: Date;
    dueDate: Date;
    ownCrewOnly: boolean;
    delegatorOnSiteRequired: boolean;
  }): CreatedTaskDto => ({
    id: task._id.toString(),
    kind: task.kind,
    projectId: task.project?.toString() ?? null,
    stageId: task.stage?.toString() ?? null,
    title: task.title,
    description: task.description ?? null,
    assigneeId: task.assignee?.toString() ?? null,
    startDate: iso(task.startDate),
    dueDate: iso(task.dueDate),
    ownCrewOnly: task.ownCrewOnly,
    delegatorOnSiteRequired: task.delegatorOnSiteRequired,
  });

  return {
    async create(userId, input) {
      if (input.dueDate < input.startDate) throw dueBeforeStart();

      if (input.kind === 'standalone') {
        const context = await companyContext.forUser(userId);
        requireActiveCompany(context, userId);
        // Standalone work sits outside every project grant, so the company code is the only gate.
        if (!(context?.permissions.includes('task.create') ?? false)) {
          throw notPermittedToCreateStandalone();
        }

        const created = await tasks.create({
          kind: 'standalone',
          title: input.title,
          ...(input.description === undefined ? {} : { description: input.description }),
          createdBy: new Types.ObjectId(userId),
          // Standalone work is always its creator's own, and that is not editable here.
          assignee: new Types.ObjectId(userId),
          ...(context === null ? {} : { company: new Types.ObjectId(context.id) }),
          startDate: input.startDate,
          dueDate: input.dueDate,
          ownCrewOnly: false,
          delegatorOnSiteRequired: false,
        });

        return { task: toDto(created), warnings: [] };
      }

      const { project, resolved } = await reachProject(userId, input.projectId);
      if (!hasProjectPermission(resolved, 'task.create')) throw notPermittedToCreateTask();

      // Naming somebody else is an assignment, so the create flow cannot walk around task.assign.
      if (input.assigneeId !== userId && !hasProjectPermission(resolved, 'task.assign')) {
        throw notPermittedToAssign();
      }

      const stage = await requireStage(project, input.stageId);
      requireInsideWindow(project, input.startDate, input.dueDate);

      const assignee = new Types.ObjectId(input.assigneeId);
      if ((await access.findActiveMembership(project._id, assignee)) === null) {
        throw assigneeNotMember();
      }

      const created = await tasks.create({
        kind: 'project',
        project: project._id,
        stage: stage._id,
        company: project.company,
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        createdBy: new Types.ObjectId(userId),
        assignee,
        startDate: input.startDate,
        dueDate: input.dueDate,
        ownCrewOnly: input.ownCrewOnly,
        delegatorOnSiteRequired: input.delegatorOnSiteRequired,
      });

      return {
        task: toDto(created),
        warnings: await nonWorkingWarnings(project, input.startDate, input.dueDate),
      };
    },

    /** Only the projects this account may actually open work in — the picker offers nothing else. */
    async options(userId) {
      const context = await companyContext.forUser(userId);
      const authority = requireActiveCompany(context, userId);
      const memberships = await access.listActiveMembershipsForUser(new Types.ObjectId(userId));

      // Authority comes only from a grant row, and a grant row implies a membership — so the
      // memberships ARE the candidate set, and company ownership adds nothing to it.
      const grantOf = new Map(memberships.map((row) => [row.project.toString(), row]));
      const reachable = await projects.listByIds(memberships.map((row) => row.project));

      const creatable = reachable.flatMap((project) => {
        const membership = grantOf.get(project._id.toString());
        if (membership === undefined) return [];
        const resolved: ResolvedProjectAccess = {
          isOwningCompany: project.company.toString() === authority.companyId,
          projectPermissions: membership.permissions,
          fullAuthority: membership.fullAuthority,
        };
        if (!hasProjectPermission(resolved, 'task.create')) return [];
        return [
          {
            id: project._id.toString(),
            name: project.name,
            canAssignOthers: hasProjectPermission(resolved, 'task.assign'),
          },
        ];
      });

      return {
        projects: creatable,
        canCreateStandalone: context?.permissions.includes('task.create') ?? false,
      };
    },

    async projectOptions(userId, projectId) {
      const { project, resolved } = await reachProject(userId, projectId);
      if (!hasProjectPermission(resolved, 'task.create')) throw notPermittedToCreateTask();

      const stages = await ProjectStageModel.find({ project: project._id })
        .sort({ order: 1 })
        .lean<ProjectStageRecord[]>()
        .exec();

      const members = await access.listMembers(project._id);
      const active = members.filter((row) => row.status === 'active');
      const people = await participants.findByIds(active.map((row) => row.user));
      const nameOf = new Map(people.map((row) => [row._id.toString(), row]));

      return {
        projectId: project._id.toString(),
        name: project.name,
        startDate: iso(project.startDate),
        // The end of the window, not the target — the ceiling is what may never be passed.
        endDate: iso(overrunCeiling(project.originalTargetEndDate, project.overrunAllowanceDays)),
        stages: stages.map((stage) => ({
          id: stage._id.toString(),
          name: stage.name,
          order: stage.order,
          isGate: stage.isGate,
        })),
        assignees: active.flatMap((row) => {
          const person = nameOf.get(row.user.toString());
          if (person === undefined) return [];
          return [
            {
              userId: row.user.toString(),
              name: `${person.firstName} ${person.lastName}`.trim(),
              companyName: person.companyName,
            },
          ];
        }),
        canAssignOthers: hasProjectPermission(resolved, 'task.assign'),
        canManageStages: hasProjectPermission(resolved, 'project.edit'),
      };
    },
  };
};
