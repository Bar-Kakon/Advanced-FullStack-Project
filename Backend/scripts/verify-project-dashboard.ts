/**
 * Drives the real Project Dashboard read over real HTTP.
 *
 * What it proves: the dashboard composes the existing project, membership, grant and calendar
 * truth rather than holding a copy; a project the caller may not reach answers as one that does
 * not exist; the pinned calendar version never moves on its own; and no task figure is invented
 * while the Tasks domain does not exist.
 */
import { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyCalendarVersionModel } from '../src/features/calendar/companyCalendarVersion.model.js';
import { PermissionTemplateModel } from '../src/features/projectaccess/permissionTemplate.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-project-dashboard';

const day = (offset: number): string =>
  new Date(Date.UTC(2027, 8, 1) + offset * 86_400_000).toISOString().slice(0, 10);

interface DashboardBody {
  project: {
    id: string;
    name: string;
    projectType: string;
    size: string;
    location: { city: string | null; address: string | null };
    dates: {
      startDate: string;
      targetEndDate: string;
      originalTargetEndDate: string;
      overrunAllowanceDays: number;
      overrunCeilingDate: string;
      overrunDaysFromOriginal: number;
    };
    status: string;
    cancellable: boolean;
    viewerManages: boolean;
    calendar: { versionId: string; overrides: Record<string, unknown> | null; effective: Record<string, unknown> | null };
  };
  viewer: {
    manages: boolean;
    canEdit: boolean;
    canCancel: boolean;
    canManageCalendar: boolean;
    canInvite: boolean;
    canManageMembers: boolean;
    canGrantPermissions: boolean;
  };
  calendar: {
    versionNumber: number | null;
    currentVersionNumber: number | null;
    outdated: boolean;
    overridden: boolean;
    adoptions: {
      fromVersion: number | null;
      toVersion: number;
      adoptedAt: string;
      adoptedByName: string | null;
      overridesKept: boolean;
    }[];
  };
  members: { active: number; pending: number };
  tasks: unknown;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const carol = await createAccount(baseUrl, MARKER, 3);

  const body = {
    name: 'אתר לוח העבודה',
    description: 'שלד וגמר',
    startDate: day(0),
    targetEndDate: day(80),
    overrunAllowanceDays: 25,
    projectType: 'villa' as const,
    size: 'וילה אחת, שתי קומות',
    location: { city: 'הרצליה', region: 'sharon' as const, address: 'הנשיא 4' },
  };

  const created = await request(baseUrl, 'POST', '/api/projects', { token: alice.token, json: body });
  const projectId = (created.body as { project: { id: string } }).project.id;

  const dashboard = async (token: string, id = projectId) =>
    request(baseUrl, 'GET', `/api/projects/${id}/dashboard`, { token });

  section('Authentication');
  const anon = await request(baseUrl, 'GET', `/api/projects/${projectId}/dashboard`);
  check(anon.status === 401, 'Without a token the dashboard is 401', anon.status);

  section('The dashboard reads the existing project, and does not restate it');
  const first = await dashboard(alice.token);
  check(first.status === 200, 'An authorized viewer reads it', first.status);
  const view = first.body as unknown as DashboardBody;
  check(view.project.id === projectId, 'It is the project the route named');
  check(view.project.name === body.name, 'Name', view.project.name);
  check(view.project.projectType === 'villa', 'Type', view.project.projectType);
  check(view.project.size === body.size, 'Free-text size, exactly as stored', view.project.size);
  check(view.project.location.city === 'הרצליה', 'Structured location', view.project.location.city);
  check(view.project.dates.startDate === day(0), 'Start date', view.project.dates.startDate);
  check(view.project.dates.originalTargetEndDate === day(80), 'Original target', view.project.dates.originalTargetEndDate);
  check(view.project.dates.overrunAllowanceDays === 25, 'Overrun allowance');
  check(view.project.dates.overrunCeilingDate === day(105), 'And the ceiling it produces', view.project.dates.overrunCeilingDate);

  const stored = await ProjectModel.findById(projectId).lean().exec();
  check(
    stored?.name === view.project.name && stored?.size === view.project.size,
    'Every field matches the one stored project row — there is no second copy',
  );

  section('Status is derived on read, and is not settable here');
  check(view.project.status === 'planned', 'A project that has not started is planned', view.project.status);
  check(view.project.cancellable === true, 'And reports itself cancellable');
  await ProjectModel.updateOne({ _id: projectId }, { $set: { startedAt: new Date() } }).exec();
  const started = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(started.project.status === 'active', 'Execution facts move it to active', started.project.status);
  check(started.project.cancellable === false, 'And cancellation is withdrawn with it');
  const forced = await request(baseUrl, 'GET', `/api/projects/${projectId}/dashboard?status=completed`, {
    token: alice.token,
  });
  check(
    (forced.body as unknown as DashboardBody).project.status === 'active',
    'A status in the query changes nothing',
  );
  await ProjectModel.updateOne({ _id: projectId }, { $unset: { startedAt: '' } }).exec();

