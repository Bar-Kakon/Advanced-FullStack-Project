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

  section('4. A hidden performer (D7) deletes too, and the delegation record is untouched');
  mongo(`db.getSiblingDB("blokta-qa").tasks.updateOne({_id:ObjectId("${taskId}")},{$set:{delegation:{delegate:ObjectId("${hila.userId}"), delegatedAt:new Date()}}})`);
  check('the hidden performer may close their account', (await api('DELETE', '/users/me', hila.token)).status === 204);
  const delegationAfter = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{delegation:1,completedAt:1}))`));
  check('the delegation record and the task are exactly as they were', delegationAfter.delegation?.delegate !== undefined && delegationAfter.completedAt === undefined);

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

  section('11. Past the window: restoration refused, then anonymization — name kept, PII gone');
  await api('DELETE', '/users/me', gadi.token);
  mongo(`db.getSiblingDB("blokta-qa").users.updateOne({email:"${gadi.email}"},{$set:{deletedAt:new Date(Date.now() - 61*86400000)}})`);
  const expired = await api('POST', `/moderation/accounts/${gadi.userId}/restore`, admin.token, { reason: 'verification: past the deadline' });
  check('restoration past 60 days is refused (ACCOUNT_RESTORE_EXPIRED)', expired.status === 409 && expired.body.code === 'ACCOUNT_RESTORE_EXPIRED');
  const sweep1 = execSync(
    `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development PORT=4546 MONGODB_URI='${QA_URI}' CORS_ORIGINS='${APP}' FRONTEND_URL='${APP}' API_PUBLIC_URL='${API}' TERMS_VERSION='qa' ACCESS_TOKEN_TTL_SECONDS='900' REFRESH_TOKEN_TTL_SECONDS='1209600' ACCESS_TOKEN_SECRET='qa-access-secret-0123456789abcdef0123456789abcdef0123456789' REFRESH_TOKEN_SECRET='qa-refresh-secret-0123456789abcdef0123456789abcdef0123456789' npx --prefix "${BACKEND_DIR}" tsx "${BACKEND_DIR}/scripts/anonymize-accounts.ts"`,
    { cwd: BACKEND_DIR },
  ).toString();
  console.log(sweep1.split('\n').map((l) => `    ${l}`).join('\n'));
  check('the sweep anonymized exactly the eligible account', sweep1.includes('Anonymized this sweep: 1'));
  const gadiAfter = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").users.findOne({_id:ObjectId("${gadi.userId}")},{firstName:1,lastName:1,email:1,bio:1,businessPhone:1,location:1,anonymizedAt:1,identities:1,avatar:1}))`));
  check('PII is gone: tombstone email, no phone, no location, no identities, no avatar',
    gadiAfter.email.endsWith('@anonymized.blokta.invalid') && gadiAfter.businessPhone === undefined &&
    gadiAfter.location === undefined && gadiAfter.identities === undefined && gadiAfter.avatar === undefined);
  check('the NAME survives as business attribution', gadiAfter.firstName === 'gadi' && gadiAfter.anonymizedAt !== undefined);
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
  const danaBack = await api('POST', `/moderation/accounts/${dana.userId}/restore`, admin.token, { reason: 'verification: reader for the thread' });
  check('the counterpart account is restored to read the thread', danaBack.status === 204 || danaBack.status === 200);
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
  console.log('UNVERIFIED, with reasons: cross-restart worker continuity is proven by design (eligibility');
  console.log('lives in persisted timestamps; the sweep ran as its own fresh process twice), not by a');
  console.log('long-running soak; and avatar FILE bytes are orphaned rather than purged (reference removed).');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
