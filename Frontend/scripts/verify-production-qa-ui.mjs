/**
 * The production-QA corrections batch, verified end to end in one procedure: real browser, real
 * local API, real local database. Covers request classification and answering, the sent
 * confirmation, per-viewer hiding vs sender deletion, notification content / navigation / badge,
 * connection notifications, the network management link, the travel editor's new home, account
 * closure (blocked and allowed), the password-reset flow in log mode, and the login warn icons.
 *
 *   APP_URL=http://localhost:5411 API_URL=http://localhost:4545/api \
 *   BACKEND_LOG=<path> SHOTS=<dir> node scripts/verify-production-qa-ui.mjs
 */
import './support/developmentGuard.mjs';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const BACKEND_LOG = process.env.BACKEND_LOG ?? '';
const TOKEN_KEY = 'fieldsync-access-token';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(78)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

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
  const email = `qa.${name}.${stamp}@example.com`;
  const { status } = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `QA${index}`, standing: 'owner',
    companyName: `${name} QA Co ${stamp}`, contractorCategory: 'subcontractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (status !== 201) throw new Error(`register ${name}: ${status}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${name}: ${login.status}`);
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const pageAs = async (browser, token) => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  if (token) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [TOKEN_KEY, token]);
  const page = await context.newPage();
  page.consoleErrors = [];
  page.on('pageerror', (e) => page.consoleErrors.push(String(e)));
  return page;
};

