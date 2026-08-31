/**
 * Drives the real My Network endpoints over real HTTP against real accounts.
 *
 * The lifecycle rules are the point: D17 (a decline is historical, not permanent) and D19 (a block
 * is its own record, never a connection state, and never disclosed to the person blocked).
 */
import { BlockModel } from '../src/features/blocks/block.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ConnectionModel } from '../src/features/connections/connection.model.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-network';

interface Row {
  person: { userId: string; firstName: string; lastName: string; relationship: string };
  since?: string;
  blockedAt?: string;
}
interface Page {
  rows: Row[];
  nextCursor: string | null;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;

  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const carol = await createAccount(baseUrl, MARKER, 3);
  const dan = await createAccount(baseUrl, MARKER, 4);

  const A = alice.userId.toString();
  const B = bob.userId.toString();
  const C = carol.userId.toString();
  const D = dan.userId.toString();

  const list = async (token: string, group: string, extra = ''): Promise<Page> => {
    const { body } = await request(baseUrl, 'GET', `/api/network/connections?group=${group}${extra}`, { token });
    return body as unknown as Page;
  };
  const blocks = async (token: string, extra = ''): Promise<Page> => {
    const { body } = await request(baseUrl, 'GET', `/api/network/blocks?${extra}`, { token });
    return body as unknown as Page;
  };
  const ids = (page: Page) => page.rows.map((row) => row.person.userId);

  section('Authentication and input');
  const anon = await request(baseUrl, 'GET', '/api/network/connections?group=connected');
  check(anon.status === 401, 'Listing without a token is 401', anon.status);

  const anonBlocks = await request(baseUrl, 'GET', '/api/network/blocks');
  check(anonBlocks.status === 401, 'Listing blocks without a token is 401', anonBlocks.status);

  const noGroup = await request(baseUrl, 'GET', '/api/network/connections', { token: alice.token });
  check(noGroup.status === 400, 'A missing group is refused', noGroup.status);

  const badGroup = await request(baseUrl, 'GET', '/api/network/connections?group=blocked', {
    token: alice.token,
  });
  check(badGroup.status === 400, '"blocked" is not a connection group — refused', badGroup.status);

  const badLimit = await request(baseUrl, 'GET', '/api/network/connections?group=connected&limit=999', {
    token: alice.token,
  });
  check(badLimit.status === 400, 'An out-of-range limit is refused', badLimit.status);

  section('Empty groups are empty, not absent');
  const empty = await list(alice.token, 'connected');
  check(Array.isArray(empty.rows) && empty.rows.length === 0, 'A fresh account has no connections');
  check(empty.nextCursor === null, 'No cursor is issued for a page that ends the list');

  section('Outgoing and incoming are the two sides of one request');
  await request(baseUrl, 'POST', `/api/connections/${B}/request`, { token: alice.token });

  check(ids(await list(alice.token, 'outgoing')).includes(B), 'The requester sees it as outgoing');
  check(ids(await list(alice.token, 'incoming')).length === 0, 'The requester has no incoming row');
  check(ids(await list(bob.token, 'incoming')).includes(A), 'The recipient sees it as incoming');
  check(ids(await list(bob.token, 'outgoing')).length === 0, 'The recipient has no outgoing row');
  check(ids(await list(carol.token, 'incoming')).length === 0, 'An uninvolved account sees nothing');

  const outgoing = await list(alice.token, 'outgoing');
  check(
    outgoing.rows[0]?.person.relationship === 'outgoing_request',
    'The row carries the relationship state the group means',
    outgoing.rows[0]?.person.relationship,
  );
  check(
    typeof outgoing.rows[0]?.since === 'string',
    'The row says when the request was made',
    outgoing.rows[0]?.since,
  );

  section('Privacy — no phone number is ever in a network row');
  const serialized = JSON.stringify(outgoing);
  check(!serialized.includes('phone'), 'No phone field of any kind appears in a network row');
  check(!serialized.includes('email'), 'No email address appears in a network row');

