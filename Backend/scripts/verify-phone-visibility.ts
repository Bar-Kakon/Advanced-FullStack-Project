/**
 * The closed phone-visibility policy, proved on the server.
 *
 * Personal phone never anywhere, the two automatic cases and nothing beside them, the
 * professional's own control for everything else, and a connection that confers nothing.
 *
 *   npm run verify:phone-visibility
 */
import { Types } from 'mongoose';

import { createPhoneVisibilityService } from '../src/features/browse/phoneVisibility.service.js';
import { ConnectionModel } from '../src/features/connections/connection.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-phone';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

const BUSINESS = '050-1112222';
const OFFICE = '03-9998888';

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const put = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PUT', path, { token, json });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subject = await createAccount(baseUrl, MARKER, 2);
  const coMember = await createAccount(baseUrl, MARKER, 3);
  const connected = await createAccount(baseUrl, MARKER, 4);
  const stranger = await createAccount(baseUrl, MARKER, 5);

  await UserModel.updateOne({ _id: subject.userId }, { $set: { businessPhone: BUSINESS } }).exec();
  await CompanyModel.updateOne({ _id: subject.companyId }, { $set: { officePhone: OFFICE } }).exec();

  const phones = createPhoneVisibilityService();
  const decide = (viewer: { userId: Types.ObjectId }) =>
    phones.decide({ viewerId: viewer.userId.toString(), subjectId: subject.userId.toString() });

  const profileFor = async (token: string) => {
    const answer = await get(`/api/browse/contractors/${subject.userId.toString()}`, token);
    return answer.body as {
      profile?: {
        phones: { officePhone: string | null; businessPhone: string | null; visibility: string };
        email: string | null;
      };
    };
  };

  section('1. There is no personal phone to expose');
  const stored = await UserModel.findById(subject.userId).lean<Record<string, unknown>>().exec();
  check(stored !== null && !('phone' in stored),
    'the account document carries no personal phone field at all');
  const raw = JSON.stringify(await profileFor(stranger.token));
  check(!raw.includes('"phone"'), 'and no public profile shape has one either');

  section('2. A stranger gets the withheld answer');
  check(await decide(stranger) === 'hidden_no_approved_case',
    'no approved case applies', await decide(stranger));
  const strangerView = await profileFor(stranger.token);
  check(strangerView.profile?.phones.businessPhone === null,
    'the business number is absent from the payload, not merely hidden by a screen');
  check(strangerView.profile?.phones.officePhone === null, 'and so is the office number');

  section('3. A connection alone confers nothing');
  // Built through the real endpoints, so the edge under test is the one the product creates.
  const requested = await post(`/api/connections/${subject.userId.toString()}/request`, connected.token);
  check(requested.status === 200 || requested.status === 201, 'a connection request is sent',
    requested.status);
  const accepted = await post(`/api/connections/${connected.userId.toString()}/accept`, subject.token);
  check(accepted.status === 200, 'and accepted', accepted.status);
  const connectedAnswer = await decide(connected);
  check(connectedAnswer === 'hidden_no_approved_case',
    'an accepted connection is still not an approved case', connectedAnswer);
  const connectedView = await profileFor(connected.token);
  check(connectedView.profile?.phones.businessPhone === null,
    'and the number stays out of the payload');
  check(connectedView.profile?.phones.visibility === 'hidden_no_approved_case',
    'the reason names the missing case rather than the connection');

  section('4. Sharing a project is not enough — the grant is');
  const created = await post('/api/projects', gc.token, {
    name: 'אתר הטלפונים', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
  };
  await join(subject);
  await join(coMember);

  const coMemberAnswer = await decide(coMember);
  check(coMemberAnswer === 'hidden_no_approved_case',
    'another subcontractor on the same job sees nothing', coMemberAnswer);
  const coMemberView = await profileFor(coMember.token);
  check(coMemberView.profile?.phones.businessPhone === null,
    'an unrelated project member gains no private contact data');

  section('5. The management grant is the approved automatic case');
  await ProjectMembershipModel.updateOne(
    { project, user: coMember.userId },
    { $set: { permissions: ['schedule.change.manage'], fullAuthority: false } },
  ).exec();
  const managerAnswer = await decide(coMember);
  check(managerAnswer === 'visible_shared_project_role',
    'holding schedule.change.manage on a shared project is what shows the number', managerAnswer);
  const managerView = await profileFor(coMember.token);
  check(managerView.profile?.phones.businessPhone === BUSINESS,
    'and the number is actually served', managerView.profile?.phones.businessPhone);
  check(managerView.profile?.phones.officePhone === OFFICE, 'along with the office number');

  section('6. A descriptive role name grants nothing');
  await ProjectMembershipModel.updateOne(
    { project, user: coMember.userId },
    { $set: { permissions: [], fullAuthority: false, projectRole: 'site_manager' } },
  ).exec();
  const roleOnly = await decide(coMember);
  check(roleOnly === 'hidden_no_approved_case',
    'a project role with no grant behind it is not authority', roleOnly);

  section('7. The two parties to real work see each other, mutually');
  const stage = await ProjectStageModel.create({
    project, name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });
  const task = await TaskModel.create({
    kind: 'project', project, stage: stage._id, company: gc.companyId, createdBy: gc.userId,
    assignee: subject.userId, title: 'יציקה',
    startDate: new Date(iso(4)), dueDate: new Date(iso(8)),
    ownCrewOnly: false, delegatorOnSiteRequired: false,
  });

  check(await decide(gc) === 'visible_work_commitment',
    'the party who opened the work sees the responsible party’s number');
  const reverse = await phones.decide({
    viewerId: subject.userId.toString(), subjectId: gc.userId.toString(),
  });
  check(reverse === 'visible_work_commitment', 'and it runs both ways');

  section('8. The delegation wall holds through the phone matrix');
  const delegate = await createAccount(baseUrl, MARKER, 6);
  await TaskModel.updateOne(
    { _id: task._id },
    {
      $set: {
        delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() },
      },
    },
  ).exec();

  const delegateSeesResponsible = await phones.decide({
    viewerId: delegate.userId.toString(), subjectId: subject.userId.toString(),
  });
  check(delegateSeesResponsible === 'visible_work_commitment',
    'the delegate and the delegator are two parties to real work');

  const delegateSeesAbove = await phones.decide({
    viewerId: delegate.userId.toString(), subjectId: gc.userId.toString(),
  });
  check(delegateSeesAbove === 'hidden_no_approved_case',
    'but the delegate is never paired with the party above', delegateSeesAbove);
  const aboveSeesDelegate = await phones.decide({
    viewerId: gc.userId.toString(), subjectId: delegate.userId.toString(),
  });
  check(aboveSeesDelegate === 'hidden_no_approved_case',
    'and the party above is never paired with the delegate', aboveSeesDelegate);

  section('9. Everything else is the professional’s own control');
  const beforeChoice = await profileFor(stranger.token);
  check(beforeChoice.profile?.phones.businessPhone === null,
    'withheld is where a number starts');
  check(beforeChoice.profile?.email === subject.email,
    'while the email is published, which is the one default the policy states',
    beforeChoice.profile?.email);

  const published = await put('/api/settings/contact-visibility', subject.token, {
    businessPhone: true,
  });
  check(published.status === 200, 'the professional publishes their own business number',
    published.status);

  const afterChoice = await profileFor(stranger.token);
  check(afterChoice.profile?.phones.businessPhone === BUSINESS,
    'and now a stranger may see it', afterChoice.profile?.phones.businessPhone);
  check(afterChoice.profile?.phones.officePhone === null,
    'the office number is a separate answer and stays withheld');
  check(afterChoice.profile?.phones.visibility === 'hidden_no_approved_case',
    'the automatic reason is unchanged — the choice is a second layer, not a new case');

  const withdrawn = await put('/api/settings/contact-visibility', subject.token, {
    businessPhone: false, email: false,
  });
  check(withdrawn.status === 200, 'and it can be withdrawn again', withdrawn.status);
  const afterWithdraw = await profileFor(stranger.token);
  check(afterWithdraw.profile?.phones.businessPhone === null, 'the number goes back out of the payload');
  check(afterWithdraw.profile?.email === null, 'and so does the email');

  section('10. A withdrawal never closes an approved automatic case');
  const stillManager = await profileFor(gc.token);
  check(stillManager.profile?.phones.businessPhone === BUSINESS,
    'the party to the work still sees the number after the subject withheld it publicly',
    stillManager.profile?.phones.businessPhone);

  section('11. Nobody edits somebody else’s contact visibility');
  const before = await UserModel.findById(subject.userId).lean().exec();
  const hijack = await put('/api/settings/contact-visibility', stranger.token, {
    businessPhone: true,
  });
  check(hijack.status === 200, 'the call acts on the caller’s own account', hijack.status);
  const after = await UserModel.findById(subject.userId).lean().exec();
  check(
    after?.contactVisibility?.businessPhone === before?.contactVisibility?.businessPhone,
    'and the subject’s setting is untouched',
  );

  await ConnectionModel.deleteMany({
    $or: [{ requester: connected.userId }, { recipient: connected.userId }],
  }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