  section('D16 — an unreachable project answers as one that does not exist');
  const stranger = await dashboard(bob.token);
  check(stranger.status === 404, 'Another company reading it is 404', stranger.status);
  const absent = await dashboard(bob.token, new Types.ObjectId().toString());
  check(absent.status === 404, 'A project that does not exist is 404 too', absent.status);
  check(
    JSON.stringify(stranger.body) === JSON.stringify(absent.body),
    'Byte-identical bodies — existence is never disclosed',
  );
  const malformed = await dashboard(bob.token, 'not-an-id');
  check(malformed.status === 404, 'A malformed id is the same 404', malformed.status);

  section('Viewer capabilities come from the grant, never from a role');
  check(
    started.viewer.manages && started.viewer.canEdit && started.viewer.canCancel &&
      started.viewer.canManageCalendar && started.viewer.canInvite &&
      started.viewer.canManageMembers && started.viewer.canGrantPermissions,
    'The creator holds every capability through Full Project Authority',
  );

  await request(baseUrl, 'POST', '/api/permissions/grants', {
    token: alice.token,
    json: { projectId, userId: bob.userId.toString(), projectRole: 'main_contractor', permissions: [] },
  });
  const guest = (await dashboard(bob.token)).body as unknown as DashboardBody;
  check(guest.viewer.manages === false, 'A member with no permissions manages nothing');
  check(
    !guest.viewer.canEdit && !guest.viewer.canCancel && !guest.viewer.canManageCalendar &&
      !guest.viewer.canInvite && !guest.viewer.canManageMembers && !guest.viewer.canGrantPermissions,
    'Every capability is false, even though the project role says Main Contractor',
  );
  check(guest.project.viewerManages === false, 'And the project DTO agrees');

  const guestEdit = await request(baseUrl, 'PATCH', `/api/projects/${projectId}`, {
    token: bob.token,
    json: { name: 'nope' },
  });
  check(guestEdit.status === 403, 'The API refuses what the dashboard did not offer', guestEdit.status);

  section('The dashboard counts members over the same membership rows');
  check(guest.members.active === 2, 'Two active members', guest.members.active);
  check(guest.members.pending === 0, 'And nothing pending', guest.members.pending);
  await request(baseUrl, 'POST', `/api/projects/${projectId}/members`, {
    token: alice.token,
    json: { userId: carol.userId.toString(), projectRole: 'professional' },
  });
  const withPending = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(withPending.members.pending === 1, 'An invitation shows as pending, not as a member', withPending.members.pending);
  check(withPending.members.active === 2, 'And the active count does not move', withPending.members.active);
  check(
    withPending.members.active + withPending.members.pending ===
      (await ProjectMembershipModel.countDocuments({ project: projectId, status: { $in: ['active', 'invited'] } }).exec()),
    'Both counts are the membership rows themselves, not a stored counter',
  );

  section('Permissions are the same grants, reached from this project');
  const grantRow = await ProjectMembershipModel.findOne({ project: projectId, user: bob.userId }).lean().exec();
  await request(baseUrl, 'PATCH', `/api/permissions/grants/${grantRow?._id.toString()}`, {
    token: alice.token,
    json: { permissions: ['project.edit'] },
  });
  const afterGrant = (await dashboard(bob.token)).body as unknown as DashboardBody;
  check(afterGrant.viewer.canEdit === true, 'A central grant is visible on the project surface at once');
  check(afterGrant.viewer.canCancel === false, 'And only what was granted');

  await request(baseUrl, 'PATCH', `/api/permissions/grants/${grantRow?._id.toString()}`, {
    token: alice.token,
    json: { fullAuthority: true },
  });
  const afterFull = (await dashboard(bob.token)).body as unknown as DashboardBody;
  check(
    afterFull.viewer.canCancel && afterFull.viewer.canManageCalendar && afterFull.viewer.canGrantPermissions,
    'Full Project Authority covers every capability without expanding any list',
  );
  const storedGrant = await ProjectMembershipModel.findById(grantRow?._id).lean().exec();
  check(storedGrant?.permissions.length === 1, 'The stored list is still just what was ticked', storedGrant?.permissions.length);

  section('The working calendar — pinned, and never moved by the company');
  const pinnedFirst = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(pinnedFirst.calendar.versionNumber === 1, 'The project is pinned to version 1', pinnedFirst.calendar.versionNumber);
  check(pinnedFirst.calendar.currentVersionNumber === 1, 'Which is also the company current');
  check(pinnedFirst.calendar.outdated === false, 'So nothing is outdated');
  check(pinnedFirst.calendar.overridden === false, 'And the project carries no override yet');
  check(pinnedFirst.calendar.adoptions.length === 0, 'And has adopted nothing');
  check(pinnedFirst.project.calendar.effective !== null, 'The effective calendar is served');

