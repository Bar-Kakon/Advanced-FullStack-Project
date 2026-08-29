import { Types } from 'mongoose';

import type { CompanyContext, CompanyContextService } from '../companies/companyContext.service.js';
import {
  requireMayCreateProject,
  requireMayManageProject,
  requireMayReadProjects,
  type ProjectAuthority,
} from './projectAuthorization.js';
import type { ProjectDto, ProjectPageDto } from './project.dto.js';
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
  list(userId: string, limit: number, cursor?: string): Promise<ProjectPageDto>;
  getOne(userId: string, projectId: string): Promise<ProjectDto>;
  update(userId: string, projectId: string, body: UpdateProjectBody): Promise<ProjectDto>;
  cancel(userId: string, projectId: string): Promise<void>;
}

export interface ProjectsDependencies {
  readonly projects: ProjectRepository;
  readonly companyContext: CompanyContextService;
  readonly execution: ProjectExecutionPort;
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

const toDto = (project: ProjectRecord): ProjectDto => ({
  id: project._id.toString(),
  companyId: project.company.toString(),
  name: project.name,
  description: project.description ?? null,
  location: {
    place: project.location?.place ?? null,
    city: project.location?.city ?? null,
    region: project.location?.region ?? null,
    address: project.location?.address ?? null,
  },
  dates: {
    startDate: formatCalendarDate(project.startDate),
    targetEndDate: formatCalendarDate(project.targetEndDate),
    originalTargetEndDate: formatCalendarDate(project.originalTargetEndDate),
    overrunAllowanceDays: project.overrunAllowanceDays,
    overrunCeilingDate: formatCalendarDate(
      overrunCeiling(project.originalTargetEndDate, project.overrunAllowanceDays),
    ),
    overrunDaysFromOriginal: overrunFromOriginal(project.originalTargetEndDate, project.targetEndDate),
  },
  status: deriveStatus(project),
  cancellable: isCancellable(project),
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

export const createProjectsService = ({
  projects,
  companyContext,
  execution,
}: ProjectsDependencies): ProjectsService => {
  /** The caller's company is read from their session, never from the request body. */
  const authorityFor = async (
    userId: string,
    require: (context: CompanyContext | null) => ProjectAuthority,
  ) => require(await companyContext.forUser(userId));

  const load = async (userId: string, projectId: string, require = requireMayReadProjects) => {
    const context = await authorityFor(userId, require);
    const project = await projects.findOwnedById(projectId, new Types.ObjectId(context.companyId));
    // Another company's project, and one that never existed, answer identically (D16).
    if (project === null) throw projectNotFound();
    return { context, project };
  };

  return {
    async create(userId, body) {
      const context = await authorityFor(userId, requireMayCreateProject);

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
      });

      return toDto(created);
    },

    async list(userId, limit, cursor) {
      const context = await authorityFor(userId, requireMayReadProjects);
      const rows = await projects.listByCompany(
        new Types.ObjectId(context.companyId),
        decodeCursor(cursor),
        limit + 1,
      );

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        projects: page.map(toDto),
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeCursor({ createdAt: last.createdAt, id: last._id })
            : null,
      };
    },

    async getOne(userId, projectId) {
      const { project } = await load(userId, projectId);
      return toDto(project);
    },

    async update(userId, projectId, body) {
      const { project } = await load(userId, projectId, requireMayManageProject);

      const update: ProjectUpdate = {};
      if (body.name !== undefined) Object.assign(update, { name: body.name });
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
            changedBy: new Types.ObjectId(userId),
          }
        : null;

      const updated = await projects.update(project._id, update, targetChange, { clearLocation });
      if (updated === null) throw projectNotFound();
      return toDto(updated);
    },

    async cancel(userId, projectId) {
      const { context, project } = await load(userId, projectId, requireMayManageProject);

      // Pre-start only. The stored flags answer first; the port covers the case where execution
      // has begun but the flag has not been written yet.
      if (!isCancellable(project) || (await execution.hasFirstTaskStarted(projectId))) {
        throw projectAlreadyStarted();
      }

      const removed = await projects.deleteOwnedById(projectId, new Types.ObjectId(context.companyId));
      if (!removed) throw projectNotFound();
    },
  };
};

export const __testing = { toDto, encodeCursor, decodeCursor, addDays };
