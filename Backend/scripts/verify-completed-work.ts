/**
 * Proves the Completed Work rules over real HTTP.
 *
 * The rules under test: an entry belongs to the person who created it and nobody else can read or
 * delete it, the `Completed on Blokta` badge is server-derived and cannot be claimed by a
 * client, and a link to work the server cannot verify is refused rather than silently dropped.
 *
 *   npm run verify:completed-work
 */
import { Types } from 'mongoose';

import { WorkEntryModel } from '../src/features/workentries/workEntry.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'work-verify';

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);

  section('POST /api/users/me/work-entries');
  const created = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: alice.token,
    json: {
      title: 'מגדל הראשונים',
      scope: 'קידוח יסודות',
      meta: '2025 · תל אביב',
      // A client asserting its own badge. The field is not in the contract at all.
      onFieldSync: true,
      verified: true,
    },
  });
  const entry = (created.body['entry'] ?? {}) as Record<string, unknown>;

  check(created.status === 201, 'creates an entry', created.status);
  check(entry['title'] === 'מגדל הראשונים', 'stores the title', entry['title']);
  check(entry['onFieldSync'] === false, 'refuses a client-claimed badge', entry['onFieldSync']);

  const stored = await WorkEntryModel.findById(String(entry['id'])).lean().exec();
  check(stored?.fieldSyncVerifiedAt === undefined, 'stored no verification the server did not derive');
  check(String(stored?.owner) === String(alice.userId), 'owns the entry to the authenticated caller');

  section('Validation');
  const noTitle = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: alice.token,
    json: { meta: '2025' },
  });
  check(noTitle.status === 400, 'refuses an entry with no title', noTitle.status);

  const unverifiableLink = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: alice.token,
    json: { title: 'Linked', meta: '2025', projectId: new Types.ObjectId().toString() },
  });
  check(unverifiableLink.status === 422, 'refuses a link it cannot verify', unverifiableLink.status);
  check(
    unverifiableLink.body['code'] === 'WORK_LINK_NOT_VERIFIABLE',
    'answers with the documented code',
    unverifiableLink.body,
  );

  section('GET /api/users/me — the list');
  const mine = await request(baseUrl, 'GET', '/api/users/me', { token: alice.token });
  const work = ((mine.body['user'] as Record<string, unknown>)['work'] ?? []) as unknown[];
  check(work.length === 1, 'lists exactly the entries this caller created', work.length);

  const bobsView = await request(baseUrl, 'GET', '/api/users/me', { token: bob.token });
  const bobsWork = ((bobsView.body['user'] as Record<string, unknown>)['work'] ?? []) as unknown[];
  check(bobsWork.length === 0, "never shows another person's entries", bobsWork.length);

  section('DELETE /api/users/me/work-entries/:id');
  const foreign = await request(baseUrl, 'DELETE', `/api/users/me/work-entries/${String(entry['id'])}`, {
    token: bob.token,
  });
  check(foreign.status === 404, "refuses to delete another person's entry", foreign.status);
  check(
    (await WorkEntryModel.countDocuments({ owner: alice.userId }).exec()) === 1,
    'left the entry in place after the refused delete',
  );

  const badId = await request(baseUrl, 'DELETE', '/api/users/me/work-entries/not-an-id', {
    token: alice.token,
  });
  check(badId.status === 400, 'refuses a malformed id', badId.status);

  const removed = await request(baseUrl, 'DELETE', `/api/users/me/work-entries/${String(entry['id'])}`, {
    token: alice.token,
  });
  check(removed.status === 204, 'deletes the caller’s own entry', removed.status);
  check(
    (await WorkEntryModel.countDocuments({ owner: alice.userId }).exec()) === 0,
    'removed the row',
  );

  const twice = await request(baseUrl, 'DELETE', `/api/users/me/work-entries/${String(entry['id'])}`, {
    token: alice.token,
  });
  check(twice.status === 404, 'reports a second delete as not found', twice.status);

  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