  const companyEdit = await request(baseUrl, 'PUT', '/api/calendar/company', {
    token: alice.token,
    json: {
      workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      hours: { startMinute: 360, endMinute: 900 },
      sector: 'jewish',
      worksCholHaMoed: true,
      worksMemorialDays: false,
    },
  });
  check(companyEdit.status === 201, 'The company default is changed', companyEdit.status);
  check(
    (await CompanyCalendarVersionModel.countDocuments({ company: alice.companyId }).exec()) === 2,
    'Which appends a version rather than editing one',
  );

  const afterCompanyEdit = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(afterCompanyEdit.calendar.versionNumber === 1, 'The project is STILL pinned to version 1', afterCompanyEdit.calendar.versionNumber);
  check(afterCompanyEdit.calendar.currentVersionNumber === 2, 'The company moved to 2', afterCompanyEdit.calendar.currentVersionNumber);
  check(afterCompanyEdit.calendar.outdated === true, 'The dashboard says a newer version exists');
  check(
    JSON.stringify(afterCompanyEdit.project.calendar.effective) ===
      JSON.stringify(pinnedFirst.project.calendar.effective),
    'And not one working day of the project changed — no silent propagation',
  );

  section('Project-specific overrides stay project-specific');
  const override = await request(baseUrl, 'PUT', `/api/projects/${projectId}/calendar/overrides`, {
    token: alice.token,
    json: { workingDays: ['sunday', 'monday', 'tuesday'] },
  });
  check(override.status === 200, 'A project override is accepted', override.status);
  const overridden = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(overridden.calendar.overridden === true, 'The dashboard reports the project as customised');
  check(
    JSON.stringify(overridden.project.calendar.overrides) ===
      JSON.stringify({ workingDays: ['sunday', 'monday', 'tuesday'] }),
    'With exactly the override that was written',
  );
  const companyVersion = await CompanyCalendarVersionModel.findOne({ company: alice.companyId })
    .sort({ version: -1 })
    .lean()
    .exec();
  check(
    companyVersion?.config.workingDays.length === 6,
    'And the company version is untouched by it',
    companyVersion?.config.workingDays,
  );

  section('Adoption is explicit, recorded, and never automatic');
  const stillOutdated = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(stillOutdated.calendar.outdated === true, 'It is still on the older version after all of that');
  const adopt = await request(baseUrl, 'POST', `/api/projects/${projectId}/calendar/adopt`, {
    token: alice.token,
    json: { keepOverrides: true },
  });
  check(adopt.status === 200, 'Adoption is an explicit action', adopt.status);
  const adopted = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(adopted.calendar.versionNumber === 2, 'The project now sits on version 2', adopted.calendar.versionNumber);
  check(adopted.calendar.outdated === false, 'And is no longer outdated');
  check(adopted.calendar.adoptions.length === 1, 'The move is kept as history', adopted.calendar.adoptions.length);
  check(adopted.calendar.adoptions[0]?.fromVersion === 1, 'From version 1', adopted.calendar.adoptions[0]?.fromVersion);
  check(adopted.calendar.adoptions[0]?.toVersion === 2, 'To version 2');
  check(adopted.calendar.adoptions[0]?.adoptedByName !== null, 'Naming who adopted it');
  check(adopted.calendar.adoptions[0]?.overridesKept === true, 'And that the overrides were kept');
  check(adopted.calendar.overridden === true, 'Which they were');

  const carolRow = await ProjectMembershipModel.findOne({ project: projectId, user: carol.userId }).lean().exec();
  await request(baseUrl, 'POST', `/api/project-invitations/${carolRow?._id.toString()}/accept`, {
    token: carol.token,
  });
  const noCalendarRight = await request(baseUrl, 'POST', `/api/projects/${projectId}/calendar/adopt`, {
    token: carol.token,
    json: { keepOverrides: false },
  });
  check(noCalendarRight.status === 403, 'A member without the calendar right cannot adopt', noCalendarRight.status);

  section('No task figure is invented while Tasks do not exist');
  const final = (await dashboard(alice.token)).body as unknown as DashboardBody;
  check(final.tasks === null, 'The task summary is null, not a zero', JSON.stringify(final.tasks));
  const serialized = JSON.stringify(final);
  for (const invented of ['overdue', 'openTaskCount', 'progress', 'completedTasks', 'dependencies']) {
    check(!serialized.includes(invented), `The payload carries no \`${invented}\` figure`);
  }

  const companies = [alice.companyId, bob.companyId, carol.companyId];
  const owned = await ProjectModel.find({ company: { $in: companies } }).select('_id').lean().exec();
  await ProjectMembershipModel.deleteMany({ project: { $in: owned.map((row) => row._id) } }).exec();
  await PermissionTemplateModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyCalendarVersionModel.deleteMany({ company: { $in: companies } }).exec();
  await ProjectModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
