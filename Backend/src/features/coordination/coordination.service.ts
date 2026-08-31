import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import type { CompanyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { workingDaysBetween } from '../calendar/workingDay.js';
import { NoWorkingDaysError } from '../calendar/workingDay.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import { effectiveProjectPermissions } from '../projectaccess/projectPermission.js';
import type { ParticipantRepository } from '../projectmembers/participant.repository.js';
import type { ProjectRecord } from '../projects/project.model.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { projectNotFound } from '../projects/project.errors.js';
import { formatCalendarDate } from '../projects/projectDates.js';
import {
  hasProjectPermission,
  requireActiveCompany,
  resolveProjectAccess,
} from '../projects/projectAuthorization.js';
import { ProjectStageModel, type ProjectStageRecord } from '../tasks/projectStage.model.js';
import { TaskModel, type TaskRecord } from '../tasks/task.model.js';
import type { AuditRepository, NewAuditEntry } from './audit.repository.js';
import {
  candidateSchedules,
  computeImpact,
  loadProjectGraph,
  type AlternativesConstraints,
  type ProjectGraph,
} from './cascade.service.js';
import type { HandoffRecord, HandoffState } from './handoff.model.js';
import type { HandoffRepository } from './handoff.repository.js';
import {
  mayAdjustImpact,
  mayCancel,
  mayLaunch,
  mayReadFullAudit,
  mayReleasePartially,
  mayRequestChange,
  mayResolve,
  mayRespondTo,
  type CoordinationViewer,
} from './coordination.authority.js';
import type {
  AlternativesDto,
  AuditEntryDto,
  ExplanationEntryDto,
  HandoffDto,
  HandoffMode,
  HandoffViewDto,
  ImpactPreviewDto,
  PendingActionsDto,
  ProposalDto,
  ProposalListRowDto,
  ScheduleCandidateDto,
} from './coordination.dto.js';
import { toPreviewDto, toProposalDto, type NameLookup } from './coordination.mapper.js';
import {
  alreadyAnswered,
  alternativeNotFound,
  beyondProjectCeiling,
  calendarHasNoWorkingDays,
  changeIsEmpty,
  counterNeedsDates,
  handoffAlreadyOpen,
  handoffNeedsCompletionRecord,
  handoffNotFound,
  handoffResponsibilityMoved,
  handoffTargetInvalid,
  notARespondent,
  notPermittedToHandOff,
  notPermittedToManageSchedule,
  notPermittedToRequest,
  otherSolutionNeedsDescription,
  proposalNotFound,
  proposalNotOpen,
  releaseNeedsTasks,
  resolutionNotSupported,
} from './coordination.errors.js';
import {
  DEFAULT_PROPOSAL_RESPONSE_HOURS,
  type ItemResolution,
  type JustifiedDeclineReason,
  type ProposalRecord,
  type RequestedChanges,
} from './proposal.model.js';
import type { ItemDecision, ProposalRepository } from './proposal.repository.js';

const toHandoffDto = (
  handoff: HandoffRecord,
  taskTitle: string,
  userId: string,
  manages: boolean,
  names: ReadonlyMap<string, string>,
): HandoffDto => ({
  id: handoff._id.toString(),
  taskId: handoff.task.toString(),
  taskTitle,
  kind: handoff.kind,
  state: handoff.state,
  fromName: names.get(handoff.from.toString()) ?? null,
  toName: names.get(handoff.to.toString()) ?? null,
  completedWorkAtHandover: handoff.completedWorkAtHandover,
  initiatedAt: handoff.initiatedAt.toISOString(),
  decidedAt: handoff.decidedAt?.toISOString() ?? null,
  viewerDecides:
    handoff.state === 'proposed' &&
    (handoff.kind === 'authority' ? handoff.to.toString() === userId : manages),
});

const AUDIT_PAGE = 100;
const MS_PER_HOUR = 3_600_000;

const TRANSFER_SWEEP_BATCH = 50;

class ResponsibilityAlreadyMoved extends Error {}

export interface RequestInput {
  readonly changes: RequestedChanges;
  readonly reason?: string;
  readonly responseHours?: number;
}

export interface RespondInput {
  readonly response: 'accepted' | 'declined' | 'countered' | 'other_proposed';
  readonly declineReason?: JustifiedDeclineReason;
  readonly counterStart?: Date;
  readonly counterDue?: Date;
  readonly otherSolution?: string;
}

export interface AlternativesInput {
  readonly earliestStart?: Date;
  readonly latestFinishForWork?: Date;
  readonly latestFinishForChain?: Date;
  readonly mustNotMove?: readonly string[];
  readonly note?: string;
}

export interface HandoffInput {
  readonly toUserId?: string;
  readonly completedWorkAtHandover: string;
  readonly proposalId?: string;
}

export interface TransferSweepResult {
  readonly examined: number;
  readonly completed: number;
  readonly declined: number;
  readonly waiting: number;
}

export interface ResolveInput {
  readonly decisions: readonly ItemDecision[];
  readonly note?: string;
}

export interface CoordinationService {
  preview(userId: string, taskId: string, changes: RequestedChanges): Promise<ImpactPreviewDto>;
  request(userId: string, taskId: string, input: RequestInput): Promise<ProposalDto>;
  get(userId: string, proposalId: string): Promise<ProposalDto>;
  launch(userId: string, proposalId: string): Promise<ProposalDto>;
  setExcluded(userId: string, proposalId: string, itemId: string, excluded: boolean): Promise<ProposalDto>;
  respond(userId: string, proposalId: string, itemId: string, input: RespondInput): Promise<ProposalDto>;
  resolve(userId: string, proposalId: string, input: ResolveInput): Promise<ProposalDto>;
  cancel(userId: string, proposalId: string): Promise<ProposalDto>;
  listForProject(userId: string, projectId: string): Promise<readonly ProposalListRowDto[]>;
  auditForProject(userId: string, projectId: string): Promise<readonly AuditEntryDto[]>;
  releasePartially(
    userId: string,
    projectId: string,
    stageId: string,
    taskIds: readonly string[],
    note?: string,
  ): Promise<{ readonly stageId: string; readonly releasedTaskIds: readonly string[] }>;
  alternatives(userId: string, proposalId: string): Promise<AlternativesDto>;
  requestAlternatives(
    userId: string,
    proposalId: string,
    input: AlternativesInput,
  ): Promise<AlternativesDto>;
  selectAlternative(userId: string, proposalId: string, token: string): Promise<ProposalDto>;
  initiateHandoff(userId: string, taskId: string, input: HandoffInput): Promise<HandoffDto>;
  decideHandoff(userId: string, handoffId: string, accept: boolean): Promise<HandoffDto>;
  handoffViewFor(userId: string, taskId: string): Promise<HandoffViewDto>;
  completeAfterMembership(userId: string, projectId: string): Promise<void>;
  abandonAfterMembershipDeclined(userId: string, projectId: string): Promise<void>;
  settleAwaitingTransfers(limit?: number): Promise<TransferSweepResult>;
  pendingActionsFor(userId: string): Promise<ReadonlyMap<string, PendingActionsDto>>;
  pendingActionTotals(userId: string): Promise<PendingActionsDto>;
  pendingFor(userId: string, taskIds: readonly string[]): Promise<ReadonlyMap<string, boolean>>;
  impactCountFor(taskId: string): Promise<number | null>;
  recordEarlyCompletion(taskId: string): Promise<void>;
}

export interface CoordinationDependencies {
  readonly proposals: ProposalRepository;
  readonly handoffs: HandoffRepository;
  readonly audit: AuditRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly calendars: CompanyCalendarRepository;
  readonly participants: ParticipantRepository;
  readonly companyContext: CompanyContextService;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
  readonly notifications: NotificationDispatchService;
}

export const createCoordinationService = ({
  proposals,
  handoffs,
  audit,
  projects,
  access,
  grants,
  calendars,
  participants,
  companyContext,
  transactions,
  notifications,
}: CoordinationDependencies): CoordinationService => {
  const reach = async (
    userId: string,
    projectId: string,
  ): Promise<{ project: ProjectRecord; viewer: CoordinationViewer }> => {
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

    return {
      project,
      viewer: {
        userId,
        reachesProject: true,
        managesSchedule: hasProjectPermission(resolved, 'schedule.change.manage'),
        mayPartialRelease: hasProjectPermission(resolved, 'schedule.partial_release.manage'),
      },
    };
  };

  const namesOf = async (ids: readonly Types.ObjectId[]): Promise<Map<string, string>> => {
    const unique = [...new Map(ids.map((id) => [id.toString(), id])).values()];
    const people = await participants.findByIds(unique);
    return new Map(
      people.map((person) => [person._id.toString(), `${person.firstName} ${person.lastName}`.trim()]),
    );
  };

  const lookupFor = async (graph: ProjectGraph, extra: readonly Types.ObjectId[] = []): Promise<NameLookup> => ({
    tasks: new Map(graph.tasks.map((task) => [task._id.toString(), task])),
    stages: new Map(graph.stages.map((stage) => [stage._id.toString(), stage])),
    people: await namesOf([
      ...graph.tasks.flatMap((task) => (task.assignee === undefined ? [] : [task.assignee])),
      ...extra,
    ]),
  });

  const nameOf = async (id: Types.ObjectId): Promise<string> =>
    (await namesOf([id])).get(id.toString()) ?? '';

  const standsAsMember = async (handoff: HandoffRecord): Promise<boolean> =>
    (await access.findActiveMembership(handoff.project, handoff.to)) !== null;

  const companyOf = async (user: Types.ObjectId): Promise<{ company?: Types.ObjectId }> => {
    const [person] = await participants.findByIds([user]);
    return person?.companyId ? { company: person.companyId } : {};
  };

  const moveResponsibility = async (
    handoff: HandoffRecord,
    by: Types.ObjectId,
    at: Date,
    from: readonly HandoffState[],
  ): Promise<HandoffRecord | null> => {
    try {
      return await transactions.run(async (session) => {
        const won = await handoffs.accept(handoff._id, by, at, from, session);
        if (won === null) throw new ResponsibilityAlreadyMoved();

        const moved = await TaskModel.updateOne(
          { _id: won.task, assignee: won.from },
          { $set: { assignee: won.to, previousAssignee: won.from }, $unset: { delegation: '' } },
          { session },
        ).exec();
        if (moved.matchedCount === 0) throw new ResponsibilityAlreadyMoved();
        return won;
      });
    } catch (error) {
      if (error instanceof ResponsibilityAlreadyMoved) return null;
      throw error;
    }
  };

  const appendTransferEntry = async (
    handoff: HandoffRecord,
    action: 'work.handoff_accepted' | 'work.handoff_declined',
  ): Promise<void> => {
    const task = await TaskModel.findById(handoff.task).lean<TaskRecord>().exec();
    await audit.append([
      {
        project: handoff.project,
        task: handoff.task,
        actor: handoff.from,
        actorName: await nameOf(handoff.from),
        action,
        parties: [handoff.from, handoff.to],
        details: { taskTitle: task?.title ?? null },
        partyDetails: { taskTitle: task?.title ?? null },
      },
    ]);
  };

  const completeTransfer = async (handoff: HandoffRecord): Promise<HandoffRecord | null> => {
    const at = new Date();
    const settled = await moveResponsibility(handoff, handoff.to, at, ['awaiting_membership']);
    if (settled === null) {
      await handoffs.settle(handoff._id, 'cancelled', handoff.to, at, ['awaiting_membership']);
      return null;
    }
    await appendTransferEntry(settled, 'work.handoff_accepted');
    return settled;
  };

  const abandonTransfer = async (handoff: HandoffRecord): Promise<boolean> => {
    const settled = await handoffs.settle(handoff._id, 'declined', handoff.to, new Date(), [
      'awaiting_membership',
    ]);
    if (settled === null) return false;
    await appendTransferEntry(settled, 'work.handoff_declined');
    return true;
  };

  const awaitingFor = async (userId: string, projectId: string): Promise<HandoffRecord | null> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(projectId)) return null;
    return handoffs.findAwaitingMembership(
      new Types.ObjectId(projectId),
      new Types.ObjectId(userId),
    );
  };

  const pendingBaseline = async (
    projectId: Types.ObjectId,
    exclude?: Types.ObjectId,
  ): Promise<Map<string, { start: Date; due: Date }>> => {
    const open = await proposals.listForProject(projectId, 200);
    const baseline = new Map<string, { start: Date; due: Date }>();

    for (const proposal of open) {
      if (proposal.status !== 'open' && proposal.status !== 'expired') continue;
      if (exclude !== undefined && proposal._id.equals(exclude)) continue;

      for (const item of proposal.items) {
        if (item.excluded) continue;
        const current = baseline.get(item.task.toString());
        if (current === undefined || item.proposedDue.getTime() > current.due.getTime()) {
          baseline.set(item.task.toString(), { start: item.proposedStart, due: item.proposedDue });
        }
      }
    }
    return baseline;
  };

  const withBaseline = (graph: ProjectGraph, baseline: ReadonlyMap<string, { start: Date; due: Date }>): ProjectGraph => ({
    ...graph,
    tasks: graph.tasks.map((task) => {
      const pending = baseline.get(task._id.toString());
      return pending === undefined ? task : { ...task, startDate: pending.start, dueDate: pending.due };
    }),
  });

  const graphFor = async (project: ProjectRecord, exclude?: Types.ObjectId): Promise<ProjectGraph> => {
    const graph = await loadProjectGraph(project, calendars);
    return withBaseline(graph, await pendingBaseline(project._id, exclude));
  };

  const constraintsOf = (proposal: ProposalRecord): AlternativesConstraints => {
    const context = proposal.alternativesContext;
    return {
      ...(context?.earliestStart === undefined ? {} : { earliestStart: context.earliestStart }),
      ...(context?.latestFinishForWork === undefined ? {} : { latestFinishForWork: context.latestFinishForWork }),
      ...(context?.latestFinishForChain === undefined
        ? {}
        : { latestFinishForChain: context.latestFinishForChain }),
      mustNotMove: (context?.mustNotMove ?? []).map((id) => id.toString()),
    };
  };

  const alternativesFor = async (
    proposal: ProposalRecord,
    project: ProjectRecord,
  ): Promise<AlternativesDto> => {
    const context = proposal.alternativesContext;
    if (context === undefined) {
      return {
        requested: false,
        constraints: null,
        candidates: [],
        explanation: [],
        sweepTruncated: false,
        anchorsEvaluated: 0,
      };
    }

    const graph = await graphFor(project, proposal._id);
    const task = graph.tasks.find((row) => row._id.equals(proposal.initiatingTask));
    const titleOf = (id: string): string =>
      graph.tasks.find((row) => row._id.toString() === id)?.title ?? '';

    const constraintsDto = {
      earliestStart: context.earliestStart === undefined ? null : formatCalendarDate(context.earliestStart),
      latestFinishForWork:
        context.latestFinishForWork === undefined ? null : formatCalendarDate(context.latestFinishForWork),
      latestFinishForChain:
        context.latestFinishForChain === undefined ? null : formatCalendarDate(context.latestFinishForChain),
      mustNotMoveTitles: context.mustNotMove.map((id) => titleOf(id.toString())),
      note: context.note ?? null,
    };

    if (task === undefined) {
      return {
        requested: true,
        constraints: constraintsDto,
        candidates: [],
        explanation: [],
        sweepTruncated: false,
        anchorsEvaluated: 0,
      };
    }

    const found = guardCalendar(() =>
      candidateSchedules(graph, task, proposal.changes, constraintsOf(proposal)),
    );

    const candidates: ScheduleCandidateDto[] = found.candidates.map((candidate) => ({
      token: candidate.token,
      startDate: candidate.startDate,
      dueDate: candidate.dueDate,
      affectedTaskCount: candidate.affectedTaskCount,
      affectedProfessionalCount: candidate.affectedProfessionalCount,
      onlyInitiatingWorkMoves: candidate.onlyInitiatingWorkMoves,
      latestFinishInArrangement: candidate.latestFinishInArrangement,
      equivalentAnchorCount: candidate.equivalentAnchorCount,
      selected: proposal.selectedAlternative === candidate.token,
    }));

    const explanation: ExplanationEntryDto[] = found.explanation.map((entry) => ({
      code: entry.code,
      anchorsUnavailable: entry.anchorsUnavailable ?? null,
      candidatesEliminated: entry.candidatesEliminated ?? null,
      outcomesCollapsed: entry.outcomesCollapsed ?? null,
      arrangementsForced: entry.arrangementsForced ?? null,
      taskTitles: (entry.taskIds ?? []).map(titleOf),
      date: entry.date ?? null,
    }));

    return {
      requested: true,
      constraints: constraintsDto,
      candidates,
      explanation,
      sweepTruncated: found.sweepTruncated,
      anchorsEvaluated: found.anchorsEvaluated,
    };
  };

  const shiftDays = (graph: ProjectGraph) => (from: Date, to: Date): number => {
    if (to.getTime() === from.getTime()) return 0;
    const forward = to.getTime() > from.getTime();
    const span = workingDaysBetween(graph.projectCalendar, forward ? from : to, forward ? to : from);
    return forward ? Math.max(0, span - 1) : -Math.max(0, span - 1);
  };

  const loadTask = async (taskId: string): Promise<TaskRecord> => {
    if (!Types.ObjectId.isValid(taskId)) throw proposalNotFound();
    const task = await TaskModel.findById(new Types.ObjectId(taskId)).lean<TaskRecord>().exec();
    if (task === null || task.project === undefined) throw proposalNotFound();
    return task;
  };

  const guardCalendar = <T>(work: () => T): T => {
    try {
      return work();
    } catch (error) {
      if (error instanceof NoWorkingDaysError) throw calendarHasNoWorkingDays();
      throw error;
    }
  };

  const settleExpiry = async (proposal: ProposalRecord): Promise<ProposalRecord> => {
    if (proposal.status !== 'open' || proposal.expiresAt === undefined) return proposal;

    const now = new Date();
    if (proposal.expiresAt.getTime() > now.getTime()) return proposal;

    const expired = await proposals.expire(proposal._id, now);
    if (expired === null) return (await proposals.findById(proposal._id.toString())) ?? proposal;

    const actor = expired.launchedBy ?? expired.requestedBy;
    await audit.append([
      {
        project: expired.project,
        task: expired.initiatingTask,
        proposal: expired._id,
        actor,
        actorName: await nameOf(actor),
        action: 'proposal.expired',
        parties: expired.items.map((item) => item.respondent),
        details: { pending: expired.items.filter((item) => item.response === 'pending').length },
        partyDetails: {},
      },
    ]);
    return expired;
  };

  const loadProposal = async (
    userId: string,
    proposalId: string,
  ): Promise<{ proposal: ProposalRecord; project: ProjectRecord; viewer: CoordinationViewer }> => {
    const found = await proposals.findById(proposalId);
    if (found === null) throw proposalNotFound();

    const { project, viewer } = await reach(userId, found.project.toString()).catch(() => {
      throw proposalNotFound();
    });

    const proposal = await settleExpiry(found);
    const isParty =
      viewer.managesSchedule ||
      proposal.requestedBy.toString() === userId ||
      proposal.items.some((item) => item.respondent.toString() === userId);
    if (!isParty) throw proposalNotFound();

    return { proposal, project, viewer };
  };

  const present = async (
    proposal: ProposalRecord,
    project: ProjectRecord,
    viewer: CoordinationViewer,
  ): Promise<ProposalDto> => {
    const graph = await loadProjectGraph(project, calendars);
    const lookup = await lookupFor(graph, [proposal.requestedBy]);
    const expired =
      proposal.status === 'expired' ||
      (proposal.status === 'open' &&
        proposal.expiresAt !== undefined &&
        proposal.expiresAt.getTime() <= Date.now());

    let ceiling = null;
    if (viewer.managesSchedule) {
      const initiating = graph.tasks.find((task) => task._id.equals(proposal.initiatingTask));
      if (initiating !== undefined) {
        ceiling = guardCalendar(() => computeImpact(graph, initiating, proposal.changes)).ceiling;
      }
    }
    return toProposalDto(proposal, viewer, lookup, expired, ceiling);
  };

  const isEmptyChange = (changes: RequestedChanges): boolean =>
    changes.deltaWorkingDays === undefined &&
    changes.alternativeStart === undefined &&
    changes.alternativeDue === undefined;

  const buildItems = (
    graph: ProjectGraph,
    task: TaskRecord,
    changes: RequestedChanges,
    requesterIsAssignee: boolean,
    requester: Types.ObjectId,
  ) => {
    const { result, ceiling } = guardCalendar(() => computeImpact(graph, task, changes));
    const byId = new Map(graph.tasks.map((row) => [row._id.toString(), row]));
    const now = new Date();

    const items = result.items.flatMap((item) => {
      const row = byId.get(item.taskId);
      const respondent = row?.assignee;
      if (row === undefined || respondent === undefined) return [];

      const isInitiating = item.reason === 'initiating';
      const preAccepted = isInitiating && requesterIsAssignee && respondent.equals(requester);

      return [
        {
          task: row._id,
          respondent,
          currentStart: item.currentStart,
          currentDue: item.currentDue,
          proposedStart: item.proposedStart,
          proposedDue: item.proposedDue,
          reason: item.reason,
          response: (preAccepted ? 'accepted' : 'pending') as 'accepted' | 'pending',
          ...(preAccepted ? { respondedAt: now } : {}),
          resolution: 'none' as ItemResolution,
          excluded: false,
        },
      ];
    });

    return { items, result, ceiling };
  };

  const applyDates = async (
    proposal: ProposalRecord,
    decisions: readonly ItemDecision[],
    session: DbSession,
  ): Promise<{ applied: string[]; stale: string[] }> => {
    const byId = new Map(decisions.map((decision) => [decision.itemId, decision.resolution]));
    const applied: string[] = [];
    const stale: string[] = [];

    for (const item of proposal.items) {
      const decision = byId.get(item._id.toString());
      if (decision !== 'proposed' && decision !== 'counter') continue;

      const start = decision === 'counter' ? item.counterStart : item.proposedStart;
      const due = decision === 'counter' ? item.counterDue : item.proposedDue;
      if (start === undefined || due === undefined) continue;

      const updated = await TaskModel.updateOne(
        { _id: item.task, startDate: item.currentStart, dueDate: item.currentDue },
        { $set: { startDate: start, dueDate: due } },
        { session },
      ).exec();

      if (updated.matchedCount === 0) stale.push(item.task.toString());
      else applied.push(item.task.toString());
    }
    return { applied, stale };
  };

  const recascadeFromCounters = async (
    project: ProjectRecord,
    resolved: ProposalRecord,
    decisions: readonly ItemDecision[],
    resolver: Types.ObjectId,
  ): Promise<void> => {
    const countered = resolved.items.filter(
      (item) =>
        decisions.find((decision) => decision.itemId === item._id.toString())?.resolution === 'counter',
    );
    if (countered.length === 0) return;

    const alreadyHandled = new Set(resolved.items.map((item) => item.task.toString()));

    for (const item of countered) {
      const graph = await graphFor(project, resolved._id);
      const task = graph.tasks.find((row) => row._id.equals(item.task));
      if (task === undefined) continue;

      const changes: RequestedChanges = {
        ...(item.counterStart === undefined ? {} : { alternativeStart: item.counterStart }),
        ...(item.counterDue === undefined ? {} : { alternativeDue: item.counterDue }),
      };
      const { items } = buildItems(graph, task, changes, false, resolver);
      const fresh = items.filter((row) => !alreadyHandled.has(row.task.toString()));
      if (fresh.length === 0) continue;

      const child = await proposals.create({
        project: project._id,
        initiatingTask: task._id,
        requestedBy: item.respondent,
        ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
        changes,
        responseHours: resolved.responseHours,
        parentProposal: resolved._id,
        items: fresh,
      });
      const launched = await proposals.launch(
        child._id,
        resolver,
        new Date(Date.now() + resolved.responseHours * MS_PER_HOUR),
      );

      await audit.append([
        {
          project: project._id,
          task: task._id,
          proposal: child._id,
          actor: resolver,
          actorName: await nameOf(resolver),
          action: 'proposal.launched',
          parties: fresh.map((row) => row.respondent),
          details: { affected: fresh.length, fromCounterOn: resolved._id.toString() },
          partyDetails: { affected: fresh.length },
        },
      ]);
      for (const row of fresh) alreadyHandled.add(row.task.toString());
      void launched;
    }
  };

  return {
    async preview(userId, taskId, changes) {
      if (isEmptyChange(changes)) throw changeIsEmpty();

      const task = await loadTask(taskId);
      const { project, viewer } = await reach(userId, (task.project as Types.ObjectId).toString());
      if (!mayRequestChange(viewer, task)) throw notPermittedToRequest();

      const graph = await graphFor(project);
      const { result, ceiling } = guardCalendar(() => computeImpact(graph, task, changes));
      const lookup = await lookupFor(graph);

      return toPreviewDto(task, changes, result, ceiling, lookup, viewer.managesSchedule, shiftDays(graph));
    },

    async request(userId, taskId, input) {
      if (isEmptyChange(input.changes)) throw changeIsEmpty();

      const task = await loadTask(taskId);
      const { project, viewer } = await reach(userId, (task.project as Types.ObjectId).toString());
      if (!mayRequestChange(viewer, task)) throw notPermittedToRequest();

      const graph = await graphFor(project);
      const requester = new Types.ObjectId(userId);
      const { items, ceiling } = buildItems(
        graph,
        task,
        input.changes,
        task.assignee?.toString() === userId,
        requester,
      );
      if (ceiling.exceeded) {
        throw beyondProjectCeiling(ceiling.latestProposedDue ?? '', ceiling.ceilingDate);
      }

      const created = await proposals.create({
        project: project._id,
        initiatingTask: task._id,
        requestedBy: requester,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        changes: input.changes,
        responseHours:
          input.responseHours ?? project.proposalResponseHours ?? DEFAULT_PROPOSAL_RESPONSE_HOURS,
        items,
      });

      await audit.append([
        {
          project: project._id,
          task: task._id,
          proposal: created._id,
          actor: requester,
          actorName: await nameOf(requester),
          action: 'proposal.requested',
          parties: [requester],
          details: { affected: items.length, taskTitle: task.title },
          partyDetails: { affected: items.length, taskTitle: task.title },
        },
      ]);

      return present(created, project, viewer);
    },

    async get(userId, proposalId) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      return present(proposal, project, viewer);
    },

    async launch(userId, proposalId) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayLaunch(viewer)) throw notPermittedToManageSchedule();
      if (proposal.status !== 'requested') throw proposalNotOpen();

      const graph = await loadProjectGraph(project, calendars);
      const initiating = graph.tasks.find((task) => task._id.equals(proposal.initiatingTask));
      if (initiating !== undefined) {
        const { ceiling } = guardCalendar(() => computeImpact(graph, initiating, proposal.changes));
        if (ceiling.exceeded) {
          throw beyondProjectCeiling(ceiling.latestProposedDue ?? '', ceiling.ceilingDate);
        }
      }

      const actor = new Types.ObjectId(userId);
      const launched = await proposals.launch(
        proposal._id,
        actor,
        new Date(Date.now() + proposal.responseHours * MS_PER_HOUR),
      );
      if (launched === null) throw proposalNotOpen();

      const live = launched.items.filter((item) => !item.excluded);
      await audit.append([
        {
          project: project._id,
          task: launched.initiatingTask,
          proposal: launched._id,
          actor,
          actorName: await nameOf(actor),
          action: 'proposal.launched',
          parties: live.map((item) => item.respondent),
          details: { affected: live.length, responseHours: launched.responseHours },
          partyDetails: { affected: live.length, responseHours: launched.responseHours },
        },
      ]);

      // One notice per respondent, carrying no other party's dates: the item id in the key makes
      // it one row per person per proposal rather than a broadcast everybody reads differently.
      await notifications.emitMany(
        live.map((item) => ({
          userId: item.respondent,
          type: 'proposal.awaiting_response' as const,
          projectId: project._id,
          taskId: item.task,
          proposalId: launched._id,
          payload: { projectName: project.name },
          dedupeKey: `proposal.awaiting_response:${item._id.toString()}`,
        })),
      );

      return present(launched, project, viewer);
    },

    async setExcluded(userId, proposalId, itemId, excluded) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayAdjustImpact(viewer)) throw notPermittedToManageSchedule();
      if (proposal.status !== 'requested' && proposal.status !== 'open') throw proposalNotOpen();
      if (!Types.ObjectId.isValid(itemId)) throw proposalNotFound();

      const actor = new Types.ObjectId(userId);
      const updated = await proposals.setExcluded(
        proposal._id,
        new Types.ObjectId(itemId),
        excluded,
        actor,
      );
      if (updated === null) throw proposalNotOpen();

      const item = updated.items.find((row) => row._id.toString() === itemId);
      await audit.append([
        {
          project: project._id,
          ...(item === undefined ? {} : { task: item.task }),
          proposal: updated._id,
          actor,
          actorName: await nameOf(actor),
          action: excluded ? 'proposal.item_excluded' : 'proposal.item_included',
          parties: item === undefined ? [] : [item.respondent],
          details: { itemId },
          partyDetails: {},
        },
      ]);

      return present(updated, project, viewer);
    },

    async respond(userId, proposalId, itemId, input) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (proposal.status !== 'open') throw proposalNotOpen();
      if (!Types.ObjectId.isValid(itemId)) throw proposalNotFound();

      const item = proposal.items.find((row) => row._id.toString() === itemId);
      if (item === undefined) throw proposalNotFound();
      if (!mayRespondTo(viewer, item)) throw notARespondent();
      if (input.response === 'countered' && (input.counterStart === undefined || input.counterDue === undefined)) {
        throw counterNeedsDates();
      }
      if (input.response === 'other_proposed' && (input.otherSolution ?? '').trim() === '') {
        throw otherSolutionNeedsDescription();
      }

      const actor = new Types.ObjectId(userId);
      const updated = await proposals.recordResponse(
        proposal._id,
        item._id,
        actor,
        {
          response: input.response,
          ...(input.declineReason === undefined ? {} : { declineReason: input.declineReason }),
          ...(input.counterStart === undefined ? {} : { counterStart: input.counterStart }),
          ...(input.counterDue === undefined ? {} : { counterDue: input.counterDue }),
          ...(input.otherSolution === undefined ? {} : { otherSolution: input.otherSolution.trim() }),
        },
        new Date(),
      );
      if (updated === null) throw alreadyAnswered();

      const actorName = await nameOf(actor);
      const entries: NewAuditEntry[] = [
        {
          project: project._id,
          task: item.task,
          proposal: proposal._id,
          actor,
          actorName,
          action: 'proposal.response_recorded',
          parties: [actor],
          details: {
            response: input.response,
            ...(input.declineReason === undefined ? {} : { declineReason: input.declineReason }),
          },
          partyDetails: { response: input.response },
        },
      ];
      if (input.response === 'other_proposed' && input.otherSolution !== undefined) {
        entries.push({
          project: project._id,
          task: item.task,
          proposal: proposal._id,
          actor,
          actorName,
          action: 'proposal.other_solution_proposed',
          parties: [actor],
          details: { otherSolution: input.otherSolution.trim() },
          partyDetails: { otherSolution: input.otherSolution.trim() },
        });
      }
      if (input.response === 'countered' && input.counterStart && input.counterDue) {
        entries.push({
          project: project._id,
          task: item.task,
          proposal: proposal._id,
          actor,
          actorName,
          action: 'proposal.counter_submitted',
          parties: [actor],
          details: {
            counterStart: formatCalendarDate(input.counterStart),
            counterDue: formatCalendarDate(input.counterDue),
          },
          partyDetails: {
            counterStart: formatCalendarDate(input.counterStart),
            counterDue: formatCalendarDate(input.counterDue),
          },
        });
      }
      await audit.append(entries);

      /**
       * Once nobody is still being waited on, the decision is the authorised manager's to make and
       * the proposal is back with them. Raised only on the transition — the last answer, not every
       * answer — so a proposal with five respondents produces one notice per manager, not five.
       *
       * The notice carries no respondent's dates, reason or counter: the payload has no field for
       * any of them, and the manager reads the proposal itself for that.
       */
      const stillWaiting = updated.items.some(
        (row) => !row.excluded && row.response === 'pending',
      );
      if (!stillWaiting) {
        const managers = await access.listMembers(project._id);
        await notifications.emitMany(
          managers
            .filter(
              (row) =>
                row.status === 'active' &&
                effectiveProjectPermissions(row).includes('schedule.change.manage'),
            )
            .map((row) => ({
              userId: row.user,
              type: 'proposal.returned_to_management' as const,
              projectId: project._id,
              taskId: updated.initiatingTask,
              proposalId: updated._id,
              payload: { projectName: project.name, count: updated.items.length },
              dedupeKey: `proposal.returned_to_management:${updated._id.toString()}:${row.user.toString()}`,
            })),
        );
      }

      return present(updated, project, viewer);
    },

    async resolve(userId, proposalId, input) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayResolve(viewer)) throw notPermittedToManageSchedule();
      if (proposal.status !== 'open' && proposal.status !== 'expired') throw proposalNotOpen();

      const known = new Map(proposal.items.map((item) => [item._id.toString(), item]));
      const decisions = input.decisions.filter((decision) => known.has(decision.itemId));
      for (const decision of decisions) {
        const item = known.get(decision.itemId);
        if (item === undefined) continue;
        if (decision.resolution === 'counter' && item.response !== 'countered') throw resolutionNotSupported();
        if (decision.resolution === 'other' && item.response !== 'other_proposed') throw resolutionNotSupported();
        if (decision.resolution === 'proposed' && item.excluded) throw proposalNotOpen();
      }

      const actor = new Types.ObjectId(userId);
      const at = new Date();

      const outcome = await transactions.run(async (session) => {
        const settled = await proposals.resolve(
          proposal._id,
          actor,
          at,
          input.note,
          decisions,
          session,
        );
        if (settled === null) return null;

        const { applied, stale } = await applyDates(settled, decisions, session);
        return { settled, applied, stale };
      });
      if (outcome === null) throw proposalNotOpen();

      const actorName = await nameOf(actor);
      const entries: NewAuditEntry[] = [
        {
          project: project._id,
          task: proposal.initiatingTask,
          proposal: proposal._id,
          actor,
          actorName,
          action: 'proposal.resolved',
          parties: proposal.items.map((item) => item.respondent),
          details: {
            applied: outcome.applied.length,
            stale: outcome.stale.length,
            ...(input.note === undefined ? {} : { note: input.note }),
          },
          partyDetails: {},
        },
      ];

      for (const decision of decisions) {
        const item = known.get(decision.itemId);
        if (item === undefined) continue;

        if (item.response === 'countered') {
          entries.push({
            project: project._id,
            task: item.task,
            proposal: proposal._id,
            actor,
            actorName,
            action: decision.resolution === 'counter' ? 'proposal.counter_accepted' : 'proposal.counter_rejected',
            parties: [item.respondent],
            details: {},
            partyDetails: {},
          });
        }
        if (item.response === 'other_proposed') {
          entries.push({
            project: project._id,
            task: item.task,
            proposal: proposal._id,
            actor,
            actorName,
            action:
              decision.resolution === 'other'
                ? 'proposal.other_solution_agreed'
                : 'proposal.other_solution_rejected',
            parties: [item.respondent],
            details: { otherSolution: item.otherSolution ?? null },
            partyDetails: {},
          });
        }
        if (decision.resolution === 'replaced') {
          entries.push({
            project: project._id,
            task: item.task,
            proposal: proposal._id,
            actor,
            actorName,
            action: 'work.replacement_recorded',
            parties: [item.respondent],
            details: {},
            partyDetails: {},
          });
        }
        if (
          (decision.resolution === 'proposed' || decision.resolution === 'counter') &&
          outcome.applied.includes(item.task.toString())
        ) {
          const start = decision.resolution === 'counter' ? item.counterStart : item.proposedStart;
          const due = decision.resolution === 'counter' ? item.counterDue : item.proposedDue;
          entries.push({
            project: project._id,
            task: item.task,
            proposal: proposal._id,
            actor,
            actorName,
            action: 'schedule.applied',
            parties: [item.respondent],
            details: {
              startDate: start === undefined ? null : formatCalendarDate(start),
              dueDate: due === undefined ? null : formatCalendarDate(due),
            },
            partyDetails: {
              startDate: start === undefined ? null : formatCalendarDate(start),
              dueDate: due === undefined ? null : formatCalendarDate(due),
            },
          });
        }
      }
      await audit.append(entries);
      await recascadeFromCounters(project, outcome.settled, decisions, actor);

      /**
       * The resolution is what actually moves dates, so this is the notice that a schedule change
       * has landed on somebody's work. Only the respondents whose task was actually written are
       * told — a proposal that ended up not moving a task is not a change to that professional.
       */
      const moved = new Set(outcome.applied);
      await notifications.emitMany(
        outcome.settled.items
          .filter(
            (item) =>
              moved.has(item.task.toString()) && item.respondent.toString() !== userId,
          )
          .map((item) => ({
            userId: item.respondent,
            type: 'schedule.change_resolved' as const,
            projectId: project._id,
            taskId: item.task,
            proposalId: outcome.settled._id,
            payload: { projectName: project.name },
            dedupeKey: `schedule.change_resolved:${item._id.toString()}`,
          })),
      );

      return present(outcome.settled, project, viewer);
    },

    async cancel(userId, proposalId) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayCancel(viewer)) throw notPermittedToManageSchedule();

      const actor = new Types.ObjectId(userId);
      const cancelled = await proposals.cancel(proposal._id, actor, new Date());
      if (cancelled === null) throw proposalNotOpen();

      await audit.append([
        {
          project: project._id,
          task: cancelled.initiatingTask,
          proposal: cancelled._id,
          actor,
          actorName: await nameOf(actor),
          action: 'proposal.cancelled',
          parties: cancelled.items.map((item) => item.respondent),
          details: {},
          partyDetails: {},
        },
      ]);

      return present(cancelled, project, viewer);
    },

    async listForProject(userId, projectId) {
      const { project, viewer } = await reach(userId, projectId);
      const rows = await proposals.listForProject(project._id, 50);
      const settled = await Promise.all(rows.map((row) => settleExpiry(row)));

      const tasks = await TaskModel.find({ project: project._id })
        .select('title')
        .lean<{ _id: Types.ObjectId; title: string }[]>()
        .exec();
      const titles = new Map(tasks.map((task) => [task._id.toString(), task.title]));
      const names = await namesOf(settled.map((row) => row.requestedBy));

      return settled
        .filter(
          (row) =>
            viewer.managesSchedule ||
            row.requestedBy.toString() === userId ||
            row.items.some((item) => item.respondent.toString() === userId),
        )
        .map((row) => {
          const live = row.items.filter((item) => !item.excluded);
          return {
            id: row._id.toString(),
            status: row.status,
            expired: row.status === 'expired',
            initiatingTaskTitle: titles.get(row.initiatingTask.toString()) ?? '',
            requestedByName: viewer.managesSchedule
              ? names.get(row.requestedBy.toString()) ?? null
              : null,
            affectedCount: live.length,
            pendingCount: viewer.managesSchedule
              ? live.filter((item) => item.response === 'pending').length
              : null,
            awaitingMe:
              row.status === 'open' &&
              live.some(
                (item) => item.respondent.toString() === userId && item.response === 'pending',
              ),
            expiresAt: row.expiresAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          };
        });
    },

    async auditForProject(userId, projectId) {
      const { project, viewer } = await reach(userId, projectId);
      const full = mayReadFullAudit(viewer);
      const rows = full
        ? await audit.listForProject(project._id, AUDIT_PAGE)
        : await audit.listForParty(project._id, new Types.ObjectId(userId), AUDIT_PAGE);

      const tasks = await TaskModel.find({ project: project._id })
        .select('title')
        .lean<{ _id: Types.ObjectId; title: string }[]>()
        .exec();
      const titles = new Map(tasks.map((task) => [task._id.toString(), task.title]));

      return rows.map((row) => ({
        id: row._id.toString(),
        action: row.action,
        actorName: full || row.actor.toString() === userId ? row.actorName : '',
        taskTitle: row.task === undefined ? null : titles.get(row.task.toString()) ?? null,
        proposalId: row.proposal?.toString() ?? null,
        at: row.at.toISOString(),
        details: full ? row.details : row.partyDetails,
      }));
    },

    async releasePartially(userId, projectId, stageId, taskIds, note) {
      const { project, viewer } = await reach(userId, projectId);
      if (!mayReleasePartially(viewer)) throw notPermittedToManageSchedule();
      if (taskIds.length === 0) throw releaseNeedsTasks();
      if (!Types.ObjectId.isValid(stageId)) throw proposalNotFound();

      const stage = await ProjectStageModel.findOne({
        _id: new Types.ObjectId(stageId),
        project: project._id,
      })
        .lean<ProjectStageRecord>()
        .exec();
      if (stage === null) throw proposalNotFound();

      const downstream = await ProjectStageModel.find({ project: project._id, dependsOn: stage._id })
        .lean<ProjectStageRecord[]>()
        .exec();
      const downstreamIds = downstream.map((row) => row._id);

      const released = await TaskModel.find({
        _id: { $in: taskIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) },
        project: project._id,
        stage: { $in: downstreamIds },
      })
        .lean<TaskRecord[]>()
        .exec();
      if (released.length === 0) throw releaseNeedsTasks();

      const actor = new Types.ObjectId(userId);
      await ProjectStageModel.updateOne(
        { _id: stage._id },
        {
          $set: {
            partialReleaseAt: new Date(),
            partialReleaseBy: actor,
            ...(note === undefined ? {} : { partialReleaseNote: note }),
            partialReleaseTasks: released.map((task) => task._id),
          },
        },
      ).exec();

      const actorName = await nameOf(actor);
      await audit.append(
        released.map((task) => ({
          project: project._id,
          task: task._id,
          actor,
          actorName,
          action: 'schedule.partial_release' as const,
          parties: task.assignee === undefined ? [] : [task.assignee],
          details: { stage: stage.name, taskTitle: task.title, ...(note === undefined ? {} : { note }) },
          partyDetails: { stage: stage.name, taskTitle: task.title },
        })),
      );

      // The whole point of a release is that the next professional may now start, so the person
      // responsible for the released work is the one who has to hear about it.
      await notifications.emitMany(
        released
          .filter((task) => task.assignee !== undefined && task.assignee.toString() !== userId)
          .map((task) => ({
            userId: task.assignee as Types.ObjectId,
            type: 'schedule.partial_release' as const,
            projectId: project._id,
            taskId: task._id,
            payload: { projectName: project.name, taskTitle: task.title },
            dedupeKey: `schedule.partial_release:${stage._id.toString()}:${task._id.toString()}`,
          })),
      );

      return { stageId: stage._id.toString(), releasedTaskIds: released.map((task) => task._id.toString()) };
    },

    async alternatives(userId, proposalId) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayAdjustImpact(viewer)) throw notPermittedToManageSchedule();

      return alternativesFor(proposal, project);
    },

    async requestAlternatives(userId, proposalId, input) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayAdjustImpact(viewer)) throw notPermittedToManageSchedule();
      if (proposal.status !== 'requested') throw proposalNotOpen();

      const actor = new Types.ObjectId(userId);
      const updated = await proposals.setAlternativesContext(proposal._id, {
        ...(input.earliestStart === undefined ? {} : { earliestStart: input.earliestStart }),
        ...(input.latestFinishForWork === undefined ? {} : { latestFinishForWork: input.latestFinishForWork }),
        ...(input.latestFinishForChain === undefined ? {} : { latestFinishForChain: input.latestFinishForChain }),
        mustNotMove: (input.mustNotMove ?? [])
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id)),
        ...(input.note === undefined || input.note.trim() === '' ? {} : { note: input.note.trim() }),
        requestedBy: actor,
        requestedAt: new Date(),
      });
      if (updated === null) throw proposalNotOpen();

      await audit.append([
        {
          project: project._id,
          task: updated.initiatingTask,
          proposal: updated._id,
          actor,
          actorName: await nameOf(actor),
          action: 'proposal.alternatives_requested',
          parties: [],
          details: {
            earliestStart: input.earliestStart === undefined ? null : formatCalendarDate(input.earliestStart),
            latestFinishForWork:
              input.latestFinishForWork === undefined ? null : formatCalendarDate(input.latestFinishForWork),
            latestFinishForChain:
              input.latestFinishForChain === undefined ? null : formatCalendarDate(input.latestFinishForChain),
            mustNotMove: (input.mustNotMove ?? []).length,
          },
          partyDetails: {},
        },
      ]);

      return alternativesFor(updated, project);
    },

    async selectAlternative(userId, proposalId, token) {
      const { proposal, project, viewer } = await loadProposal(userId, proposalId);
      if (!mayAdjustImpact(viewer)) throw notPermittedToManageSchedule();
      if (proposal.status !== 'requested') throw proposalNotOpen();
      if (proposal.alternativesContext === undefined) throw alternativeNotFound();

      const graph = await graphFor(project, proposal._id);
      const task = graph.tasks.find((row) => row._id.equals(proposal.initiatingTask));
      if (task === undefined) throw alternativeNotFound();

      const found = guardCalendar(() =>
        candidateSchedules(graph, task, proposal.changes, constraintsOf(proposal)),
      ).candidates.find((candidate) => candidate.token === token);
      if (found === undefined) throw alternativeNotFound();

      const chosen: RequestedChanges = {
        alternativeStart: new Date(`${found.startDate}T00:00:00.000Z`),
        alternativeDue: new Date(`${found.dueDate}T00:00:00.000Z`),
        ...(proposal.changes.note === undefined ? {} : { note: proposal.changes.note }),
      };
      const { items } = buildItems(
        graph,
        task,
        chosen,
        task.assignee?.toString() === proposal.requestedBy.toString(),
        proposal.requestedBy,
      );
      const updated = await proposals.replaceItems(proposal._id, chosen, items, token);
      if (updated === null) throw proposalNotOpen();

      const actor = new Types.ObjectId(userId);
      await audit.append([
        {
          project: project._id,
          task: task._id,
          proposal: proposal._id,
          actor,
          actorName: await nameOf(actor),
          action: 'proposal.alternative_selected',
          parties: items.map((row) => row.respondent),
          details: { startDate: found.startDate, dueDate: found.dueDate, affected: items.length },
          partyDetails: { affected: items.length },
        },
      ]);
      return present(updated, project, viewer);
    },

    async initiateHandoff(userId, taskId, input) {
      const task = await loadTask(taskId);
      const { project, viewer } = await reach(userId, (task.project as Types.ObjectId).toString());

      if (input.completedWorkAtHandover.trim() === '') throw handoffNeedsCompletionRecord();

      const from = task.assignee;
      if (from === undefined) throw handoffTargetInvalid();

      const delegate = from.toString() === userId ? task.delegation?.delegate : undefined;
      if (input.toUserId !== undefined && !Types.ObjectId.isValid(input.toUserId)) {
        throw handoffTargetInvalid();
      }

      const to =
        input.toUserId === undefined ? delegate : new Types.ObjectId(input.toUserId);
      if (to === undefined) throw handoffTargetInvalid();
      if (to.equals(from)) throw handoffTargetInvalid();

      let kind: HandoffRecord['kind'];
      if (delegate !== undefined && delegate.equals(to)) kind = 'delegation_disclosure';
      else if (viewer.managesSchedule) {
        const membership = await access.findActiveMembership(project._id, to);
        if (membership === null) throw handoffTargetInvalid();
        kind = 'authority';
      } else throw notPermittedToHandOff();

      if ((await handoffs.findOpenForTask(task._id)) !== null) throw handoffAlreadyOpen();

      const actor = new Types.ObjectId(userId);
      const created = await handoffs.create({
        project: project._id,
        task: task._id,
        from,
        to,
        kind,
        initiatedBy: actor,
        completedWorkAtHandover: input.completedWorkAtHandover.trim(),
        ...(input.proposalId !== undefined && Types.ObjectId.isValid(input.proposalId)
          ? { proposal: new Types.ObjectId(input.proposalId) }
          : {}),
      });

      await audit.append([
        {
          project: project._id,
          task: task._id,
          actor,
          actorName: await nameOf(actor),
          action: 'work.handoff_initiated',
          parties: [from, to],
          details: { taskTitle: task.title, completedWorkAtHandover: created.completedWorkAtHandover },
          partyDetails: { taskTitle: task.title, completedWorkAtHandover: created.completedWorkAtHandover },
        },
      ]);

      // The incoming party is being asked to take responsibility, which is a decision waiting on
      // them. The outgoing party already knows: they initiated it.
      await notifications.emit({
        userId: to,
        type: 'responsibility.transfer_invited',
        projectId: project._id,
        taskId: task._id,
        payload: { projectName: project.name, taskTitle: task.title },
        dedupeKey: `responsibility.transfer_invited:${created._id.toString()}`,
      });

      return toHandoffDto(created, task.title, userId, viewer.managesSchedule, await namesOf([from, to]));
    },

    async decideHandoff(userId, handoffId, accept) {
      const handoff = await handoffs.findById(handoffId);
      if (handoff === null) throw handoffNotFound();

      const { project, viewer } = await reach(userId, handoff.project.toString()).catch(() => {
        throw handoffNotFound();
      });

      if (handoff.state !== 'proposed') throw handoffNotFound();

      const decides =
        handoff.kind === 'authority'
          ? handoff.to.toString() === userId
          : viewer.managesSchedule;
      if (!decides) throw notPermittedToHandOff();

      const actor = new Types.ObjectId(userId);
      const at = new Date();
      const task = await TaskModel.findById(handoff.task).lean<TaskRecord>().exec();

      let settled: HandoffRecord | null;
      let heldForMembership = false;

      if (!accept) {
        settled = await handoffs.settle(handoff._id, 'declined', actor, at, ['proposed']);
      } else if (await standsAsMember(handoff)) {
        settled = await moveResponsibility(handoff, actor, at, ['proposed']);
        if (settled === null) throw handoffResponsibilityMoved();
      } else {
        const invitation = await grants.invite({
          project: handoff.project,
          user: handoff.to,
          ...(await companyOf(handoff.to)),
          projectRole: 'subcontractor',
          permissions: [],
          fullAuthority: false,
          invitedBy: handoff.kind === 'authority' ? handoff.initiatedBy : actor,
        });
        settled = await handoffs.holdForMembership(handoff._id, invitation._id);
        heldForMembership = true;
      }
      if (settled === null) throw handoffNotFound();

      await audit.append([
        {
          project: project._id,
          task: settled.task,
          actor: settled.from,
          actorName: await nameOf(settled.from),
          action: heldForMembership
            ? 'work.handoff_awaiting_membership'
            : accept
              ? 'work.handoff_accepted'
              : 'work.handoff_declined',
          parties: [settled.from, settled.to],
          details: { taskTitle: task?.title ?? null },
          partyDetails: { taskTitle: task?.title ?? null },
        },
      ]);

      // Informational rather than blocking: the party who handed the work over learns it landed,
      // and nothing is waiting on them, so it aggregates into the digest.
      if (accept && !heldForMembership && settled.from.toString() !== userId) {
        await notifications.emit({
          userId: settled.from,
          type: 'responsibility.transfer_accepted',
          projectId: project._id,
          taskId: settled.task,
          payload: { projectName: project.name, taskTitle: task?.title ?? '' },
          dedupeKey: `responsibility.transfer_accepted:${settled._id.toString()}`,
        });
      }

      return toHandoffDto(
        settled,
        task?.title ?? '',
        userId,
        viewer.managesSchedule,
        await namesOf([settled.from, settled.to]),
      );
    },

    async completeAfterMembership(userId, projectId) {
      const handoff = await awaitingFor(userId, projectId);
      if (handoff === null) return;
      await completeTransfer(handoff);
    },

    async abandonAfterMembershipDeclined(userId, projectId) {
      const handoff = await awaitingFor(userId, projectId);
      if (handoff === null) return;
      await abandonTransfer(handoff);
    },

    async settleAwaitingTransfers(limit = TRANSFER_SWEEP_BATCH) {
      const rows = await handoffs.listAwaitingMembership(limit);
      const at = new Date();
      let completed = 0;
      let declined = 0;
      let waiting = 0;

      for (const handoff of rows) {
        await handoffs.noteAttempt(handoff._id, at);
        const membership = await access.findMembership(handoff.project, handoff.to);

        if (membership?.status === 'active') {
          if ((await completeTransfer(handoff)) !== null) completed += 1;
        } else if (membership === null || membership.status !== 'invited') {
          if (await abandonTransfer(handoff)) declined += 1;
        } else {
          waiting += 1;
        }
      }

      return { examined: rows.length, completed, declined, waiting };
    },

    async handoffViewFor(userId, taskId) {
      let task = await loadTask(taskId);
      const { viewer } = await reach(userId, (task.project as Types.ObjectId).toString());

      let open = await handoffs.findOpenForTask(task._id);
      if (open !== null && open.state === 'awaiting_membership' && (await standsAsMember(open))) {
        await completeTransfer(open);
        task = await loadTask(taskId);
        open = null;
      }

      if (open !== null) {
        const involved =
          open.from.toString() === userId ||
          open.to.toString() === userId ||
          viewer.managesSchedule;
        return {
          handoff: involved
            ? toHandoffDto(
                open,
                task.title,
                userId,
                viewer.managesSchedule,
                await namesOf([open.from, open.to]),
              )
            : null,
          mode: null,
          delegateName: null,
          currentAssigneeId: null,
        };
      }

      const settled = task.completedAt !== undefined || task.orphanedAt !== undefined;
      const isAssignee = task.assignee?.toString() === userId;

      let mode: HandoffMode | null = null;
      if (!settled && task.assignee !== undefined) {
        if (isAssignee && task.delegation !== undefined) mode = 'disclosure';
        else if (viewer.managesSchedule) mode = 'authority';
      }

      return {
        handoff: null,
        mode,
        delegateName:
          mode === 'disclosure' && task.delegation !== undefined
            ? await nameOf(task.delegation.delegate)
            : null,
        currentAssigneeId: mode === null ? null : (task.assignee?.toString() ?? null),
      };
    },

    async pendingActionsFor(userId) {
      const user = new Types.ObjectId(userId);
      const memberships = await access.listActiveMembershipsForUser(user);
      const managed = memberships
        .filter((row) => effectiveProjectPermissions(row).includes('schedule.change.manage'))
        .map((row) => row.project);
      const managedIds = new Set(managed.map((id) => id.toString()));

      const counts = new Map<string, { proposals: number; handoffs: number }>();
      const bump = (projectId: string, field: 'proposals' | 'handoffs'): void => {
        const current = counts.get(projectId) ?? { proposals: 0, handoffs: 0 };
        counts.set(projectId, { ...current, [field]: current[field] + 1 });
      };

      const now = Date.now();
      const rows = await proposals.listAwaitingAction(user, managed);
      for (const row of rows) {
        const projectId = row.project.toString();
        const live = row.items.filter((item) => !item.excluded);
        const lapsed = row.expiresAt !== undefined && row.expiresAt.getTime() <= now;

        const mineIsPending =
          row.status === 'open' &&
          !lapsed &&
          live.some((item) => item.respondent.toString() === userId && item.response === 'pending');
        if (mineIsPending) bump(projectId, 'proposals');

        if (!managedIds.has(projectId)) continue;

        const needsMe =
          row.status === 'requested' ||
          row.status === 'expired' ||
          (row.status === 'open' &&
            (lapsed || live.every((item) => item.response !== 'pending')));
        if (needsMe) bump(projectId, 'proposals');
      }

      for (const handoff of await handoffs.listPendingFor(user, managed)) {
        const decides =
          handoff.kind === 'authority'
            ? handoff.to.toString() === userId
            : managedIds.has(handoff.project.toString());
        if (decides) bump(handoff.project.toString(), 'handoffs');
      }

      return new Map(
        [...counts.entries()].map(([projectId, value]) => [
          projectId,
          { ...value, total: value.proposals + value.handoffs },
        ]),
      );
    },

    async pendingActionTotals(userId) {
      const perProject = await this.pendingActionsFor(userId);
      let proposals = 0;
      let handoffCount = 0;
      for (const value of perProject.values()) {
        proposals += value.proposals;
        handoffCount += value.handoffs;
      }
      return { proposals, handoffs: handoffCount, total: proposals + handoffCount };
    },

    async pendingFor(userId, taskIds) {
      const open = await proposals.listOpenForRespondent(new Types.ObjectId(userId));
      const waiting = new Set<string>();

      for (const proposal of open) {
        if (proposal.expiresAt !== undefined && proposal.expiresAt.getTime() <= Date.now()) continue;
        for (const item of proposal.items) {
          if (item.excluded || item.response !== 'pending') continue;
          if (item.respondent.toString() !== userId) continue;
          waiting.add(item.task.toString());
        }
      }
      return new Map(taskIds.map((id) => [id, waiting.has(id)]));
    },

    async impactCountFor(taskId) {
      if (!Types.ObjectId.isValid(taskId)) return null;

      const task = await TaskModel.findById(new Types.ObjectId(taskId)).lean<TaskRecord>().exec();
      if (task === null || task.project === undefined) return null;

      const [project] = await projects.listByIds([task.project]);
      if (project === undefined) return null;

      const graph = await graphFor(project);
      const { result } = guardCalendar(() => computeImpact(graph, task, { deltaWorkingDays: 1 }));
      return Math.max(0, result.items.length - 1);
    },

    async recordEarlyCompletion(taskId) {
      const task = await TaskModel.findById(new Types.ObjectId(taskId)).lean<TaskRecord>().exec();
      if (task === null || task.project === undefined || task.stage === undefined) return;
      if (task.completedAt === undefined) return;
      if (task.completedAt.getTime() >= task.dueDate.getTime()) return;

      const siblings = await TaskModel.find({ project: task.project, stage: task.stage })
        .lean<TaskRecord[]>()
        .exec();
      if (siblings.some((row) => row.completedAt === undefined && row.orphanedAt === undefined)) return;

      const actor = task.assignee ?? task.createdBy;
      const stage = await ProjectStageModel.findById(task.stage).lean<ProjectStageRecord>().exec();

      await audit.append([
        {
          project: task.project,
          task: task._id,
          actor,
          actorName: await nameOf(actor),
          action: 'stage.early_completion',
          parties: [actor],
          details: {
            stage: stage?.name ?? null,
            completedAt: formatCalendarDate(task.completedAt),
            plannedDue: formatCalendarDate(task.dueDate),
          },
          partyDetails: { stage: stage?.name ?? null },
        },
      ]);

      /**
       * The closed rule: early upstream completion reaches the management side on every tier, free
       * — and releases nothing. The decision to let downstream work start is theirs, and only an
       * authorised release tells the next professional anything.
       */
      const managers = await access.listMembers(task.project);
      await notifications.emitMany(
        managers
          .filter(
            (row) =>
              row.status === 'active' &&
              row.user.toString() !== actor.toString() &&
              effectiveProjectPermissions(row).includes('schedule.change.manage'),
          )
          .map((row) => ({
            userId: row.user,
            type: 'task.early_completion' as const,
            projectId: task.project as Types.ObjectId,
            taskId: task._id,
            payload: { taskTitle: task.title, toDate: formatCalendarDate(task.dueDate) },
            dedupeKey: `task.early_completion:${task._id.toString()}:${row.user.toString()}`,
          })),
      );
    },
  };
};
