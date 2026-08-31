import { Types } from 'mongoose';

import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { configOrDefault } from '../calendar/companyCalendar.repository.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectPermission } from '../projectaccess/projectPermission.js';
import { projectNotFound } from '../projects/project.errors.js';
import { toProjectDto } from '../projects/project.mapper.js';
import type { CalendarAdoptionRecord } from '../projects/project.model.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  mayManage,
  requireActiveCompany,
  resolveProjectAccess,
  type ResolvedProjectAccess,
} from '../projects/projectAuthorization.js';
import type { ProjectExecutionPort } from '../projects/projectLifecycle.service.js';
import type { CoordinationService } from '../coordination/coordination.service.js';
import type { CalendarAdoptionDto, ProjectDashboardDto } from './projectDashboard.dto.js';

export interface ProjectDashboardService {
  get(userId: string, projectId: string): Promise<ProjectDashboardDto>;
}

export interface ProjectDashboardDependencies {
  readonly projects: ProjectRepository;
  readonly companyContext: CompanyContextService;
  readonly access: ProjectAccessRepository;
  readonly calendars: CompanyCalendarRepository;
  readonly participants: ParticipantRepository;
  readonly execution: ProjectExecutionPort;
  readonly coordination: CoordinationService;
}

const holds = (resolved: ResolvedProjectAccess, permission: ProjectPermission): boolean =>
  resolved.fullAuthority || resolved.projectPermissions.includes(permission);

/**
 * The working context of ONE project. It composes what the Projects, Permissions, Members and
 * Calendar features already own — it derives no status, stores no counter and holds no second
 * copy of any project fact.
 */
export const createProjectDashboardService = ({
  projects,
  companyContext,
  access,
  calendars,
  participants,
  execution,
  coordination,
}: ProjectDashboardDependencies): ProjectDashboardService => ({
  async get(userId, projectId) {
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

    const [pinned, current, rows] = await Promise.all([
      calendars.findById(project.calendarVersion),
      calendars.findCurrent(project.company),
      access.listMembers(project._id),
    ]);

    const versions = await calendars.listVersions(project.company);
    const numberOf = new Map(versions.map((row) => [row._id.toString(), row.version]));

    const adopters = await participants.findByIds(
      project.calendarAdoptions.map((adoption) => adoption.adoptedBy),
    );
    const names = new Map(
      adopters.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`.trim()]),
    );

    const toAdoptionDto = (adoption: CalendarAdoptionRecord): CalendarAdoptionDto => ({
      fromVersion:
        adoption.fromVersion === null ? null : numberOf.get(adoption.fromVersion.toString()) ?? null,
      toVersion: numberOf.get(adoption.toVersion.toString()) ?? 0,
      adoptedAt: adoption.adoptedAt.toISOString(),
      adoptedByName: names.get(adoption.adoptedBy.toString()) ?? null,
      overridesKept: adoption.overridesKept,
    });

    return {
      project: toProjectDto(
        project,
        mayManage(resolved),
        await execution.hasFirstTaskStarted(project._id.toString()),
        configOrDefault(pinned),
      ),
      viewer: {
        manages: mayManage(resolved),
        canEdit: holds(resolved, 'project.edit'),
        canCancel: holds(resolved, 'project.cancel'),
        canManageCalendar: holds(resolved, 'project.calendar.manage'),
        canInvite: holds(resolved, 'project.member.invite'),
        canManageMembers: holds(resolved, 'project.member.manage'),
        canGrantPermissions: holds(resolved, 'project.permission.grant'),
        canCreateTasks: holds(resolved, 'task.create'),
        canManageStages: holds(resolved, 'project.stage.manage'),
        canManageSchedule: holds(resolved, 'schedule.change.manage'),
        canPartialRelease: holds(resolved, 'schedule.partial_release.manage'),
      },
      calendar: {
        versionNumber: pinned?.version ?? null,
        currentVersionNumber: current?.version ?? null,
        // Outdated is a comparison made on read. Nothing propagates, and nothing is stored.
        outdated: current !== null && current._id.toString() !== project.calendarVersion.toString(),
        overridden: project.calendarOverrides !== undefined,
        adoptions: project.calendarAdoptions.map(toAdoptionDto),
      },
      members: {
        active: rows.filter((row) => row.status === 'active').length,
        pending: rows.filter((row) => row.status === 'invited').length,
      },
      tasks: await execution.summarize(project._id.toString()),
      coordination: await (async () => {
        const rows = await coordination.listForProject(userId, projectId);
        const pending = await coordination.pendingActionsFor(userId);
        return {
          openProposals: rows.filter((row) => row.status === 'open' || row.status === 'requested').length,
          pendingActions: pending.get(projectId) ?? { proposals: 0, handoffs: 0, total: 0 },
          proposals: rows,
          audit: await coordination.auditForProject(userId, projectId),
        };
      })(),
    };
  },
});
