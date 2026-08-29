/**
 * Browse discovery and the embedded Public Profile, against the running server and real database.
 *
 * Needs a FRESHLY STARTED server. Google is NOT called: no test here applies a driving-distance
 * filter, so the routing adapter is never reached. `verify:google-adapters` covers that boundary.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { BlockModel } from '../src/features/blocks/block.model.js';
import { ConnectionModel } from '../src/features/connections/connection.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { UserModel } from '../src/features/users/user.model.js';

const API = 'http://localhost:3000/api';
const MARKER = 'browse-verify';
const PASSWORD = 'CorrectHorse42!';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(66)} ${detail}`);
};

interface Reply { readonly status: number; readonly body: Record<string, any> }

const send = async (method: string, path: string, payload?: unknown, token?: string): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const reply = { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, any> };
  if (reply.status === 429) throw new Error(`Rate limited on ${path}. Restart the API and retry.`);
  return reply;
};

interface Account { readonly token: string; readonly id: string; readonly company: string }

const makeAccount = async (
  first: string, last: string, company: string,
  extra: Record<string, unknown> = {},
): Promise<Account> => {
  const email = `${MARKER}-${first}-${last}@example.com`.toLowerCase();
  const registered = await send('POST', '/auth/register', {
    firstName: first, lastName: last, standing: 'owner', companyName: company,
    email, password: PASSWORD, confirmPassword: PASSWORD,
    specialty: 'electrical', city: 'חיפה', region: 'haifa',
    availability: 'open', acceptedTerms: true, ...extra,
  });
  if (registered.status !== 201) throw new Error(`register ${first}: ${JSON.stringify(registered.body)}`);

  const signedIn = await send('POST', '/auth/login', { email, password: PASSWORD });
  return { token: signedIn.body['accessToken'], id: signedIn.body['user'].id, company };
};

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  const companies = await CompanyModel.find({ name: { $regex: `^${MARKER}` } }).distinct('_id');
  await BlockModel.deleteMany({ $or: [{ blockerUserId: { $in: users } }, { blockedUserId: { $in: users } }] });
  await ConnectionModel.deleteMany({ $or: [{ requester: { $in: users } }, { recipient: { $in: users } }] });
  await CompanyMembershipModel.deleteMany({ $or: [{ user: { $in: users } }, { company: { $in: companies } }] });
  await CompanyModel.deleteMany({ name: { $regex: `^${MARKER}` } });
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } });
};

const ids = (reply: Reply): string[] => (reply.body['contractors'] ?? []).map((c: any) => c.userId);

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await wipe();

  const viewer = await makeAccount('Vera', 'Viewer', `${MARKER} Viewer Ltd`);
  const alpha = await makeAccount('Avi', 'Alpha', `${MARKER} Alpha Electrical Ltd`);
  const beta = await makeAccount('Bar', 'Beta', `${MARKER} Beta Plumbing Ltd`,
    { specialty: 'plumbing', region: 'center', city: 'תל אביב', availability: 'limited' });
  const gamma = await makeAccount('גיא', 'גמא', `${MARKER} גמא בנייה בעמ`,
    { specialty: 'concrete', region: 'nationwide', availability: 'closed' });

  console.log('\n1. Discovery basics');
  const all = await send('GET', '/browse/contractors?limit=48', undefined, viewer.token);
  check('an authenticated viewer gets a page', all.status === 200, String(all.status));
  check('the three other seeded contractors are discoverable',
    [alpha.id, beta.id, gamma.id].every((id) => ids(all).includes(id)),
    `${ids(all).length} rows`);
  // Browse is where a person finds somebody else, so the viewer is never one of its answers.
  check('and the viewer is not among their own results', !ids(all).includes(viewer.id));
  check('an unauthenticated call is refused', (await send('GET', '/browse/contractors')).status === 401);

  console.log('\n2. No private field reaches a Browse card');
  const card = all.body['contractors'].find((c: any) => c.userId === alpha.id);
  const cardKeys = Object.keys(card);
  check('no email on a card', !cardKeys.includes('email'));
  check('no passwordHash, security or terms on a card',
    !cardKeys.some((k) => ['passwordHash', 'security', 'termsAcceptances', 'status'].includes(k)));
  check('no phone of any kind on a card',
    !cardKeys.some((k) => k.toLowerCase().includes('phone')), cardKeys.join(','));
  check('flexibility is null, never an invented number', card.flexibility === null);
  check('rating is null with no history, never zero', card.rating === null);

  console.log('\n3. Search — person and company, Hebrew and English');
  check('search by first name', ids(await send('GET', '/browse/contractors?q=Avi', undefined, viewer.token)).includes(alpha.id));
  check('search by last name', ids(await send('GET', '/browse/contractors?q=Beta', undefined, viewer.token)).includes(beta.id));
  check('search by full name',
    ids(await send('GET', '/browse/contractors?q=Avi%20Alpha', undefined, viewer.token)).includes(alpha.id));
  const byCompany = await send('GET', '/browse/contractors?q=Beta%20Plumbing', undefined, viewer.token);
  check('search by COMPANY name', ids(byCompany).includes(beta.id), `${ids(byCompany).length} rows`);
  const hebrew = await send('GET', `/browse/contractors?q=${encodeURIComponent('גמא')}`, undefined, viewer.token);
  check('Hebrew search matches a Hebrew name/company', ids(hebrew).includes(gamma.id), `${ids(hebrew).length} rows`);
  const noMatch = await send('GET', '/browse/contractors?q=zzzznotarealname', undefined, viewer.token);
  check('a search with no match is an empty page, not an error',
    noMatch.status === 200 && ids(noMatch).length === 0);
  const regexish = await send('GET', '/browse/contractors?q=' + encodeURIComponent('.*'), undefined, viewer.token);
  check('regex characters are escaped, not executed as a pattern', ids(regexish).length === 0,
    `${ids(regexish).length} rows`);

  console.log('\n4. Filters');
  const plumbing = await send('GET', '/browse/contractors?specialty=plumbing', undefined, viewer.token);
  check('specialty filter narrows to the right contractor',
    ids(plumbing).includes(beta.id) && !ids(plumbing).includes(alpha.id));
  const center = await send('GET', '/browse/contractors?region=center', undefined, viewer.token);
  check('region filter includes that region', ids(center).includes(beta.id));
  check('and a nationwide contractor answers a regional filter too', ids(center).includes(gamma.id));
  check('but a contractor of another region does not', !ids(center).includes(alpha.id));
  const nationwide = await send('GET', '/browse/contractors?region=nationwide', undefined, viewer.token);
  check('asking for nationwide returns only nationwide',
    ids(nationwide).includes(gamma.id) && !ids(nationwide).includes(beta.id));
  const limited = await send('GET', '/browse/contractors?availability=limited', undefined, viewer.token);
  check('availability filter works', ids(limited).includes(beta.id) && !ids(limited).includes(alpha.id));
  const combined = await send('GET', '/browse/contractors?specialty=plumbing&region=center&availability=limited',
    undefined, viewer.token);
  check('several filters combine', ids(combined).length === 1 && ids(combined)[0] === beta.id,
    `${ids(combined).length} rows`);
  const badSpecialty = await send('GET', '/browse/contractors?specialty=notatrade', undefined, viewer.token);
  check('an unknown specialty code is refused by validation', badSpecialty.status === 400, String(badSpecialty.status));

  console.log('\n5. Cursor pagination');
  const first = await send('GET', '/browse/contractors?limit=2', undefined, viewer.token);
  check('a first page honours the limit', ids(first).length === 2, `${ids(first).length}`);
  check('and offers a cursor', typeof first.body['nextCursor'] === 'string');
  const second = await send('GET',
    `/browse/contractors?limit=2&cursor=${encodeURIComponent(first.body['nextCursor'])}`, undefined, viewer.token);
  check('the second page returns different rows',
    !ids(second).some((id) => ids(first).includes(id)), `${ids(first)} then ${ids(second)}`);
  check('the two pages together cover the three other seeded accounts',
    [alpha.id, beta.id, gamma.id].every((id) => [...ids(first), ...ids(second)].includes(id)),
    `${[...ids(first), ...ids(second)].length} rows`);
  const seen: string[] = [];
  let cursor: string | null = first.body['nextCursor'];
  let pages = 1;
  seen.push(...ids(first));
  while (cursor && pages < 50) {
    const next: Reply = await send('GET',
      `/browse/contractors?limit=2&cursor=${encodeURIComponent(cursor)}`, undefined, viewer.token);
    seen.push(...ids(next));
    cursor = next.body['nextCursor'];
    pages += 1;
  }
  check('paging to the end terminates with nextCursor null', cursor === null, `${pages} pages`);
  check('and never returns the same contractor twice', new Set(seen).size === seen.length,
    `${seen.length} rows, ${new Set(seen).size} unique`);
  check('every other seeded contractor appeared exactly once across the pages',
    [alpha.id, beta.id, gamma.id].every((id) => seen.filter((s) => s === id).length === 1));
  check('and the viewer appeared on no page at all',
    !seen.includes(viewer.id), `${seen.length} rows walked`);
  const emptyCursor = await send('GET', '/browse/contractors?limit=2&cursor=', undefined, viewer.token);
  check('an empty cursor is refused by validation rather than guessed at',
    emptyCursor.status === 400, String(emptyCursor.status));
  const malformed = await send('GET', '/browse/contractors?cursor=not-a-real-cursor', undefined, viewer.token);
  check('a malformed cursor starts from the beginning rather than throwing',
    malformed.status === 200 && ids(malformed).length > 0, String(malformed.status));

  console.log('\n6. Relationship projection — all four states');
  const none = await send('GET', `/browse/contractors?q=Avi`, undefined, viewer.token);
  check('no relationship reads as none',
    none.body['contractors'].find((c: any) => c.userId === alpha.id)?.relationship === 'none');

  await send('POST', `/connections/${alpha.id}/request`, undefined, viewer.token);
  const outgoing = await send('GET', '/browse/contractors?q=Avi', undefined, viewer.token);
  check('a request the viewer sent reads as outgoing_request',
    outgoing.body['contractors'].find((c: any) => c.userId === alpha.id)?.relationship === 'outgoing_request');
  const incoming = await send('GET', '/browse/contractors?q=Vera', undefined, alpha.token);
  check('the same edge reads as incoming_request from the other side',
    incoming.body['contractors'].find((c: any) => c.userId === viewer.id)?.relationship === 'incoming_request');

  await send('POST', `/connections/${viewer.id}/accept`, undefined, alpha.token);
  const connected = await send('GET', '/browse/contractors?q=Avi', undefined, viewer.token);
  check('once accepted both sides read as connected',
    connected.body['contractors'].find((c: any) => c.userId === alpha.id)?.relationship === 'connected');

  await send('POST', `/connections/${alpha.id}/remove`, undefined, viewer.token);
  const afterRemove = await send('GET', '/browse/contractors?q=Avi', undefined, viewer.token);
  check('a removed connection reads as none, not a fifth state',
    afterRemove.body['contractors'].find((c: any) => c.userId === alpha.id)?.relationship === 'none');

  console.log('\n7. Block exclusion is enforced by the SERVER');
  await send('PUT', `/blocks/${beta.id}`, undefined, viewer.token);
  const afterBlock = await send('GET', '/browse/contractors?limit=48', undefined, viewer.token);
  check('the blocked contractor is absent from the blocker page', !ids(afterBlock).includes(beta.id));
  const fromBlocked = await send('GET', '/browse/contractors?limit=48', undefined, beta.token);
  check('and the blocker is absent from the blocked person page', !ids(fromBlocked).includes(viewer.id));
  check('an unrelated contractor is still discoverable by both',
    ids(afterBlock).includes(gamma.id) && ids(fromBlocked).includes(gamma.id));
  const targeted = await send('GET', '/browse/contractors?q=Beta', undefined, viewer.token);
  check('a direct search cannot rediscover them', !ids(targeted).includes(beta.id), `${ids(targeted).length} rows`);
  const blockedProfile = await send('GET', `/browse/contractors/${beta.id}`, undefined, viewer.token);
  check('and their Public Profile answers 404 rather than rendering',
    blockedProfile.status === 404, String(blockedProfile.status));

  await send('DELETE', `/blocks/${beta.id}`, undefined, viewer.token);
  const afterUnblock = await send('GET', '/browse/contractors?limit=48', undefined, viewer.token);
  check('unblocking restores discovery', ids(afterUnblock).includes(beta.id));

  console.log('\n8. Public Profile');
  const profileReply = await send('GET', `/browse/contractors/${alpha.id}`, undefined, viewer.token);
  const profile = profileReply.body['profile'];
  check('a profile is returned', profileReply.status === 200 && profile.userId === alpha.id);
  check('it carries the public identity', profile.firstName === 'Avi' && profile.companyName === alpha.company);
  check('it carries the relationship', typeof profile.relationship === 'string');
  const profileKeys = Object.keys(profile);
  check('no email, hash, security or terms leak',
    !profileKeys.some((k) => ['email', 'passwordHash', 'security', 'termsAcceptances'].includes(k)),
    profileKeys.join(','));
  check('no permissions or membership internals leak',
    !profileKeys.some((k) => ['permissions', 'membership', 'standing'].includes(k)));

  console.log('\n9. D15 phone visibility');
  check('an ordinary viewer receives no office phone', profile.phones.officePhone === null);
  check('and no business phone', profile.phones.businessPhone === null);
  check('the reason is stated rather than left blank',
    profile.phones.visibility === 'hidden_no_approved_case', profile.phones.visibility);
  check('the personal/login phone is not even a field in the shape',
    !Object.keys(profile.phones).includes('phone'));
  const ownProfile = await send('GET', `/browse/contractors/${viewer.id}`, undefined, viewer.token);
  check('viewing your own profile is marked isSelf', ownProfile.body['profile'].isSelf === true);
  check('and your own numbers are visible to you',
    ownProfile.body['profile'].phones.visibility === 'self');

  console.log('\n10. Rating eligibility is backend-decided');
  check('Public Profile does not claim a viewer may rate', profile.rateable.canRate === false);
  check('and states why', profile.rateable.reason === 'no_shared_completed_task', profile.rateable.reason);
  check('your own profile reports self, not eligibility',
    ownProfile.body['profile'].rateable.reason === 'self');

  console.log('\n11. Bad input');
  check('a malformed contractor id is refused',
    (await send('GET', '/browse/contractors/not-an-id', undefined, viewer.token)).status === 400);
  check('an unknown contractor answers 404',
    (await send('GET', '/browse/contractors/000000000000000000000009', undefined, viewer.token)).status === 404);
  const halfFilter = await send('GET', '/browse/contractors?maxDrivingKm=50', undefined, viewer.token);
  check('a driving-distance filter without an origin is refused', halfFilter.status === 400,
    String(halfFilter.status));
  const overLimit = await send('GET', '/browse/contractors?limit=999', undefined, viewer.token);
  check('an oversized limit is refused', overLimit.status === 400, String(overLimit.status));

  await wipe();
  await disconnectFromDatabase();

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(2);
});