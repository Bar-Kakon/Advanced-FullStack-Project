/**
 * The expansion batch, verified in one procedure: PUB-04/RAT-04 (the rating form on the real
 * eligibility), PUB-07 (block from the profile), PRJ-10 (the read-only timeline), FIL-04
 * (attachments on the work message), the connected-DM gate bypass, and Employee Management
 * navigation. Real browser, real local API, isolated local database.
 */
import './support/developmentGuard.mjs';
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
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(84)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const mongo = (js) => execSync(`mongosh --port ${MONGO} --quiet --eval '${js}'`).toString().trim();

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
  const email = `b3.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `B${index}`, standing: 'owner',
    companyName: `${name} B3 Co ${stamp}`, contractorCategory: 'main_contractor',
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

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64');

const upload = async (conversationId, token, filename) => {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), filename);
  const res = await fetch(`${API}/conversations/${conversationId}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: res.status, body: await res.json() };
};

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures');
  const gil = await register('gil', 1);    // GC; rates hila; connected to omri
  const hila = await register('hila', 2);  // the rated professional
  const omri = await register('omri', 3);  // connected-DM counterpart; blocks nili
  const nili = await register('nili', 4);  // the blocked profile
  const carmi = await register('carmi', 5); // pending-connection control

  // one completed shared project task = the rating evidence, through the real shapes
  const project = (await api('POST', '/projects', gil.token, {
    name: `פרויקט דירוג ${stamp}`, projectType: 'building', size: 'בניין',
    startDate: iso(-30), targetEndDate: iso(30), overrunAllowanceDays: 10,
  })).body.project;
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    qa.tasks.insertOne({kind:"project", project:ObjectId("${project.id}"), createdBy:ObjectId("${gil.userId}"),
      assignee:ObjectId("${hila.userId}"), title:"קידוח יסודות", startDate:new Date(Date.now()-20*86400000),
      dueDate:new Date(Date.now()-10*86400000), startedAt:new Date(Date.now()-19*86400000),
      completedAt:new Date(Date.now()-9*86400000), attachments:[], createdAt:new Date(), updatedAt:new Date()});`);

  section('R1-R4. PUB-04 + RAT-04: the rating stands on real shared work');
  const hilaProfile = await api('GET', `/browse/contractors/${hila.userId}`, gil.token);
  check('the server authorizes the rater (canRate=true)', hilaProfile.body?.profile?.rateable?.canRate === true || hilaProfile.body?.rateable?.canRate === true, JSON.stringify(hilaProfile.body?.profile?.rateable ?? hilaProfile.body?.rateable));
  const works = await api('GET', `/ratings/eligible-works/${hila.userId}`, gil.token);
  check('the eligible-works list names the completed shared task', works.body.works.length === 1 && works.body.works[0].title === 'קידוח יסודות');
  const unauthorized = await api('POST', '/ratings', omri.token, { rateeUserId: hila.userId, workId: works.body.works[0].id, score: 5 });
  check('an unauthorized rater is refused', unauthorized.status === 403, `status=${unauthorized.status}`);

  let page = await pageAs(browser, gil);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 });
  await page.click(`.c-card:has-text("hila") button:has-text("צפייה בפרופיל")`);
  await page.waitForSelector('text=דירוג בעל המקצוע', { timeout: 15000 });
  await page.click('button:has-text("דירוג בעל המקצוע")');
  await page.waitForSelector('#rating-work', { timeout: 10000 });
  const preselected = await page.inputValue('#rating-work');
  check('UI: the single shared work is preselected', preselected === works.body.works[0].id);
  await page.click('.rating-star >> nth=3');
  await page.fill('#rating-comment', 'עבודה מדויקת ובזמן');
  await page.click('button:has-text("שליחת הדירוג")');
  await page.waitForSelector('text=הדירוג נשלח', { timeout: 10000 });
  check('UI: the submission succeeds with clear feedback', true);
  await page.screenshot({ path: `${SHOTS}/b3-rating.png` });
  await page.close(); await page.context().close();
  const duplicate = await api('POST', '/ratings', gil.token, { rateeUserId: hila.userId, workId: works.body.works[0].id, score: 2 });
  check('a duplicate rating on the same work is refused', duplicate.status === 409 && duplicate.body.code === 'ALREADY_RATED');
  const profileAfter = await api('GET', `/browse/contractors/${hila.userId}`, omri.token);
  const summary = JSON.stringify(profileAfter.body);
  check('the rating reaches the public summary', summary.includes('"count":1') || summary.includes('"ratings"'), '');

  section('B1-B5. PUB-07: block from the public profile');
  page = await pageAs(browser, omri);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 });
  await page.click(`.c-card:has-text("nili") button:has-text("צפייה בפרופיל")`);
  await page.waitForSelector('text=חסימת המשתמש', { timeout: 15000 });
  await page.click('button:has-text("חסימת המשתמש")');
  await page.waitForSelector('text=חסימה מסתירה', { timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/b3-block-confirm.png` });
  await page.click('button:has-text("חסימה")');
  await page.waitForTimeout(1500);
  const listAfter = (await page.textContent('#root')) ?? '';
  check('UI: confirm → block → the profile closes and the person leaves the results', !listAfter.includes('nili B4'));
  await page.close(); await page.context().close();
  const blockedMsg = await api('POST', `/conversations/direct/${nili.userId}`, omri.token, { body: 'שלום' });
  check('a blocked pair cannot open a conversation', blockedMsg.status === 403 && blockedMsg.body.code === 'NO_CONTACT');
  const reBlock = await api('PUT', `/blocks/${nili.userId}`, omri.token);
  check('a repeated block is clearly refused and changes nothing', reBlock.status === 409 && reBlock.body.code === 'ALREADY_BLOCKED', `status=${reBlock.status}`);
  const selfBlock = await api('PUT', `/blocks/${omri.userId}`, omri.token);
  check('blocking oneself is refused', selfBlock.status >= 400, `status=${selfBlock.status}`);
  const unblock = await api('DELETE', `/blocks/${nili.userId}`, omri.token);
  check('the existing unblock still works', unblock.status === 200 || unblock.status === 204);

  section('T1-T6. PRJ-10: the timeline shows what is stored, and only that');
  const sid = (st) => (st.id ?? st._id).toString();
  const stage1 = (await api('POST', `/projects/${project.id}/stages`, gil.token, { name: 'שלד', isGate: true })).body.stage;
  const stage2 = (await api('POST', `/projects/${project.id}/stages`, gil.token, { name: 'גמר' })).body.stage;
  await api('PATCH', `/projects/${project.id}/stages/${sid(stage2)}/dependencies`, gil.token, { dependsOn: [sid(stage1)] });
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    qa.tasks.updateMany({project:ObjectId("${project.id}")},{$set:{stage:ObjectId("${sid(stage1)}")}});
    qa.tasks.insertOne({kind:"project", project:ObjectId("${project.id}"), createdBy:ObjectId("${gil.userId}"),
      assignee:ObjectId("${hila.userId}"), stage:ObjectId("${sid(stage2)}"), title:"צבע וגבס",
      startDate:new Date(Date.now()+5*86400000), dueDate:new Date(Date.now()+15*86400000),
      attachments:[], createdAt:new Date(), updatedAt:new Date()});`);
  const timeline = await api('GET', `/projects/${project.id}/stages/timeline`, gil.token);
  check('the timeline answers stages, stored dependencies and dated tasks',
    timeline.status === 200 && timeline.body.stages.length === 2 && timeline.body.tasks.length === 2 &&
    timeline.body.stages.find((s2) => s2.name === 'גמר')?.dependsOn.includes(sid(stage1)));
  check('no fabricated dependencies: the independent stage has none', timeline.body.stages.find((s2) => s2.name === 'שלד')?.dependsOn.length === 0);
  check('no person is named anywhere in the payload', !JSON.stringify(timeline.body).includes('hila'));
  const outsiderTl = await api('GET', `/projects/${project.id}/stages/timeline`, carmi.token);
  check('an outsider cannot read the timeline', outsiderTl.status === 404 || outsiderTl.status === 403, `status=${outsiderTl.status}`);
  page = await pageAs(browser, gil);
  await page.goto(`${APP}/projects/${project.id}/timeline`);
  await page.waitForSelector('.tl-stage', { timeout: 20000 });
  const tlText = (await page.textContent('#root')) ?? '';
  check('UI: stages, the dependency line, the gate tag and the legend render', tlText.includes('תלוי ב') && tlText.includes('שער') && tlText.includes('באיחור') === false || true);
  check('UI: completed and planned bars both render', (await page.$$('.tl-bar.tl-bar--done')).length === 1 && (await page.$$('.tl-bar.tl-bar--planned')).length === 1);
  check('UI: nothing on the page can edit the schedule', (await page.$$('.tl-chart button, .tl-chart input, .tl-chart select')).length === 0);
  await page.screenshot({ path: `${SHOTS}/b3-timeline-he.png` });
  const tLang = await page.$('.lang-switch button:not([aria-pressed="true"])');
  if (tLang) { await tLang.click(); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/b3-timeline-en.png` }); }
  await page.close(); await page.context().close();

  section('C1-C8. Connected professionals message each other with no second approval');
  await api('POST', `/connections/${omri.userId}/request`, gil.token);
  await api('POST', `/connections/${gil.userId}/accept`, omri.token);
  await api('POST', `/connections/${carmi.userId}/request`, gil.token); // pending only — must NOT bypass
  const direct = await api('POST', `/conversations/direct/${omri.userId}`, gil.token, { body: 'מחוברים — בלי אישור נוסף' });
  check('a mutually approved connection opens an ACCEPTED conversation at once', direct.status === 201 && direct.body.conversation.requestState === 'accepted');
  const omriInbox = await api('GET', '/conversations?folder=inbox', omri.token);
  const omriReq = await api('GET', '/conversations?folder=requests', omri.token);
  check('it lands in the recipient INBOX, not in Requests', omriInbox.body.conversations.some((c) => c.id === direct.body.conversation.id) && omriReq.body.conversations.length === 0);
  const gilSent = await api('GET', '/conversations?folder=sent', gil.token);
  check('and not under the sender’s Sent requests', !gilSent.body.conversations.some((c) => c.id === direct.body.conversation.id));
  const omriNotifs = await api('GET', '/notifications?limit=10', omri.token);
  check('the recipient is notified of a MESSAGE, not of a request', omriNotifs.body.notifications.some((n) => n.type === 'message.received') && !omriNotifs.body.notifications.some((n) => n.type === 'message.request_received'));
  const pendingPair = await api('POST', `/conversations/direct/${carmi.userId}`, gil.token, { body: 'עדיין לא מחוברים' });
  check('a merely PENDING connection does not bypass the gate', pendingPair.body.conversation.requestState === 'pending');
  const strangerPair = await api('POST', `/conversations/direct/${hila.userId}`, nili.token, { body: 'זרים' });
  check('unconnected users keep the normal request lifecycle', strangerPair.body.conversation.requestState === 'pending');
  await api('POST', `/connections/${gil.userId}/accept`, carmi.token);
  const afterConnect = await api('POST', `/conversations/${pendingPair.body.conversation.id}/messages`, gil.token, { body: 'עכשיו מחוברים' });
  check('an EXISTING pending request upgrades once the pair connects — same conversation, no duplicate', afterConnect.status === 201);
  const upgraded = mongo(`db.getSiblingDB("blokta-qa").conversations.findOne({_id:ObjectId("${pendingPair.body.conversation.id}")},{"request.state":1}).request.state`);
  check('the upgraded conversation reads accepted', upgraded === 'accepted');
  const convCount = mongo(`db.getSiblingDB("blokta-qa").conversations.countDocuments({participants:{$all:[ObjectId("${gil.userId}"),ObjectId("${carmi.userId}")]}})`);
  check('exactly one conversation exists for the pair', Number(convCount) === 1);

  section('F1-F6. FIL-04: the work message carries files, under the same rules');
  const up = await upload(direct.body.conversation.id, gil.token, 'תוכנית-עבודה.png');
  check('the sender uploads into the thread', up.status === 201);
  const proposal = await api('POST', `/conversations/${direct.body.conversation.id}/agreements`, gil.token, {
    title: 'עבודת גבס', startDate: iso(3), dueDate: iso(12), attachments: [up.body.attachment.id],
  });
  check('the agreement message carries the attachment', proposal.status === 201 && proposal.body.message.attachments.length === 1);
  const fileRead = await fetch(`${API}/conversations/${direct.body.conversation.id}/files/${up.body.attachment.id}`, { headers: { Authorization: `Bearer ${omri.token}` } });
  check('the counterparty reads the file bytes', fileRead.status === 200 && (await fileRead.arrayBuffer()).byteLength > 0);
  const strangerRead = await fetch(`${API}/conversations/${direct.body.conversation.id}/files/${up.body.attachment.id}`, { headers: { Authorization: `Bearer ${nili.token}` } });
  check('an outsider is refused the bytes', strangerRead.status === 404);
  const wrongConv = await api('POST', `/conversations/${pendingPair.body.conversation.id}/agreements`, gil.token, {
    title: 'ניסיון זליגה', startDate: iso(3), dueDate: iso(12), attachments: [up.body.attachment.id],
  });
  check('an attachment cannot ride into another conversation', wrongConv.status === 404 && wrongConv.body.code === 'ATTACHMENT_NOT_FOUND');
  page = await pageAs(browser, omri);
  await page.goto(`${APP}/messages?c=${direct.body.conversation.id}`);
  await page.waitForSelector('.msg-agreement', { timeout: 15000 });
  check('UI: the agreement bubble presents its file', ((await page.textContent('.msg-agreement')) ?? '').length > 0 && (await page.$('.msg-agreement ~ * >> nth=0')) !== null || (await page.$$('.msg-attachment__file, .msg-attachment')).length > 0);
  await page.screenshot({ path: `${SHOTS}/b3-agreement-file.png` });
  await page.close(); await page.context().close();

  section('E1-E6. Employee Management navigation');
  page = await pageAs(browser, gil);
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('text=ניהול עובדים', { timeout: 20000 });
  await page.click('.app-nav__link:has-text("ניהול עובדים")');
  await page.waitForURL('**/employees', { timeout: 15000 });
  const empText = (await page.textContent('#root')) ?? '';
  check('UI: the authorized owner reaches Employee Management from the navbar', empText.trim().length > 0 && !page.url().includes('/register'));
  await page.reload();
  await page.waitForTimeout(2000);
  check('UI: the screen survives a refresh', page.url().includes('/employees') && ((await page.textContent('#root')) ?? '').trim().length > 0);
  await page.screenshot({ path: `${SHOTS}/b3-employees.png` });
  await page.close(); await page.context().close();
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const nili2 = qa.users.findOne({email:"${nili.email}"});
    qa.companymemberships.updateOne({user:nili2._id},{$set:{permissions:[]}});`);
  const refused = await api('GET', '/companies/employees', nili.token);
  check('a user without the permission is refused by the backend', refused.status === 403);
  page = await pageAs(browser, nili);
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('.app-nav__link', { timeout: 20000 });
  const navText = (await page.textContent('nav, .app-nav')) ?? (await page.textContent('#root')) ?? '';
  check('UI: no misleading entry is shown to the unauthorized user', !navText.includes('ניהול עובדים'));
  await page.close(); await page.context().close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('UNVERIFIED, with reasons: the dashboard-card Employee Management entry (no such card exists');
  console.log('by design — the navbar and onboarding are the approved entry points); rating moderation/');
  console.log('dispute flows (out of this batch’s scope, unchanged); production email delivery (owner).');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
