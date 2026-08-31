import { Types } from 'mongoose';

import { ConversationModel } from '../src/features/messaging/conversation.model.js';
import { MessageModel } from '../src/features/messaging/message.model.js';
import { MuteModel } from '../src/features/mutes/mute.model.js';
import { notificationPreferencePort } from '../src/features/mutes/notificationPreference.port.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-mute';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await MuteModel.deleteMany({}).exec();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const put = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PUT', path, { token, json });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subA = await createAccount(baseUrl, MARKER, 2);
  const subB = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);
  const invitee = await createAccount(baseUrl, MARKER, 5);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר ההשתקה', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }, accept = true) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    if (accept) await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
    return row;
  };
  await join(subA);
  await join(subB);
  await join(invitee, false);

  const stage = await ProjectStageModel.create({ project, name: 'שלד', order: 0, isGate: false, dependsOn: [] });
  const task = await TaskModel.create({
    kind: 'project', project, stage: stage._id, company: gc.companyId, createdBy: gc.userId,
    assignee: subA.userId, title: 'עבודה', startDate: new Date(iso(1)), dueDate: new Date(iso(7)),
    ownCrewOnly: false, delegatorOnSiteRequired: false,
  });

  section('1. A project starts unmuted, as a real answer rather than an absence');
  const initial = await get(`/api/mutes/projects/${projectId}`, subA.token);
  check(initial.status === 200, 'an active member may read their own mute state', initial.status);
  check((initial.body as { mute: { muted: boolean } }).mute.muted === false,
    'and it is a canonical false, not a missing value',
    JSON.stringify(initial.body));

  section('2. Muting and unmuting are the viewer own preference');
  const muted = await put(`/api/mutes/projects/${projectId}`, subA.token, { muted: true });
  check(muted.status === 200 && (muted.body as { mute: { muted: boolean } }).mute.muted,
    'the viewer mutes the project', muted.status);
  const reread = (await get(`/api/mutes/projects/${projectId}`, subA.token)).body as { mute: { muted: boolean } };
  check(reread.mute.muted, 'and a fresh read still says muted — it is stored, not held in a screen');

  const again = await put(`/api/mutes/projects/${projectId}`, subA.token, { muted: true });
  check(again.status === 200, 'muting twice is accepted', again.status);
  check((await MuteModel.countDocuments({ user: subA.userId, scope: 'project', target: project })) === 1,
    'and leaves exactly one row, never a duplicate');

  const unmuted = await put(`/api/mutes/projects/${projectId}`, subA.token, { muted: false });
  check(unmuted.status === 200 && (unmuted.body as { mute: { muted: boolean } }).mute.muted === false,
    'the viewer unmutes it', unmuted.status);
  const unmutedTwice = await put(`/api/mutes/projects/${projectId}`, subA.token, { muted: false });
  check(unmutedTwice.status === 200, 'unmuting twice is accepted too', unmutedTwice.status);
  check((await MuteModel.countDocuments({ user: subA.userId, scope: 'project', target: project })) === 0,
    'and leaves no row behind');

  section('3. One person mute is nobody else business');
  await put(`/api/mutes/projects/${projectId}`, subA.token, { muted: true });
  const otherView = (await get(`/api/mutes/projects/${projectId}`, subB.token)).body as { mute: { muted: boolean } };
  check(otherView.mute.muted === false, 'another member on the same project is unaffected');
  const shape = JSON.stringify((await get(`/api/mutes/projects/${projectId}`, subB.token)).body);
  check(!shape.includes(subA.userId.toString()), 'and cannot see who else muted it');

  section('4. Muting changes nothing about the project itself');
  const membership = await ProjectMembershipModel.findOne({ project, user: subA.userId }).lean().exec();
  check(membership?.status === 'active', 'membership is untouched', String(membership?.status));
  check((membership?.permissions ?? []).length === 0 && membership?.fullAuthority === false,
    'grants are untouched');

  const taskStillThere = await get(`/api/tasks/${task._id.toString()}`, subA.token);
  check(taskStillThere.status === 200, 'the muted viewer still reads their task', taskStillThere.status);
  const proposals = await get(`/api/coordination/projects/${projectId}/proposals`, subA.token);
  check(proposals.status === 200, 'still reads the project proposal surface', proposals.status);
  const audit = await get(`/api/coordination/projects/${projectId}/audit`, subA.token);
  check(audit.status === 200, 'and still reads the project history', audit.status);
  const dashboard = await get(`/api/projects/${projectId}`, subA.token);
  check(dashboard.status === 200, 'and the project itself is still reachable', dashboard.status);

  section('5. The endpoint discloses nothing to somebody with no standing');
  const outsiderRead = await get(`/api/mutes/projects/${projectId}`, outsider.token);
  check(outsiderRead.status === 404, 'an unrelated account cannot tell the project exists', outsiderRead.status);
  const outsiderWrite = await put(`/api/mutes/projects/${projectId}`, outsider.token, { muted: true });
  check(outsiderWrite.status === 404, 'nor mute it into existence', outsiderWrite.status);
  const inviteeRead = await get(`/api/mutes/projects/${projectId}`, invitee.token);
  check(inviteeRead.status === 404,
    'and an invitation that was never accepted gets the same answer', inviteeRead.status);
  check((await MuteModel.countDocuments({ user: outsider.userId })) === 0,
    'no row was written for either of them');

  section('6. The preference reads from the server, for whoever asks later');
  check(await notificationPreferencePort.isProjectMuted(subA.userId.toString(), projectId),
    'the notification boundary sees the mute without any screen involved');
  check(!(await notificationPreferencePort.isProjectMuted(subB.userId.toString(), projectId)),
    'and sees the other member as unmuted');

  const batch = await notificationPreferencePort.mutedProjectIdsFor(subA.userId.toString(), [projectId]);
  check(batch.has(projectId), 'the batch form answers for a list of projects in one read');
  check(
    !(await notificationPreferencePort.isProjectMuted(subA.userId.toString(), new Types.ObjectId().toString())),
    'a project nobody muted answers false rather than throwing',
  );

  section('7. The stored shape is the designed one');
  const row = await MuteModel.findOne({ user: subA.userId, scope: 'project', target: project }).lean().exec();
  check(row !== null, 'one row per user, scope and target');
  check(row?.scope === 'project', 'the scope is stored rather than implied', String(row?.scope));
  const indexes = (await MuteModel.collection.indexes()) as readonly {
    key: Record<string, number>;
    unique?: boolean;
  }[];
  const unique = indexes.find(
    (index) => JSON.stringify(index.key) === '{"user":1,"scope":1,"target":1}',
  );
  check(unique?.unique === true,
    'and the unique index is what makes muting twice a no-op rather than a second row');

  section('Conversation mute — the caller\'s own delivery preference');
  const other = await createAccount(baseUrl, MARKER, 90);
  const opened = await post(`/api/conversations/direct/${other.userId.toString()}`, gc.token, {
    body: 'שלום',
  });
  check(opened.status === 201, 'a conversation exists to mute', opened.status);
  const conversationId = (opened.body as unknown as { conversation: { id: string } }).conversation.id;

  // Accepted first: a pending request refuses further messages, which would mask the point below.
  const acceptedRequest = await post(`/api/conversations/${conversationId}/accept`, other.token);
  check(acceptedRequest.status === 204, 'the recipient accepts the request', acceptedRequest.status);

  const beforeMute = await get(`/api/mutes/conversations/${conversationId}`, gc.token);
  check(beforeMute.status === 200, 'the conversation mute is readable', beforeMute.status);
  check(
    (beforeMute.body as unknown as { mute: { muted: boolean } }).mute.muted === false,
    'and starts unmuted',
  );

  const muteOn = await request(baseUrl, 'PUT', `/api/mutes/conversations/${conversationId}`, {
    token: gc.token,
    json: { muted: true },
  });
  check(muteOn.status === 200, 'it can be muted', muteOn.status);
  check(
    (await MuteModel.findOne({ user: gc.userId, scope: 'conversation' }).lean().exec()) !== null,
    'on the canonical mute model, under the conversation scope',
  );

  const stillReadable = await get(`/api/conversations/${conversationId}/messages`, gc.token);
  check(stillReadable.status === 200, 'muting changes NO access — the thread still reads', stillReadable.status);
  const stillSendable = await post(`/api/conversations/${conversationId}/messages`, other.token, {
    body: 'עדיין מגיע',
  });
  check(stillSendable.status === 201, 'and messages still arrive: mute is delivery, not domain state');
  check(
    (await MessageModel.countDocuments({ conversation: new Types.ObjectId(conversationId) }).exec()) === 2,
    'the message was written despite the mute',
  );

  const stranger = await createAccount(baseUrl, MARKER, 91);
  const foreignMute = await request(baseUrl, 'PUT', `/api/mutes/conversations/${conversationId}`, {
    token: stranger.token,
    json: { muted: true },
  });
  check(foreignMute.status === 404, 'somebody outside the conversation cannot mute it', foreignMute.status);

  const muteOff = await request(baseUrl, 'PUT', `/api/mutes/conversations/${conversationId}`, {
    token: gc.token,
    json: { muted: false },
  });
  check(muteOff.status === 200, 'and it can be unmuted', muteOff.status);
  check(
    (await MuteModel.findOne({ user: gc.userId, scope: 'conversation' }).lean().exec()) === null,
    'which removes the row rather than flagging it',
  );

  section('Contractor mute — a preference, and never a block');
  const contractorBefore = await get(`/api/mutes/contractors/${other.userId.toString()}`, gc.token);
  check(contractorBefore.status === 200, 'the contractor mute is readable', contractorBefore.status);

  const contractorOn = await request(baseUrl, 'PUT', `/api/mutes/contractors/${other.userId.toString()}`, {
    token: gc.token,
    json: { muted: true },
  });
  check(contractorOn.status === 200, 'a contractor can be muted', contractorOn.status);
  check(
    (await MuteModel.findOne({ user: gc.userId, scope: 'contractor' }).lean().exec()) !== null,
    'under the contractor scope on the same canonical model',
  );

  const profileStillVisible = await get(
    `/api/browse/contractors/${other.userId.toString()}`,
    gc.token,
  );
  check(profileStillVisible.status === 200, 'muting is not blocking — the profile still resolves', profileStillVisible.status);
  const theirs = await get(`/api/mutes/contractors/${gc.userId.toString()}`, other.token);
  check(
    (theirs.body as unknown as { mute: { muted: boolean } }).mute.muted === false,
    'and it is one-sided: the muted person has muted nobody',
  );

  await request(baseUrl, 'PUT', `/api/mutes/contractors/${other.userId.toString()}`, {
    token: gc.token,
    json: { muted: false },
  });

  await ConversationModel.deleteMany({}).exec();
  await MessageModel.deleteMany({}).exec();
  await MuteModel.deleteMany({}).exec();
  await TaskModel.deleteMany({ project }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await ProjectMembershipModel.deleteMany({ project }).exec();
  await ProjectModel.deleteMany({ _id: project }).exec();
  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
