/**
 * The PLATFORM audit trail and recoverable account deletion, against the real server.
 *
 * What it proves: administrative actions are recorded on their own append-only trail rather than
 * on the project one; the read surface is admin-only, newest-first, paginated and filterable;
 * account deletion is a recoverable state that erases nothing and blocks access; and restoration
 * is an explicit admin action that is itself audited.
 */
import { Types } from 'mongoose';

import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { PlatformAuditEntryModel } from '../src/features/moderation/platformAuditEntry.model.js';
import { ReportModel } from '../src/features/reports/report.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-platform-audit';

interface AuditPage {
  readonly rows: readonly {
    id: string;
    action: string;
    actor: { userId: string; name: string | null };
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
    at: string;
  }[];
  readonly nextCursor: string | null;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const del = (path: string, token: string) => request(baseUrl, 'DELETE', path, { token });

  const admin = await createAccount(baseUrl, MARKER, 1);
  const ordinary = await createAccount(baseUrl, MARKER, 2);
  const reporter = await createAccount(baseUrl, MARKER, 3);
  const subject = await createAccount(baseUrl, MARKER, 4);
  const doomed = await createAccount(baseUrl, MARKER, 5);

  await ReportModel.deleteMany({}).exec();
  await PlatformAuditEntryModel.deleteMany({}).exec();
  await UserModel.updateOne({ _id: admin.userId }, { $set: { isAdmin: true } }).exec();

  const projectAuditBefore = await AuditEntryModel.countDocuments({}).exec();

  section('1. The read surface is admin-only');
  const refused = await get('/api/moderation/audit', ordinary.token);
  check(refused.status === 404, 'an ordinary account is refused the audit log', refused.status);

  const anonymous = await request(baseUrl, 'GET', '/api/moderation/audit', {});
  check(anonymous.status === 401, 'no session is refused before authority is even asked', anonymous.status);

  const refusedRestore = await post(
    `/api/moderation/accounts/${doomed.userId.toString()}/restore`,
    ordinary.token,
    { reason: 'nope' },
  );
  check(refusedRestore.status === 404, 'an ordinary account cannot restore an account', refusedRestore.status);

  const allowed = await get('/api/moderation/audit', admin.token);
  check(allowed.status === 200, 'the admin reads it', allowed.status);
  check((allowed.body as unknown as AuditPage).rows.length === 0, 'and it starts empty', (allowed.body as unknown as AuditPage).rows.length);

  section('2. Real moderation actions are recorded');
  const filed = await post(`/api/reports/users/${subject.userId.toString()}`, reporter.token, {
    reason: 'harassment',
    note: 'ההסבר הפרטי של המדווח',
    source: 'public_profile',
  });
  check(filed.status === 201, 'a report is filed', filed.status);
  const reportId = (filed.body as { report: { id: string } }).report.id;

  const claimed = await post(`/api/moderation/reports/${reportId}/claim`, admin.token);
  check(claimed.status === 200, 'the admin claims it', claimed.status);

  const restricted = await post(
    `/api/moderation/reports/${reportId}/account-action`,
    admin.token,
    { action: 'restrict', reason: 'repeated harassment' },
  );
  check(restricted.status === 200, 'and restricts the account', restricted.status);

  const resolved = await post(`/api/moderation/reports/${reportId}/resolve`, admin.token, {
    outcome: 'actioned',
    note: 'restricted',
  });
  check(resolved.status === 200, 'and actions the report', resolved.status);

  const page = (await get('/api/moderation/audit', admin.token)).body as unknown as AuditPage;
  const actions = page.rows.map((row) => row.action);
  check(actions.length === 3, 'three administrative actions are on the trail', actions.join(' '));
  check(
    actions[0] === 'report.actioned' && actions[1] === 'account.restricted' && actions[2] === 'report.claimed',
    'newest first',
    actions.join(' '),
  );
  check(
    page.rows.every((row) => row.actor.userId === admin.userId.toString()),
    'each names the admin who acted',
  );
  check(
    page.rows.every((row) => row.actor.name !== null),
    'and resolves their display name',
  );

  section('3. The project trail is not touched');
  const projectAuditAfter = await AuditEntryModel.countDocuments({}).exec();
  check(
    projectAuditAfter === projectAuditBefore,
    'auditEntries gained no rows from administrative actions',
    `${projectAuditBefore} -> ${projectAuditAfter}`,
  );

  section('4. Nothing private reaches the trail');
  const stored = await PlatformAuditEntryModel.find({}).lean().exec();
  const serialised = JSON.stringify(stored);
  check(!serialised.includes('ההסבר הפרטי של המדווח'), "the reporter's note is not copied onto the trail");
  check(!serialised.includes(reporter.email), "the reporter's email is absent");
  check(!/passwordHash|accessToken|refreshToken|secret/i.test(serialised), 'no credential-shaped key appears');

  section('5. Filtering and pagination');
  const filtered = (await get('/api/moderation/audit?action=account.restricted', admin.token))
    .body as unknown as AuditPage;
  check(filtered.rows.length === 1, 'filtering by action narrows the page', filtered.rows.length);
  check(filtered.rows[0]?.action === 'account.restricted', 'and returns the asked-for action');