  section('Accept moves the pair, once');
  await request(baseUrl, 'POST', `/api/connections/${A}/accept`, { token: bob.token });

  check(ids(await list(alice.token, 'connected')).includes(B), 'The requester is now connected');
  check(ids(await list(bob.token, 'connected')).includes(A), 'The recipient is now connected');
  check(ids(await list(alice.token, 'outgoing')).length === 0, 'The outgoing row is gone');
  check(ids(await list(bob.token, 'incoming')).length === 0, 'The incoming row is gone');

  const acceptAgain = await request(baseUrl, 'POST', `/api/connections/${A}/accept`, { token: bob.token });
  check(acceptAgain.status === 404, 'Accepting a second time is refused', acceptAgain.status);

  const acceptByStranger = await request(baseUrl, 'POST', `/api/connections/${A}/accept`, {
    token: carol.token,
  });
  check(acceptByStranger.status === 404, 'A third party cannot accept somebody else’s request', acceptByStranger.status);

  section('D17 — withdraw, and a decline that is historical rather than permanent');
  await request(baseUrl, 'POST', `/api/connections/${C}/request`, { token: alice.token });
  check(ids(await list(alice.token, 'outgoing')).includes(C), 'A second request is outgoing');

  await request(baseUrl, 'POST', `/api/connections/${C}/withdraw`, { token: alice.token });
  check(!ids(await list(alice.token, 'outgoing')).includes(C), 'Withdrawing removes it from outgoing');
  check(!ids(await list(carol.token, 'incoming')).includes(A), 'And from the other side’s incoming');

  const withdrawn = await ConnectionModel.findOne({ requester: alice.userId, recipient: carol.userId }).lean().exec();
  check(withdrawn?.status === 'withdrawn', 'The row survives as history, it is not deleted', withdrawn?.status);

  await request(baseUrl, 'POST', `/api/connections/${C}/request`, { token: alice.token });
  await request(baseUrl, 'POST', `/api/connections/${A}/decline`, { token: carol.token });
  check(!ids(await list(alice.token, 'outgoing')).includes(C), 'A declined request leaves outgoing');

  const declined = await ConnectionModel.findOne({ requester: alice.userId, recipient: carol.userId }).lean().exec();
  check(declined?.status === 'declined', 'Declining records its own state', declined?.status);

  const reRequest = await request(baseUrl, 'POST', `/api/connections/${C}/request`, { token: alice.token });
  check(reRequest.status === 201, 'After a decline the same pair may ask again — D17', reRequest.status);
  check(ids(await list(alice.token, 'outgoing')).includes(C), 'And the new request is outgoing again');

  await request(baseUrl, 'POST', `/api/connections/${A}/decline`, { token: carol.token });
  const reverse = await request(baseUrl, 'POST', `/api/connections/${A}/request`, { token: carol.token });
  check(reverse.status === 201, 'The reverse direction may also be opened later', reverse.status);
  check(ids(await list(alice.token, 'incoming')).includes(C), 'It arrives as incoming for the other side');
  await request(baseUrl, 'POST', `/api/connections/${C}/decline`, { token: alice.token });

  const noBlockFromDecline = await BlockModel.countDocuments({
    $or: [
      { blockerUserId: alice.userId, blockedUserId: carol.userId },
      { blockerUserId: carol.userId, blockedUserId: alice.userId },
    ],
  }).exec();
  check(noBlockFromDecline === 0, 'Declining never creates a block — D17', noBlockFromDecline);

  section('Remove ends a live connection and keeps the record');
  await request(baseUrl, 'POST', `/api/connections/${B}/remove`, { token: alice.token });
  check(!ids(await list(alice.token, 'connected')).includes(B), 'Removing clears it for the actor');
  check(!ids(await list(bob.token, 'connected')).includes(A), 'And for the other side');

  const removed = await ConnectionModel.findOne({ pair: [A, B].sort().join(':') }).lean().exec();
  check(removed?.status === 'removed', 'The edge survives as `removed`', removed?.status);

