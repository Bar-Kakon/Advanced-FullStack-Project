import { Types } from 'mongoose';

import { GRIDFS_DRIVER, openGridFsDownloadStream } from '../files/gridFs.service.js';
import type { StoredUpload } from '../files/fileAsset.service.js';
import type { FileAssetRecord, FileVisibility, WorkPlanScope } from '../files/fileAsset.model.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import { effectiveProjectPermissions } from '../projectaccess/projectPermission.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { TaskRecord } from '../tasks/task.model.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import { viewpointOf } from '../tasks/taskVisibility.js';
import { attributableUploader, toWorkPlanDto, type WorkPlanDto } from './workPlan.dto.js';
import {
  notPermittedToManageWorkPlans,
  visibilityNotPermitted,
  workPlanNotFound,
} from './workPlan.errors.js';
import {
  allowedVisibilityFor,
  mayMarkCurrent,
  mayRead,
  mayUpload,
  type WorkPlanViewer,
} from './workPlanAuthority.js';
import type { WorkPlanRepository } from './workPlan.repository.js';

export interface WorkPlanScopeRef {
  readonly type: WorkPlanScope;
  readonly id: string;
}

export interface WorkPlanService {
  upload(userId: string, scope: WorkPlanScopeRef, visibility: FileVisibility, upload: StoredUpload): Promise<WorkPlanDto>;
  addVersion(userId: string, groupId: string, upload: StoredUpload): Promise<WorkPlanDto>;
  listForScope(userId: string, scope: WorkPlanScopeRef): Promise<readonly WorkPlanDto[]>;
  listVersions(userId: string, groupId: string): Promise<readonly WorkPlanDto[]>;
  markCurrent(userId: string, groupId: string, version: number): Promise<readonly WorkPlanDto[]>;
  openContent(userId: string, assetId: string): Promise<{ asset: FileAssetRecord; stream: NodeJS.ReadableStream }>;
}

export interface WorkPlanDependencies {
  readonly plans: WorkPlanRepository;
  readonly tasks: TaskRepository;
  readonly access: ProjectAccessRepository;
  readonly participants: ParticipantRepository;
  readonly notifications: NotificationDispatchService;
}

/** What one scope resolves to: the project it belongs to, and the task if it is a task scope. */
interface ResolvedScope {
  readonly projectId: Types.ObjectId | null;
  readonly task: TaskRecord | null;
}

