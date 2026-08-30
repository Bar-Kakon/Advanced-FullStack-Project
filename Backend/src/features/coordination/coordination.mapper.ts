import type { Types } from 'mongoose';

import { formatCalendarDate } from '../projects/projectDates.js';
import type { ProjectStageRecord } from '../tasks/projectStage.model.js';
import type { TaskRecord } from '../tasks/task.model.js';
import type { CascadeResult } from './cascade.js';
import type { CoordinationViewer } from './coordination.authority.js';
import { maySeeResponseMatrix } from './coordination.authority.js';
import type {
  CeilingDto,
  ImpactItemDto,
  ImpactPreviewDto,
  ProposalDto,
  ProposalItemDto,
  RequestedChangesDto,
  ResponseSummaryDto,
  UnaffectedWorkDto,
} from './coordination.dto.js';
import type { ProposalRecord, RequestedChanges } from './proposal.model.js';

export interface NameLookup {
  readonly tasks: ReadonlyMap<string, TaskRecord>;
  readonly stages: ReadonlyMap<string, ProjectStageRecord>;
  readonly people: ReadonlyMap<string, string>;
}

const stageNameFor = (task: TaskRecord | undefined, lookup: NameLookup): string | null => {
  const id = task?.stage?.toString();
  return id === undefined ? null : lookup.stages.get(id)?.name ?? null;
};

const personName = (id: Types.ObjectId | undefined | null, lookup: NameLookup): string | null =>
  id === undefined || id === null ? null : lookup.people.get(id.toString()) ?? null;

export const toChangesDto = (changes: RequestedChanges): RequestedChangesDto => ({
  deltaWorkingDays: changes.deltaWorkingDays ?? null,
  alternativeStart: changes.alternativeStart === undefined ? null : formatCalendarDate(changes.alternativeStart),
  alternativeDue: changes.alternativeDue === undefined ? null : formatCalendarDate(changes.alternativeDue),
  note: changes.note ?? null,
});

export const toPreviewDto = (
  initiating: TaskRecord,
  changes: RequestedChanges,
  result: CascadeResult,
  ceiling: CeilingDto,
  lookup: NameLookup,
  detailed: boolean,
  shiftDaysOf: (from: Date, to: Date) => number,
): ImpactPreviewDto => {
  const affected: ImpactItemDto[] = result.items.map((item) => {
    const task = lookup.tasks.get(item.taskId);
    return {
      taskId: item.taskId,
      taskTitle: task?.title ?? '',
      stageName: stageNameFor(task, lookup),
      respondentName: personName(task?.assignee, lookup),
      currentStart: formatCalendarDate(item.currentStart),
      currentDue: formatCalendarDate(item.currentDue),
      proposedStart: formatCalendarDate(item.proposedStart),
      proposedDue: formatCalendarDate(item.proposedDue),
      reason: item.reason,
      shiftWorkingDays: shiftDaysOf(item.currentDue, item.proposedDue),
      excluded: false,
    };
  });

  const unaffected: UnaffectedWorkDto[] = result.unaffected.map((taskId) => {
    const task = lookup.tasks.get(taskId);
    return { taskId, taskTitle: task?.title ?? '', stageName: stageNameFor(task, lookup) };
  });

  const others = new Set(
    result.items
      .filter((item) => item.reason !== 'initiating')
      .map((item) => lookup.tasks.get(item.taskId)?.assignee?.toString())
      .filter((id): id is string => id !== undefined),
  );

  return {
    initiatingTaskId: initiating._id.toString(),
    initiatingTaskTitle: initiating.title,
    requestedChanges: toChangesDto(changes),
    detailed,
    affected: detailed ? affected : affected.filter((row) => row.taskId === initiating._id.toString()),
    affectedCount: result.items.length,
    otherProfessionalsCount: others.size,
    unaffected: detailed ? unaffected : [],
    unaffectedCount: result.unaffected.length,
    gateHeldCount: result.items.filter((item) => item.reason === 'gate').length,
    ceiling,
  };
};

