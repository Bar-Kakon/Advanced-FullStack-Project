/**
 * User report submission, end to end, against the real server.
 *
 * What it proves: a legitimate report is accepted and stored; self-reporting and unknown subjects
 * are refused; a reporter cannot write any moderation field; the duplicate rule is deterministic;
 * and nothing about a report leaks through an ordinary endpoint to anyone.
 */
import { ReportModel } from '../src/features/reports/report.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

// Deliberately free of the word "report": several checks below assert that the word appears
// nowhere in a response, and a marker carrying it would sit in every harness email and company
// name and pass those checks for the wrong reason.
const MARKER = 'verify-flagging';

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });

  const reporter = await createAccount(baseUrl, MARKER, 1);
  const subject = await createAccount(baseUrl, MARKER, 2);
  const other = await createAccount(baseUrl, MARKER, 3);

  await ReportModel.deleteMany({ reporter: { $in: [reporter.userId, subject.userId, other.userId] } }).exec();
  // The duplicate rule is a partial unique index, so it has to exist before the first write races it.
  await ReportModel.syncIndexes();

  section('1. An authenticated user may report another legitimate user');
  const filed = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'harassment',
    note: 'הודעות חוזרות ונשנות באתר',
    source: 'public_profile',
  });
  check(filed.status === 201, 'the report is accepted', filed.status);

  const receipt = (filed.body as { report?: { id?: string; createdAt?: string } }).report;
  check(typeof receipt?.id === 'string', 'a receipt with an id comes back', JSON.stringify(filed.body));

  section('2. The receipt is an acknowledgement, not a window into review');
  const receiptKeys = Object.keys(receipt ?? {}).sort();
  check(
    JSON.stringify(receiptKeys) === JSON.stringify(['createdAt', 'id']),
    'it carries the id and the time and nothing else',
    receiptKeys,
  );
  check(
    !JSON.stringify(filed.body).includes('harassment'),
    'the reason is not echoed back to the reporter',
    JSON.stringify(filed.body),
  );

  section('3. The report really persists, with the reporter and subject it named');
  const stored = await ReportModel.findById(receipt?.id).lean().exec();
  check(stored !== null, 'the row exists');
  check(stored?.reporter.equals(reporter.userId) === true, 'the reporter is the caller');
  check(stored?.subject?.id.equals(subject.userId) === true, 'the subject is who was named');
  check(stored?.subject?.type === 'user', 'the subject type is user', stored?.subject?.type);
  check(stored?.reason === 'harassment', 'the reason is stored', stored?.reason);
  check(stored?.status === 'open', 'it opens in the open state', stored?.status);
  check(stored?.history.length === 1, 'one history entry is written at submission', stored?.history.length);
  check(
    stored?.history[0]?.action === 'report.submitted',
    'and it records the submission',
    stored?.history[0]?.action,
  );

  section('4. Self-reporting is refused');
  const self = await post(`/api/reports/users/${reporter.userId.toString()}`, reporter.token, {
    reason: 'spam',
  });
  check(self.status === 400, 'reporting yourself is a 400', self.status);
  check(
    (self.body as { code?: string }).code === 'CANNOT_REPORT_SELF',
    'with the self-report code',
    self.body,
  );

  section('5. A malformed or unknown subject is refused, and neither confirms the other');
  const malformed = await post('/api/reports/users/not-an-object-id', reporter.token, { reason: 'spam' });
  check(malformed.status === 400, 'a malformed subject id fails validation', malformed.status);

  const missing = await post('/api/reports/users/64b7f3d2f1a2c3d4e5f60718', reporter.token, {
    reason: 'spam',
  });
  check(missing.status === 404, 'an unknown subject is a 404', missing.status);

  section('6. A reporter cannot set moderation status or internal notes');
  const crafted = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'spam',
    status: 'actioned',
    resolutionNote: 'planted by the reporter',
    reviewedBy: reporter.userId.toString(),
    history: [{ action: 'report.actioned', actor: reporter.userId.toString() }],
  });
  check(crafted.status === 201, 'the crafted body is accepted after the unknown keys are stripped', crafted.status);

  const craftedRow = await ReportModel.findById(
    (crafted.body as { report: { id: string } }).report.id,
  )
    .lean()
    .exec();
  check(craftedRow?.status === 'open', 'the status is open, not the one that was sent', craftedRow?.status);
  check(craftedRow?.resolutionNote === undefined, 'no resolution note was planted', craftedRow?.resolutionNote);
  check(craftedRow?.reviewedBy === undefined, 'no reviewer was planted', craftedRow?.reviewedBy);
  check(
    craftedRow?.history.length === 1 && craftedRow.history[0]?.action === 'report.submitted',
    'the history holds only the submission the server wrote',
    craftedRow?.history.map((entry) => entry.action),
  );

  section('7. Duplicate submission is deterministic');
  const duplicate = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'harassment',
  });
  check(duplicate.status === 409, 'the same reporter, subject and reason again is a 409', duplicate.status);
  check(
    (duplicate.body as { code?: string }).code === 'DUPLICATE_OPEN_REPORT',
    'with the duplicate code',
    duplicate.body,
  );

  const differentReason = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'impersonation',
  });
  check(differentReason.status === 201, 'a different reason is a different report', differentReason.status);

  const differentReporter = await post(`/api/reports/users/${subject.userId.toString()}`, other.token, {
    reason: 'harassment',
  });
  check(differentReporter.status === 201, 'another reporter is never blocked by the first', differentReporter.status);

  section('8. Resolving frees the slot, so a reporter is not silenced forever');
  await ReportModel.updateOne(
    { _id: receipt?.id },
    { $set: { status: 'dismissed', resolvedAt: new Date() }, $unset: { open: '' } },
  ).exec();
  const afterResolution = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'harassment',
  });
  check(afterResolution.status === 201, 'the same report may be filed again once the first closed', afterResolution.status);

  section('9. Reporting is not blocking, and blocking is not reporting');
  const blocked = await request(baseUrl, 'PUT', `/api/blocks/${subject.userId.toString()}`, {
    token: other.token,
  });
  check(blocked.status === 201, 'a block is created', blocked.status);
  const reportsFromBlock = await ReportModel.countDocuments({
    reporter: other.userId,
    'subject.id': subject.userId,
  }).exec();
  check(reportsFromBlock === 1, 'blocking created no second report', reportsFromBlock);

  const myBlocks = await get('/api/blocks', reporter.token);
  const blockList = (myBlocks.body as { blocks: unknown[] }).blocks;
  check(blockList.length === 0, 'and reporting created no block', blockList);

  section('10. Nothing about a report reaches an ordinary endpoint');
  // Viewed by the reporter, who blocked nobody: `other` has just blocked the subject and would be
  // refused the profile for that reason, which would prove nothing about reporting.
  const profile = await get(`/api/browse/contractors/${subject.userId.toString()}`, reporter.token);
  const profileText = JSON.stringify(profile.body);
  check(profile.status === 200, 'the public profile still loads', profile.status);
  check(!/report/i.test(profileText), 'it names no report anywhere', profileText.slice(0, 200));
  check(
    !/reportCount|reportedBy|reports/i.test(profileText),
    'and exposes no aggregate report count',
    profileText.slice(0, 200),
  );

  section('11. The reported user learns nothing through their own surfaces');
  const subjectDashboard = await get('/api/dashboard', subject.token);
  check(subjectDashboard.status === 200, 'the reported user still has a dashboard', subjectDashboard.status);
  check(
    !/report/i.test(JSON.stringify(subjectDashboard.body)),
    'and it says nothing about being reported',
  );

  const subjectSelf = await get('/api/auth/me', subject.token);
  check(
    !/report/i.test(JSON.stringify(subjectSelf.body)),
    'nor does their own session read',
  );

  section('12. The moderation API is unreachable for an ordinary account');
  const queue = await get('/api/moderation/reports', reporter.token);
  check(queue.status === 404, 'the reporter cannot list reports', queue.status);

  const detail = await get(`/api/moderation/reports/${receipt?.id}`, subject.token);
  check(detail.status === 404, 'the reported user cannot read the report about them', detail.status);

  await ReportModel.deleteMany({
    reporter: { $in: [reporter.userId, subject.userId, other.userId] },
  }).exec();
  await UserModel.updateMany({ _id: subject.userId }, { $set: { status: 'active' } }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

void run();
