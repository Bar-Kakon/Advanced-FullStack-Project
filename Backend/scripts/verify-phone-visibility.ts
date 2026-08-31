/**
 * Phone visibility, against the real server.
 *
 * The rule this proves is the CORRECTED one: automatic disclosure comes from an approved
 * coordinating ROLE on a shared project, and never from a project permission. The suite exists
 * largely to keep it that way — `schedule.change.manage` and Full Authority are asserted to show
 * nothing, because an earlier implementation read exactly those and that was the defect.
 */
import { Types } from 'mongoose';

import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-phone-visibility';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

interface Phones {
  readonly officePhone: string | null;
  readonly businessPhone: string | null;
  readonly visibility: string;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subject = await createAccount(baseUrl, MARKER, 2);
  const stranger = await createAccount(baseUrl, MARKER, 3);
  const manager = await createAccount(baseUrl, MARKER, 4);

  await UserModel.updateOne(
    { _id: subject.userId },
    { $set: { businessPhone: '050-1234567' } },
  ).exec();

  const phonesFor = async (viewerToken: string): Promise<Phones> => {
    const answer = await get(`/api/browse/contractors/${subject.userId.toString()}`, viewerToken);
    return (answer.body as unknown as { profile: { phones: Phones } }).profile.phones;
  };

  section('1. There is no personal phone to expose');
  const stored = await UserModel.findById(subject.userId).lean().exec();
  check(!('phone' in (stored ?? {})), 'the user document has no personal phone field at all');

  section('2. A stranger gets the withheld answer');
  const strangerSees = await phonesFor(stranger.token);
  check(strangerSees.visibility === 'hidden_no_approved_case', 'no approved case applies', strangerSees.visibility);
  check(strangerSees.businessPhone === null, 'the business number is withheld');
  check(strangerSees.officePhone === null, 'and so is the office number');

  section('3. The subject always sees their own');
  const own = await phonesFor(subject.token);
  check(own.visibility === 'self', 'their own answer is `self`', own.visibility);
  check(own.businessPhone === '050-1234567', 'and carries the number');

  section('4. A shared project alone is not enough');
  const project = await post('/api/projects', gc.token, {
    name: 'אתר בדיקת טלפונים',
    startDate: iso(0),
    targetEndDate: iso(120),
    overrunAllowanceDays: 30,
    projectType: 'building',
    size: 'בניין 3 קומות',
  });
  check(project.status === 201, 'the GC opens a project', project.status);
  const projectId = new Types.ObjectId((project.body as { project: { id: string } }).project.id);

  const join = async (userId: Types.ObjectId, projectRole: string): Promise<void> => {
    await ProjectMembershipModel.updateOne(
      { project: projectId, user: userId },
      {
        $set: {
          project: projectId,
          user: userId,
          status: 'active',
          projectRole,
          permissions: [],
          fullAuthority: false,
          invitedBy: gc.userId,
          invitedAt: new Date(),
        },
      },
      { upsert: true },
    ).exec();
  };

  await join(subject.userId, 'subcontractor');
  await join(stranger.userId, 'professional');
  await join(manager.userId, 'professional');

  const coMember = await phonesFor(stranger.token);
  check(
    coMember.visibility === 'hidden_no_approved_case',
    'ordinary co-membership on the same project shows nothing',
    coMember.visibility,
  );
  check(coMember.businessPhone === null, 'and the number stays withheld');

  section('5. A PERMISSION never opens it — this is the corrected rule');
  await ProjectMembershipModel.updateOne(
    { project: projectId, user: stranger.userId },
    { $set: { permissions: ['schedule.change.manage'], fullAuthority: false } },
  ).exec();
  const withScheduleGrant = await phonesFor(stranger.token);
  check(
    withScheduleGrant.visibility === 'hidden_no_approved_case',
    'schedule.change.manage shows NOTHING',
    withScheduleGrant.visibility,
  );
  check(withScheduleGrant.businessPhone === null, 'and the number is still withheld');

  await ProjectMembershipModel.updateOne(
    { project: projectId, user: stranger.userId },
    { $set: { permissions: [], fullAuthority: true } },
  ).exec();
  const withFullAuthority = await phonesFor(stranger.token);
  check(
    withFullAuthority.visibility === 'hidden_no_approved_case',
    'Full Project Authority shows NOTHING',
    withFullAuthority.visibility,
  );
  check(withFullAuthority.businessPhone === null, 'and the number is still withheld');

  await ProjectMembershipModel.updateOne(
    { project: projectId, user: stranger.userId },
    { $set: { permissions: [], fullAuthority: false } },
  ).exec();

  section('6. The GC project role is an approved automatic case');
  const gcSees = await phonesFor(gc.token);
  check(
    gcSees.visibility === 'visible_shared_project_role',
    'the main_contractor project role is what shows the number',
    gcSees.visibility,
  );
  check(gcSees.businessPhone === '050-1234567', 'and the number is really there');

  section('7. A site/construction manager company position is the other one');
  await CompanyMembershipModel.updateOne(
    { user: manager.userId, status: 'active' },
    { $set: { companyPosition: 'site_manager' } },
  ).exec();
  const managerSees = await phonesFor(manager.token);
  check(
    managerSees.visibility === 'visible_shared_project_role',
    'a site manager sharing the project sees it',
    managerSees.visibility,
  );

  await CompanyMembershipModel.updateOne(
    { user: manager.userId, status: 'active' },
    { $set: { companyPosition: 'employee' } },
  ).exec();
  const demoted = await phonesFor(manager.token);
  check(
    demoted.visibility === 'hidden_no_approved_case',
    'and an ordinary employee position on the same project does not',
    demoted.visibility,
  );

  section('8. Being connected confers nothing');
  const connect = await post(`/api/connections/${subject.userId.toString()}`, stranger.token);
  if (connect.status === 201) {
    const accepted = await post(
      `/api/connections/${stranger.userId.toString()}/accept`,
      subject.token,
    );
    check(accepted.status === 200 || accepted.status === 204, 'the two accounts connect', accepted.status);
  }
  const connected = await phonesFor(stranger.token);
  check(
    connected.visibility === 'hidden_no_approved_case',
    'a connection is never an approved case',
    connected.visibility,
  );

  section("9. Outside the automatic cases it is the professional's own setting");
  await UserModel.updateOne(
    { _id: subject.userId },
    { $set: { 'contactVisibility.businessPhone': true } },
  ).exec();
  const published = await phonesFor(stranger.token);
  check(
    published.visibility === 'visible_contact_setting',
    'publishing the number is what shows it',
    published.visibility,
  );
  check(published.businessPhone === '050-1234567', 'and it is the real number');

  await UserModel.updateOne(
    { _id: subject.userId },
    { $set: { 'contactVisibility.businessPhone': false } },
  ).exec();
  const withdrawn = await phonesFor(stranger.token);
  check(
    withdrawn.visibility === 'hidden_no_approved_case',
    'withdrawing it withholds it again',
    withdrawn.visibility,
  );

  section('10. Withdrawing it never closes an approved automatic case');
  const gcAfterWithdrawal = await phonesFor(gc.token);
  check(
    gcAfterWithdrawal.visibility === 'visible_shared_project_role',
    'the GC still sees it — the setting only governs what the automatic cases do not',
    gcAfterWithdrawal.visibility,
  );

  await ProjectMembershipModel.deleteMany({ project: projectId }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

void run();
