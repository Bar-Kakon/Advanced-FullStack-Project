import { Types } from 'mongoose';

import type { CompanyContext, CompanyContextService } from '../companies/companyContext.service.js';
import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { configOrDefault } from '../calendar/companyCalendar.repository.js';
import { resolveEffectiveCalendar, type WorkingCalendarConfig } from '../calendar/workingCalendar.types.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import {
  mayManage,
  requireActiveCompany,
  requireMayCreateProject,
  requireProjectPermission,
  resolveProjectAccess,
} from './projectAuthorization.js';
import { calendarVersionMissing, projectPlanLimitReached } from './project.errors.js';
import type { PlanCapacityPort } from './planCapacity.port.js';
import type { ProjectDto, ProjectPageDto } from './project.dto.js';
import { toProjectDto } from './project.mapper.js';
import type { ProjectRecord, TargetChangeRecord } from './project.model.js';
import type { ProjectCursor, ProjectRepository, ProjectUpdate } from './project.repository.js';
import {
  addDays,
  formatCalendarDate,
  overrunCeiling,
  overrunFromOriginal,
  parseCalendarDate,
} from './projectDates.js';
import {
  deriveStatus,
  isCancellable,
  type ProjectExecutionPort,
} from './projectLifecycle.service.js';
import {
  overrunCeilingExceeded,
  projectAlreadyStarted,
  projectNotFound,
  targetBeforeStart,
} from './project.errors.js';
import type { CreateProjectBody, UpdateProjectBody } from './projects.validation.js';

export interface ProjectsService {
  create(userId: string, body: CreateProjectBody): Promise<ProjectDto>;
  adoptCurrentCalendar(userId: string, projectId: string, keepOverrides: boolean): Promise<ProjectDto>;
  setCalendarOverrides(userId: string, projectId: string, overrides: unknown): Promise<ProjectDto>;
  outdatedCalendarCount(userId: string): Promise<number>;
  list(userId: string, limit: number, cursor?: string): Promise<ProjectPageDto>;
  getOne(userId: string, projectId: string): Promise<ProjectDto>;
  update(userId: string, projectId: string, body: UpdateProjectBody): Promise<ProjectDto>;
  cancel(userId: string, projectId: string): Promise<void>;
}

export interface ProjectsDependencies {
  readonly projects: ProjectRepository;
  readonly companyContext: CompanyContextService;
  readonly execution: ProjectExecutionPort;
  readonly calendars: CompanyCalendarRepository;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly planCapacity: PlanCapacityPort;
}

const encodeCursor = ({ createdAt, id }: ProjectCursor): string =>
  Buffer.from(`${createdAt.toISOString()}|${id.toString()}`, 'utf8').toString('base64url');