  section('D19 — a block is its own record, and only its author sees it');
  await request(baseUrl, 'POST', `/api/connections/${D}/request`, { token: alice.token });
  await request(baseUrl, 'POST', `/api/connections/${A}/accept`, { token: dan.token });
  check(ids(await list(alice.token, 'connected')).includes(D), 'Alice and Dan are connected');

  await request(baseUrl, 'PUT', `/api/blocks/${D}`, { token: alice.token });

  const mine = await blocks(alice.token);
  check(ids(mine).includes(D), 'The blocker sees the block she created', ids(mine));
  check(mine.rows[0]?.blockedAt !== undefined, 'The row says when it was placed');
  check(
    mine.rows[0]?.person.relationship === 'none',
    'A blocked row carries no connection state — blocking is not one',
    mine.rows[0]?.person.relationship,
  );

  const theirs = await blocks(dan.token);
  check(ids(theirs).length === 0, 'The blocked person is never told — their list is empty', ids(theirs));

  const stillThere = await ConnectionModel.findOne({ pair: [A, D].sort().join(':') }).lean().exec();
  check(
    stillThere?.status === 'accepted',
    'Blocking does not erase the connection history — D19',
    stillThere?.status,
  );

  const unblock = await request(baseUrl, 'DELETE', `/api/blocks/${D}`, { token: alice.token });
  check(unblock.status === 200, 'Unblock succeeds for the person who blocked', unblock.status);
  check(ids(await blocks(alice.token)).length === 0, 'And the row leaves the list');

  const unblockAgain = await request(baseUrl, 'DELETE', `/api/blocks/${D}`, { token: alice.token });
  check(unblockAgain.status === 404, 'Unblocking twice is refused', unblockAgain.status);

  const unblockByStranger = await request(baseUrl, 'DELETE', `/api/blocks/${D}`, { token: bob.token });
  check(unblockByStranger.status === 404, 'Nobody else can lift somebody’s block', unblockByStranger.status);

  section('Pagination walks the whole set without repeating or skipping');
  await request(baseUrl, 'PUT', `/api/blocks/${B}`, { token: alice.token });
  await request(baseUrl, 'PUT', `/api/blocks/${C}`, { token: alice.token });
  await request(baseUrl, 'PUT', `/api/blocks/${D}`, { token: alice.token });

  const all = await blocks(alice.token, 'limit=50');
  check(all.rows.length === 3, 'Three blocks exist', all.rows.length);

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: Page = await blocks(alice.token, `limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    seen.push(...ids(page));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 10);

  check(seen.length === 3, 'Walking one row at a time returns every row', `${seen.length} rows in ${pages} pages`);
  check(new Set(seen).size === 3, 'No row is returned twice', seen.join(','));
  check(
    seen.join(',') === ids(all).join(','),
    'The paged order matches the unpaged order',
    `${seen.join(',')} vs ${ids(all).join(',')}`,
  );

  const tampered = await blocks(alice.token, 'limit=50&cursor=not-a-real-cursor');
  check(tampered.rows.length === 3, 'A tampered cursor starts from the beginning rather than failing');

  section('Blocking hides discovery both ways, without touching the network lists');
  const blockedRequest = await request(baseUrl, 'POST', `/api/connections/${B}/request`, {
    token: alice.token,
  });
  check(blockedRequest.status === 404, 'No request may be opened toward somebody blocked', blockedRequest.status);

  const userIds = [alice.userId, bob.userId, carol.userId, dan.userId];
  await ConnectionModel.deleteMany({
    $or: [{ requester: { $in: userIds } }, { recipient: { $in: userIds } }],
  }).exec();
  await BlockModel.deleteMany({
    $or: [{ blockerUserId: { $in: userIds } }, { blockedUserId: { $in: userIds } }],
  }).exec();
  await CompanyMembershipModel.deleteMany({
    company: { $in: [alice.companyId, bob.companyId, carol.companyId, dan.companyId] },
  }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
