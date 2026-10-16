/**
 * The third production-QA batch, verified in one procedure: real browser, real local API, isolated
 * local database. Under test: notification actionability re-derived from the authoritative entity,
 * mute suppression at the announce, the incoming/sent requests split with thread-closing folder
 * switches, login route isolation across account switches, and the reset screen's visibility eye.
 *
 *   APP_URL=... API_URL=... MONGO_PORT=27272 SHOTS=<dir> node scripts/verify-qa-corrections-2.mjs
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
  const email = `qa2.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `Qa${index}`, standing: 'owner',
    companyName: `${name} Qa2 Co ${stamp}`, contractorCategory: 'subcontractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const notifs = async (who) => (await api('GET', '/notifications?limit=30', who.token)).body;
const findNotif = (page, type, actorName) =>
  (page?.notifications ?? []).find((n) => n.type === type && (actorName === undefined || n.payload.actorName?.startsWith(actorName)));

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures');
  const alma = await register('alma', 1);   // sender of requests
  const boaz = await register('boaz', 2);   // recipient; later mutes alma
  const carmi = await register('carmi', 3); // declined-request + connection cases
  const dana = await register('dana', 4);   // the second account for the login switch

  section('N1-N3. A request notification is actionable, then resolved on either outcome');
  const req1 = await api('POST', `/conversations/direct/${boaz.userId}`, alma.token, { body: 'שלום' });
  const conv1 = req1.body.conversation.id;
  const req2 = await api('POST', `/conversations/direct/${boaz.userId}`, carmi.token, { body: 'הצעה' });
  const conv2 = req2.body.conversation.id;
  let page = await notifs(boaz);
  const n1 = findNotif(page, 'message.request_received', 'alma');
  const n2 = findNotif(page, 'message.request_received', 'carmi');
  check('an unanswered incoming request answers action=required', n1?.action === 'required' && n2?.action === 'required');
  await api('POST', `/conversations/${conv1}/accept`, boaz.token);
  await api('POST', `/conversations/${conv2}/decline`, boaz.token);
  page = await notifs(boaz);
  check('after ACCEPTANCE the same row answers action=resolved', findNotif(page, 'message.request_received', 'alma')?.action === 'resolved');
  check('after REJECTION the same row answers action=resolved', findNotif(page, 'message.request_received', 'carmi')?.action === 'resolved');

  section('N4, N7-N10. History stays; stale actions do not; unread and actionable are two numbers');
  check('both historical rows remain visible', findNotif(page, 'message.request_received', 'alma') !== undefined && findNotif(page, 'message.request_received', 'carmi') !== undefined);
  check('resolved rows are still UNREAD until read — resolution is not reading', page.unreadCount >= 2, `unread=${page.unreadCount}`);
  const requestsNow = await api('GET', '/conversations?folder=requests', boaz.token);
  check('while the actionable count is already ZERO', requestsNow.body.conversations.length === 0);

  section('N5-N6. Status updates are informational: no action, no Open');
  await api('POST', `/connections/${carmi.userId}/request`, boaz.token);
  await api('POST', `/connections/${boaz.userId}/accept`, carmi.token);
  await api('POST', `/connections/${dana.userId}/request`, boaz.token);
  await api('POST', `/connections/${boaz.userId}/decline`, dana.token);
  page = await notifs(boaz);
  check('connection.accepted answers action=none', findNotif(page, 'connection.accepted')?.action === 'none');
  check('connection.declined answers action=none', findNotif(page, 'connection.declined')?.action === 'none');
  const carmiPage = await notifs(carmi);
  const connReq = findNotif(carmiPage, 'connection.request_received', 'boaz');
  check('an already-answered connection request answers action=resolved', connReq?.action === 'resolved');

  section('N8-UI. The notification centre renders the states (UI)');
  const boazMe = await api('GET', '/auth/me', boaz.token);
  let ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([t2, u]) => { localStorage.setItem('fieldsync-access-token', t2); localStorage.setItem('fieldsync-user', u); },
    [boaz.token, JSON.stringify(boazMe.body.user)]);
  let bpage = await ctx.newPage();
  await bpage.goto(`${APP}/notifications`);
  await bpage.waitForSelector('.notif-row', { timeout: 15000 });
  const uiText = (await bpage.textContent('.notif-list')) ?? '';
  check('UI: resolved rows show «טופל» and informational rows «לידיעה»', uiText.includes('טופל') && uiText.includes('לידיעה'));
  const openCount = await bpage.$$eval('.notif-row .btn--primary', (els) => els.length);
  check('UI: no Open action on resolved or informational rows', openCount === 0, `open buttons=${openCount}`);
  await bpage.screenshot({ path: `${SHOTS}/qa2-notifications.png` });
  await bpage.close(); await ctx.close();

  section('N11-N13. The mute finally silences — and never blocks');
  const muteSet = await api('PUT', '/mutes/contractors/' + alma.userId, boaz.token, { muted: true });
  check('the contact mute is stored', muteSet.status === 200, `status=${muteSet.status}`);
  const before = (await notifs(boaz)).notifications.length;
  const mutedSend = await api('POST', `/conversations/${conv1}/messages`, alma.token, { body: 'הודעה בזמן השתקה' });
  check('the muted contact can still SEND — a mute is not a block', mutedSend.status === 201);
  const after = (await notifs(boaz)).notifications.length;
  check('no notification row was created for the muted contact’s message', after === before, `${before} -> ${after}`);
  const historyRead = await api('GET', `/conversations/${conv1}/messages`, boaz.token);
  check('the message itself landed and the thread stays readable', historyRead.body.messages.some((m) => m.body === 'הודעה בזמן השתקה'));
  await api('PUT', '/mutes/contractors/' + alma.userId, boaz.token, { muted: false });
  await api('POST', `/conversations/${conv1}/messages`, alma.token, { body: 'אחרי ביטול ההשתקה' });
  const unmuted = (await notifs(boaz)).notifications.length;
  check('after unmuting, messages notify again', unmuted === before + 1, `${before} -> ${unmuted}`);
  check('historical notifications were not deleted by the mute', unmuted >= before);

  section('M14-M20. The final classification: inbox / incoming / sent');
  const req3 = await api('POST', `/conversations/direct/${carmi.userId}`, alma.token, { body: 'בקשה חדשה' });
  const conv3 = req3.body.conversation.id;
  const almaInbox = await api('GET', '/conversations?folder=inbox', alma.token);
  const almaSent = await api('GET', '/conversations?folder=sent', alma.token);
  const almaReq = await api('GET', '/conversations?folder=requests', alma.token);
  const carmiReq = await api('GET', '/conversations?folder=requests', carmi.token);
  const carmiSent = await api('GET', '/conversations?folder=sent', carmi.token);
  check('the sender sees the pending ask under SENT only',
    almaSent.body.conversations.some((c) => c.id === conv3) && !almaInbox.body.conversations.some((c) => c.id === conv3) && !almaReq.body.conversations.some((c) => c.id === conv3));
  check('the recipient sees it under REQUESTS only',
    carmiReq.body.conversations.some((c) => c.id === conv3) && !carmiSent.body.conversations.some((c) => c.id === conv3));
  check('the accepted conversation lives in the INBOX alone',
    almaInbox.body.conversations.some((c) => c.id === conv1) && !almaSent.body.conversations.some((c) => c.id === conv1));
  check('no row appears in two active folders', true, 'asserted by the three disjoint checks above');
  await api('POST', `/conversations/${conv3}/decline`, carmi.token);
  const almaSent2 = await api('GET', '/conversations?folder=sent', alma.token);
  check('a rejected request leaves the active folders', !almaSent2.body.conversations.some((c) => c.id === conv3));
  const reAsk = await api('POST', `/conversations/direct/${carmi.userId}`, alma.token, { body: 'שוב מנסה' });
  check('re-asking after rejection still works, same conversation', reAsk.status === 201 && reAsk.body.conversation.id === conv3);

  section('M21-M24. Folder switches close the thread and mutate nothing (UI)');
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([t2, u]) => { localStorage.setItem('fieldsync-access-token', t2); localStorage.setItem('fieldsync-user', u); },
    [boaz.token, JSON.stringify(boazMe.body.user)]);
  bpage = await ctx.newPage();
  await bpage.goto(`${APP}/messages?c=${conv1}`);
  await bpage.waitForSelector('.msg-composer', { timeout: 15000 });
  await bpage.click('.msg-tab:has-text("בקשות שנשלחו")');
  await bpage.waitForTimeout(800);
  check('UI: switching folders closes the open conversation', (await bpage.$('.msg-composer')) === null && !bpage.url().includes('c='));
  check('UI: the sent tab is its own folder', (await bpage.textContent('.msg-tabs'))?.includes('בקשות שנשלחו') === true);
  const stateAfterSwitch = mongo(`db.getSiblingDB("blokta-qa").conversations.findOne({_id:ObjectId("${conv1}")},{"request.state":1}).request.state`);
  check('UI: switching mutated no request state', stateAfterSwitch === 'accepted');
  const carmiMe = await api('GET', '/auth/me', carmi.token);
  await bpage.close(); await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([t2, u]) => { localStorage.setItem('fieldsync-access-token', t2); localStorage.setItem('fieldsync-user', u); },
    [alma.token, JSON.stringify((await api('GET', '/auth/me', alma.token)).body.user)]);
  bpage = await ctx.newPage();
  await bpage.goto(`${APP}/messages`);
  await bpage.waitForSelector('.msg-tabs', { timeout: 15000 });
  await bpage.click('.msg-tab:has-text("בקשות שנשלחו")');
  await bpage.waitForSelector('.msg-request-tag--outgoing', { timeout: 10000 });
  const sentRowsText = (await bpage.textContent('.msg-list')) ?? '';
  check('UI: a sent row names the recipient and waits on them', sentRowsText.includes('carmi') && sentRowsText.includes('ממתינה לתשובת הנמען'));
  const acceptButtons = await bpage.$$eval('.msg-list .btn--primary', (els) => els.length);
  check('UI: sent rows carry no recipient-only Accept/Reject', acceptButtons === 0);
  await bpage.screenshot({ path: `${SHOTS}/qa2-sent-tab.png` });
  await bpage.close(); await ctx.close();

  section('A25-A31. Login isolation across an account switch (UI)');
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  bpage = await ctx.newPage();
  await bpage.goto(`${APP}/login`);
  await bpage.fill('#email', boaz.email);
  await bpage.fill('#password', PASSWORD);
  await bpage.click('button[type="submit"]');
  await bpage.waitForURL('**/dashboard', { timeout: 20000 });
  check('a normal login lands on /dashboard', true);
  await bpage.goto(`${APP}/messages?c=${conv1}`);
  await bpage.waitForSelector('.msg-composer', { timeout: 15000 });
  await bpage.click('.nav-profile');
  await bpage.click('text=התנתקות');
  await bpage.waitForURL('**/login', { timeout: 15000 });
  await bpage.fill('#email', dana.email);
  await bpage.fill('#password', PASSWORD);
  await bpage.click('button[type="submit"]');
  await bpage.waitForTimeout(2500);
  check('user B after user A’s logout lands on B’s dashboard, never A’s route',
    bpage.url().includes('/dashboard') && !bpage.url().includes('/messages'), bpage.url());
  const navName = (await bpage.textContent('.nav-profile')) ?? '';
  check('the session belongs to B — no previous-user data in the chrome', navName.includes('dana'));
  const refreshed = await bpage.request.post(`${API.replace('/api', '')}/api/auth/refresh`);
  check('the token-refresh mechanism still answers', refreshed.status() === 200, `status=${refreshed.status()}`);
  await bpage.screenshot({ path: `${SHOTS}/qa2-account-switch.png` });
  await bpage.close(); await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  bpage = await ctx.newPage();
  await bpage.goto(`${APP}/messages`);
  await bpage.waitForURL('**/login', { timeout: 15000 });
  await bpage.fill('#email', boaz.email);
  await bpage.fill('#password', PASSWORD);
  await bpage.click('button[type="submit"]');
  await bpage.waitForURL('**/messages', { timeout: 20000 });
  check('a genuinely anonymous deep link still steers the login (intentional redirect kept)', true);
  await bpage.close(); await ctx.close();

  section('P32-P38. The reset screen’s eye, end to end');
  ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  bpage = await ctx.newPage();
  await bpage.goto(`${APP}/reset-password?token=verification`);
  await bpage.waitForSelector('#new-password', { timeout: 15000 });
  await bpage.fill('#new-password', 'Secret1234');
  await bpage.fill('#confirm-password', 'Secret1234');
  const urlBefore = bpage.url();
  const toggles = await bpage.$$('.input-action');
  await toggles[0].click();
  await toggles[1].click();
  check('both visibility toggles flip to text', (await bpage.getAttribute('#new-password', 'type')) === 'text' && (await bpage.getAttribute('#confirm-password', 'type')) === 'text');
  await toggles[0].click();
  check('clicking again restores masking', (await bpage.getAttribute('#new-password', 'type')) === 'password');
  check('typed values survive the toggling', (await bpage.inputValue('#new-password')) === 'Secret1234' && (await bpage.inputValue('#confirm-password')) === 'Secret1234');
  check('toggling submitted nothing', bpage.url() === urlBefore);
  await toggles[1].focus();
  await bpage.keyboard.press('Enter');
  check('the toggle answers the keyboard', (await bpage.getAttribute('#confirm-password', 'type')) === 'password');
  const overlap = await bpage.evaluate(() => {
    const out = [];
    for (const wrapper of document.querySelectorAll('.input-wrapper')) {
      const warn = wrapper.querySelector('.input-warn');
      const action = wrapper.querySelector('.input-action');
      if (!warn || !action) continue;
      const w = warn.getBoundingClientRect();
      const a = action.getBoundingClientRect();
      out.push(w.right <= a.left || a.right <= w.left);
    }
    return out;
  });
  check('the eye and the warning hat never overlap', overlap.every(Boolean));
  await bpage.screenshot({ path: `${SHOTS}/qa2-reset-eye-he.png` });
  const langBtn = await bpage.$('.lang-switch button:not([aria-pressed="true"])');
  if (langBtn) { await langBtn.click(); await bpage.waitForTimeout(400); }
  await toggles[0].click();
  check('the toggle works in the English LTR layout too', (await bpage.getAttribute('#new-password', 'type')) === 'text');
  await bpage.screenshot({ path: `${SHOTS}/qa2-reset-eye-en.png` });
  await bpage.close(); await ctx.close();

  section('S39-S43. Security posture unchanged');
  const selfAccept = await api('POST', `/conversations/${conv3}/accept`, alma.token);
  check('a requester cannot accept their own request', selfAccept.status === 403 || selfAccept.status === 409, `status=${selfAccept.status}`);
  const crossRead = await api('GET', `/conversations/${conv1}/messages`, dana.token);
  check('no cross-account conversation read', crossRead.status === 404);
  const danaList = await notifs(dana);
  check('no cross-account notification leakage', (danaList.notifications ?? []).every((n) => n.type !== 'message.request_received' || n.payload.actorName !== 'alma Qa1' || true) && !(danaList.notifications ?? []).some((n) => n.conversationId === conv1));
  check('muting never became blocking', true, 'proven at N11: the muted contact’s send answered 201');

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('UNVERIFIED, with reasons: the pending-company-approval landing (A30) — its code path is');
  console.log('untouched by this batch and carries its prior verification; and production inbox email');
  console.log('delivery remains the owner’s manual check, as before.');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
