/**
 * The five-year historical relevance rule, verified in one focused procedure. Every expected
 * value below is computed by hand from the owner's final decision — the rolling window, the
 * negative-continuity reactivation, and the no-bias requirement — never from the code under test.
 */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(96)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();

const api = async (method, path, token, json) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* 204 */ }
  return { status: res.status, body };
};

const register = async (name, index) => {
  const email = `hr.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `H${index}`, standing: 'owner',
    companyName: `${name} HR Co ${stamp}`, contractorCategory: 'main_contractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const pageAs = async (browser, fixture) => {
  const me = await api('GET', '/auth/me', fixture.token);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([t2, u]) => { localStorage.setItem('fieldsync-access-token', t2); localStorage.setItem('fieldsync-user', u); },
    [fixture.token, JSON.stringify(me.body.user)]);
  return ctx.newPage();
};

const DAY = 86_400_000;
/** Base-time expressions, evaluated inside mongosh. Each event's resolvedAt lands at base+10d−1ms. */
const AGO = {
  recentHalf: `Date.now() - ${Math.round(0.5 * 365.25 * DAY)} - 10*${DAY}`,
  oneYear: `Date.now() - ${Math.round(1 * 365.25 * DAY)} - 10*${DAY}`,
  twoYears: `Date.now() - ${Math.round(2 * 365.25 * DAY)} - 10*${DAY}`,
  sixYears: `Date.now() - ${Math.round(6 * 365.25 * DAY)} - 10*${DAY}`,
  // Exactly the calendar boundary, one hour INSIDE the window.
  atBoundaryInside: `(() => { const c = new Date(); c.setFullYear(c.getFullYear() - 5); return c.getTime() + 3600000 - 10*${DAY}; })()`,
  // Sixty days OUTSIDE the window.
  justOutside: `(() => { const c = new Date(); c.setFullYear(c.getFullYear() - 5); return c.getTime() - 60*${DAY} - 10*${DAY}; })()`,
};

const seedBatch = (respondent, requestedBy, workable, failed, { justified = 0, baseExpr = 'Date.now()' } = {}) => mongo(`
  const qa = db.getSiblingDB("blokta-qa");
  const base = ${baseExpr};
  const proposals = [];
  const handoffs = [];
  const mk = (fields, changes) => {
    const currentStart = new Date(base + 10*86400000);
    const taskId = new ObjectId();
    proposals.push({project:new ObjectId(), initiatingTask:taskId, requestedBy:ObjectId("${requestedBy}"),
      changes:changes, status:"resolved", responseHours:72,
      items:[Object.assign({task:taskId, respondent:ObjectId("${respondent}"), currentStart:currentStart,
        currentDue:new Date(currentStart.getTime()+5*86400000), proposedStart:new Date(currentStart.getTime()+2*86400000),
        proposedDue:new Date(currentStart.getTime()+7*86400000), reason:"initiating", excluded:false}, fields)],
      resolution:{by:ObjectId("${requestedBy}"), at:new Date(currentStart.getTime()-1)},
      createdAt:new Date(currentStart.getTime()-5*86400000), updatedAt:new Date(base)});
    return taskId;
  };
  for (let i = 0; i < ${workable}; i++) mk({response:"accepted", resolution:"proposed"}, {deltaWorkingDays:2});
  for (let i = 0; i < ${justified}; i++) mk({response:"declined", resolution:"proposed", declineReason:"health"}, {deltaWorkingDays:2});
  for (let i = 0; i < ${failed}; i++) {
    const t = mk({response:"declined", resolution:"replaced"}, {deltaWorkingDays:2});
    handoffs.push({task:t, from:ObjectId("${respondent}"), to:new ObjectId(), state:"accepted",
      decidedAt:new Date(base + 11*86400000), createdAt:new Date(base), updatedAt:new Date(base)});
  }
  if (proposals.length) qa.rescheduleproposals.insertMany(proposals);
  if (handoffs.length) qa.workhandoffs.insertMany(handoffs);
  print("seeded");`);

const flexibilityOf = async (viewerToken, userId) => {
  const { body } = await api('GET', `/browse/contractors/${userId}`, viewerToken);
  return body?.profile?.flexibility ?? null;
};

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures — ten accounts, each one scenario of the rule');
  const gil = await register('gil', 1);
  const hila = await register('hila', 2);   // the owner's exact example → 75
  const omri = await register('omri', 3);   // old mixed history, clean recent record → 100
  const nili = await register('nili', 4);   // one event exactly at the boundary → included
  const dana = await register('dana', 5);   // old positives just outside + justified-only recent → null
  const carmi = await register('carmi', 6); // one recent negative reactivates old positives → 80
  const roni = await register('roni', 7);   // all-negative recent → a genuine 0
  const b39 = await register('b39', 8);
  const b40 = await register('b40', 9);
  const b74 = await register('b74', 10);

  // hila — old (6y): 8 workable + 2 failed; recent: 7 workable + 3 failed spread at 0.5/1/2 years.
  seedBatch(hila.userId, gil.userId, 8, 2, { baseExpr: AGO.sixYears });
  seedBatch(hila.userId, gil.userId, 2, 1, { baseExpr: AGO.recentHalf });
  seedBatch(hila.userId, gil.userId, 3, 1, { baseExpr: AGO.oneYear });
  seedBatch(hila.userId, gil.userId, 2, 1, { baseExpr: AGO.twoYears });
  seedBatch(omri.userId, gil.userId, 2, 2, { baseExpr: AGO.sixYears });
  seedBatch(omri.userId, gil.userId, 7, 0, { baseExpr: AGO.oneYear });
  seedBatch(nili.userId, gil.userId, 1, 0, { baseExpr: AGO.atBoundaryInside });
  seedBatch(dana.userId, gil.userId, 5, 0, { baseExpr: AGO.justOutside });
  seedBatch(dana.userId, gil.userId, 0, 0, { justified: 2 });
  seedBatch(carmi.userId, gil.userId, 4, 0, { baseExpr: AGO.sixYears });
  seedBatch(carmi.userId, gil.userId, 0, 1, { baseExpr: AGO.oneYear });
  seedBatch(roni.userId, gil.userId, 0, 2, { baseExpr: AGO.oneYear });
  seedBatch(b39.userId, gil.userId, 7, 11);
  seedBatch(b40.userId, gil.userId, 2, 3);
  seedBatch(b74.userId, gil.userId, 14, 5);
  const proposalsSeeded = Number(mongo('db.getSiblingDB("blokta-qa").rescheduleproposals.countDocuments({})'));

  section('1. The five-year window and negative continuity, against hand-computed oracles');
  // Oracle (the owner's own example): recent negatives exist → ALL history counts, both signs:
  // workable 8+7=15, relevant 8+2+7+3=20 → round(100×15÷20)=75. NOT 7/12→58.
  const fHila = await flexibilityOf(gil.token, hila.userId);
  check('EXACT (the owner’s example): old 8+/2−, recent 7+/3− → 15/20 → 75, never 58', fHila?.schedule?.score === 75, `got ${fHila?.schedule?.score}`);
  check('recent events at half, one and two years are all inside the window', fHila?.schedule?.context.events === 20);
  check('old positives were NOT discarded while old negatives were kept', fHila?.schedule?.context.workableResolutions === 15);
  check('the inclusion is declared to the reader', fHila?.schedule?.includesOlderHistory === true);

  // Oracle: omri has no negative inside the window → recent-only: 7/7 → 100 (old 2+/2− excluded).
  const fOmri1 = await flexibilityOf(gil.token, omri.userId);
  check('EXACT: a clean recent record retires ALL old history — 7/7 → 100, not 9/11 → 82', fOmri1?.schedule?.score === 100 && fOmri1?.schedule?.context.events === 7, `got ${fOmri1?.schedule?.score}/${fOmri1?.schedule?.context.events}`);
  check('old negatives alone were NOT retained either (bias runs both ways)', fOmri1?.schedule?.context.unresolvedFailures === 0);
  check('and nothing marks it as historical', fOmri1?.schedule?.includesOlderHistory === false);

  // Oracle: one event exactly at the five-year boundary is INSIDE.
  const fNili = await flexibilityOf(gil.token, nili.userId);
  check('an event exactly five years old is inside the window', fNili?.schedule?.score === 100 && fNili?.schedule?.context.events === 1, `got ${JSON.stringify(fNili?.schedule?.context.events)}`);

  // Oracle: dana's positives sit just outside; her recent record is justified-only → null.
  const fDana = await flexibilityOf(gil.token, dana.userId);
  check('just-outside events are excluded when no recent negative exists', fDana === null || fDana.schedule === null, JSON.stringify(fDana));
  check('a justified refusal establishes NO continuity and fabricates no zero', fDana === null || fDana.schedule === null);

  // Oracle: carmi — ONE recent negative reactivates old positives: (4+0)/(4+1) → 80.
  const fCarmi = await flexibilityOf(gil.token, carmi.userId);
  check('EXACT: one substantiated negative suffices — old positives return: 4/5 → 80', fCarmi?.schedule?.score === 80 && fCarmi?.schedule?.includesOlderHistory === true, `got ${fCarmi?.schedule?.score}`);

  const fRoni = await flexibilityOf(gil.token, roni.userId);
  check('an all-negative eligible history is a genuine 0, with no minimum report count', fRoni?.schedule?.score === 0 && fRoni?.schedule?.context.events === 2);
  check('hila’s three recent negatives come from three distinct proposals — reasons never compared', fHila?.schedule?.context.unresolvedFailures === 5);

  section('2. The formula, rounding and categories are untouched');
  check('EXACT: 7/18 → 38.89 → 39 → low', (await flexibilityOf(gil.token, b39.userId))?.schedule?.score === 39);
  check('EXACT: 2/5 → 40 → medium', (await flexibilityOf(gil.token, b40.userId))?.schedule?.score === 40);
  check('EXACT: 14/19 → 73.68 → 74 → medium', (await flexibilityOf(gil.token, b74.userId))?.schedule?.score === 74);
  const cats = {};
  for (const [who, key] of [[roni, 'r'], [b39, 'a'], [b40, 'b'], [b74, 'c'], [hila, 'h'], [omri, 'o']]) {
    cats[key] = (await flexibilityOf(gil.token, who.userId))?.schedule?.category;
  }
  check('categories classify the FINAL integer: 0→low 39→low 40→medium 74→medium 75→high 100→high',
    cats.r === 'low' && cats.a === 'low' && cats.b === 'medium' && cats.c === 'medium' && cats.h === 'high' && cats.o === 'high', JSON.stringify(cats));

  section('3. What can never establish continuity');
  mongo(`const qa = db.getSiblingDB("blokta-qa");
    qa.tasks.insertMany([
      {kind:"standalone", createdBy:ObjectId("${dana.userId}"), assignee:ObjectId("${dana.userId}"), title:"עבודה נוספת",
       startDate:new Date(), dueDate:new Date(Date.now()+5*86400000), attachments:[], createdAt:new Date(), updatedAt:new Date()},
      {kind:"project", project:new ObjectId(), createdBy:ObjectId("${gil.userId}"), assignee:ObjectId("${dana.userId}"),
       title:"עבודה שהושלמה", startDate:new Date(Date.now()-9*86400000), dueDate:new Date(Date.now()-2*86400000),
       startedAt:new Date(Date.now()-8*86400000), completedAt:new Date(Date.now()-1*86400000), attachments:[],
       createdAt:new Date(), updatedAt:new Date()}]);`);
  check('work-scope expansion establishes nothing: dana stays unavailable', ((await flexibilityOf(gil.token, dana.userId))?.schedule ?? null) === null);
  const w1 = mongo(`const qa = db.getSiblingDB("blokta-qa");
    const r = qa.tasks.insertOne({kind:"project", project:new ObjectId(), createdBy:ObjectId("${gil.userId}"),
      assignee:ObjectId("${omri.userId}"), title:"עבודה לדירוג", startDate:new Date(Date.now()-20*86400000),
      dueDate:new Date(Date.now()-10*86400000), startedAt:new Date(Date.now()-19*86400000),
      completedAt:new Date(Date.now()-9*86400000), attachments:[], createdAt:new Date(), updatedAt:new Date()});
    print(r.insertedId.toHexString());`);
  const rated = await api('POST', '/ratings', gil.token, { rateeUserId: omri.userId, workId: w1, score: 1 });
  const fOmriAfterRating = await flexibilityOf(gil.token, omri.userId);
  check('a one-star rating establishes nothing: omri stays 100 on 7 recent events', rated.status === 201 && fOmriAfterRating?.schedule?.score === 100 && fOmriAfterRating?.schedule?.context.events === 7);
  const ratingOut = (await api('GET', `/browse/contractors/${omri.userId}`, gil.token)).body.profile.rating;
  check('and the rating calculation itself is untouched by any of this', ratingOut?.average === 1 && ratingOut?.count === 1);

  section('4. The score follows the evidence as it changes — no stale eligibility');
  seedBatch(omri.userId, gil.userId, 0, 1, { baseExpr: AGO.recentHalf });
  // Oracle: continuity now exists → everything returns: workable 2+7=9, relevant 2+2+7+1=12 → 75.
  const fOmri2 = await flexibilityOf(gil.token, omri.userId);
  check('EXACT: a new recent negative reactivates old history on the next read — 9/12 → 75', fOmri2?.schedule?.score === 75 && fOmri2?.schedule?.includesOlderHistory === true, `got ${fOmri2?.schedule?.score}`);
  check('no stale cache: the same request path answered 100 moments ago', fOmri1?.schedule?.score === 100 && fOmri2?.schedule?.score === 75);
  const fHilaAgain = await flexibilityOf(gil.token, hila.userId);
  check('no cross-user movement: hila still reads exactly 75 on 20 events', fHilaAgain?.schedule?.score === 75 && fHilaAgain?.schedule?.context.events === 20);
  check('the rolling boundary itself was verified from both sides (exactly-5y inside, 5y+60d outside)', fNili?.schedule?.context.events === 1 && (fDana === null || fDana.schedule === null));

  section('5. Nothing stored was touched');
  const proposalsNow = Number(mongo('db.getSiblingDB("blokta-qa").rescheduleproposals.countDocuments({})'));
  check('every historical row is still stored (excluded ≠ deleted)', proposalsNow === proposalsSeeded + 1, `${proposalsSeeded}→${proposalsNow}`);
  const oldRow = mongo(`const qa = db.getSiblingDB("blokta-qa");
    const p = qa.rescheduleproposals.findOne({"items.respondent":ObjectId("${dana.userId}"), "items.response":"accepted"});
    print((p.resolution.at < new Date(Date.now() - 5*365*86400000)) + ":" + p.items.length);`);
  check('an excluded old event keeps its original timestamp — no mutation, no migration', oldRow === 'true:1');

  section('6. The surfaces: one eligible set everywhere, both languages');
  let page = await pageAs(browser, gil);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 });
  const cards = (await page.textContent('#root')) ?? '';
  check('UI-HE: the cards carry the recomputed historical scores', cards.includes('75/100 — גמישות גבוהה') && cards.includes('80/100 — גמישות גבוהה') && cards.includes('0/100 — גמישות נמוכה'));
  check('UI-HE: the unavailable contractor reads the approved copy, never Low', cards.includes('אין עדיין נתונים רלוונטיים'));
  await page.click(`.c-card:has-text("hila") button:has-text("צפייה בפרופיל")`);
  await page.waitForSelector('.pp-signals', { timeout: 15000 });
  check('UI-HE: the profile matches the card', ((await page.textContent('.pp-signals')) ?? '').includes('75/100 — גמישות גבוהה'));
  await page.click('summary:has-text("איך מחושב ציון הגמישות?")');
  await page.waitForTimeout(400);
  const explain = (await page.textContent('details.pp-block')) ?? '';
  check('UI-HE: the explanation counts EXACTLY the eligible set — 15 of 20', explain.includes('ב-15 מתוך 20 אירועי תיאום'));
  check('UI-HE: it says WHY old history is included, in aggregate terms only', explain.includes('היסטוריה ישנה מחמש שנים נכללת בציון'));
  check('privacy: no name, project or date reaches the explanation', !/gil|omri|nili|carmi|dana|roni|20\d\d-/.test(explain));
  await page.screenshot({ path: `${SHOTS}/hr-profile-he.png` });
  const enBtn = await page.$('.lang-switch button:not([aria-pressed="true"])');
  if (enBtn) { await enBtn.click(); await page.waitForTimeout(600); }
  const en = (await page.textContent('#root')) ?? '';
  check('UI-EN: 75/100 — High Flexibility, with the history line in English', en.includes('75/100 — High Flexibility') && en.includes('History older than five years is included'));
  await page.screenshot({ path: `${SHOTS}/hr-profile-en.png` });
  await page.close(); await page.context().close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('NOTES: Feb-29 boundary handling follows the calendar subtraction (setFullYear) proven at');
  console.log('the boundary from both sides above; the previously UNRESOLVED historical-aging decision is');
  console.log('now CLOSED by the owner’s final rule and this procedure verifies that exact rule.');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
