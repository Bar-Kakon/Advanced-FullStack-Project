import { runInTransaction } from '../../db/mongoose.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { auditRepository } from '../coordination/audit.repository.js';
import { proposalRepository } from '../coordination/proposal.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { scheduleExceptionRepository } from '../scheduleexceptions/scheduleException.repository.js';
import { taskRepository } from '../tasks/task.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createCalendarChangeService } from './calendarChange.service.js';
import { createCalendarChangeGuard } from './calendarChangeGuard.js';
import { projectRepository } from './project.repository.js';

export const calendarChangeGuard = createCalendarChangeGuard({
  calendars: companyCalendarRepository,
  tasks: taskRepository,
  proposals: proposalRepository,
  exceptions: scheduleExceptionRepository,
  companyMemberships: companyMembershipRepository,
  projectMembers: projectAccessRepository,
});

export const calendarChangeService = createCalendarChangeService({
  projects: projectRepository,
  calendars: companyCalendarRepository,
  guard: calendarChangeGuard,
  audit: auditRepository,
  names: userRepository,
  transactions: { run: runInTransaction },
});
