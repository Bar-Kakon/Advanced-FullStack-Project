/**
 * The concurrency leg of the Batch 2 verification: a commitment written between the guard's check
 * and the calendar write. Run by `Frontend/scripts/verify-company-calendar.mjs` against its isolated
 * database. Required: MONGODB_URI, RACE_PROJECT_ID, RACE_ACTOR_ID, RACE_EXTERNAL_ID, RACE_START, RACE_DUE.
 */
import './support/developmentGuard.js';
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase, runInTransaction } from '../src/db/mongoose.js';
import { companyCalendarRepository } from '../src/features/calendar/companyCalendar.repository.js';
import { companyMembershipRepository } from '../src/features/companies/companyMembership.repository.js';
import { auditRepository } from '../src/features/coordination/audit.repository.js';
import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { proposalRepository } from '../src/features/coordination/proposal.repository.js';
import { projectAccessRepository } from '../src/features/projectaccess/projectAccess.repository.js';
import { createCalendarChangeService } from '../src/features/projects/calendarChange.service.js';
import { createCalendarChangeGuard } from '../src/features/projects/calendarChangeGuard.js';
import { ProjectModel, type ProjectRecord } from '../src/features/projects/project.model.js';
import { projectRepository } from '../src/features/projects/project.repository.js';
import { scheduleExceptionRepository } from '../src/features/scheduleexceptions/scheduleException.repository.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { taskRepository } from '../src/features/tasks/task.repository.js';
import { userRepository } from '../src/features/users/user.repository.js';

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return value;
};

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(96)} ${detail}`);
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const projectId = new Types.ObjectId(need('RACE_PROJECT_ID'));
  const actor = new Types.ObjectId(need('RACE_ACTOR_ID'));
  const external = new Types.ObjectId(need('RACE_EXTERNAL_ID'));
  const startDate = new Date(need('RACE_START'));
  const dueDate = new Date(need('RACE_DUE'));

  const project = await ProjectModel.findById(projectId).lean<ProjectRecord>().exec();
  if (project === null) throw new Error('race project missing');

  let reads = 0;
  const racingTasks = {
    async listLiveAssignedInProject(target: Types.ObjectId) {
      reads += 1;
      const rows = await taskRepository.listLiveAssignedInProject(target);
      if (reads === 1) {
        await TaskModel.collection.insertOne({
          kind: 'project',
          project: target,
          company: project.company,
          title: 'race: written between check and write',
          createdBy: actor,
          assignee: external,
          startDate,
          dueDate,
          ownCrewOnly: false,
          delegatorOnSiteRequired: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return rows;
    },
  };

  const guard = createCalendarChangeGuard({
    calendars: companyCalendarRepository,
    tasks: racingTasks,
    proposals: proposalRepository,
    exceptions: scheduleExceptionRepository,
    companyMemberships: companyMembershipRepository,
    projectMembers: projectAccessRepository,
  });
  const service = createCalendarChangeService({
    projects: projectRepository,
    calendars: companyCalendarRepository,
    guard,
    audit: auditRepository,
    names: userRepository,
    transactions: { run: runInTransaction },
  });

  let code: string | null = null;
  try {
    await service.setOverrides(actor, project, { workingDays: ['sunday', 'monday', 'tuesday', 'wednesday'] });
  } catch (error) {
    code = (error as { code?: string }).code ?? 'unexpected';
  }

  check('race: the change is refused once the slipped commitment is seen', code === 'CALENDAR_CHANGE_NEEDS_APPROVAL', `code=${code}`);
  check('race: the guard ran before and after the write', reads === 2, `reads=${reads}`);

  const after = await ProjectModel.findById(projectId).lean<ProjectRecord>().exec();
  check(
    'race: the project calendar is back to what it was',
    JSON.stringify(after?.calendarOverrides ?? null) === JSON.stringify(project.calendarOverrides ?? null) &&
      after?.calendarVersion.toString() === project.calendarVersion.toString(),
  );

  const actions = (
    await AuditEntryModel.find({ project: projectId }).sort({ at: 1, _id: 1 }).lean<{ action: string }[]>().exec()
  ).map((row) => row.action);
  check(
    'race: history records the change and its automatic revert, in order',
    actions.join(',') === 'project.calendar_overrides_changed,project.calendar_change_reverted',
    actions.join(','),
  );

  await disconnectFromDatabase();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error: unknown) => {
  console.error('ABORTED:', error instanceof Error ? error.message : error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