const summaryOf = (proposal: ProposalRecord): ResponseSummaryDto => {
  const live = proposal.items.filter((item) => !item.excluded);
  return {
    affected: live.length,
    accepted: live.filter((item) => item.response === 'accepted').length,
    declined: live.filter((item) => item.response === 'declined').length,
    countered: live.filter((item) => item.response === 'countered').length,
    pending: live.filter((item) => item.response === 'pending').length,
    excluded: proposal.items.filter((item) => item.excluded).length,
  };
};

const toItemDto = (
  item: ProposalRecord['items'][number],
  viewer: CoordinationViewer,
  lookup: NameLookup,
): ProposalItemDto => {
  const task = lookup.tasks.get(item.task.toString());
  return {
    id: item._id.toString(),
    taskId: item.task.toString(),
    taskTitle: task?.title ?? '',
    stageName: stageNameFor(task, lookup),
    respondentName: personName(item.respondent, lookup),
    isMine: item.respondent.toString() === viewer.userId,
    currentStart: formatCalendarDate(item.currentStart),
    currentDue: formatCalendarDate(item.currentDue),
    proposedStart: formatCalendarDate(item.proposedStart),
    proposedDue: formatCalendarDate(item.proposedDue),
    reason: item.reason,
    response: item.response,
    declineReason: item.declineReason ?? null,
    counterStart: item.counterStart === undefined ? null : formatCalendarDate(item.counterStart),
    counterDue: item.counterDue === undefined ? null : formatCalendarDate(item.counterDue),
    respondedAt: item.respondedAt?.toISOString() ?? null,
    resolution: item.resolution,
    excluded: item.excluded,
  };
};

export const toProposalDto = (
  proposal: ProposalRecord,
  viewer: CoordinationViewer,
  lookup: NameLookup,
  expired: boolean,
  ceiling: CeilingDto | null,
): ProposalDto => {
  const matrix = maySeeResponseMatrix(viewer);
  const mine = proposal.items.filter((item) => item.respondent.toString() === viewer.userId);
  const visible = matrix ? proposal.items : mine;
  const initiating = lookup.tasks.get(proposal.initiatingTask.toString());

  return {
    id: proposal._id.toString(),
    projectId: proposal.project.toString(),
    status: proposal.status,
    expired,
    initiatingTaskId: proposal.initiatingTask.toString(),
    initiatingTaskTitle: initiating?.title ?? '',
    requestedByName: personName(proposal.requestedBy, lookup),
    requestedByMe: proposal.requestedBy.toString() === viewer.userId,
    reason: proposal.reason ?? null,
    changes: toChangesDto(proposal.changes),
    responseHours: proposal.responseHours,
    expiresAt: proposal.expiresAt?.toISOString() ?? null,
    launchedAt: proposal.launchedAt?.toISOString() ?? null,
    resolvedAt: proposal.resolution?.at.toISOString() ?? null,
    resolutionNote: proposal.resolution?.note ?? null,
    parentProposalId: proposal.parentProposal?.toString() ?? null,
    items: visible.map((item) => toItemDto(item, viewer, lookup)),
    summary: matrix ? summaryOf(proposal) : null,
    viewer: {
      canLaunch: matrix && proposal.status === 'requested',
      canResolve: matrix && (proposal.status === 'open' || proposal.status === 'expired'),
      canCancel: matrix && proposal.status !== 'resolved' && proposal.status !== 'cancelled',
      canAdjustImpact: matrix && (proposal.status === 'requested' || proposal.status === 'open'),
      seesResponseMatrix: matrix,
      respondableItemIds:
        proposal.status === 'open'
          ? mine
              .filter((item) => item.response === 'pending' && !item.excluded)
              .map((item) => item._id.toString())
          : [],
    },
    ceiling: matrix ? ceiling : null,
  };
};