const decodeCursor = (raw: string | undefined): ProjectCursor | null => {
  if (!raw) return null;
  try {
    const [timestamp, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!timestamp || !id || !Types.ObjectId.isValid(id)) return null;
    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
};

export const createProjectsService = ({
  projects,
  companyContext,
  execution,
  calendars,
  access,
  grants,
  planCapacity,
}: ProjectsDependencies): ProjectsService => {
  /** The caller's company is read from their session, never from the request body. */
  const contextFor = async (userId: string) => {
    const context = await companyContext.forUser(userId);
    return { context, authority: requireActiveCompany(context, userId) };
  };


  /**
   * Loads a project the caller may reach, and works out what they may do with it. Not reachable and
   * not existing answer identically (D16).
   */
  const load = async (userId: string, projectId: string) => {
    const { context, authority } = await contextFor(userId);
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

    return { authority, project, resolved };
  };

  return {
    async create(userId, body) {
      const context = requireMayCreateProject(await companyContext.forUser(userId), userId);

      // Server-authoritative, and checked before anything is written. Hiding the control on the
      // client is a courtesy to the person; this is the enforcement.
      if (!(await planCapacity.mayOpenAnotherProject(context.companyId))) {
        throw projectPlanLimitReached();
      }

      // A new project receives the contractor's schedule — pinned to the version current right now,
      // so a later edit to the company default cannot reach back into it.
      const current = await calendars.findCurrent(new Types.ObjectId(context.companyId));
      const pinned =
        current ??
        (await calendars.append(
          new Types.ObjectId(context.companyId),
          configOrDefault(null),
          new Types.ObjectId(userId),
        ));

      const startDate = parseCalendarDate(body.startDate);
      const targetEndDate = parseCalendarDate(body.targetEndDate);
      if (startDate === null || targetEndDate === null) throw targetBeforeStart();
      if (targetEndDate.getTime() < startDate.getTime()) throw targetBeforeStart();

      const created = await projects.create({
        company: new Types.ObjectId(context.companyId),
        createdBy: new Types.ObjectId(userId),
        name: body.name,
        ...(body.description ? { description: body.description } : {}),
        ...(body.location ? { location: body.location } : {}),
        startDate,
        targetEndDate,
        // At creation the promise and the original are the same date, by definition.
        originalTargetEndDate: targetEndDate,
        overrunAllowanceDays: body.overrunAllowanceDays,
        projectType: body.projectType,
        ...(body.projectTypeOther ? { projectTypeOther: body.projectTypeOther } : {}),
        size: body.size,
        calendarVersion: pinned._id,
      });

      // The creator's power is a ROW, not an inference. It can be read, reduced or revoked like
      // anyone else's — nothing anywhere derives authority from having created a project.
      await grants.upsert({
        project: created._id,
        user: new Types.ObjectId(userId),
        company: new Types.ObjectId(context.companyId),
        projectRole: 'main_contractor',
        permissions: [],
        fullAuthority: true,
        invitedBy: new Types.ObjectId(userId),
        status: 'active',
      });

      // The creator manages it, and a project with no tasks cannot have started.
      return toProjectDto(created, true, false);
    },

    async list(userId, limit, cursor) {
      const { authority } = await contextFor(userId);
      const memberships = await access.listActiveMembershipsForUser(new Types.ObjectId(userId));
      const memberOf = memberships.map((m) => m.project);
      const grantByProject = new Map(memberships.map((m) => [m.project.toString(), m]));

      const rows = await projects.listAccessible(
        new Types.ObjectId(authority.companyId),
        memberOf,
        decodeCursor(cursor),
        limit + 1,
      );

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const started = await execution.startedProjectIds(page.map((row) => row._id.toString()));

      return {
        projects: page.map((row) => {
          const grant = grantByProject.get(row._id.toString());
          const viewerManages =
            grant?.fullAuthority === true || grant?.permissions.includes('project.edit') === true;
          return toProjectDto(row, viewerManages, started.has(row._id.toString()));
        }),
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeCursor({ createdAt: last.createdAt, id: last._id })
            : null,
      };
    },

    async getOne(userId, projectId) {
      const { project: p, resolved } = await load(userId, projectId);
      const pinned = await calendars.findById(p.calendarVersion);
      const started = await execution.hasFirstTaskStarted(p._id.toString());
      return toProjectDto(p, mayManage(resolved), started, configOrDefault(pinned));
    },

    async update(userId, projectId, body) {
      const { authority, project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.edit');

      const update: ProjectUpdate = {};
      if (body.name !== undefined) Object.assign(update, { name: body.name });
      if (body.projectType !== undefined) Object.assign(update, { projectType: body.projectType });
      if (body.projectTypeOther !== undefined) Object.assign(update, { projectTypeOther: body.projectTypeOther });
      if (body.size !== undefined) Object.assign(update, { size: body.size });
      if (body.description !== undefined) Object.assign(update, { description: body.description });
      const clearLocation = body.location === null;
      if (body.location !== undefined && !clearLocation) {
        Object.assign(update, { location: body.location });
      }

      const startDate = body.startDate === undefined ? project.startDate : parseCalendarDate(body.startDate);
      const targetEndDate =
        body.targetEndDate === undefined ? project.targetEndDate : parseCalendarDate(body.targetEndDate);
      if (startDate === null || targetEndDate === null) throw targetBeforeStart();
      if (targetEndDate.getTime() < startDate.getTime()) throw targetBeforeStart();

      // The allowance is never edited, so the ceiling is fixed for the life of the project.
      const ceiling = overrunCeiling(project.originalTargetEndDate, project.overrunAllowanceDays);
      if (targetEndDate.getTime() > ceiling.getTime()) throw overrunCeilingExceeded();

      if (body.startDate !== undefined) Object.assign(update, { startDate });
      if (body.targetEndDate !== undefined) Object.assign(update, { targetEndDate });

      const moved = targetEndDate.getTime() !== project.targetEndDate.getTime();
      const targetChange: TargetChangeRecord | null = moved
        ? {
            from: project.targetEndDate,
            to: targetEndDate,
            overrunDaysFromOriginal: overrunFromOriginal(project.originalTargetEndDate, targetEndDate),
            changedAt: new Date(),
            changedBy: new Types.ObjectId(authority.userId),
          }
        : null;

      const updated = await projects.update(project._id, update, targetChange, { clearLocation });
      if (updated === null) throw projectNotFound();
      return toProjectDto(updated, mayManage(resolved), await execution.hasFirstTaskStarted(projectId));
    },

    /** The only way a project moves to a newer company version. Never automatic. */
    async adoptCurrentCalendar(userId, projectId, keepOverrides) {
      const { authority, project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.calendar.manage');

      const current = await calendars.findCurrent(project.company);
      if (current === null) throw calendarVersionMissing();

      const updated = await projects.adoptCalendarVersion(
        project._id,
        current._id,
        {
          fromVersion: project.calendarVersion,
          toVersion: current._id,
          adoptedAt: new Date(),
          adoptedBy: new Types.ObjectId(authority.userId),
          overridesKept: keepOverrides,
        },
        !keepOverrides,
      );
      if (updated === null) throw projectNotFound();
      return toProjectDto(updated, mayManage(resolved), await execution.hasFirstTaskStarted(projectId));
    },

    async setCalendarOverrides(userId, projectId, overrides) {
      const { project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.calendar.manage');

      const updated = await projects.update(
        project._id,
        { calendarOverrides: overrides as never },
        null,
      );
      if (updated === null) throw projectNotFound();
      return toProjectDto(updated, mayManage(resolved), await execution.hasFirstTaskStarted(projectId));
    },

    /** How many of this company's projects still sit on an older pinned version. */
    async outdatedCalendarCount(userId) {
      const { authority } = await contextFor(userId);
      const company = new Types.ObjectId(authority.companyId);
      const current = await calendars.findCurrent(company);
      if (current === null) return 0;
      return projects.countOnOutdatedCalendar(company, current._id);
    },

    async cancel(userId, projectId) {
      const { project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.cancel');

      // Pre-start only (D24), against the same closed rule the status derives from.
      if (!isCancellable(project, await execution.hasFirstTaskStarted(projectId))) {
        throw projectAlreadyStarted();
      }

      const removed = await projects.deleteOwnedById(projectId, project.company);
      if (!removed) throw projectNotFound();

      await grants.deleteByProject(project._id);
    },
  };
};

export const __testing = { encodeCursor, decodeCursor, addDays };
