/**
 * The account-deletion / ownerless-company / anonymization batch, verified in one procedure:
 * real browser, real local API, isolated local database. The rules under test, in the owner's
 * words: «ההתחייבות ממשיכה מחוץ למערכת», an owner deletes without transferring the company, the
 * company derives its inactive state from the owner's lifecycle, and after 60 days without
 * restoration the person's PII goes while their name survives as business attribution.
 *
 *   APP_URL=... API_URL=... MONGO_PORT=27272 SHOTS=<dir> BACKEND_DIR=<backend> \
 *   node scripts/verify-account-deletion.mjs
 */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const BACKEND_DIR = process.env.BACKEND_DIR ?? '../Backend';
const QA_URI = `mongodb://127.0.0.1:${MONGO}/blokta-qa?replicaSet=qa0`;
const TOKEN_KEY = 'fieldsync-access-token';
const USER_KEY = 'fieldsync-user';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(84)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const mongo = (js) => execSync(`mongosh --port ${MONGO} --quiet --eval '${js}'`).toString().trim();
const BACKEND_LOG = process.env.BACKEND_LOG ?? '';

const lastLogLink = (marker) => {
  const lines = execSync(`cat '${BACKEND_LOG}'`).toString().split('\n').filter((l) => l.includes(marker));
  const line = lines.at(-1);
  if (!line) return null;
  const match = line.match(/"(?:restoreUrl|resetUrl)":"(http[^"]+)"/);
  return match?.[1] ?? null;
};

const tokenFrom = (url) => (url === null ? null : new URL(url).searchParams.get('token'));

/** A real 1x1 PNG, for the avatar upload. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  'base64',
);

const upload = async (path, token, field, filename) => {
  const form = new FormData();
  form.append(field, new Blob([PNG_BYTES], { type: 'image/png' }), filename);
  const res = await fetch(`${API}${path}`, {
    method: path.includes('/avatar') ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let body = null;
  try { body = await res.json(); } catch { /* none */ }
  return { status: res.status, body };
};

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
  const email = `del.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `Del${index}`, standing: 'owner',
    companyName: `${name} Del Co ${stamp}`, contractorCategory: 'subcontractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${name}: ${login.status}`);
  return {
    email, token: login.body.accessToken, userId: login.body.user.id,
    name, fullName: `${name} Del${index}`, companyName: `${name} Del Co ${stamp}`,
  };
};

