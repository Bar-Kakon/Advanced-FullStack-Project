/**
 * The final approved product corrections, verified in one procedure: the scheduling-only
 * Flexibility Score with its exact formula, the three approved verbal categories at every
 * boundary, the evidence-based explanation, historical-relevance behaviour, and the final
 * agreement-document authorization rules. Every expected number is computed independently
 * from the approved specification, never from the code under test.
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
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(92)} ${detail}`);
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
  try { body = await res.json(); } catch { /* bytes or 204 */ }
  return { status: res.status, body };
};

const register = async (name, index) => {
  const email = `af.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `A${index}`, standing: 'owner',
    companyName: `${name} AF Co ${stamp}`, contractorCategory: 'main_contractor',
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

const iso = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64');

/**
 * Seeds `workable` agreed scheduling outcomes and `failed` unjustified failures for one user,
 * in one insertMany, in the exact stored shape the coordination domain writes. `yearsAgo`
 * backdates the whole batch for the historical checks.
 */
const seedBatch = (respondent, requestedBy, workable, failed, { justified = 0, yearsAgo = 0 } = {}) => mongo(`
  const qa = db.getSiblingDB("blokta-qa");
  const now = Date.now() - ${yearsAgo} * 365 * 86400000;
  const proposals = [];
  const handoffs = [];
  const mk = (fields, changes) => {
    const currentStart = new Date(now + 10*86400000);
    const taskId = new ObjectId();
    proposals.push({project:new ObjectId(), initiatingTask:taskId, requestedBy:ObjectId("${requestedBy}"),
      changes:changes, status:"resolved", responseHours:72,
      items:[Object.assign({task:taskId, respondent:ObjectId("${respondent}"), currentStart:currentStart,
        currentDue:new Date(currentStart.getTime()+5*86400000), proposedStart:new Date(currentStart.getTime()+2*86400000),
        proposedDue:new Date(currentStart.getTime()+7*86400000), reason:"initiating", excluded:false}, fields)],
      resolution:{by:ObjectId("${requestedBy}"), at:new Date(currentStart.getTime()-1)},
      createdAt:new Date(currentStart.getTime()-5*86400000), updatedAt:new Date(now)});
    return taskId;
  };
  for (let i = 0; i < ${workable}; i++) mk({response:"accepted", resolution:"proposed"}, {deltaWorkingDays:2});
  for (let i = 0; i < ${justified}; i++) mk({response:"declined", resolution:"proposed", declineReason:"health"}, {deltaWorkingDays:2});
  for (let i = 0; i < ${failed}; i++) {
    const t = mk({response:"declined", resolution:"replaced"}, {deltaWorkingDays:2});
    handoffs.push({task:t, from:ObjectId("${respondent}"), to:new ObjectId(), state:"accepted",
      decidedAt:new Date(now + 10*86400000), createdAt:new Date(now), updatedAt:new Date(now)});
  }
  if (proposals.length) qa.rescheduleproposals.insertMany(proposals);
  if (handoffs.length) qa.workhandoffs.insertMany(handoffs);
  print("seeded");`);

const flexibilityOf = async (viewerToken, userId) => {
  const { body } = await api('GET', `/browse/contractors/${userId}`, viewerToken);
  return body?.profile?.flexibility ?? null;
};

const HE = { high: 'גמישות גבוהה', medium: 'גמישות בינונית', low: 'גמישות נמוכה' };

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures');
  // Eight accounts, each carrying one boundary score AND one document-access role, so the
  // whole procedure stays inside the auth rate limits of a single fresh backend.
  const gil = await register('gil', 1);    // commissioning party, grantor — unscored viewer
  const hila = await register('hila', 2);  // performer; the 75-score contractor
  const omri = await register('omri', 3);  // 100; project initiator, NOT an agreement party
  const nili = await register('nili', 4);  // 39; explicit grantee
  const carmi = await register('carmi', 5); // 74; full-authority principal, NOT a party
  const dana = await register('dana', 6);  // 40; main_contractor TITLE only — must stay refused
  const adi = await register('adi', 7);    // justified-declines-only → null
  const roni = await register('roni', 8);  // 0; tracking rights only — must stay refused
  const boundary = { b0: roni, b39: nili, b40: dana, b74: carmi, b100: omri };
  for (const [who, w, f] of [[roni, 0, 1], [nili, 7, 11], [dana, 2, 3], [carmi, 14, 5], [omri, 1, 0]]) {
    seedBatch(who.userId, gil.userId, w, f);
  }
  await api('POST', `/connections/${hila.userId}/request`, gil.token);
  await api('POST', `/connections/${gil.userId}/accept`, hila.token);

  section('8.1 THE NUMERICAL SCORE — scheduling only, exact formula');
  seedBatch(hila.userId, gil.userId, 3, 1, { justified: 1 });
  // Oracle: workable=3, failed=1, justified excluded from BOTH sides → round(100*3/4) = 75.
  let flex = await flexibilityOf(omri.token, hila.userId);
  check('EXACT: round(100×3÷4) = 75, the justified refusal outside numerator AND denominator', flex?.schedule?.score === 75, `got ${flex?.schedule?.score}`);
  check('the justified refusal is visible as context, never as negative conduct', flex?.schedule?.context.justifiedDeclines === 1 && flex?.schedule?.context.events === 4);
  const b39flex = await flexibilityOf(gil.token, boundary.b39.userId);
  check('EXACT: rounding to the nearest integer — 7 of 18 → 38.89 → 39', b39flex?.schedule?.score === 39, `got ${b39flex?.schedule?.score}`);
  const b74flex = await flexibilityOf(gil.token, boundary.b74.userId);
  check('EXACT: 14 of 19 → 73.68 → 74', b74flex?.schedule?.score === 74, `got ${b74flex?.schedule?.score}`);
  const b0flex = await flexibilityOf(gil.token, boundary.b0.userId);
  check('a genuine 0 is returned as 0, not as unavailable', b0flex?.schedule?.score === 0);
  seedBatch(adi.userId, gil.userId, 0, 0, { justified: 2 });
  check('zero score-relevant events → unavailable, never a fabricated 0', (await flexibilityOf(gil.token, adi.userId)) === null);

  // Work-scope expansion never moves the score: extra work, extra completed work and a new
  // agreement task are all added for hila, and the number must not move.
  mongo(`const qa = db.getSiblingDB("blokta-qa");
    qa.tasks.insertMany([
      {kind:"standalone", createdBy:ObjectId("${hila.userId}"), assignee:ObjectId("${hila.userId}"), title:"עבודה נוספת",
       startDate:new Date(), dueDate:new Date(Date.now()+5*86400000), attachments:[], createdAt:new Date(), updatedAt:new Date()},
      {kind:"project", project:new ObjectId(), createdBy:ObjectId("${gil.userId}"), assignee:ObjectId("${hila.userId}"),
       title:"עבודה שהושלמה", startDate:new Date(Date.now()-9*86400000), dueDate:new Date(Date.now()-2*86400000),
       startedAt:new Date(Date.now()-8*86400000), completedAt:new Date(Date.now()-1*86400000), attachments:[],
       createdAt:new Date(), updatedAt:new Date()}]);`);
  flex = await flexibilityOf(omri.token, hila.userId);
  check('work-scope expansion (new and completed extra work) moves NOTHING', flex?.schedule?.score === 75 && flex?.schedule?.context.events === 4);
  check('the score carries no scope dimension at all any more', !('scope' in (flex ?? {})), JSON.stringify(Object.keys(flex ?? {})));

  section('8.2 CATEGORY BOUNDARIES — every approved edge, both languages, both surfaces');
  const expectCat = [[boundary.b0, 0, 'low'], [boundary.b39, 39, 'low'], [boundary.b40, 40, 'medium'], [boundary.b74, 74, 'medium'], [hila, 75, 'high'], [boundary.b100, 100, 'high']];
  for (const [who, score, cat] of expectCat) {
    const f = await flexibilityOf(gil.token, who.userId);
    check(`${score} → ${cat}`, f?.schedule?.score === score && f?.schedule?.category === cat, `got ${f?.schedule?.score}/${f?.schedule?.category}`);
  }
  check('null → no category, no Low, no zero', (await flexibilityOf(gil.token, adi.userId)) === null);

  let page = await pageAs(browser, gil);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 });
  const cards = (await page.textContent('#root')) ?? '';
  check('UI-HE: 0/100 — גמישות נמוכה', cards.includes(`0/100 — ${HE.low}`));
  check('UI-HE: 39 reads low, 40 reads medium', cards.includes(`39/100 — ${HE.low}`) && cards.includes(`40/100 — ${HE.medium}`));
  check('UI-HE: 74 reads medium, 75 high, 100 high', cards.includes(`74/100 — ${HE.medium}`) && cards.includes(`75/100 — ${HE.high}`) && cards.includes(`100/100 — ${HE.high}`));
  check('UI-HE: unavailable reads «אין עדיין נתונים רלוונטיים», never Low', cards.includes('אין עדיין נתונים רלוונטיים') && !cards.includes(`— ${HE.low}».`));
  await page.screenshot({ path: `${SHOTS}/af-cards-he.png` });
  await page.click(`.c-card:has-text("hila") button:has-text("צפייה בפרופיל")`);
  await page.waitForSelector('.pp-signals', { timeout: 15000 });
  const ppHe = (await page.textContent('.pp-signals')) ?? '';
  check('UI-HE: the public profile classifies identically to the card', ppHe.includes(`75/100 — ${HE.high}`));

  section('8.4 THE EXPLANATION — evidence-based, private-safe');
  await page.click('summary:has-text("איך מחושב ציון הגמישות?")');
  await page.waitForTimeout(400);
  const explain = (await page.textContent('details.pp-block')) ?? '';
  check('UI-HE: the explanation opens from the profile and speaks in real aggregates', explain.includes('ב-3 מתוך 4 אירועי תיאום נמצא פתרון'));
  check('UI-HE: justified refusals are explained as excluded, not negative', explain.includes('1 סירובים מנומקים אינם נכללים'));
  check('privacy: no fixture name, date or project leaks into the explanation', !/gil|omri|nili|carmi|dana|roni|20\d\d-/.test(explain));
  await page.screenshot({ path: `${SHOTS}/af-explanation-he.png` });
  const enBtn = await page.$('.lang-switch button:not([aria-pressed="true"])');
  if (enBtn) { await enBtn.click(); await page.waitForTimeout(600); }
  const ppEn = (await page.textContent('#root')) ?? '';
  check('UI-EN: 75/100 — High Flexibility', ppEn.includes('75/100 — High Flexibility'));
  check('UI-EN: the unavailable copy reads "No relevant data yet"', ppEn.includes('No relevant data yet'));
  await page.screenshot({ path: `${SHOTS}/af-cards-en.png` });
  await page.close(); await page.context().close();

  section('8.3 HISTORICAL BEHAVIOUR — relevance without invented thresholds');
  const before = await flexibilityOf(gil.token, boundary.b100.userId);
  seedBatch(boundary.b100.userId, gil.userId, 1, 0, { yearsAgo: 1.5 });
  const afterRecent = await flexibilityOf(gil.token, boundary.b100.userId);
  check('a 1.5-year-old event still reaches the calculation', afterRecent?.schedule?.context.events === (before?.schedule?.context.events ?? 0) + 1);
  seedBatch(boundary.b100.userId, gil.userId, 0, 1, { yearsAgo: 6 });
  const afterOld = await flexibilityOf(gil.token, boundary.b100.userId);
  check('a 6-year-old event is NOT auto-deleted or auto-excluded', afterOld?.schedule?.context.events === (afterRecent?.schedule?.context.events ?? 0) + 1);
  check('EXACT: the recomputed score follows the formula over ALL stored history — round(100×2÷3)=67', afterOld?.schedule?.score === 67, `got ${afterOld?.schedule?.score}`);
  check('single negative events count — no minimum report count, no reporter threshold', b0flex?.schedule?.context.events === 1 && b0flex?.schedule?.score === 0);
  check('historical rows remain stored untouched', Number(mongo('db.getSiblingDB("blokta-qa").rescheduleproposals.countDocuments({})')) > 40);
  console.log('  UNVERIFIED  the exact >5-year attenuation arithmetic — settled as CONTINUITY-OF-CONDUCT in principle, but no approved numeric aging rule exists; current behaviour (full relevance, no decay) is the recorded owner decision, reported, not invented');

  section('8.5 AGREEMENT DOCUMENTS — the final access rules');
  const conv = (await api('POST', `/conversations/direct/${hila.userId}`, gil.token, { body: 'מתחילים' })).body.conversation;
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'כתב-כמויות.png');
  const up = await (await fetch(`${API}/conversations/${conv.id}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${gil.token}` }, body: form,
  })).json();
  const prop = await api('POST', `/conversations/${conv.id}/agreements`, gil.token, {
    title: 'עבודת ריצוף', startDate: iso(3), dueDate: iso(12), attachments: [up.attachment.id],
  });
  await api('POST', `/conversations/${conv.id}/agreements/${prop.body.message.id}/accept`, hila.token);
  const taskId = mongo(`print(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${prop.body.message.id}")}).agreement.task.toHexString())`);
  const assetsBefore = Number(mongo('db.getSiblingDB("blokta-qa").fileassets.countDocuments({})'));

  const project = (await api('POST', '/projects', omri.token, {
    name: `פרויקט מסמכים ${stamp}`, projectType: 'building', size: 'בניין',
    startDate: iso(-10), targetEndDate: iso(60), overrunAllowanceDays: 10,
  })).body.project;
  mongo(`const qa = db.getSiblingDB("blokta-qa");
    qa.messages.updateOne({_id:ObjectId("${prop.body.message.id}")},{$set:{"agreement.project":ObjectId("${project.id}")}});
    qa.projectmemberships.insertMany([
      {project:ObjectId("${project.id}"), user:ObjectId("${carmi.userId}"), status:"active", projectRole:"subcontractor",
       fullAuthority:true, permissions:[], invitedBy:ObjectId("${omri.userId}"), invitedAt:new Date(), createdAt:new Date(), updatedAt:new Date()},
      {project:ObjectId("${project.id}"), user:ObjectId("${dana.userId}"), status:"active", projectRole:"main_contractor",
       fullAuthority:false, permissions:[], invitedBy:ObjectId("${omri.userId}"), invitedAt:new Date(), createdAt:new Date(), updatedAt:new Date()}]);
    const t = qa.tasks.findOne({_id:ObjectId("${taskId}")});
    qa.commissiontrackings.insertOne({task:ObjectId("${taskId}"), company:new ObjectId(), trackee:ObjectId("${roni.userId}"),
      createdAt:new Date(), updatedAt:new Date()});`);

  const docsOf = (who) => api('GET', `/tasks/${taskId}/agreement-documents`, who.token);
  const bytesOf = async (who, fid) => (await fetch(`${API}/tasks/${taskId}/agreement-files/${fid}`, { headers: { Authorization: `Bearer ${who.token}` } })).status;
  const fid = up.attachment.id;

  const perf = await docsOf(hila);
  check('the performer (counterparty) reads metadata and bytes', perf.status === 200 && perf.body.documents[0].filename === 'כתב-כמויות.png' && (await bytesOf(hila, fid)) === 200);
  check('the commissioning party reads metadata and bytes', (await docsOf(gil)).status === 200 && (await bytesOf(gil, fid)) === 200);
  const initiator = await docsOf(omri);
  check('the project initiator (owner/developer) reads, by relationship not title', initiator.status === 200 && initiator.body.viewer.role === 'initiator' && (await bytesOf(omri, fid)) === 200);
  const principal = await docsOf(carmi);
  check('the full-authority principal contractor reads', principal.status === 200 && principal.body.viewer.role === 'principal' && (await bytesOf(carmi, fid)) === 200);
  check('a main_contractor TITLE alone grants NOTHING', (await docsOf(dana)).status === 404 && (await bytesOf(dana, fid)) === 404);
  check('generic commissioned-work tracking grants NOTHING', (await docsOf(roni)).status === 404 && (await bytesOf(roni, fid)) === 404);
  check('an unrelated user is refused', (await docsOf(adi)).status === 404 && (await bytesOf(adi, fid)) === 404);

  check('a grantee cannot exist before the grant', (await docsOf(nili)).status === 404);
  const granted = await api('PUT', `/tasks/${taskId}/agreement-documents/grants/${nili.userId}`, gil.token);
  const grantee = await docsOf(nili);
  check('an authorized party grants; the grantee reads metadata and bytes', granted.status === 204 && grantee.status === 200 && grantee.body.viewer.role === 'grantee' && (await bytesOf(nili, fid)) === 200);
  check('the grant does NOT open the private conversation', (await api('GET', `/conversations/${conv.id}/messages?limit=5`, nili.token)).status >= 400);
  check('the grantee may not grant onward', (await api('PUT', `/tasks/${taskId}/agreement-documents/grants/${adi.userId}`, nili.token)).status === 404);
  check('the grantee may not revoke anybody', (await api('DELETE', `/tasks/${taskId}/agreement-documents/grants/${nili.userId}`, nili.token)).status === 404);
  check('the grantor sees the live grant with attribution', (await docsOf(gil)).body.grants.some((g) => g.userId === nili.userId));
  const revoked = await api('DELETE', `/tasks/${taskId}/agreement-documents/grants/${nili.userId}`, gil.token);
  check('revocation works and takes effect on the very next read', revoked.status === 204 && (await docsOf(nili)).status === 404 && (await bytesOf(nili, fid)) === 404);
  check('a tracking-only user cannot grant either', (await api('PUT', `/tasks/${taskId}/agreement-documents/grants/${roni.userId}`, roni.token)).status === 404);

  const assetsAfter = Number(mongo('db.getSiblingDB("blokta-qa").fileassets.countDocuments({})'));
  check('no file bytes or asset rows duplicated by any of it', assetsAfter === assetsBefore);
  const agreementRow = mongo(`const m = db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${prop.body.message.id}")}); print(m.agreement.state + ":" + m.attachments.length)`);
  check('the agreement message is intact, accepted, with its attachment', agreementRow === 'accepted:1');

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('UNRESOLVED, deliberately not invented: the exact numeric mechanism for attenuating');
  console.log('events older than five years (continuity of negative conduct is SETTLED as a principle;');
  console.log('its arithmetic has no approved rule, so full relevance without decay — the recorded');
  console.log('owner decision — remains in force until the owner approves a mechanism).');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