  const byTarget = (await get('/api/moderation/audit?targetType=user', admin.token)).body as unknown as AuditPage;
  check(byTarget.rows.every((row) => row.targetType === 'user'), 'filtering by target type narrows it too');

  const firstPage = (await get('/api/moderation/audit?limit=2', admin.token)).body as unknown as AuditPage;
  check(firstPage.rows.length === 2, 'a limit is honoured', firstPage.rows.length);
  check(firstPage.nextCursor !== null, 'and a full page offers a cursor');

  const secondPage = (await get(
    `/api/moderation/audit?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor as string)}`,
    admin.token,
  )).body as unknown as AuditPage;
  const seen = new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.id));
  check(seen.size === 3, 'walking the cursor yields every row exactly once', seen.size);
  check(secondPage.nextCursor === null, 'and the short last page offers none');

  const tampered = (await get('/api/moderation/audit?limit=2&cursor=nonsense', admin.token))
    .body as unknown as AuditPage;
  check(tampered.rows.length === 2, 'a tampered cursor restarts rather than throwing', tampered.rows.length);

  section('6. Account deletion is recoverable and destroys nothing');
  const doomedReport = await post(`/api/reports/users/${subject.userId.toString()}`, doomed.token, {
    reason: 'spam',
    source: 'public_profile',
  });
  check(doomedReport.status === 201, 'the account leaves a historical reference behind', doomedReport.status);

  const closed = await del('/api/users/me', doomed.token);
  check(closed.status === 204, 'the account closes itself', closed.status);

  const row = await UserModel.findById(doomed.userId).lean().exec();
  check(row !== null, 'the user record still exists');
  check(row?.status === 'deleted', 'and carries the deleted state', row?.status);
  check(row?.email === doomed.email, 'with its identity intact for a later restore');

  const survivingReport = await ReportModel.findOne({ reporter: doomed.userId }).lean().exec();
  check(survivingReport !== null, 'its report history was not cascade-deleted');

  section('7. A deleted account cannot get back in');
  const blocked = await get('/api/users/me', doomed.token);
  check(blocked.status === 401, 'its existing session is refused', blocked.status);

  const login = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email: doomed.email, password: 'CorrectHorse42!' },
  });
  check(login.status !== 200, 'and it cannot log in again', login.status);

  const twice = await del('/api/users/me', doomed.token);
  check(twice.status === 401, 'a second deletion cannot reach the route at all', twice.status);

  section('8. Restoration is an explicit, audited admin action');
  const restoredByOwner = await post(
    `/api/moderation/accounts/${doomed.userId.toString()}/restore`,
    ordinary.token,
    { reason: 'self service' },
  );
  check(restoredByOwner.status === 404, 'a non-admin cannot restore', restoredByOwner.status);

  const restored = await post(
    `/api/moderation/accounts/${doomed.userId.toString()}/restore`,
    admin.token,
    { reason: 'contacted support and proved identity' },
  );
  check(restored.status === 204, 'the admin restores it', restored.status);

  const back = await UserModel.findById(doomed.userId).lean().exec();
  check(back?.status === 'active', 'the account is active again', back?.status);

  const backIn = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email: doomed.email, password: 'CorrectHorse42!' },
  });
  check(backIn.status === 200, 'and can sign in', backIn.status);

  const afterRestore = (await get('/api/moderation/audit?targetType=user', admin.token))
    .body as unknown as AuditPage;
  const deletion = afterRestore.rows.find((r) => r.action === 'account.deleted');
  const restoration = afterRestore.rows.find((r) => r.action === 'account.restored');
  check(deletion !== undefined, 'the deletion is on the trail');
  check(restoration !== undefined, 'and so is the restoration');
  check(
    restoration?.actor.userId === admin.userId.toString(),
    'the restoration names the admin, not the account holder',
  );
  check(
    restoration?.metadata['reason'] === 'contacted support and proved identity',
    'and carries the stated reason',
  );

  const secondRestore = await post(
    `/api/moderation/accounts/${doomed.userId.toString()}/restore`,
    admin.token,
    { reason: 'again' },
  );
  check(secondRestore.status === 409, 'restoring an active account is refused', secondRestore.status);

  section('9. The trail is append-only');
  const before = await PlatformAuditEntryModel.countDocuments({}).exec();
  const patched = await request(baseUrl, 'PATCH', `/api/moderation/audit/${stored[0]?._id.toString()}`, {
    token: admin.token,
    json: { action: 'report.dismissed' },
  });
  check(patched.status === 404, 'there is no route that edits an entry', patched.status);
  const deleted = await request(baseUrl, 'DELETE', `/api/moderation/audit/${stored[0]?._id.toString()}`, {
    token: admin.token,
  });
  check(deleted.status === 404, 'and none that removes one', deleted.status);
  check(
    (await PlatformAuditEntryModel.countDocuments({}).exec()) === before,
    'the trail is unchanged',
  );

  await UserModel.updateOne({ _id: admin.userId }, { $set: { isAdmin: false } }).exec();
  await PlatformAuditEntryModel.deleteMany({}).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

void run();