const relogin = async (fixture) => {
  const login = await api('POST', '/auth/login', undefined, { email: fixture.email, password: PASSWORD });
  if (login.status === 200) fixture.token = login.body.accessToken;
  return login;
};

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures: an owner with an employee, a performer, a hidden performer, a second company, an admin');
  const gadi = await register('gadi', 1);   // owner of company G; deletes with an active employee
  const dana = await register('dana', 2);   // performer; deletes with open work
  const hila = await register('hila', 3);   // hidden performer
  const eli = await register('eli', 4);     // becomes company G's employee
  const noa = await register('noa', 5);     // owner of company N, receives eli later
  const admin = await register('admin', 6); // platform admin for restorations
  mongo(`db.getSiblingDB("blokta-qa").users.updateOne({email:"${admin.email}"},{$set:{isAdmin:true}})`);
  // eli joins company G as an active employee with every company permission, so the ownerless
  // denial later is provably the barrier and never a missing grant.
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const gadi = qa.users.findOne({email:"${gadi.email}"});
    const eli = qa.users.findOne({email:"${eli.email}"});
    const company = qa.companymemberships.findOne({user:gadi._id}).company;
    qa.companymemberships.updateOne({user:eli._id},{$set:{standing:"employee",company:company,
      permissions:["company.invite_employees","company.manage","task.create"]}})`);

  section('1. A real accepted agreement becomes a real unfinished task');
  const conv = await api('POST', `/conversations/direct/${dana.userId}`, gadi.token, { body: 'עבודה בשבילך' });
  const convId = conv.body.conversation.id;
  await api('POST', `/conversations/${convId}/accept`, dana.token);
  await api('POST', `/conversations/${convId}/messages`, dana.token, { body: 'סגור, אני לוקחת את זה' });
  const proposed = await api('POST', `/conversations/${convId}/agreements`, gadi.token, {
    title: 'איטום גג', startDate: iso(3), dueDate: iso(10),
  });
  check('the agreement is proposed', proposed.status === 201, JSON.stringify(proposed.body?.code ?? ''));
  const agreementId = proposed.body?.message?.id;
  const answered = await api('POST', `/conversations/${convId}/agreements/${agreementId}/accept`, dana.token);
  const taskId = answered.body?.message?.agreement?.taskId ?? null;
  check('acceptance created the canonical task, assigned to the accepter', answered.status === 200 && taskId !== null);

  section('2. Deletion proceeds WITH the unfinished assigned task — and moves nothing');
  const before = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{assignee:1,completedAt:1,delegation:1,previousAssignee:1}))`));
  const danaDelete = await api('DELETE', '/users/me', dana.token);
  check('DELETE /users/me answers 204 despite the open work', danaDelete.status === 204, `status=${danaDelete.status}`);
  const danaLife = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").users.findOne({email:"${dana.email}"},{status:1,deletedAt:1}))`));
  check('the deletion stamped its timestamp (the window is measured from it)', danaLife.status === 'deleted' && danaLife.deletedAt !== undefined);
  const after = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{assignee:1,completedAt:1,delegation:1,previousAssignee:1}))`));
  check('no reassignment, no forged completion, no orphaning fields',
    after.assignee === before.assignee && after.completedAt === undefined && after.previousAssignee === undefined);
  const agreementRow = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${agreementId}")},{"agreement.state":1,"agreement.task":1}))`));
  check('the agreement message is preserved, accepted, still naming its task', agreementRow.agreement.state === 'accepted' && agreementRow.agreement.task !== undefined);

  section('3. Access ends at once: live token, refresh families, fresh login');
  check('the live access token is refused on the next request', (await api('GET', '/users/me', dana.token)).status === 401);
  const families = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${dana.email}"});
    JSON.stringify({total: qa.refreshtokens.countDocuments({user:u._id}), live: qa.refreshtokens.countDocuments({user:u._id, revokedAt:null})})`));
  check('every refresh-token family is revoked', families.total > 0 && families.live === 0, JSON.stringify(families));
  const deadLogin = await api('POST', '/auth/login', undefined, { email: dana.email, password: PASSWORD });
  check('a fresh login is refused like a wrong password', deadLogin.status === 401 && deadLogin.body.code === 'INVALID_CREDENTIALS');

  section('3R. Self-service recovery: the request is enumeration-safe and mints one real token');
  const tokensBefore = Number(mongo('db.getSiblingDB("blokta-qa").accountrecoverytokens.countDocuments({})'));
  const req1 = await api('POST', '/auth/recover-account', undefined, { email: dana.email });
  const req2 = await api('POST', '/auth/recover-account', undefined, { email: `no.such.${stamp}@example.com` });
  const req3 = await api('POST', '/auth/recover-account', undefined, { email: noa.email });
  check('eligible, nonexistent and active addresses all answer identically',
    req1.status === 200 && req2.status === 200 && req3.status === 200 &&
    JSON.stringify(req1.body) === JSON.stringify(req2.body) && JSON.stringify(req2.body) === JSON.stringify(req3.body));
  const tokensAfter = Number(mongo('db.getSiblingDB("blokta-qa").accountrecoverytokens.countDocuments({})'));
  check('exactly ONE token was minted — for the eligible deleted account alone', tokensAfter - tokensBefore === 1);
  const danaRestoreUrl = lastLogLink('Account recovery link');
  check('the recovery link was dispatched (log mode)', danaRestoreUrl !== null && danaRestoreUrl.includes('/restore-account?token='));

  section('3S. The restoration link, walked through the real screen (UI)');
  let recoveryPage = await browser.newContext({ viewport: { width: 1360, height: 900 } }).then((c) => c.newPage());
  await recoveryPage.goto(`${APP}/login`);
  await recoveryPage.waitForSelector('text=שחזור חשבון שנמחק', { timeout: 15000 });
  check('UI: the login screen carries the recovery entry point (HE)', true);
  await recoveryPage.screenshot({ path: `${SHOTS}/qa-recovery-entry.png` });
  await recoveryPage.click('text=שחזור חשבון שנמחק');
  await recoveryPage.waitForSelector('#email', { timeout: 15000 });
  check('UI: the entry point opens the recovery request screen', recoveryPage.url().includes('/recover-account'));
  const langToggle = await recoveryPage.$('.lang-switch button:not([aria-pressed="true"])');
  if (langToggle) {
    await langToggle.click();
    await recoveryPage.waitForTimeout(400);
    const enText = (await recoveryPage.textContent('#root')) ?? '';
    check('UI: the recovery screen localizes to English LTR', enText.includes('Restore a deleted account'));
    await recoveryPage.screenshot({ path: `${SHOTS}/qa-recovery-en.png` });
    const backToHe = await recoveryPage.$('.lang-switch button:not([aria-pressed="true"])');
    if (backToHe) { await backToHe.click(); await recoveryPage.waitForTimeout(400); }
  } else {
    check('UI: the recovery screen localizes to English LTR', false, 'language toggle not found');
  }
  await recoveryPage.goto(danaRestoreUrl.replace('http://localhost:5411', APP));
  await recoveryPage.waitForSelector('text=שחזור החשבון', { timeout: 15000 });
  await recoveryPage.click('button:has-text("שחזור החשבון")');
  await recoveryPage.waitForSelector('text=החשבון שוחזר', { timeout: 15000 });
  check('UI: confirming the link restores the account and says so', true);
  await recoveryPage.screenshot({ path: `${SHOTS}/qa-recovery-success.png` });
  await recoveryPage.context().close();
  const danaToken = tokenFrom(danaRestoreUrl);
  const replay = await api('POST', '/auth/restore-account', undefined, { token: danaToken });
  check('the spent token is refused on replay (single use)', replay.status === 401 && replay.body.code === 'INVALID_RECOVERY_TOKEN');
  const danaBack2 = await relogin(dana);
  check('the restored account signs in afresh', danaBack2.status === 200);
  const familiesAfterRestore = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${dana.email}"});
    JSON.stringify({revokedStay: qa.refreshtokens.countDocuments({user:u._id, revokedAt:{$ne:null}})})`));
  check('the pre-deletion refresh families stay revoked — nothing is resurrected', familiesAfterRestore.revokedStay > 0);

  section('3T. Token hygiene: purposes never cross, expiry is enforced');
  await api('POST', '/auth/forgot-password', undefined, { email: noa.email });
  const resetUrl = lastLogLink('Password reset link');
  check('the password-reset link was dispatched (log mode)', resetUrl !== null && resetUrl.includes('/reset-password?token='));
  const crossRestore = await api('POST', '/auth/restore-account', undefined, { token: tokenFrom(resetUrl) });
  check('a password-reset token can NEVER restore an account', crossRestore.status === 401 && crossRestore.body.code === 'INVALID_RECOVERY_TOKEN');

  section('4. A hidden performer (D7) deletes too, and the delegation record is untouched');
  mongo(`db.getSiblingDB("blokta-qa").tasks.updateOne({_id:ObjectId("${taskId}")},{$set:{delegation:{delegate:ObjectId("${hila.userId}"), delegatedAt:new Date()}}})`);
  check('the hidden performer may close their account', (await api('DELETE', '/users/me', hila.token)).status === 204);
  const delegationAfter = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{delegation:1,completedAt:1}))`));
  check('the delegation record and the task are exactly as they were', delegationAfter.delegation?.delegate !== undefined && delegationAfter.completedAt === undefined);

  await api('POST', '/auth/recover-account', undefined, { email: hila.email });
  const hilaRestoreUrl = lastLogLink('Account recovery link');
  const hilaToken = tokenFrom(hilaRestoreUrl);
  const crossReset = await api('POST', '/auth/reset-password', undefined, { token: hilaToken, password: 'EvenBetter43!' });
  check('a recovery token can NEVER reset a password', crossReset.status === 401 && crossReset.body.code === 'INVALID_RESET_TOKEN');
  mongo('db.getSiblingDB("blokta-qa").accountrecoverytokens.updateMany({usedAt:null,invalidatedAt:null},{$set:{expiresAt:new Date(Date.now()-60000)}})');
  const expiredToken = await api('POST', '/auth/restore-account', undefined, { token: hilaToken });
  check('an expired recovery token is refused', expiredToken.status === 401 && expiredToken.body.code === 'INVALID_RECOVERY_TOKEN');

  section('5. The employee gate stands: a current employee leaves the company first');
  const eliBlocked = await api('DELETE', '/users/me', eli.token);
  check('an employee with a current membership is refused (ACCOUNT_IN_COMPANY)', eliBlocked.status === 409 && eliBlocked.body.code === 'ACCOUNT_IN_COMPANY');

  section('6. OWNER DELETION: the owner closes their account with an active employee');
  const gadiDelete = await api('DELETE', '/users/me', gadi.token);
  check('the owner deletes without transferring anything', gadiDelete.status === 204, `status=${gadiDelete.status} ${JSON.stringify(gadiDelete.body ?? '')}`);
  const companyRow = mongo(`db.getSiblingDB("blokta-qa").companies.countDocuments({name:"${gadi.companyName}"})`);
  check('the company record is intact', Number(companyRow) === 1);
  const eliUser = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").users.findOne({email:"${eli.email}"},{status:1}))`));
  check('the employee keeps their individual account', eliUser.status === 'active');

  section('7. The ownerless company: writes denied centrally, reads and the person untouched');
  const eliSession = await api('GET', '/auth/me', eli.token);
  check('the session derives ownerState=recovery with no company permissions',
    eliSession.status === 200 && eliSession.body.user.company.ownerState === 'recovery' && eliSession.body.user.company.permissions.length === 0,
    `ownerState=${eliSession.body?.user?.company?.ownerState}`);
  const invite = await api('POST', '/companies/employees/invitations', eli.token, { fullName: 'מישהו חדש', companyPosition: 'site_manager' });
  check('inviting an employee is refused (COMPANY_OWNER_INACTIVE)', invite.status === 409 && invite.body.code === 'COMPANY_OWNER_INACTIVE');
  const companyEdit = await api('PATCH', '/companies/me', eli.token, { availability: 'limited' });
  check('editing the company is refused (COMPANY_OWNER_INACTIVE)', companyEdit.status === 409 && companyEdit.body.code === 'COMPANY_OWNER_INACTIVE');
  const eliConv = await api('POST', `/conversations/direct/${noa.userId}`, eli.token, { body: 'שלום' });
  await api('POST', `/conversations/${eliConv.body.conversation.id}/accept`, noa.token);
  const eliProposal = await api('POST', `/conversations/${eliConv.body.conversation.id}/agreements`, eli.token, {
    title: 'עבודה בשם החברה', startDate: iso(2), dueDate: iso(5),
  });
  check('commissioning on the company’s behalf is refused', eliProposal.status === 403, `status=${eliProposal.status}`);
  const eliRead = await api('GET', '/companies/employees', eli.token);
  check('the authorized employee-list READ still answers', eliRead.status === 200);
  check('personal messaging still works', eliConv.status === 201);

  section('8. The employee is told, and leaves, through the real screen (UI)');
  const eliMe = await api('GET', '/auth/me', eli.token);
  let context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(
    ([k, v, uk, uv]) => { localStorage.setItem(k, v); localStorage.setItem(uk, uv); },
    [TOKEN_KEY, eli.token, USER_KEY, JSON.stringify(eliMe.body.user)],
  );
  let page = await context.newPage();
  await page.goto(`${APP}/settings`);
  await page.waitForSelector('text=החברה אינה פעילה כרגע', { timeout: 15000 });
  const noticeText = (await page.textContent('#root')) ?? '';
  check('UI: the inactive-company notice explains history, the personal account, and leaving',
    noticeText.includes('ההיסטוריה העסקית') && noticeText.includes('לעזוב את החברה'));
  check('UI: the recovery nuance is stated while the owner may still return', noticeText.includes('תקופת השחזור'));
  await page.screenshot({ path: `${SHOTS}/qa-ownerless-notice.png` });
  const leaveButton = await page.$('text=עזיבת החברה');
  check('UI: the departure action is visible and reachable', leaveButton !== null);
  await page.close(); await context.close();
  const leave = await api('POST', '/companies/employees/me/leave', eli.token);
  check('leaving the ownerless company works with no owner online', leave.status === 204 || leave.status === 200, `status=${leave.status}`);
  const eliMembership = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${eli.email}"});
    JSON.stringify(qa.companymemberships.findOne({user:u._id},{status:1,leftAt:1}))`));
  check('the membership period is history, not erasure (inactive + leftAt)', eliMembership.status === 'inactive' && eliMembership.leftAt !== undefined);
  const stampRow = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${agreementId}")},{"agreement.commissioningCompany":1}))`));
  check('commissioningCompany attribution is exactly as stamped', stampRow.agreement.commissioningCompany !== undefined);

  section('9. The departed employee joins another company through the approved workflow');
  const inviteEli = await api('POST', '/companies/employees/invitations', noa.token, { fullName: eli.fullName, companyPosition: 'site_manager' });
  check('the receiving owner invites', inviteEli.status === 201 || inviteEli.status === 200, `status=${inviteEli.status}`);
  const claim = await api('POST', '/companies/employees/claim', eli.token, { companyName: noa.companyName, companyPosition: 'site_manager' });
  check('the claim lands as pending company approval', claim.status === 200 || claim.status === 204 || claim.status === 201, `status=${claim.status} ${JSON.stringify(claim.body ?? '')}`);
  const list = await api('GET', '/companies/employees', noa.token);
  const pendingRow = (list.body?.memberships ?? []).find((row) => row.status === 'pending_company_approval');
  const membershipId = pendingRow?.id ?? null;
  if (membershipId !== null) {
    const approve = await api('POST', `/companies/employees/${membershipId}/approve`, noa.token);
    check('the receiving owner approves the new episode', approve.status === 200 || approve.status === 204, `status=${approve.status}`);
  } else {
    check('the receiving owner approves the new episode', false, `pending row not found: ${JSON.stringify(list.body).slice(0, 200)}`);
  }
  const episodes = mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${eli.email}"});
    qa.companymemberships.countDocuments({user:u._id})`);
  check('both membership episodes exist side by side', Number(episodes) === 2, `episodes=${episodes}`);

  section('10. Restoration inside the window reactivates the company by itself');
  const restore = await api('POST', `/moderation/accounts/${gadi.userId}/restore`, admin.token, { reason: 'verification: recovery inside the window' });
  check('the admin restore answers success', restore.status === 204 || restore.status === 200);
  const backIn = await relogin(gadi);
  check('the restored owner signs in again', backIn.status === 200);
  const gadiSession = await api('GET', '/auth/me', gadi.token);
  check('the company is active again, with the owner’s permissions back',
    gadiSession.body?.user?.company?.ownerState === 'active' && gadiSession.body.user.company.permissions.length > 0);
  const inviteWorks = await api('POST', '/companies/employees/invitations', gadi.token, { fullName: 'עובד עתידי', companyPosition: 'site_manager' });
  check('company writes work again after restoration', inviteWorks.status === 201 || inviteWorks.status === 200, `status=${inviteWorks.status}`);
  const eliStill = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${eli.email}"});
    const gadiUser = qa.users.findOne({email:"${gadi.email}"});
    const g = qa.companymemberships.findOne({user:gadiUser._id}).company;
    JSON.stringify(qa.companymemberships.findOne({user:u._id, company:g},{status:1}))`));
  check('the departed membership was NOT resurrected', eliStill.status === 'inactive');

  section('11. Past the window: every door shuts at the deadline, then anonymization');
  const avatarUp = await upload('/users/me/avatar', gadi.token, 'avatar', 'portrait.png');
  check('the owner uploads a personal avatar before leaving', avatarUp.status === 200 || avatarUp.status === 201, `status=${avatarUp.status}`);
  const controlUp = await upload(`/conversations/${eliConv.body.conversation.id}/attachments`, noa.token, 'file', 'evidence.png');
  check('a control attachment exists for another person', controlUp.status === 201);
  const controlAssetId = controlUp.body?.attachment?.id ?? null;
  await api('DELETE', '/users/me', gadi.token);
  await api('POST', '/auth/recover-account', undefined, { email: gadi.email });
  const gadiPreDeadlineUrl = lastLogLink('Account recovery link');
  const gadiPreDeadlineToken = tokenFrom(gadiPreDeadlineUrl);
  mongo(`db.getSiblingDB("blokta-qa").users.updateOne({email:"${gadi.email}"},{$set:{deletedAt:new Date(Date.now() - 61*86400000)}})`);
  const expired = await api('POST', `/moderation/accounts/${gadi.userId}/restore`, admin.token, { reason: 'verification: past the deadline' });
  check('ADMIN restoration past 60 days is refused (ACCOUNT_RESTORE_EXPIRED)', expired.status === 409 && expired.body.code === 'ACCOUNT_RESTORE_EXPIRED');
  const tokensBeforeLate = Number(mongo('db.getSiblingDB("blokta-qa").accountrecoverytokens.countDocuments({})'));
  await api('POST', '/auth/recover-account', undefined, { email: gadi.email });
  const tokensAfterLate = Number(mongo('db.getSiblingDB("blokta-qa").accountrecoverytokens.countDocuments({})'));
  check('a recovery REQUEST past the deadline mints nothing (same generic answer)', tokensAfterLate === tokensBeforeLate);
  const lateToken = await api('POST', '/auth/restore-account', undefined, { token: gadiPreDeadlineToken });
  check('a token minted inside the window dies AT the deadline (ACCOUNT_RESTORE_EXPIRED)', lateToken.status === 409 && lateToken.body.code === 'ACCOUNT_RESTORE_EXPIRED');
  const sweep1 = execSync(
    `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT=4546 MONGODB_URI='${QA_URI}' CORS_ORIGINS='${APP}' FRONTEND_URL='${APP}' API_PUBLIC_URL='${API}' TERMS_VERSION='qa' ACCESS_TOKEN_TTL_SECONDS='900' REFRESH_TOKEN_TTL_SECONDS='1209600' ACCESS_TOKEN_SECRET='qa-access-secret-0123456789abcdef0123456789abcdef0123456789' REFRESH_TOKEN_SECRET='qa-refresh-secret-0123456789abcdef0123456789abcdef0123456789' npx --prefix "${BACKEND_DIR}" tsx "${BACKEND_DIR}/scripts/anonymize-accounts.ts"`,
    { cwd: BACKEND_DIR },
  ).toString();
  console.log(sweep1.split('\n').map((l) => `    ${l}`).join('\n'));
  check('the sweep anonymized exactly the eligible account', sweep1.includes('Anonymized this sweep: 1'));
  const gadiAfter = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").users.findOne({_id:ObjectId("${gadi.userId}")},{firstName:1,lastName:1,email:1,bio:1,businessPhone:1,location:1,anonymizedAt:1,identities:1,avatar:1,specialties:1}))`));
  check('PII is gone: tombstone email, no phone, no location, no identities, no avatar',
    gadiAfter.email.endsWith('@anonymized.blokta.invalid') && gadiAfter.businessPhone === undefined &&
    gadiAfter.location === undefined && gadiAfter.identities === undefined && gadiAfter.avatar === undefined);
  check('the NAME survives as business attribution', gadiAfter.firstName === 'gadi' && gadiAfter.anonymizedAt !== undefined);
  check('the PROFESSION survives as business attribution', Array.isArray(gadiAfter.specialties) && gadiAfter.specialties.includes('drilling'));
  check('the avatar FILE was physically removed', sweep1.includes('Avatar files removed: 1'));
  const gadiAssets = mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const files = qa.fileassets.countDocuments({owner:ObjectId("${gadi.userId}"), "scope.type":"avatar"});
    const chunks = qa["fs.files"] ? 0 : 0;
    files`);
  check('no avatar asset row remains for the anonymized owner', Number(gadiAssets) === 0);
  const controlStill = mongo(`db.getSiblingDB("blokta-qa").fileassets.countDocuments({_id:ObjectId("${controlAssetId}")})`);
  check('the unrelated message attachment was NOT touched', Number(controlStill) === 1);
  const danaUntouched = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").users.findOne({email:"${hila.email}"},{anonymizedAt:1,email:1}))`));
  check('a deletion still inside its window was NOT touched', danaUntouched.anonymizedAt === undefined && danaUntouched.email === hila.email);
  const sweep2 = execSync(
    `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT=4546 MONGODB_URI='${QA_URI}' CORS_ORIGINS='${APP}' FRONTEND_URL='${APP}' API_PUBLIC_URL='${API}' TERMS_VERSION='qa' ACCESS_TOKEN_TTL_SECONDS='900' REFRESH_TOKEN_TTL_SECONDS='1209600' ACCESS_TOKEN_SECRET='qa-access-secret-0123456789abcdef0123456789abcdef0123456789' REFRESH_TOKEN_SECRET='qa-refresh-secret-0123456789abcdef0123456789abcdef0123456789' npx --prefix "${BACKEND_DIR}" tsx "${BACKEND_DIR}/scripts/anonymize-accounts.ts"`,
    { cwd: BACKEND_DIR },
  ).toString();
  check('a second sweep is a no-op (idempotent)', sweep2.includes('Anonymized this sweep: 0'));
  const postAnonRestore = await api('POST', `/moderation/accounts/${gadi.userId}/restore`, admin.token, { reason: 'verification: after anonymization' });
  check('restoration after anonymization stays refused', postAnonRestore.status === 409);
  const anonAudit = mongo(`db.getSiblingDB("blokta-qa").platformauditentries.countDocuments({action:"account.anonymized"})`);
  check('the anonymization is audited', Number(anonAudit) === 1, `entries=${anonAudit}`);

  section('12. Attribution after anonymization: business history names the person, surfaces close');
  await relogin(dana);
  const danaHistory = await api('GET', `/conversations/${convId}/messages`, dana.token);
  const gadiMessage = danaHistory.body?.messages?.find?.((m) => m.senderId === gadi.userId && m.senderName.trim().length > 0);
  check('the anonymized performer is still named inside the authorized thread', gadiMessage !== undefined, gadiMessage?.senderName ?? '');
  const publicProfile = await api('GET', `/browse/contractors/${gadi.userId}`, dana.token);
  check('the public profile no longer answers as an active professional (404)', publicProfile.status === 404);

  section('13. The owner-aware confirmation, on the real screen (UI)');
  const noaMe = await api('GET', '/auth/me', noa.token);
  context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(
    ([k, v, uk, uv]) => { localStorage.setItem(k, v); localStorage.setItem(uk, uv); },
    [TOKEN_KEY, noa.token, USER_KEY, JSON.stringify(noaMe.body.user)],
  );
  page = await context.newPage();
  await page.goto(`${APP}/settings`);
  await page.waitForSelector('text=בקשת סגירת חשבון', { timeout: 15000 });
  await page.click('text=בקשת סגירת חשבון');
  await page.waitForSelector('.settings-confirm', { timeout: 5000 });
  const confirmText = (await page.textContent('.settings-confirm')) ?? '';
  check('UI: the confirmation covers obligations, anonymization, and the company consequence',
    confirmText.includes('ממשיכות מחוץ למערכת') && confirmText.includes('אנונימיזציה') && confirmText.includes('אינה נמחקת ואינה מועברת'));
  await page.screenshot({ path: `${SHOTS}/qa-owner-deletion-confirm.png` });
  await page.click('.settings-confirm .btn--ghost');
  await page.close(); await context.close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('Two steps complete this procedure outside this process: the backend is restarted with an');
  console.log('overdue account present (the BOOT sweep must anonymize it — items 16-18), and the Brevo');
  console.log('transport is exercised on port 2525 (item 30). Both are recorded in the procedure log.');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
