/**
 * Messaging, end to end, against the real server.
 *
 * What it proves are the closed rules: a connection never gates a first message; first contact is
 * a request; deleting a chat is a per-user hide that destroys nothing and comes back whole; one
 * pair never gets a second conversation; no-contact reaches private messages and never a shared
 * Project Room; an invited-but-not-accepted member has no room access; an accepted agreement
 * creates the canonical Task exactly once; and every message carries its persisted send time.
 */
import { Types } from 'mongoose';

import { ConversationModel } from '../src/features/messaging/conversation.model.js';
import { MessageModel } from '../src/features/messaging/message.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ReportModel } from '../src/features/reports/report.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-messaging';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

interface Summary {
  readonly id: string;
  readonly kind: string;
  readonly requestState: string | null;
  readonly awaitingMyAnswer: boolean;
}
interface Msg {
  readonly id: string;
  readonly body: string | null;
  readonly sentAt: string;
  readonly removed: boolean;
  readonly agreement: { state: string; taskId: string | null } | null;
}
interface Inbox {
  readonly conversations: readonly Summary[];
  readonly nextCursor: string | null;
}
interface History {
  readonly messages: readonly Msg[];
  readonly nextCursor: string | null;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await ConversationModel.deleteMany({}).exec();
  await MessageModel.deleteMany({}).exec();
  await ConversationModel.syncIndexes();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const del = (path: string, token: string) => request(baseUrl, 'DELETE', path, { token });

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const gc = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);
  const invitee = await createAccount(baseUrl, MARKER, 5);

  const inbox = async (token: string, folder = 'inbox'): Promise<Inbox> =>
    (await get(`/api/conversations?folder=${folder}`, token)).body as unknown as Inbox;
  const history = async (token: string, id: string, query = ''): Promise<History> =>
    (await get(`/api/conversations/${id}/messages${query}`, token)).body as unknown as History;

  section('1. A connection does NOT gate the first message');
  const opened = await post(`/api/conversations/direct/${bob.userId.toString()}`, alice.token, {
    body: 'שלום, יש לי עבודה בשבילך',
  });
  check(opened.status === 201, 'a first message is accepted with no connection at all', opened.status);
  const conversationId = (opened.body as unknown as { conversation: Summary }).conversation.id;

  section('2. First contact enters the Message Request flow');
  const bobRequests = await inbox(bob.token, 'requests');
  check(bobRequests.conversations.length === 1, 'it lands in the recipient’s Requests', bobRequests.conversations.length);
  check(bobRequests.conversations[0]?.requestState === 'pending', 'as pending', bobRequests.conversations[0]?.requestState);
  check(bobRequests.conversations[0]?.awaitingMyAnswer === true, 'and it is his to answer');

  const bobInbox = await inbox(bob.token);
  check(bobInbox.conversations.length === 0, 'and it is NOT in his ordinary Inbox yet', bobInbox.conversations.length);

  const aliceInbox = await inbox(alice.token);
  check(aliceInbox.conversations.length === 1, 'the sender keeps it in her own Inbox', aliceInbox.conversations.length);

  section('3. The sender may not keep writing while it is unanswered');
  const pushy = await post(`/api/conversations/${conversationId}/messages`, alice.token, { body: 'עוד הודעה' });
  check(pushy.status === 409, 'a second message before acceptance is refused', pushy.status);

  section('4. A stranger cannot read it at all');
  const peek = await get(`/api/conversations/${conversationId}/messages`, outsider.token);
  check(peek.status === 404, 'an unrelated account gets not-found, not forbidden', peek.status);

  section('5. Accepting opens the thread, with its history intact');
  const wrongAnswer = await post(`/api/conversations/${conversationId}/accept`, alice.token);
  check(wrongAnswer.status === 403, 'the sender cannot accept her own request', wrongAnswer.status);

  const accepted = await post(`/api/conversations/${conversationId}/accept`, bob.token);
  check(accepted.status === 204, 'the recipient accepts', accepted.status);

  const afterAccept = await history(bob.token, conversationId);
  check(afterAccept.messages.length === 1, 'the original message is still there', afterAccept.messages.length);
  check(afterAccept.messages[0]?.body === 'שלום, יש לי עבודה בשבילך', 'unchanged');

  const reply = await post(`/api/conversations/${conversationId}/messages`, bob.token, { body: 'מתאים לי' });
  check(reply.status === 201, 'and he can reply', reply.status);

  section('6. Every message carries its PERSISTED send time');
  const timed = await history(alice.token, conversationId);
  check(timed.messages.every((m) => !Number.isNaN(Date.parse(m.sentAt))), 'each message has a real timestamp');
  const stored = await MessageModel.findById(timed.messages[0]?.id).lean().exec();
  check(
    stored !== null && new Date(timed.messages[0]!.sentAt).getTime() === stored.createdAt.getTime(),
    'and it is the stored createdAt, never a client clock',
  );
  check(
    timed.messages[0]!.sentAt <= timed.messages[1]!.sentAt,
    'a page reads oldest-first, which is the order a conversation is read in',
  );

  section('7. Deleting a chat is a per-user hide that destroys nothing');
  const hidden = await del(`/api/conversations/${conversationId}`, alice.token);
  check(hidden.status === 204, 'Alice deletes the chat', hidden.status);

  check((await inbox(alice.token)).conversations.length === 0, 'it leaves her Inbox');
  check((await inbox(bob.token)).conversations.length === 1, "Bob's copy is untouched");

  check((await MessageModel.countDocuments({ conversation: new Types.ObjectId(conversationId) }).exec()) === 2,
    'and NO message was deleted');
  const stillReadable = await history(alice.token, conversationId);
  check(stillReadable.messages.length === 2, 'she can still read the history by id — it is hidden, not gone');

  section('8. The next message restores the SAME conversation, whole');
  const revive = await post(`/api/conversations/${conversationId}/messages`, bob.token, { body: 'עוד שאלה' });
  check(revive.status === 201, 'the other side writes again', revive.status);

  const revived = await inbox(alice.token);
  check(revived.conversations.length === 1, 'it reappears in her Inbox', revived.conversations.length);
  check(revived.conversations[0]?.id === conversationId, 'and it is the SAME conversation, not a new one');

  const fullHistory = await history(alice.token, conversationId);
  check(fullHistory.messages.length === 3, 'with ALL the previous history', fullHistory.messages.length);
  check(fullHistory.messages[0]?.body === 'שלום, יש לי עבודה בשבילך', 'including the very first message');

  check((await ConversationModel.countDocuments({ pairKey: { $exists: true } }).exec()) === 1,
    'and exactly ONE conversation exists for the pair');

  section('9. Hiding, then writing yourself, also restores it');
  await del(`/api/conversations/${conversationId}`, alice.token);
  const selfRevive = await post(`/api/conversations/${conversationId}/messages`, alice.token, { body: 'חוזרת' });
  check(selfRevive.status === 201, 'the person who hid it writes into it', selfRevive.status);
  check((await inbox(alice.token)).conversations.length === 1, 'and it is back for her too');

  section('10. Starting again never creates a duplicate');
  const again = await post(`/api/conversations/direct/${bob.userId.toString()}`, alice.token, { body: 'שוב' });
  check(again.status === 201, 'she opens a direct conversation again', again.status);
  check(
    (await ConversationModel.countDocuments({ pairKey: { $exists: true } }).exec()) === 1,
    'still exactly one conversation for the pair',
  );

  section('11. Cursor pagination walks the history without repeats or gaps');
  const firstPage = await history(alice.token, conversationId, '?limit=2');
  check(firstPage.messages.length === 2, 'a limit is honoured', firstPage.messages.length);
  check(firstPage.nextCursor !== null, 'and a full page offers a cursor');
  const secondPage = await history(
    alice.token,
    conversationId,
    `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor as string)}`,
  );
  const ids = new Set([...firstPage.messages, ...secondPage.messages].map((m) => m.id));
  check(ids.size === firstPage.messages.length + secondPage.messages.length, 'the pages do not overlap', ids.size);

  const tampered = await history(alice.token, conversationId, '?limit=2&cursor=nonsense');
  check(tampered.messages.length === 2, 'a tampered cursor restarts rather than throwing');

  section('12. Message reporting reuses the existing reports domain');
  const before = await ReportModel.countDocuments({}).exec();
  const reported = await post(
    `/api/conversations/${conversationId}/messages/${fullHistory.messages[1]!.id}/report`,
    alice.token,
    { reason: 'harassment', note: 'לא בסדר' },
  );
  check(reported.status === 201, 'a message can be reported', reported.status);
  check((await ReportModel.countDocuments({}).exec()) === before + 1, 'into the SAME reports collection');
  const filed = await ReportModel.findOne({ 'subject.type': 'message' }).lean().exec();
  check(filed?.subject?.type === 'message', 'with a message subject type', filed?.subject?.type);
  check(filed?.reporter.toString() === alice.userId.toString(), 'and the reporter is the session, not the body');

  const foreignReport = await post(
    `/api/conversations/${conversationId}/messages/${fullHistory.messages[1]!.id}/report`,
    outsider.token,
    { reason: 'spam' },
  );
  check(foreignReport.status === 404, 'an outsider cannot report a message in a thread they cannot reach', foreignReport.status);

  section('13. Project Room access is live project membership');
  const project = await post('/api/projects', gc.token, {
    name: 'אתר ההתכתבות',
    startDate: iso(0),
    targetEndDate: iso(120),
    overrunAllowanceDays: 30,
    projectType: 'building',
    size: 'בניין 3 קומות',
  });
  check(project.status === 201, 'the GC opens a project', project.status);
  const projectId = (project.body as { project: { id: string } }).project.id;

  const roomForGc = await get(`/api/conversations/project/${projectId}`, gc.token);
  check(roomForGc.status === 200, 'the GC reaches its room', roomForGc.status);
  const roomId = (roomForGc.body as unknown as { conversation: Summary }).conversation.id;

  const roomForOutsider = await get(`/api/conversations/project/${projectId}`, outsider.token);
  check(roomForOutsider.status === 404, 'a non-member does not', roomForOutsider.status);
  check(
    (await get(`/api/conversations/${roomId}/messages`, outsider.token)).status === 404,
    'and cannot read it by id either',
  );

  section('14. Invited-but-not-accepted gets NO room access');
  await ProjectMembershipModel.updateOne(
    { project: new Types.ObjectId(projectId), user: invitee.userId },
    {
      $set: {
        project: new Types.ObjectId(projectId),
        user: invitee.userId,
        status: 'invited',
        projectRole: 'subcontractor',
        permissions: [],
        fullAuthority: false,
        invitedBy: gc.userId,
        invitedAt: new Date(),
      },
    },
    { upsert: true },
  ).exec();

  check(
    (await get(`/api/conversations/project/${projectId}`, invitee.token)).status === 404,
    'an invitation is not participation',
  );

  await ProjectMembershipModel.updateOne(
    { project: new Types.ObjectId(projectId), user: invitee.userId },
    { $set: { status: 'active' } },
  ).exec();
  check(
    (await get(`/api/conversations/project/${projectId}`, invitee.token)).status === 200,
    'accepting is what opens it',
  );

  section('15. No-contact reaches private messages, never the shared Project Room');
  await ProjectMembershipModel.updateOne(
    { project: new Types.ObjectId(projectId), user: alice.userId },
    {
      $set: {
        project: new Types.ObjectId(projectId),
        user: alice.userId,
        status: 'active',
        projectRole: 'subcontractor',
        permissions: [],
        fullAuthority: false,
        invitedBy: gc.userId,
        invitedAt: new Date(),
      },
    },
    { upsert: true },
  ).exec();

  const blocked = await request(baseUrl, 'PUT', `/api/blocks/${alice.userId.toString()}`, {
    token: bob.token,
  });
  check(blocked.status === 201 || blocked.status === 200 || blocked.status === 204,
    'Bob blocks Alice', blocked.status);

  const blockedDm = await post(`/api/conversations/${conversationId}/messages`, alice.token, { body: 'עוד' });
  check(blockedDm.status === 403, 'the private conversation closes', blockedDm.status);

  const roomStillOpen = await get(`/api/conversations/project/${projectId}`, alice.token);
  check(roomStillOpen.status === 200, 'but the shared Project Room is UNAFFECTED', roomStillOpen.status);
  const roomPost = await post(`/api/conversations/${roomId}/messages`, alice.token, { body: 'עדכון מהשטח' });
  check(roomPost.status === 201, 'and she can still coordinate in it', roomPost.status);

  await request(baseUrl, 'DELETE', `/api/blocks/${alice.userId.toString()}`, { token: bob.token });

  section('16. An accepted Agreement creates the canonical Task exactly once');
  const proposed = await post(`/api/conversations/${conversationId}/agreements`, alice.token, {
    title: 'יציקת רצפה',
    description: 'קומה שנייה',
    startDate: iso(3),
    dueDate: iso(9),
  });
  check(proposed.status === 201, 'an agreement is proposed inside the conversation', proposed.status);
  const agreementId = (proposed.body as unknown as { message: Msg }).message.id;

  const inThread = await history(bob.token, conversationId);
  check(
    inThread.messages.some((m) => m.id === agreementId && m.agreement !== null),
    'it is a message in the thread, not a separate screen',
  );

  const selfAccept = await post(
    `/api/conversations/${conversationId}/agreements/${agreementId}/accept`,
    alice.token,
  );
  check(selfAccept.status === 403, 'the proposer cannot accept their own agreement', selfAccept.status);

  const tasksBefore = await TaskModel.countDocuments({}).exec();
  const acceptedAgreement = await post(
    `/api/conversations/${conversationId}/agreements/${agreementId}/accept`,
    bob.token,
  );
  check(acceptedAgreement.status === 200, 'the other party accepts', acceptedAgreement.status);

  const tasksAfter = await TaskModel.countDocuments({}).exec();
  check(tasksAfter === tasksBefore + 1, 'exactly one Task was created', `${tasksBefore} -> ${tasksAfter}`);

  const answered = (acceptedAgreement.body as unknown as { message: Msg }).message;
  check(answered.agreement?.state === 'accepted', 'the agreement records its acceptance', answered.agreement?.state);
  check(answered.agreement?.taskId !== null, 'and carries the task it became');

  const twice = await post(
    `/api/conversations/${conversationId}/agreements/${agreementId}/accept`,
    bob.token,
  );
  check(twice.status === 409, 'accepting a second time is refused', twice.status);
  check(
    (await TaskModel.countDocuments({}).exec()) === tasksAfter,
    'and NO second task was created',
  );

  section('17. There is no second task schema');
  const createdTask = await TaskModel.findById(answered.agreement?.taskId).lean().exec();
  check(createdTask !== null, 'the agreement produced a row in the ordinary tasks collection');
  check(createdTask?.title === 'יציקת רצפה', 'carrying the agreed title', createdTask?.title);

  await ProjectMembershipModel.deleteMany({ project: new Types.ObjectId(projectId) }).exec();
  await ConversationModel.deleteMany({}).exec();
  await MessageModel.deleteMany({}).exec();
  await ReportModel.deleteMany({ 'subject.type': 'message' }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

void run();
