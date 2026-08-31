/**
 * Platform moderation, end to end, against the real server.
 *
 * What it proves: moderation is reachable only through platform authority and never through
 * project authority; resolution is atomic, single-use and non-destructive; internal notes stay
 * internal; restriction stops new work without touching committed work; and the report shape
 * stays compatible with D8 anonymisation.
 */
import { Types } from 'mongoose';

import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ReportModel } from '../src/features/reports/report.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-moderation';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });

  const admin = await createAccount(baseUrl, MARKER, 1);
  const secondAdmin = await createAccount(baseUrl, MARKER, 2);
  const reporter = await createAccount(baseUrl, MARKER, 3);
  const subject = await createAccount(baseUrl, MARKER, 4);
  const gc = await createAccount(baseUrl, MARKER, 5);

  await ReportModel.deleteMany({}).exec();
  await ReportModel.syncIndexes();
  await UserModel.updateMany(
    { _id: { $in: [admin.userId, secondAdmin.userId] } },
    { $set: { isAdmin: true } },
  ).exec();

  const fileReport = async (reason: string): Promise<string> => {
    const filed = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
      reason,
      note: 'ההסבר הפרטי של המדווח',
      source: 'public_profile',
    });
    return (filed.body as { report: { id: string } }).report.id;
  };

  const reportId = await fileReport('harassment');

  section('1. Platform authority is not project authority');
  const project = await post('/api/projects', gc.token, {
    name: 'אתר המודרציה',
    startDate: iso(0),
    targetEndDate: iso(120),
    overrunAllowanceDays: 30,
    projectType: 'building',
    size: 'בניין 3 קומות',
  });
  check(project.status === 201, 'the GC creates a project and holds Full Project Authority', project.status);

  const projectId = (project.body as { project: { id: string } }).project.id;
  const grant = await ProjectMembershipModel.findOne({
    project: new Types.ObjectId(projectId),
    user: gc.userId,
  })
    .lean()
    .exec();
  check(grant?.fullAuthority === true, 'the grant really carries full authority', grant?.fullAuthority);

  const gcQueue = await get('/api/moderation/reports', gc.token);
  check(gcQueue.status === 404, 'Full Project Authority cannot reach the moderation queue', gcQueue.status);

  const gcDetail = await get(`/api/moderation/reports/${reportId}`, gc.token);
  check(gcDetail.status === 404, 'nor a report detail', gcDetail.status);

  const gcResolve = await post(`/api/moderation/reports/${reportId}/resolve`, gc.token, {
    outcome: 'dismissed',
  });
  check(gcResolve.status === 404, 'nor may it resolve one', gcResolve.status);

  section('2. An ordinary account is refused everywhere, as 404 rather than 403');
  for (const [label, token] of [
    ['the reporter', reporter.token],
    ['the reported user', subject.token],
  ] as const) {
    const listed = await get('/api/moderation/reports', token);
    check(listed.status === 404, `${label} cannot list reports`, listed.status);
    check(
      (listed.body as { code?: string }).code === 'NOT_FOUND',
      `${label} is told nothing about why`,
      listed.body,
    );
  }

  section('3. A moderator may list and read');
  const queue = await get('/api/moderation/reports?status=open', admin.token);
  check(queue.status === 200, 'the moderator lists the queue', queue.status);
  const rows = (queue.body as { reports: { id: string }[] }).reports;
  check(rows.some((row) => row.id === reportId), 'and the open report is in it', rows.length);

  const detail = await get(`/api/moderation/reports/${reportId}`, admin.token);
  check(detail.status === 200, 'the moderator reads the detail', detail.status);

  const report = (detail.body as { report: Record<string, unknown> }).report;
  check(report['note'] === 'ההסבר הפרטי של המדווח', 'the reporter explanation is visible to moderation', report['note']);
  check(
    (report['reporter'] as { name?: string }).name?.startsWith('Verify') === true,
    'the reporter is named to moderation',
    report['reporter'],
  );
  check(report['subjectReportCount'] === 1, 'the subject report count is a moderation signal', report['subjectReportCount']);
  check(Array.isArray(report['history']), 'the history travels with the detail');

  section('4. A subject id alone grants nothing');
  const bySubject = await get(`/api/moderation/reports/${subject.userId.toString()}`, admin.token);
  check(bySubject.status === 404, 'a user id is not a report id', bySubject.status);

  section('5. Claiming is single-use, so two moderators cannot both take one report');
  const claimed = await post(`/api/moderation/reports/${reportId}/claim`, admin.token);
  check(claimed.status === 200, 'the first moderator claims it', claimed.status);
  check(
    (claimed.body as { report: { status: string } }).report.status === 'under_review',
    'and it moves to under review',
    claimed.body,
  );

  const claimedAgain = await post(`/api/moderation/reports/${reportId}/claim`, secondAdmin.token);
  check(claimedAgain.status === 409, 'the second is refused rather than silently replacing the first', claimedAgain.status);

  section('6. Resolution applies once, and preserves everything');
  const resolved = await post(`/api/moderation/reports/${reportId}/resolve`, admin.token, {
    outcome: 'dismissed',
    note: 'הערה פנימית של הצוות',
  });
  check(resolved.status === 200, 'the moderator resolves it', resolved.status);
  check(
    (resolved.body as { report: { status: string } }).report.status === 'dismissed',
    'the outcome is recorded',
    resolved.body,
  );

  const stored = await ReportModel.findById(reportId).lean().exec();
  check(stored !== null, 'the report was not deleted to represent resolution');
  check(stored?.reason === 'harassment', 'its reason survives', stored?.reason);
  check(stored?.note === 'ההסבר הפרטי של המדווח', 'the reporter explanation survives', stored?.note);
  check(
    stored?.history.map((entry) => entry.action).join(',') ===
      'report.submitted,report.claimed,report.dismissed',
    'and the whole history is appended, never rewritten',
    stored?.history.map((entry) => entry.action),
  );

  section('7. A concurrent second resolution loses no history and is deterministic');
  const second = await post(`/api/moderation/reports/${reportId}/resolve`, secondAdmin.token, {
    outcome: 'actioned',
    note: 'a second verdict that must not land',
  });
  check(second.status === 409, 'the duplicate resolution is refused', second.status);

  const afterSecond = await ReportModel.findById(reportId).lean().exec();
  check(afterSecond?.status === 'dismissed', 'the first verdict still stands', afterSecond?.status);
  check(afterSecond?.history.length === 3, 'no history entry was lost or added', afterSecond?.history.length);
  check(
    afterSecond?.resolutionNote === 'הערה פנימית של הצוות',
    'and the first internal note was not overwritten',
    afterSecond?.resolutionNote,
  );

  section('8. Two moderators resolving at the same instant produce exactly one verdict');
  const raceId = await fileReport('spam');
  const [a, b] = await Promise.all([
    post(`/api/moderation/reports/${raceId}/resolve`, admin.token, { outcome: 'dismissed' }),
    post(`/api/moderation/reports/${raceId}/resolve`, secondAdmin.token, { outcome: 'actioned' }),
  ]);
  const statuses = [a.status, b.status].sort();
  check(
    JSON.stringify(statuses) === JSON.stringify([200, 409]),
    'exactly one wins and one is told the report moved',
    statuses,
  );

  const raced = await ReportModel.findById(raceId).lean().exec();
  const verdicts = raced?.history.filter((entry) => entry.action !== 'report.submitted') ?? [];
  check(verdicts.length === 1, 'and exactly one verdict is in the history', verdicts.length);

  section('9. A moderator cannot be impersonated through the payload');
  const impersonationId = await fileReport('impersonation');
  await post(`/api/moderation/reports/${impersonationId}/resolve`, admin.token, {
    outcome: 'dismissed',
    reviewedBy: secondAdmin.userId.toString(),
    actor: secondAdmin.userId.toString(),
  });
  const impersonated = await ReportModel.findById(impersonationId).lean().exec();
  check(
    impersonated?.reviewedBy?.equals(admin.userId) === true,
    'the moderator recorded is the one holding the session, not the one in the body',
    impersonated?.reviewedBy?.toString(),
  );

  section('10. Internal notes never appear in an ordinary DTO');
  const reporterProfile = await get(`/api/browse/contractors/${subject.userId.toString()}`, reporter.token);
  const subjectDashboard = await get('/api/dashboard', subject.token);
  const surfaces = JSON.stringify([reporterProfile.body, subjectDashboard.body]);
  check(!surfaces.includes('הערה פנימית'), 'the internal note is on no ordinary surface', surfaces.length);
  check(!surfaces.includes('ההסבר הפרטי'), 'nor is the reporter explanation');
  check(
    !surfaces.includes(reporter.userId.toString()),
    'and the reporter identity is nowhere near the reported user',
  );

  section('11. Restriction stops new work and leaves committed work alone');
  const restrictId = await fileReport('other');
  const restricted = await post(`/api/moderation/reports/${restrictId}/account-action`, admin.token, {
    action: 'restrict',
    reason: 'התנהגות חוזרת שהוכחה',
  });
  check(restricted.status === 200, 'the moderator restricts the account', restricted.status);

  const restrictedUser = await UserModel.findById(subject.userId).lean().exec();
  check(restrictedUser?.status === 'restricted', 'the account status is restricted', restrictedUser?.status);

  const reasonWritten = await ReportModel.findById(restrictId).lean().exec();
  check(
    reasonWritten?.history.some(
      (entry) => entry.action === 'account.restricted' && entry.note === 'התנהגות חוזרת שהוכחה',
    ) === true,
    'the required reason is written into the report history',
    reasonWritten?.history.map((entry) => entry.action),
  );

  const noReason = await post(`/api/moderation/reports/${restrictId}/account-action`, admin.token, {
    action: 'restrict',
  });
  check(noReason.status === 400, 'a restriction with no reason will not save', noReason.status);

  section('12. The restricted account still works, and still finishes what it committed to');
  const stillIn = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email: subject.email, password: 'CorrectHorse42!' },
  });
  check(stillIn.status === 200, 'it can still sign in — restriction is not a lockout', stillIn.status);
  const restrictedToken = (stillIn.body as { accessToken: string }).accessToken;

  const stillHasDashboard = await get('/api/dashboard', restrictedToken);
  check(stillHasDashboard.status === 200, 'its dashboard still loads', stillHasDashboard.status);

  const stillReadsTasks = await get('/api/tasks', restrictedToken);
  check(stillReadsTasks.status === 200, 'and its committed work is still readable', stillReadsTasks.status);

  section('13. But it starts nothing new');
  const newProject = await post('/api/projects', restrictedToken, {
    name: 'פרויקט חדש שאסור להיפתח',
    startDate: iso(0),
    targetEndDate: iso(60),
    overrunAllowanceDays: 10,
    projectType: 'building',
    size: 'בניין 2 קומות',
  });
  check(newProject.status === 403, 'a new project is refused', newProject.status);
  check(
    (newProject.body as { code?: string }).code === 'ACCOUNT_RESTRICTED',
    'with the restriction code',
    newProject.body,
  );

  const newConnection = await post(`/api/connections/${gc.userId.toString()}/request`, restrictedToken);
  check(newConnection.status === 403, 'a new connection request is refused', newConnection.status);

  const inbound = await post(`/api/connections/${subject.userId.toString()}/request`, gc.token);
  check(inbound.status === 404, 'and it has left discovery, so nobody can reach it either', inbound.status);

  const discovery = await get(`/api/browse/contractors/${subject.userId.toString()}`, gc.token);
  check(discovery.status === 404, 'its public profile is gone from discovery', discovery.status);

  section('14. Restriction is reversible, and never applied twice');
  const twice = await post(`/api/moderation/reports/${restrictId}/account-action`, admin.token, {
    action: 'restrict',
    reason: 'again',
  });
  check(twice.status === 409, 'restricting an already-restricted account is refused', twice.status);

  const lifted = await post(`/api/moderation/reports/${restrictId}/account-action`, admin.token, {
    action: 'unrestrict',
    reason: 'הוסר לאחר בדיקה',
  });
  check(lifted.status === 200, 'the restriction is lifted', lifted.status);
  const liftedUser = await UserModel.findById(subject.userId).lean().exec();
  check(liftedUser?.status === 'active', 'and the account is active again', liftedUser?.status);

  section('15. A moderator may not restrict themselves or another moderator');
  const selfId = await (async () => {
    const filed = await post(`/api/reports/users/${admin.userId.toString()}`, reporter.token, {
      reason: 'spam',
    });
    return (filed.body as { report: { id: string } }).report.id;
  })();
  const selfAction = await post(`/api/moderation/reports/${selfId}/account-action`, admin.token, {
    action: 'restrict',
    reason: 'attempting to act on my own account',
  });
  check(selfAction.status === 409, 'a moderator cannot restrict their own account', selfAction.status);

  const peerAction = await post(`/api/moderation/reports/${selfId}/account-action`, secondAdmin.token, {
    action: 'restrict',
    reason: 'attempting to act on a colleague',
  });
  check(peerAction.status === 409, 'nor another platform moderator', peerAction.status);

  section('16. D8: the report survives anonymisation and holds no forever-copy of a name');
  const beforeAnon = await get(`/api/moderation/reports/${restrictId}`, admin.token);
  const namedBefore = (beforeAnon.body as { report: { subject: { name: string | null } } }).report.subject.name;
  check(typeof namedBefore === 'string', 'the subject renders with a name while the account is live', namedBefore);

  const anonRow = await ReportModel.findById(restrictId).lean().exec();
  const anonText = JSON.stringify(anonRow);
  check(
    !anonText.includes('Verify') && !anonText.includes('@example.com'),
    'the stored report holds no copied name or email at all',
    anonText.slice(0, 240),
  );

  // What D8 will do at the end of the 60 days: neutralise the identity, keep the history.
  await UserModel.updateOne(
    { _id: subject.userId },
    { $set: { firstName: 'משתמש', lastName: 'שנמחק', email: `deleted.${subject.userId.toString()}@example.invalid` } },
  ).exec();

  const afterAnon = await get(`/api/moderation/reports/${restrictId}`, admin.token);
  check(afterAnon.status === 200, 'the report is still readable after the identity is neutralised', afterAnon.status);
  const anonReport = (afterAnon.body as { report: { subject: { name: string }; history: unknown[]; reason: string } }).report;
  check(anonReport.subject.name === 'משתמש שנמחק', 'and it renders the neutral identity with no backfill', anonReport.subject.name);
  check(anonReport.reason === 'other', 'the moderation reason survives', anonReport.reason);
  check(anonReport.history.length >= 3, 'and so does the moderation history', anonReport.history.length);

  section('17. D8: a reporter deletion clears the free text and keeps the record');
  const { reportRepository } = await import('../src/features/reports/report.repository.js');
  const redacted = await reportRepository.redactNotesByReporter(reporter.userId);
  check(redacted > 0, 'the reporter notes are redacted in bulk', redacted);

  const afterRedaction = await get(`/api/moderation/reports/${restrictId}`, admin.token);
  const redactedReport = (afterRedaction.body as {
    report: { note: string | null; noteRedacted: boolean; reason: string; history: unknown[] };
  }).report;
  check(redactedReport.note === null, 'the personal free text is gone', redactedReport.note);
  check(redactedReport.noteRedacted === true, 'and the redaction is declared rather than hidden', redactedReport.noteRedacted);
  check(redactedReport.reason === 'other', 'while the moderation reason remains', redactedReport.reason);
  check(redactedReport.history.length >= 3, 'and the history remains', redactedReport.history.length);

  await ReportModel.deleteMany({}).exec();
  await ProjectMembershipModel.deleteMany({ project: new Types.ObjectId(projectId) }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

void run();
