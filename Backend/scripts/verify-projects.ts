/**
 * Drives the real Projects endpoints over real HTTP against real accounts.
 *
 * The closed rules are what this proves: the company owns the project, the overrun ceiling cannot
 * be passed, the original target survives every move, statuses are derived, and a project another
 * company owns is indistinguishable from one that does not exist.
 */
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { CompanyCalendarVersionModel } from '../src/features/calendar/companyCalendarVersion.model.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-projects';

const day = (offset: number): string =>
  new Date(Date.UTC(2027, 0, 10) + offset * 86_400_000).toISOString().slice(0, 10);

interface ProjectBody {
  project: {
    id: string;
    projectType: string;
    projectTypeOther: string | null;
    size: string;
    calendar: { versionId: string; overrides: Record<string, unknown> | null; adoptionCount: number };
    companyId: string;
    name: string;
    description: string | null;
    location: { place: unknown; city: string | null; region: string | null; address: string | null };
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
  };
}

const PLACE = {
  placeId: 'ChIJ_projects_verify_place',
  displayName: 'רעננה, ישראל',
  city: 'רעננה',
  adminArea: 'מחוז המרכז',
  latitude: 32.1848,
  longitude: 34.8713,
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);

  const valid = {
    name: 'מגדל הצפון',
    description: 'שלד וגמר',
    startDate: day(0),
    targetEndDate: day(100),
    overrunAllowanceDays: 30,
    projectType: 'building',
    size: 'בניין 12 קומות',
  };

  section('Authentication');
  for (const [method, path] of [['GET', '/api/projects'], ['POST', '/api/projects']] as const) {
    const anon = await request(baseUrl, method, path, { json: method === 'POST' ? valid : undefined });
    check(anon.status === 401, `${method} ${path} without a token is 401`, anon.status);
  }

  section('Create — the company owns it, not the person');
  const created = await request(baseUrl, 'POST', '/api/projects', { token: alice.token, json: valid });
  check(created.status === 201, 'A valid project is created', created.status);
  const project = (created.body as unknown as ProjectBody).project;
  check(project.companyId === alice.companyId.toString(), 'It belongs to the caller’s company', project.companyId);

  const stored = await ProjectModel.findById(project.id).lean().exec();
  check(stored?.createdBy?.toString() === alice.userId.toString(), 'createdBy records the person');
  check(stored?.company?.toString() === alice.companyId.toString(), 'company is the owning context');
  check(!('owner' in (stored ?? {})), 'There is no personal `owner` field to disagree with it');

  section('Create — the company cannot be chosen by the client');
  const forged = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token,
    json: { ...valid, name: 'forged', company: bob.companyId.toString(), companyId: bob.companyId.toString(), createdBy: bob.userId.toString() },
  });
  check(forged.status === 201, 'Unknown body keys are stripped, per the project-wide convention', forged.status);
  const forgedProject = (forged.body as unknown as ProjectBody).project;
  check(
    forgedProject.companyId === alice.companyId.toString(),
    'A forged company in the body changes nothing — the session decides',
    forgedProject.companyId,
  );
  const forgedStored = await ProjectModel.findById(forgedProject.id).lean().exec();
  check(
    forgedStored?.createdBy?.toString() === alice.userId.toString(),
    'And a forged createdBy is ignored too',
  );

  section('Dates — the closed model');
  check(project.dates.startDate === valid.startDate, 'The start date survives the round trip exactly', project.dates.startDate);
  check(project.dates.targetEndDate === valid.targetEndDate, 'So does the target', project.dates.targetEndDate);
  check(
    project.dates.originalTargetEndDate === valid.targetEndDate,
    'At creation the original target equals the target',
  );
  check(project.dates.overrunAllowanceDays === 30, 'The allowance x is stored');
  check(project.dates.overrunCeilingDate === day(130), 'The ceiling is original + x', project.dates.overrunCeilingDate);
  check(project.dates.overrunDaysFromOriginal === 0, 'No overrun before the target moves');

  const backwards = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token,
    json: { ...valid, startDate: day(50), targetEndDate: day(10) },
  });
  check(backwards.status === 400, 'A target before the start is refused', backwards.status);

  const noAllowance = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token,
    json: { name: 'x', startDate: day(0), targetEndDate: day(10) },
  });
  check(noAllowance.status === 400, 'The overrun allowance is required', noAllowance.status);

  section('Edit — the ceiling holds and the original is kept');
  const withinCeiling = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { targetEndDate: day(120) },
  });
  check(withinCeiling.status === 200, 'A target inside the ceiling is accepted', withinCeiling.status);
  const moved = (withinCeiling.body as unknown as ProjectBody).project;
  check(moved.dates.targetEndDate === day(120), 'The target moved');
  check(moved.dates.originalTargetEndDate === day(100), 'The ORIGINAL target is unchanged', moved.dates.originalTargetEndDate);
  check(moved.dates.overrunDaysFromOriginal === 20, 'The actual overrun is recorded', moved.dates.overrunDaysFromOriginal);
  check(moved.dates.overrunCeilingDate === day(130), 'The ceiling did not move with the target');

  const afterMove = await ProjectModel.findById(project.id).lean().exec();
  check((afterMove?.targetChanges?.length ?? 0) === 1, 'The move is kept in history', afterMove?.targetChanges?.length);
  check(afterMove?.overrunAllowanceDays === 30, 'x itself was not rewritten');

  const pastCeiling = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { targetEndDate: day(131) },
  });
  check(pastCeiling.status === 400, 'A target past the ceiling is refused', pastCeiling.status);
  check(
    (pastCeiling.body as { code?: string }).code === 'OVERRUN_CEILING_EXCEEDED',
    'And says why',
    (pastCeiling.body as { code?: string }).code,
  );

  const editAllowance = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { overrunAllowanceDays: 90 },
  });
  check(editAllowance.status === 400, 'The allowance cannot be edited', editAllowance.status);

  section('Edit — unrelated fields are preserved');
  await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { name: 'מגדל הצפון — עדכון' },
  });
  const preserved = await request(baseUrl, 'GET', `/api/projects/${project.id}`, { token: alice.token });
  const after = (preserved.body as unknown as ProjectBody).project;
  check(after.name === 'מגדל הצפון — עדכון', 'The name changed');
  check(after.description === 'שלד וגמר', 'The description a screen did not send was NOT reset', after.description);
  check(after.dates.targetEndDate === day(120), 'And neither were the dates');

  section('Structured location — reused, never fabricated');
  const located = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { location: { place: PLACE, city: 'רעננה', region: 'sharon', address: 'הרצל 1' } },
  });
  check(located.status === 200, 'A structured place is accepted', located.status);
  const withPlace = (located.body as unknown as ProjectBody).project;
  check(
    (withPlace.location.place as { placeId?: string })?.placeId === PLACE.placeId,
    'The Place ID round-trips unchanged',
  );

  const badPlace = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { location: { place: { placeId: 'x', displayName: 'y' } } },
  });
  check(badPlace.status === 400, 'An incomplete place is refused — coordinates are not invented', badPlace.status);

  const cleared = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { location: null },
  });
  check(cleared.status === 200, 'Location can be cleared explicitly', cleared.status);
  const empty = (cleared.body as unknown as ProjectBody).project;
  check(empty.location.place === null && empty.location.city === null, 'And it clears completely — no legacy fallback');

  section('Status is derived, and never settable');
  check(after.status === 'planned', 'A project with no started task is planned', after.status);
  check(after.cancellable === true, 'And is therefore cancellable');
  const setStatus = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: alice.token,
    json: { status: 'active' },
  });
  check(setStatus.status === 400, 'There is no way to set a status by hand', setStatus.status);

  section('Cross-company isolation — D16, existence is never disclosed');
  const otherGet = await request(baseUrl, 'GET', `/api/projects/${project.id}`, { token: bob.token });
  check(otherGet.status === 404, 'Another company reading it gets 404', otherGet.status);
  const ghostGet = await request(baseUrl, 'GET', '/api/projects/6512c1f4c2b9e30012af0b21', { token: bob.token });
  check(ghostGet.status === 404, 'A project id that never existed also gets 404', ghostGet.status);
  check(
    JSON.stringify(otherGet.body) === JSON.stringify(ghostGet.body),
    'The two answers are byte-identical — no existence side-channel',
    `${JSON.stringify(otherGet.body)} vs ${JSON.stringify(ghostGet.body)}`,
  );

  const otherPatch = await request(baseUrl, 'PATCH', `/api/projects/${project.id}`, {
    token: bob.token,
    json: { name: 'stolen' },
  });
  check(otherPatch.status === 404, 'Another company cannot edit it', otherPatch.status);
  const otherDelete = await request(baseUrl, 'DELETE', `/api/projects/${project.id}`, { token: bob.token });
  check(otherDelete.status === 404, 'Nor cancel it', otherDelete.status);

  const stillThere = await ProjectModel.findById(project.id).lean().exec();
  check(stillThere !== null, 'And the project is untouched by any of it');

  section('Malformed ids');
  for (const bad of ['not-an-id', '123', 'null']) {
    const r = await request(baseUrl, 'GET', `/api/projects/${bad}`, { token: alice.token });
    check(r.status === 404, `A malformed id (${bad}) is 404, not a crash`, r.status);
  }

  section('List — company-scoped');
  const bobList = await request(baseUrl, 'GET', '/api/projects', { token: bob.token });
  check(
    (bobList.body as { projects: unknown[] }).projects.length === 0,
    'Another company sees none of it',
    (bobList.body as { projects: unknown[] }).projects.length,
  );
  const aliceList = await request(baseUrl, 'GET', '/api/projects', { token: alice.token });
  check(
    (aliceList.body as { projects: { id: string }[] }).projects.some((p) => p.id === project.id),
    'The owning company sees it',
  );

  section('Project type — the four values, and free text kept apart');
  const typed = (created.body as unknown as ProjectBody).project;
  check(typed.projectType === 'building', 'The canonical type round-trips', typed.projectType);
  check(typed.projectTypeOther === null, 'And carries no free text when it is not `other`');
  check(typed.size === 'בניין 12 קומות', 'Size is stored as the free text it was given', typed.size);

  const badType = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { ...valid, projectType: 'tower' },
  });
  check(badType.status === 400, 'A type outside the four values is refused', badType.status);

  const otherNoText = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { ...valid, projectType: 'other' },
  });
  check(otherNoText.status === 400, '`other` without free text is refused', otherNoText.status);

  const textWithoutOther = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { ...valid, projectTypeOther: 'סככה' },
  });
  check(textWithoutOther.status === 400, 'Free text beside a canonical type is refused', textWithoutOther.status);

  const otherOk = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { ...valid, name: 'other type', projectType: 'other', projectTypeOther: 'מבנה חקלאי' },
  });
  check(otherOk.status === 201, '`other` with free text is accepted', otherOk.status);
  const otherProject = (otherOk.body as unknown as ProjectBody).project;
  check(otherProject.projectTypeOther === 'מבנה חקלאי', 'And the free text is stored separately');
  const otherStored = await ProjectModel.findById(otherProject.id).lean().exec();
  check(otherStored?.projectType === 'other', 'The enum still holds the canonical value only');

  const noSize = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { name: 'x', startDate: day(0), targetEndDate: day(9), overrunAllowanceDays: 1, projectType: 'villa' },
  });
  check(noSize.status === 400, 'Size is required', noSize.status);

  section('Calendar — a project pins a version, and a company edit cannot move it');
  const pinnedVersionId = typed.calendar.versionId;
  check(typeof pinnedVersionId === 'string' && pinnedVersionId.length > 0, 'A new project pins a version');

  const before = await request(baseUrl, 'GET', '/api/calendar/company', { token: alice.token });
  const beforeVersion = (before.body as { current: { version: number } }).current.version;
  check(beforeVersion >= 1, 'The company has a current version', beforeVersion);

  const edited = await request(baseUrl, 'PUT', '/api/calendar/company', {
    token: alice.token,
    json: {
      workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      hours: { startMinute: 360, endMinute: 900 },
      sector: 'jewish',
      worksCholHaMoed: true,
      worksMemorialDays: false,
    },
  });
  check(edited.status === 201, 'Editing the company default appends a new version', edited.status);
  const newVersionId = (edited.body as { versionId: string }).versionId;
  check(newVersionId !== pinnedVersionId, 'Which is a different version from the pinned one');

  const afterEdit = await request(baseUrl, 'GET', `/api/projects/${typed.id}`, { token: alice.token });
  const afterProject = (afterEdit.body as unknown as ProjectBody).project;
  check(
    afterProject.calendar.versionId === pinnedVersionId,
    'THE LIVE PROJECT DID NOT MOVE — still pinned to its original version',
    `${afterProject.calendar.versionId} vs ${pinnedVersionId}`,
  );
  const storedPin = await ProjectModel.findById(typed.id).lean().exec();
  check(
    storedPin?.calendarVersion?.toString() === pinnedVersionId,
    'And the stored pin is unchanged too — no silent propagation',
  );

  section('Calendar — a NEW project gets the current version');
  const fresh = await request(baseUrl, 'POST', '/api/projects', {
    token: alice.token, json: { ...valid, name: 'after the edit' },
  });
  const freshProject = (fresh.body as unknown as ProjectBody).project;
  check(
    freshProject.calendar.versionId === newVersionId,
    'A project created after the edit pins the NEW version',
    `${freshProject.calendar.versionId} vs ${newVersionId}`,
  );
  check(freshProject.calendar.versionId !== pinnedVersionId, 'And not the old one');

  section('Calendar — repeated company updates keep stacking versions');
  for (const start of [300, 320, 340]) {
    await request(baseUrl, 'PUT', '/api/calendar/company', {
      token: alice.token,
      json: {
        workingDays: ['sunday', 'monday'], hours: { startMinute: start, endMinute: 900 },
        sector: 'jewish', worksCholHaMoed: false, worksMemorialDays: false,
      },
    });
  }
  const chain = await CompanyCalendarVersionModel.find({ company: alice.companyId }).sort({ version: 1 }).lean().exec();
  check(chain.length >= 5, 'Every edit appended a version rather than overwriting', `${chain.length} versions`);
  check(
    chain.every((v, i) => v.version === i + 1),
    'The version numbers are a clean sequence',
    chain.map((v) => v.version).join(','),
  );
  const stillPinned = await ProjectModel.findById(typed.id).lean().exec();
  check(
    stillPinned?.calendarVersion?.toString() === pinnedVersionId,
    'And after four company edits the original project has STILL not moved',
  );

  section('Calendar — overrides, and that they survive adoption');
  const overridden = await request(baseUrl, 'PUT', `/api/projects/${typed.id}/calendar/overrides`, {
    token: alice.token,
    json: { workingDays: ['sunday', 'monday', 'tuesday'], worksCholHaMoed: true },
  });
  check(overridden.status === 200, 'A project override is accepted', overridden.status);
  const withOverride = (overridden.body as unknown as ProjectBody).project;
  check(withOverride.calendar.overrides !== null, 'And is stored on the project');
  check(
    withOverride.calendar.versionId === pinnedVersionId,
    'Overriding does not change which version is pinned',
  );

  section('Calendar — the outdated list is surfaced, not applied');
  const outdated = await request(baseUrl, 'GET', '/api/projects/calendar/outdated', { token: alice.token });
  check(outdated.status === 200, 'The company can ask which projects are behind', outdated.status);
  check(
    (outdated.body as { outdated: number }).outdated >= 1,
    'And the pinned project is counted as behind',
    (outdated.body as { outdated: number }).outdated,
  );

  section('Calendar — adoption is explicit, recorded, and keeps overrides when asked');
  const adopted = await request(baseUrl, 'POST', `/api/projects/${typed.id}/calendar/adopt`, {
    token: alice.token, json: { keepOverrides: true },
  });
  check(adopted.status === 200, 'Adoption succeeds when asked for explicitly', adopted.status);
  const afterAdopt = (adopted.body as unknown as ProjectBody).project;
  check(afterAdopt.calendar.versionId !== pinnedVersionId, 'The pin moved — but only because it was asked to');
  check(afterAdopt.calendar.overrides !== null, 'The project keeps its own overrides across adoption');
  check(afterAdopt.calendar.adoptionCount === 1, 'And the move is recorded in history', afterAdopt.calendar.adoptionCount);

  const record = await ProjectModel.findById(typed.id).lean().exec();
  const move = record?.calendarAdoptions?.[0];
  check(move?.fromVersion?.toString() === pinnedVersionId, 'History names the version it came from');
  check(move?.overridesKept === true, 'And records that the overrides were kept');

  const dropped = await request(baseUrl, 'POST', `/api/projects/${freshProject.id}/calendar/adopt`, {
    token: alice.token, json: { keepOverrides: false },
  });
  check(dropped.status === 200, 'Adoption can also discard overrides when asked', dropped.status);
  check(
    (dropped.body as unknown as ProjectBody).project.calendar.overrides === null,
    'And then they are gone',
  );

  section('Calendar — historical reconstruction');
  const versionRow = await CompanyCalendarVersionModel.findById(pinnedVersionId).lean().exec();
  check(versionRow !== null, 'The version a project used is still readable afterwards');
  check(
    versionRow?.config?.hours?.startMinute === 420,
    'And still says exactly what it said then — 07:00',
    versionRow?.config?.hours?.startMinute,
  );

  section('Authority comes from a grant, never from a role name');
  const keeper = await request(baseUrl, 'POST', '/api/projects', { token: alice.token, json: { ...valid, name: 'grant test' } });
  const keeperId = (keeper.body as unknown as ProjectBody).project.id;

  // Strip only the grant. Standing stays `owner` and the job title is untouched, so anything that
  // still succeeds would be reading a role rather than a permission.
  await CompanyMembershipModel.updateOne(
    { user: alice.userId, company: alice.companyId },
    { $pull: { permissions: 'project.create' } },
  ).exec();

  const ungrantedCreate = await request(baseUrl, 'POST', '/api/projects', { token: alice.token, json: valid });
  check(ungrantedCreate.status === 403, 'Without the grant, creating is refused', ungrantedCreate.status);
  const ungrantedEdit = await request(baseUrl, 'PATCH', `/api/projects/${keeperId}`, {
    token: alice.token, json: { name: 'nope' },
  });
  check(ungrantedEdit.status === 403, 'And so is editing', ungrantedEdit.status);
  const ungrantedCancel = await request(baseUrl, 'DELETE', `/api/projects/${keeperId}`, { token: alice.token });
  check(ungrantedCancel.status === 403, 'And cancelling', ungrantedCancel.status);

  const stillReads = await request(baseUrl, 'GET', '/api/projects', { token: alice.token });
  check(stillReads.status === 200, 'Reading stays open to an active member', stillReads.status);
  const stillReadsOne = await request(baseUrl, 'GET', `/api/projects/${keeperId}`, { token: alice.token });
  check(stillReadsOne.status === 200, 'Including one project by id', stillReadsOne.status);

  const untouched = await ProjectModel.findById(keeperId).lean().exec();
  check(untouched?.name === 'grant test', 'And nothing was changed by the refused calls');

  await CompanyMembershipModel.updateOne(
    { user: alice.userId, company: alice.companyId },
    { $addToSet: { permissions: 'project.create' } },
  ).exec();
  const regranted = await request(baseUrl, 'PATCH', `/api/projects/${keeperId}`, {
    token: alice.token, json: { name: 'grant restored' },
  });
  check(regranted.status === 200, 'Restoring the grant restores the ability', regranted.status);

  section('Cancellation — pre-start only, and it leaves no record');
  const cancelled = await request(baseUrl, 'DELETE', `/api/projects/${project.id}`, { token: alice.token });
  check(cancelled.status === 204, 'A project that has not started is cancelled', cancelled.status);
  const gone = await ProjectModel.findById(project.id).lean().exec();
  check(gone === null, 'It disappears as if it never was — no flag, no tombstone');
  const cancelAgain = await request(baseUrl, 'DELETE', `/api/projects/${project.id}`, { token: alice.token });
  check(cancelAgain.status === 404, 'Cancelling twice is 404', cancelAgain.status);

  const startedProject = await request(baseUrl, 'POST', '/api/projects', { token: alice.token, json: valid });
  const startedId = (startedProject.body as unknown as ProjectBody).project.id;
  await ProjectModel.updateOne({ _id: startedId }, { $set: { startedAt: new Date() } }).exec();
  const refuse = await request(baseUrl, 'DELETE', `/api/projects/${startedId}`, { token: alice.token });
  check(refuse.status === 409, 'A started project cannot be cancelled', refuse.status);
  const startedRead = await request(baseUrl, 'GET', `/api/projects/${startedId}`, { token: alice.token });
  check(
    (startedRead.body as unknown as ProjectBody).project.status === 'active',
    'And it derives as active',
    (startedRead.body as unknown as ProjectBody).project.status,
  );
  check((startedRead.body as unknown as ProjectBody).project.cancellable === false, 'And reports itself uncancellable');

  await ProjectModel.deleteMany({ company: { $in: [alice.companyId, bob.companyId] } }).exec();
  await CompanyMembershipModel.deleteMany({ company: { $in: [alice.companyId, bob.companyId] } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