export const createWorkPlanService = ({
  plans,
  tasks,
  access,
  participants,
  notifications,
}: WorkPlanDependencies): WorkPlanService => {
  const resolveScope = async (scope: WorkPlanScopeRef): Promise<ResolvedScope> => {
    if (scope.type === 'project') {
      if (!Types.ObjectId.isValid(scope.id)) throw workPlanNotFound();
      return { projectId: new Types.ObjectId(scope.id), task: null };
    }

    const task = await tasks.findById(scope.id);
    if (task === null) throw workPlanNotFound();
    return { projectId: task.project ?? null, task };
  };

  /**
   * Where this viewer stands, resolved once. A viewer with no standing at all is refused with the
   * same answer a missing plan gives, so probing a URL discloses nothing.
   */
  const viewerFor = async (userId: string, scope: WorkPlanScopeRef): Promise<{
    viewer: WorkPlanViewer;
    resolved: ResolvedScope;
  }> => {
    const resolved = await resolveScope(scope);
    const membership =
      resolved.projectId === null
        ? null
        : await access.findActiveMembership(resolved.projectId, new Types.ObjectId(userId));

    const reachesProject = membership !== null;
    const holdsWorkPlanManage =
      membership !== null && effectiveProjectPermissions(membership).includes('workplan.manage');

    const taskViewpoint =
      resolved.task === null ? null : viewpointOf(resolved.task, { userId, reachesProject });

    const viewer: WorkPlanViewer = {
      scopeType: scope.type,
      reachesProject,
      holdsWorkPlanManage,
      taskViewpoint,
    };

    if (!reachesProject && taskViewpoint !== 'assignee' && taskViewpoint !== 'delegate') {
      throw workPlanNotFound();
    }
    return { viewer, resolved };
  };

  const scopeOf = (asset: FileAssetRecord): WorkPlanScopeRef => ({
    type: asset.scope.type as WorkPlanScope,
    id: (asset.scope.id ?? new Types.ObjectId()).toString(),
  });

  /** Resolves display names for a set of rows, after attribution has already been applied. */
  const render = async (
    rows: readonly FileAssetRecord[],
    resolved: ResolvedScope,
  ): Promise<readonly WorkPlanDto[]> => {
    const delegate = resolved.task?.delegation?.delegate ?? null;
    const responsible = resolved.task?.assignee ?? null;

    const ids = rows
      .map((row) => attributableUploader(row, responsible, delegate))
      .filter((id): id is Types.ObjectId => id !== null);
    const people = await participants.findByIds(ids);
    const names = new Map(
      people.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`]),
    );

    return rows.map((row) => {
      const attributed = attributableUploader(row, responsible, delegate);
      return toWorkPlanDto(row, attributed === null ? null : names.get(attributed.toString()) ?? null);
    });
  };

  const loadGroup = async (userId: string, groupId: string) => {
    if (!Types.ObjectId.isValid(groupId)) throw workPlanNotFound();

    const versions = await plans.listVersions(new Types.ObjectId(groupId));
    const newest = versions[0];
    if (newest === undefined) throw workPlanNotFound();

    const { viewer, resolved } = await viewerFor(userId, scopeOf(newest));
    // The group's visibility is the visibility of its rows; they are written as one channel.
    if (!mayRead(newest.visibility ?? 'shared', viewer)) throw workPlanNotFound();

    return { versions, viewer, resolved, newest };
  };

  return {
    async upload(userId, scope, visibility, stored) {
      const { viewer, resolved } = await viewerFor(userId, scope);
      if (!mayUpload(viewer)) throw notPermittedToManageWorkPlans();
      if (!allowedVisibilityFor(viewer).includes(visibility)) throw visibilityNotPermitted();

      const versionGroup = new Types.ObjectId();
      const created = await plans.create({
        owner: new Types.ObjectId(userId),
        scope: { type: scope.type, id: new Types.ObjectId(scope.id) },
        filename: stored.filename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storage: { driver: GRIDFS_DRIVER, fileId: stored.gridFsFileId },
        versionGroup,
        version: 1,
        visibility,
      });

      const [dto] = await render([created], resolved);
      if (dto === undefined) throw workPlanNotFound();
      return dto;
    },

    /**
     * A new version inherits the group's scope and visibility rather than accepting them again:
     * a later version must never quietly move a private plan into the party above's view.
     */
    async addVersion(userId, groupId, stored) {
      const { newest, viewer, resolved } = await loadGroup(userId, groupId);
      const visibility = newest.visibility ?? 'shared';
      if (!mayUpload(viewer)) throw notPermittedToManageWorkPlans();
      if (!allowedVisibilityFor(viewer).includes(visibility)) throw visibilityNotPermitted();

      const group = new Types.ObjectId(groupId);
      const next = (await plans.highestVersion(group)) + 1;
      const created = await plans.create({
        owner: new Types.ObjectId(userId),
        scope: { type: newest.scope.type as WorkPlanScope, id: newest.scope.id ?? new Types.ObjectId() },
        filename: stored.filename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storage: { driver: GRIDFS_DRIVER, fileId: stored.gridFsFileId },
        versionGroup: group,
        version: next,
        visibility,
      });
      // The newest upload becomes current, and every earlier one stays readable as history.
      await plans.setCurrent(group, next);

      /**
       * Informational: a new version is worth knowing about, but nothing stops without it, so it
       * aggregates into the digest rather than interrupting.
       *
       * A PRIVATE plan notifies nobody. Telling the other side a version exists is precisely the
       * disclosure its visibility withholds, so the notice is skipped rather than sanitised.
       */
      if (visibility === 'shared' && newest.scope.type === 'task' && newest.scope.id) {
        const task = await tasks.findById(newest.scope.id.toString());
        const audience = [task?.assignee, task?.createdBy].filter(
          (id): id is Types.ObjectId => id !== undefined && id.toString() !== userId,
        );

        await notifications.emitMany(
          audience.map((to) => ({
            userId: to,
            type: 'workplan.version_added' as const,
            ...(task?.project === undefined ? {} : { projectId: task.project }),
            taskId: newest.scope.id as Types.ObjectId,
            payload: { taskTitle: task?.title ?? '', count: next },
            dedupeKey: `workplan.version_added:${created._id.toString()}:${to.toString()}`,
          })),
        );
      }

      const [dto] = await render([{ ...created, isCurrent: true }], resolved);
      if (dto === undefined) throw workPlanNotFound();
      return dto;
    },

    async listForScope(userId, scope) {
      const { viewer, resolved } = await viewerFor(userId, scope);
      const rows = await plans.listCurrentForScope(scope.type, new Types.ObjectId(scope.id));
      return render(rows.filter((row) => mayRead(row.visibility ?? 'shared', viewer)), resolved);
    },

    async listVersions(userId, groupId) {
      const { versions, resolved } = await loadGroup(userId, groupId);
      return render(versions, resolved);
    },

    async markCurrent(userId, groupId, version) {
      const { newest, viewer, resolved } = await loadGroup(userId, groupId);
      if (!mayMarkCurrent(newest.visibility ?? 'shared', viewer)) throw notPermittedToManageWorkPlans();

      const group = new Types.ObjectId(groupId);
      const target = await plans.findVersion(group, version);
      if (target === null) throw workPlanNotFound();

      await plans.setCurrent(group, version);
      return render(await plans.listVersions(group), resolved);
    },

    async openContent(userId, assetId) {
      const asset = await plans.findById(assetId);
      if (asset === null) throw workPlanNotFound();

      const { viewer } = await viewerFor(userId, scopeOf(asset));
      if (!mayRead(asset.visibility ?? 'shared', viewer)) throw workPlanNotFound();

      return { asset, stream: openGridFsDownloadStream(asset.storage.fileId) };
    },
  };
};