const notBlank = async (page, label) => {
  const text = (await page.textContent('#root')) ?? '';
  check(`${label}: screen is not blank`, text.trim().length > 0);
  check(`${label}: no page errors`, page.consoleErrors.length === 0, page.consoleErrors[0] ?? '');
};

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures through the real register + login endpoints');
  const orli = await register('orli', 1);     // requester
  const barak = await register('barak', 2);   // recipient
  const carmel = await register('carmel', 3); // decline + rejoin + active-work cases

  section('1. First contact opens a request; the sender gets one clear confirmation');
  const started = await api('POST', `/conversations/direct/${barak.userId}`, orli.token, { body: 'שלום, אפשר לדבר?' });
  check('API: first message answers 201 with a pending request', started.status === 201 && started.body.conversation.requestState === 'pending');
  const convId = started.body.conversation.id;
  const again = await api('POST', `/conversations/direct/${barak.userId}`, orli.token, { body: 'עוד אחת' });
  check('API: a second ask while pending is refused as awaiting', again.status === 409 && again.body.code === 'MESSAGE_REQUEST_AWAITING_RESPONSE');

  section('2. Classification: pending in Requests alone, inbox only accepted, both sides');
  const orliInbox = await api('GET', '/conversations?folder=inbox', orli.token);
  const orliReq = await api('GET', '/conversations?folder=requests', orli.token);
  check('sender inbox does NOT list the pending request', !orliInbox.body.conversations.some((c) => c.id === convId));
  const orliRow = orliReq.body.conversations.find((c) => c.id === convId);
  check('sender Requests lists it as outgoing (not awaiting them)', orliRow !== undefined && orliRow.awaitingMyAnswer === false);
  const barakReq = await api('GET', '/conversations?folder=requests', barak.token);
  const barakRow = barakReq.body.conversations.find((c) => c.id === convId);
  check('recipient Requests lists it as incoming (awaiting them)', barakRow !== undefined && barakRow.awaitingMyAnswer === true);
  const barakInbox = await api('GET', '/conversations?folder=inbox', barak.token);
  check('recipient inbox does NOT list it', !barakInbox.body.conversations.some((c) => c.id === convId));

  section('3. The thread carries its own request state, and the recipient answers in it (UI)');
  let page = await pageAs(browser, barak.token);
  await page.goto(`${APP}/messages?c=${convId}`);
  await page.waitForSelector('.msg-request-answer', { timeout: 10000 });
  check('UI: open thread shows the answer bar instead of a composer', (await page.$('.msg-composer')) === null);
  check('UI: folder auto-switched to Requests', await page.$eval('.msg-tab--active', (el) => el.textContent?.includes('בקשות')));
  const tag = await page.$('.msg-request-tag--incoming');
  check('UI: the incoming row carries the emphasized tag', tag !== null);
  const count = await page.$('.msg-tab__count');
  check('UI: the Requests tab carries the incoming count', count !== null, count ? await count.textContent() : '');
  await page.screenshot({ path: `${SHOTS}/qa-requests-incoming.png` });
  await page.click('.msg-request-answer .btn--primary');
  await page.waitForSelector('.msg-composer', { timeout: 10000 });
  check('UI: accepting opens the composer', true);
  await notBlank(page, 'messages after accept');
  await page.close();
  const barakInbox2 = await api('GET', '/conversations?folder=inbox', barak.token);
  check('API: accepted conversation moved to the inbox', barakInbox2.body.conversations.some((c) => c.id === convId));
  const barakReq2 = await api('GET', '/conversations?folder=requests', barak.token);
  check('API: and left Requests', !barakReq2.body.conversations.some((c) => c.id === convId));

  section('4. Decline removes it everywhere; writing again re-asks (the connections precedent)');
  const toCarmel = await api('POST', `/conversations/direct/${carmel.userId}`, orli.token, { body: 'הצעה ראשונה' });
  const declineId = toCarmel.body.conversation.id;
  await api('POST', `/conversations/${declineId}/decline`, carmel.token);
  const carmelReq = await api('GET', '/conversations?folder=requests', carmel.token);
  const carmelInbox = await api('GET', '/conversations?folder=inbox', carmel.token);
  check('declined: out of the recipient Requests', !carmelReq.body.conversations.some((c) => c.id === declineId));
  check('declined: not in the recipient inbox', !carmelInbox.body.conversations.some((c) => c.id === declineId));
  const orliAfterDecline = await api('GET', '/conversations?folder=inbox', orli.token);
  check('declined: not in the sender inbox either', !orliAfterDecline.body.conversations.some((c) => c.id === declineId));
  const blockedSend = await api('POST', `/conversations/${declineId}/messages`, orli.token, { body: 'עוקף?' });
  check('a direct send into a declined thread is refused', blockedSend.status === 409 && blockedSend.body.code === 'MESSAGE_REQUEST_NOT_PENDING');
  const reAsk = await api('POST', `/conversations/direct/${carmel.userId}`, orli.token, { body: 'מנסה שוב' });
  check('re-asking re-opens the SAME conversation as pending', reAsk.status === 201 && reAsk.body.conversation.id === declineId && reAsk.body.conversation.requestState === 'pending');
  const carmelReq2 = await api('GET', '/conversations?folder=requests', carmel.token);
  check('and it is back in the recipient Requests', carmelReq2.body.conversations.some((c) => c.id === declineId && c.awaitingMyAnswer));
  // The owner-approved after-rejection decision, pinned point by point: the re-opened request
  // lives in Requests alone, the gate still holds, and only an explicit answer opens the thread.
  const orliInboxReAsk = await api('GET', '/conversations?folder=inbox', orli.token);
  const carmelInboxReAsk = await api('GET', '/conversations?folder=inbox', carmel.token);
  check('the re-opened request sits in NEITHER inbox', !orliInboxReAsk.body.conversations.some((c) => c.id === declineId) && !carmelInboxReAsk.body.conversations.some((c) => c.id === declineId));
  const reAskFollowUp = await api('POST', `/conversations/${declineId}/messages`, orli.token, { body: 'עוד לפני אישור?' });
  check('the requester still cannot write past the re-opened gate', reAskFollowUp.status === 409 && reAskFollowUp.body.code === 'MESSAGE_REQUEST_AWAITING_RESPONSE');
  const reAskThird = await api('POST', `/conversations/direct/${carmel.userId}`, orli.token, { body: 'כפילות?' });
  check('a third ask while re-pending is refused — no duplicate requests', reAskThird.status === 409 && reAskThird.body.code === 'MESSAGE_REQUEST_AWAITING_RESPONSE');

  section('5. Sender deletion is global; hiding another person\'s message is viewer-only');
  const m1 = await api('POST', `/conversations/${convId}/messages`, orli.token, { body: 'הודעה של אורלי' });
  const m2 = await api('POST', `/conversations/${convId}/messages`, barak.token, { body: 'הודעה של ברק' });
  await api('POST', `/conversations/${convId}/messages/${m2.body.message.id}/hide`, orli.token);
  const orliHist = await api('GET', `/conversations/${convId}/messages`, orli.token);
  const barakHist = await api('GET', `/conversations/${convId}/messages`, barak.token);
  check('hidden-for-me vanished from the hider history', !orliHist.body.messages.some((m) => m.id === m2.body.message.id));
  const barakCopy = barakHist.body.messages.find((m) => m.id === m2.body.message.id);
  check('and the author still sees it, body intact', barakCopy !== undefined && barakCopy.body === 'הודעה של ברק');
  const ownHide = await api('POST', `/conversations/${convId}/messages/${m1.body.message.id}/hide`, orli.token);
  check('hiding one\'s OWN message is refused (deletion is the path)', ownHide.status === 409 && ownHide.body.code === 'OWN_MESSAGE_NOT_HIDEABLE');
  await api('DELETE', `/conversations/${convId}/messages/${m1.body.message.id}`, orli.token);
  const barakHist2 = await api('GET', `/conversations/${convId}/messages`, barak.token);
  const deleted = barakHist2.body.messages.find((m) => m.id === m1.body.message.id);
  check('author deletion shows every reader the placeholder', deleted !== undefined && deleted.deleted === true && deleted.body === null);

  section('6. Notifications: titled, attributed, and they navigate to the thing itself (UI)');
  page = await pageAs(browser, carmel.token);
  await page.goto(`${APP}/notifications`);
  await page.waitForSelector('.notif-row', { timeout: 10000 });
  const rowText = await page.$eval('.notif-list', (el) => el.textContent ?? '');
  check('UI: the request notification carries its title', rowText.includes('בקשת התכתבות חדשה'));
  check('UI: and the actor name', rowText.includes('orli'));
  const badgeBefore = await page.$eval('.nav-icon-btn__badge', (el) => el.textContent ?? '').catch(() => '');
  check('UI: the navbar badge styled and showing a count', badgeBefore !== '' && Number(badgeBefore) > 0, `badge=${badgeBefore}`);
  await page.screenshot({ path: `${SHOTS}/qa-notifications.png` });
  const openLink = await page.$('.notif-row .btn--primary');
  check('UI: the notification has an Open destination', openLink !== null);
  await openLink.click();
  await page.waitForSelector('.msg-request-answer', { timeout: 10000 });
  check('UI: Open lands inside the pending thread with Accept/Decline waiting', page.url().includes('/messages?c='));
  await notBlank(page, 'notification destination');
  await page.click('.msg-request-answer .btn--primary');
  await page.waitForSelector('.msg-composer', { timeout: 10000 });
  check('UI: the recipient explicitly accepts the RE-ASKED request and the thread opens', true);
  const carmelInboxAccepted = await api('GET', '/conversations?folder=inbox', carmel.token);
  check('API: the re-asked, now accepted conversation reached the inbox', carmelInboxAccepted.body.conversations.some((c) => c.id === declineId));
  await page.goto(`${APP}/notifications`);
  await page.waitForSelector('.notif-row', { timeout: 10000 });
  const markAll = await page.$$('.notif-toolbar .btn');
  if (markAll.length > 0) await markAll[markAll.length - 1].click();
  await page.waitForTimeout(800);
  const badgeAfter = await page.$('.nav-icon-btn__badge');
  check('UI: reading everything clears the navbar badge without a remount', badgeAfter === null);
  await page.close();

  section('7. Connection requests notify both directions and land in My Network');
  await api('POST', `/connections/${barak.userId}/request`, carmel.token);
  page = await pageAs(browser, barak.token);
  await page.goto(`${APP}/notifications`);
  await page.waitForSelector('.notif-row', { timeout: 10000 });
  const connText = await page.$eval('.notif-list', (el) => el.textContent ?? '');
  check('UI: recipient sees the connection-request notification', connText.includes('בקשת קשר חדשה ברשת המקצועית'));
  check('UI: with the requester name', connText.includes('carmel'));
  const connOpen = await page.$$('.notif-row');
  let openedNetwork = false;
  for (const row of connOpen) {
    const text = (await row.textContent()) ?? '';
    if (text.includes('בקשת קשר')) {
      const link = await row.$('.btn--primary');
      if (link) { await link.click(); openedNetwork = true; }
      break;
    }
  }
  if (openedNetwork) {
    await page.waitForURL('**/network?tab=incoming', { timeout: 10000 });
    check('UI: it opens My Network on the incoming tab', true);
    await notBlank(page, 'network incoming');
  } else {
    check('UI: it opens My Network on the incoming tab', false, 'row not found');
  }
  await page.close();
  await api('POST', `/connections/${carmel.userId}/accept`, barak.token);
  const carmelNotifs = await api('GET', '/notifications?limit=20', carmel.token);
  check('API: the requester is notified of the acceptance', carmelNotifs.body.notifications.some((n) => n.type === 'connection.accepted'));

  section('8. The Browse card management control is a real link');
  await api('POST', `/connections/${orli.userId}/request`, carmel.token);
  page = await pageAs(browser, carmel.token);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 }).catch(() => {});
  const manage = await page.$('a.btn:has-text("ניהול ברשת שלי"), a:has-text("ניהול ברשת שלי")');
  if (manage !== null) {
    await manage.click();
    await page.waitForURL('**/network?tab=*', { timeout: 10000 });
    check('UI: the card control navigates to the matching network tab', true, page.url());
  } else {
    check('UI: the card control navigates to the matching network tab', false, 'no pending-relationship card listed in Browse for this fixture');
  }
  await page.close();

  section('9. Travel-area editing lives in the profile editor, not in search');
  page = await pageAs(browser, orli.token);
  await page.goto(`${APP}/browse`);
  await page.waitForTimeout(2500);
  const browseLauncher = await page.$(`text=עריכת אזורי הנסיעה שלי`);
  check('UI: professional search no longer carries the editor', browseLauncher === null);
  await page.goto(`${APP}/profile/edit`);
  await page.waitForSelector('text=עריכת אזורי הנסיעה שלי', { timeout: 15000 });
  await page.click('text=עריכת אזורי הנסיעה שלי');
  await page.waitForSelector('.travel-dialog', { timeout: 10000 });
  check('UI: the profile editor opens the travel dialog, styled', await page.$eval('.travel-dialog', (el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await page.screenshot({ path: `${SHOTS}/qa-travel-in-profile.png` });
  await notBlank(page, 'profile edit travel');
  await page.close();

  section('10. Login warn icons, rendered and measured (HE)');
  page = await pageAs(browser, null);
  await page.goto(`${APP}/login`);
  await page.waitForSelector('#email');
  await page.click('#email'); await page.click('#password'); await page.click('.form-title');
  await page.waitForTimeout(400);
  const icons = await page.evaluate(() => {
    const out = [];
    for (const wrapper of document.querySelectorAll('.input-wrapper')) {
      const input = wrapper.querySelector('.form-input');
      const warn = wrapper.querySelector('.input-warn');
      if (!input || !warn) continue;
      const ir = input.getBoundingClientRect();
      const wr = warn.getBoundingClientRect();
      const st = getComputedStyle(input);
      const textEnd = ir.right - parseFloat(st.paddingRight);
      const textStart = ir.left + parseFloat(st.paddingLeft);
      out.push({ id: input.id, overlaps: wr.left < textEnd && wr.right > textStart });
    }
    return out;
  });
  for (const icon of icons) check(`warn icon clear of the ${icon.id} text area`, !icon.overlaps);
  await page.screenshot({ path: `${SHOTS}/qa-login-icons.png` });
  await page.close();

  section('11. Password reset, end to end (mailer in log mode locally)');
  page = await pageAs(browser, null);
  await page.goto(`${APP}/forgot-password`);
  await page.fill('#email', barak.email);
  await page.click('button[type="submit"], .btn--primary');
  await page.waitForTimeout(1500);
  const sentText = (await page.textContent('#root')) ?? '';
  check('UI: the request answers with the confirmation step', sentText.includes('נשלח') || sentText.includes('קישור'));
  let resetUrl = null;
  if (BACKEND_LOG) {
    const log = readFileSync(BACKEND_LOG, 'utf8');
    const matches = [...log.matchAll(/http:\/\/localhost:5411\/reset-password\?token=([A-Za-z0-9._~%-]+)/g)];
    resetUrl = matches.at(-1)?.[0] ?? null;
  }
  check('backend minted and logged the reset link (log mode)', resetUrl !== null);
  if (resetUrl !== null) {
    await page.goto(resetUrl);
    await page.waitForSelector('#password, input[type="password"]', { timeout: 10000 });
    const boxes = await page.$$('input[type="password"]');
    for (const box of boxes) await box.fill('EvenBetter43!');
    await page.click('button[type="submit"], .btn--primary');
    await page.waitForTimeout(1500);
    const oldLogin = await api('POST', '/auth/login', undefined, { email: barak.email, password: PASSWORD });
    const newLogin = await api('POST', '/auth/login', undefined, { email: barak.email, password: 'EvenBetter43!' });
    check('the old password is dead and the new one works', oldLogin.status !== 200 && newLogin.status === 200);
    barak.token = newLogin.body.accessToken;
  }
  await page.close();

  section('12. Account closure: each gate refuses with its own reason, then a clean close');
  // carmel gets an unfinished responsibility: the gate must refuse with ACTIVE_WORK
  const { execSync } = await import('node:child_process');
  execSync(`mongosh --port 27272 --quiet --eval 'db.getSiblingDB("blokta-qa").tasks.insertOne({title:"qa-open-work", assignee: ObjectId("${carmel.userId}"), createdAt:new Date(), updatedAt:new Date()})'`);
  const carmelBlocked = await api('DELETE', '/users/me', carmel.token);
  check('open work refuses the closure', carmelBlocked.status === 409 && carmelBlocked.body.code === 'ACCOUNT_HAS_ACTIVE_WORK');
  execSync(`mongosh --port 27272 --quiet --eval 'db.getSiblingDB("blokta-qa").tasks.updateMany({title:"qa-open-work"},{$set:{completedAt:new Date()}})'`);
  // barak's company gains an active employee: the owner must be refused while anyone is stranded
  execSync(`mongosh --port 27272 --quiet --eval '
    const qa=db.getSiblingDB("blokta-qa");
    const barak=qa.users.findOne({email:"${barak.email}"});
    const carmel=qa.users.findOne({email:"${carmel.email}"});
    const company=qa.companymemberships.findOne({user:barak._id}).company;
    qa.companymemberships.updateOne({user:carmel._id},{$set:{standing:"employee",company:company}});'`);
  const barakBlocked = await api('DELETE', '/users/me', barak.token);
  check('an owner with current members is refused', barakBlocked.status === 409 && barakBlocked.body.code === 'ACCOUNT_OWNS_COMPANY');
  const carmelEmployee = await api('DELETE', '/users/me', carmel.token);
  check('an employee with a current membership is refused', carmelEmployee.status === 409 && carmelEmployee.body.code === 'ACCOUNT_IN_COMPANY');

  section('13. The allowed closure, through the real Settings screen (UI)');
  page = await pageAs(browser, orli.token);
  await page.goto(`${APP}/settings`);
  await page.waitForSelector('text=בקשת סגירת חשבון', { timeout: 15000 });
  await page.click('text=בקשת סגירת חשבון');
  await page.waitForSelector('.settings-confirm', { timeout: 5000 });
  const confirmText = (await page.textContent('.settings-confirm')) ?? '';
  check('UI: the confirmation states the 60-day window and what survives', confirmText.includes('60') && confirmText.includes('נשמרת'));
  await page.screenshot({ path: `${SHOTS}/qa-closure-confirm.png` });
  await page.click('.settings-confirm .btn--primary');
  await page.waitForURL('**/login', { timeout: 15000 });
  check('UI: a successful closure signs out to the login screen', true);
  await page.close();
  const deadToken = await api('GET', '/users/me', orli.token);
  check('the closed account\'s live session is refused', deadToken.status === 401);
  const deadLogin = await api('POST', '/auth/login', undefined, { email: orli.email, password: PASSWORD });
  check('and a fresh login is refused like a wrong password', deadLogin.status === 401);
  const barakHist3 = await api('GET', `/conversations/${convId}/messages`, barak.token);
  check('shared history survives the closure untouched', barakHist3.status === 200 && barakHist3.body.messages.length > 0);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
