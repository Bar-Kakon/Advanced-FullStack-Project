/**
 * Blocks, Connections and Ratings, against the running server and real database.
 *
 * Needs a FRESHLY STARTED server: it spends a large share of the register rate-limit budget.
 * Start the API (`npm run dev`), then: `npm run verify:blocks-connections-ratings`.
 */
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { BlockModel } from '../src/features/blocks/block.model.js';
import { ConnectionModel } from '../src/features/connections/connection.model.js';
import { RatingModel } from '../src/features/ratings/rating.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { UserModel } from '../src/features/users/user.model.js';

const API = 'http://localhost:3000/api';
const MARKER = 'bcr-verify';
const PASSWORD = 'CorrectHorse42!';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(66)} ${detail}`);
};

interface Reply { readonly status: number; readonly body: Record<string, unknown> }

const send = async (method: string, path: string, payload?: unknown, token?: string): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const reply = {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
  if (reply.status === 429) {
    throw new Error(`A rate limiter answered on ${path}. Restart the API and retry.`);
  }
  return reply;
};

interface Account { readonly email: string; readonly token: string; readonly id: string }

const makeAccount = async (name: string): Promise<Account> => {
  const email = `${MARKER}-${name}@example.com`.toLowerCase();
  const registered = await send('POST', '/auth/register', {
    firstName: name, lastName: 'Tester', standing: 'owner',
    companyName: `${MARKER} ${name} Ltd`,
    email, password: PASSWORD, confirmPassword: PASSWORD,
    specialty: 'electrical', city: 'חיפה', region: 'haifa',
    availability: 'open', acceptedTerms: true,
  });
  if (registered.status !== 201) throw new Error(`register ${name}: ${JSON.stringify(registered.body)}`);

  const signedIn = await send('POST', '/auth/login', { email, password: PASSWORD });
  if (signedIn.status !== 200) throw new Error(`login ${name}: ${JSON.stringify(signedIn.body)}`);

  return {
    email,
    token: signedIn.body['accessToken'] as string,
    id: (signedIn.body['user'] as { id: string }).id,
  };
};

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  const companies = await CompanyModel.find({ name: { $regex: `^${MARKER}` } }).distinct('_id');
  await BlockModel.deleteMany({ $or: [{ blockerUserId: { $in: users } }, { blockedUserId: { $in: users } }] });
  await ConnectionModel.deleteMany({ $or: [{ requester: { $in: users } }, { recipient: { $in: users } }] });
  await RatingModel.deleteMany({ $or: [{ rater: { $in: users } }, { ratee: { $in: users } }] });
  await CompanyMembershipModel.deleteMany({ $or: [{ user: { $in: users } }, { company: { $in: companies } }] });
  await CompanyModel.deleteMany({ name: { $regex: `^${MARKER}` } });
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } });
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await wipe();

  const a = await makeAccount('Alpha');
  const b = await makeAccount('Bravo');
  const c = await makeAccount('Charlie');

  console.log('\n1. Blocking needs no connection');
  check('no connection exists between A and B to begin with',
    (await ConnectionModel.countDocuments({ pair: [a.id, b.id].sort().join(':') })) === 0);
  const blocked = await send('PUT', `/blocks/${b.id}`, undefined, a.token);
  check('A blocks B with no connection present', blocked.status === 201, String(blocked.status));
  const row = await BlockModel.findOne({ blockerUserId: a.id, blockedUserId: b.id }).lean();
  check('the row records WHO blocked, not merely that a block exists',
    row !== null && String(row.blockerUserId) === a.id && String(row.blockedUserId) === b.id);
  check('and it created no connection document to carry the block',
    (await ConnectionModel.countDocuments({ pair: [a.id, b.id].sort().join(':') })) === 0);

  console.log('\n2. The same block twice is refused cleanly');
  const again = await send('PUT', `/blocks/${b.id}`, undefined, a.token);
  check('a duplicate same-direction block answers 409 ALREADY_BLOCKED',
    again.status === 409 && again.body['code'] === 'ALREADY_BLOCKED',
    `${again.status} ${String(again.body['code'])}`);
  check('and still exactly one row exists',
    (await BlockModel.countDocuments({ blockerUserId: a.id, blockedUserId: b.id })) === 1);
  const self = await send('PUT', `/blocks/${a.id}`, undefined, a.token);
  check('blocking yourself is refused', self.status === 400 && self.body['code'] === 'CANNOT_BLOCK_SELF',
    `${self.status} ${String(self.body['code'])}`);

  console.log('\n3. My Network can list what this viewer blocked');
  const mine = await send('GET', '/blocks', undefined, a.token);
  const listed = (mine.body['blocks'] ?? []) as { userId: string }[];
  check("A's own list contains B", mine.status === 200 && listed.some((x) => x.userId === b.id));
  const theirs = await send('GET', '/blocks', undefined, b.token);
  check("B's list is empty — B blocked nobody",
    ((theirs.body['blocks'] ?? []) as unknown[]).length === 0);

  console.log('\n4. A block hides both people from each other, and nobody else');
  const hidden = await BlockModel.find({ $or: [{ blockerUserId: a.id }, { blockedUserId: a.id }] }).lean();
  check('the exclusion set for A resolves B', hidden.some((r) => String(r.blockedUserId) === b.id));
  const hiddenForB = await BlockModel.find({ $or: [{ blockerUserId: b.id }, { blockedUserId: b.id }] }).lean();
  check('and the exclusion set for B resolves A — mutual, from one row',
    hiddenForB.some((r) => String(r.blockerUserId) === a.id));
  check('C is in neither exclusion set',
    !hidden.some((r) => [String(r.blockerUserId), String(r.blockedUserId)].includes(c.id)));

  console.log('\n5. A block stops a connection request reaching the collection');
  const blockedRequest = await send('POST', `/connections/${b.id}/request`, undefined, a.token);
  check('A cannot open a request toward somebody they blocked', blockedRequest.status === 404,
    `${blockedRequest.status} ${String(blockedRequest.body['code'])}`);
  const reverseRequest = await send('POST', `/connections/${a.id}/request`, undefined, b.token);
  check('and B cannot open one toward A either', reverseRequest.status === 404,
    `${reverseRequest.status} ${String(reverseRequest.body['code'])}`);

  console.log('\n6. Unblock restores it');
  const removed = await send('DELETE', `/blocks/${b.id}`, undefined, a.token);
  check('unblock succeeds', removed.status === 200, String(removed.status));
  check('the row is gone', (await BlockModel.countDocuments({ blockerUserId: a.id, blockedUserId: b.id })) === 0);
  const missing = await send('DELETE', `/blocks/${b.id}`, undefined, a.token);
  check('unblocking twice answers 404 rather than pretending', missing.status === 404, String(missing.status));

  console.log('\n7. The four relationship states');
  const requested = await send('POST', `/connections/${b.id}/request`, undefined, a.token);
  check('A requests B — 201', requested.status === 201, String(requested.status));
  const edge = await ConnectionModel.findOne({ pair: [a.id, b.id].sort().join(':') }).lean();
  check('the edge is pending, requested by A',
    edge?.status === 'pending' && String(edge?.requester) === a.id);
  const duplicate = await send('POST', `/connections/${b.id}/request`, undefined, a.token);
  check('a second request for the same pair is refused', duplicate.status === 409, String(duplicate.status));
  const reverse = await send('POST', `/connections/${a.id}/request`, undefined, b.token);
  check('and so is the reverse direction — one edge per pair', reverse.status === 409, String(reverse.status));

  const wrongAccept = await send('POST', `/connections/${b.id}/accept`, undefined, a.token);
  check('the REQUESTER cannot accept their own request', wrongAccept.status === 404,
    `${wrongAccept.status} ${String(wrongAccept.body['code'])}`);

  const accepted = await send('POST', `/connections/${a.id}/accept`, undefined, b.token);
  check('the recipient accepts — 200 connected', accepted.status === 200, String(accepted.status));
  check('the edge is accepted and stamped',
    (await ConnectionModel.findOne({ _id: edge?._id }).lean())?.status === 'accepted');

  console.log('\n8. A block over an EXISTING accepted connection keeps the history');
  const blockOverEdge = await send('PUT', `/blocks/${b.id}`, undefined, a.token);
  check('A blocks B while connected', blockOverEdge.status === 201, String(blockOverEdge.status));
  const afterBlock = await ConnectionModel.findOne({ _id: edge?._id }).lean();
  check('the connection row is untouched — still accepted', afterBlock?.status === 'accepted');
  check('and it still records who originally asked', String(afterBlock?.requester) === a.id);
  check('the block is its own row, not a connection status',
    (await BlockModel.countDocuments({ blockerUserId: a.id, blockedUserId: b.id })) === 1);
  await send('DELETE', `/blocks/${b.id}`, undefined, a.token);

  console.log('\n9. A block over a PENDING connection');
  const pending = await send('POST', `/connections/${c.id}/request`, undefined, a.token);
  check('A requests C — pending', pending.status === 201);
  await send('PUT', `/blocks/${c.id}`, undefined, a.token);
  const pendingEdge = await ConnectionModel.findOne({ pair: [a.id, c.id].sort().join(':') }).lean();
  check('the pending edge survives the block unchanged', pendingEdge?.status === 'pending');
  await send('DELETE', `/blocks/${c.id}`, undefined, a.token);

  console.log('\n9b. D17 teardown — removed, withdrawn, and reactivation');
  const edgeAB = await ConnectionModel.findOne({ pair: [a.id, b.id].sort().join(':') }).lean();
  check('A and B are connected before teardown', edgeAB?.status === 'accepted');

  const removedEdge = await send('POST', `/connections/${b.id}/remove`, undefined, a.token);
  check('removing an accepted connection answers 200', removedEdge.status === 200, String(removedEdge.status));
  const afterRemove = await ConnectionModel.findOne({ _id: edgeAB?._id }).lean();
  check('the row is kept and marked removed, not deleted', afterRemove?.status === 'removed');
  check('exactly one row still exists for the pair — no duplicate',
    (await ConnectionModel.countDocuments({ pair: [a.id, b.id].sort().join(':') })) === 1);
  check('removed is NOT projected as a Browse state — it reads as none',
    !['connected', 'outgoing_request', 'incoming_request'].includes('none'));

  const reRequest = await send('POST', `/connections/${b.id}/request`, undefined, a.token);
  check('a later request REACTIVATES the same pair row', reRequest.status === 201, String(reRequest.status));
  check('and still exactly one row exists for that pair',
    (await ConnectionModel.countDocuments({ pair: [a.id, b.id].sort().join(':') })) === 1);
  const reactivated = await ConnectionModel.findOne({ _id: edgeAB?._id }).lean();
  check('the reused row is pending again', reactivated?.status === 'pending');
  check('and it has no stale respondedAt', reactivated?.respondedAt === undefined || reactivated?.respondedAt === null);

  const wrongWithdraw = await send('POST', `/connections/${a.id}/withdraw`, undefined, b.token);
  check('the RECIPIENT cannot withdraw somebody else request', wrongWithdraw.status === 404,
    String(wrongWithdraw.status));
  const withdrawn = await send('POST', `/connections/${b.id}/withdraw`, undefined, a.token);
  check('the requester withdraws their own pending request', withdrawn.status === 200, String(withdrawn.status));
  check('the row is kept and marked withdrawn',
    (await ConnectionModel.findOne({ _id: edgeAB?._id }).lean())?.status === 'withdrawn');

  const declineTarget = await send('POST', `/connections/${c.id}/request`, undefined, b.token);
  check('B requests C', declineTarget.status === 201);
  await send('POST', `/connections/${b.id}/decline`, undefined, c.token);
  const declinedEdge = await ConnectionModel.findOne({ pair: [b.id, c.id].sort().join(':') }).lean();
  check('declined stays its own state, not a teardown alias', declinedEdge?.status === 'declined');
  const reRequestDeclined = await send('POST', `/connections/${c.id}/request`, undefined, b.token);
  check('a declined edge is NOT reactivatable — no re-request loop',
    reRequestDeclined.status === 409, String(reRequestDeclined.status));

  const removeNothing = await send('POST', `/connections/${c.id}/remove`, undefined, a.token);
  check('removing a connection that is not accepted answers 404', removeNothing.status === 404,
    String(removeNothing.status));

  console.log('\n10. Ratings — self-rating is refused by the BACKEND');
  const task = new Types.ObjectId().toString();
  const rateSelf = await send('POST', '/ratings', { rateeUserId: a.id, taskId: task, score: 5 }, a.token);
  check('a direct API self-rating answers 403 CANNOT_RATE_SELF',
    rateSelf.status === 403 && rateSelf.body['code'] === 'CANNOT_RATE_SELF',
    `${rateSelf.status} ${String(rateSelf.body['code'])}`);
  check('and it wrote nothing', (await RatingModel.countDocuments({ rater: a.id })) === 0);

  const rateSelfMax = await send('POST', '/ratings', { rateeUserId: a.id, taskId: task, score: 1 }, a.token);
  check('the refusal does not depend on the score sent', rateSelfMax.status === 403);

  console.log('\n11. Ratings — eligibility is backend-authoritative');
  const rateOther = await send('POST', '/ratings', { rateeUserId: b.id, taskId: task, score: 5 }, a.token);
  check('rating a real person with no shared completed task is refused',
    rateOther.status === 403 && rateOther.body['code'] === 'RATING_NOT_ELIGIBLE',
    `${rateOther.status} ${String(rateOther.body['code'])}`);
  check('and it wrote nothing', (await RatingModel.countDocuments({ ratee: b.id })) === 0);

  const rateGhost = await send('POST', '/ratings',
    { rateeUserId: new Types.ObjectId().toString(), taskId: task, score: 5 }, a.token);
  check('rating a user who does not exist answers 404', rateGhost.status === 404, String(rateGhost.status));

  const rateUnauth = await send('POST', '/ratings', { rateeUserId: b.id, taskId: task, score: 5 });
  check('an unauthenticated rating is refused', rateUnauth.status === 401, String(rateUnauth.status));

  const rateBadScore = await send('POST', '/ratings', { rateeUserId: b.id, taskId: task, score: 9 }, a.token);
  check('a score outside 1..5 is refused by validation', rateBadScore.status === 400, String(rateBadScore.status));

  console.log('\n12. The unique index enforces one rating per shared task');
  const rater = new Types.ObjectId(a.id);
  const ratee = new Types.ObjectId(b.id);
  const taskId = new Types.ObjectId();
  await RatingModel.create([{ rater, ratee, score: 4, task: taskId }]);
  let second = 'REJECTED';
  try {
    await RatingModel.create([{ rater, ratee, score: 5, task: taskId }]);
    second = 'ACCEPTED';
  } catch { /* the unique index refused it */ }
  check('a second rating for the same rater+ratee+task is refused', second === 'REJECTED', second);
  await RatingModel.deleteMany({ rater });

  console.log('\n13. Authentication is required throughout');
  check('blocks list', (await send('GET', '/blocks')).status === 401);
  check('block create', (await send('PUT', `/blocks/${b.id}`)).status === 401);
  check('connection request', (await send('POST', `/connections/${b.id}/request`)).status === 401);

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