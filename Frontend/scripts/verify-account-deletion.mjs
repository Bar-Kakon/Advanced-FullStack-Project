/**
 * The account-deletion correction, verified in one focused procedure: real browser, real local
 * API, isolated local database. The binding rule under test: «ההתחייבות ממשיכה מחוץ למערכת» —
 * active commitments never block deletion and nothing about them changes when an account closes.
 *
 *   APP_URL=... API_URL=... MONGO_PORT=27272 SHOTS=<dir> node scripts/verify-account-deletion.mjs
 */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const TOKEN_KEY = 'fieldsync-access-token';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(80)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", "\\u0027")}'`).toString().trim();

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
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login ${name}: ${login.status}`);
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures: proposer, performer, hidden performer, admin');
  const gadi = await register('gadi', 1);    // proposes the agreement, stays
  const dana = await register('dana', 2);    // accepts the work, then deletes WITH it unfinished
  const hila = await register('hila', 3);    // hidden performer, then deletes
  const admin = await register('admin', 4);  // restores, after a direct isAdmin grant
  mongo(`db.getSiblingDB("blokta-qa").users.updateOne({email:"${admin.email}"},{$set:{isAdmin:true}})`);

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
  const answered = agreementId
    ? await api('POST', `/conversations/${convId}/agreements/${agreementId}/accept`, dana.token)
    : { status: 0, body: null };
  const taskId = answered.body?.message?.agreement?.taskId ?? null;
  check('acceptance created the canonical task, assigned to the accepter', answered.status === 200 && taskId !== null);

  section('2. Deletion proceeds WITH the unfinished assigned task — and moves nothing');
  const before = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{assignee:1,completedAt:1,delegation:1,previousAssignee:1}))`));
  const danaDelete = await api('DELETE', '/users/me', dana.token);
  check('DELETE /users/me answers 204 despite the open work', danaDelete.status === 204, `status=${danaDelete.status} ${JSON.stringify(danaDelete.body ?? '')}`);
  const after = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{assignee:1,completedAt:1,delegation:1,previousAssignee:1}))`));
  check('no reassignment: the assignee is unchanged', after.assignee === before.assignee && after.assignee !== undefined);
  check('no completion stamp was forged', after.completedAt === undefined);
  check('no orphaning fields appeared', after.previousAssignee === undefined && JSON.stringify(after.delegation) === JSON.stringify(before.delegation));
  const agreementRow = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${agreementId}")},{"agreement.state":1,"agreement.task":1,deletedAt:1}))`));
  check('the agreement message is preserved, accepted, still naming its task', agreementRow.agreement.state === 'accepted' && agreementRow.agreement.task !== undefined && agreementRow.deletedAt === undefined);

  section('3. Access ends at once: live token, refresh families, fresh login');
  const dead = await api('GET', '/users/me', dana.token);
  check('the live access token is refused on the next request', dead.status === 401);
  const families = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${dana.email}"});
    JSON.stringify({total: qa.refreshtokens.countDocuments({user:u._id}), live: qa.refreshtokens.countDocuments({user:u._id, revokedAt:null})})`));
  check('every refresh-token family is revoked', families.total > 0 && families.live === 0, JSON.stringify(families));
  const deadLogin = await api('POST', '/auth/login', undefined, { email: dana.email, password: PASSWORD });
  check('a fresh login is refused like a wrong password', deadLogin.status === 401 && deadLogin.body.code === 'INVALID_CREDENTIALS');

  section('4. History, attribution and the audit record survive the closure');
  const gadiHistory = await api('GET', `/conversations/${convId}/messages`, gadi.token);
  check('the counterpart still reads the whole thread', gadiHistory.status === 200 && gadiHistory.body.messages.length >= 2);
  const named = gadiHistory.body.messages.find((m) => m.senderId !== gadi.userId && m.senderName.trim().length > 0);
  check('the deleted account is still attributed by name inside the window', named !== undefined);
  const audit = mongo(`db.getSiblingDB("blokta-qa").platformauditentries.countDocuments({action:"account.deleted"})`);
  check('the account.deleted audit entry exists', Number(audit) > 0, `entries=${audit}`);

  section('5. A hidden performer (D7) deletes too, and the delegation record is untouched');
  mongo(`db.getSiblingDB("blokta-qa").tasks.updateOne({_id:ObjectId("${taskId}")},{$set:{delegation:{delegate:ObjectId("${hila.userId}"), delegatedAt:new Date()}}})`);
  const hilaDelete = await api('DELETE', '/users/me', hila.token);
  check('the hidden performer may close their account', hilaDelete.status === 204, `status=${hilaDelete.status} ${JSON.stringify(hilaDelete.body ?? '')}`);
  const delegationAfter = JSON.parse(mongo(`JSON.stringify(db.getSiblingDB("blokta-qa").tasks.findOne({_id:ObjectId("${taskId}")},{delegation:1,assignee:1,completedAt:1}))`));
  check('the delegation record and the task are exactly as they were', delegationAfter.delegation?.delegate !== undefined && delegationAfter.completedAt === undefined);

  section('6. The company gates still stand, each with its own refusal');
  // gadi's company gains a current member: the owner is refused while anyone would be stranded
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const gadi = qa.users.findOne({email:"${gadi.email}"});
    const admin = qa.users.findOne({email:"${admin.email}"});
    const company = qa.companymemberships.findOne({user:gadi._id}).company;
    qa.companymemberships.updateOne({user:admin._id},{$set:{standing:"employee",company:company}})`);
  const ownerBlocked = await api('DELETE', '/users/me', gadi.token);
  check('an owner with current members is refused (ACCOUNT_OWNS_COMPANY)', ownerBlocked.status === 409 && ownerBlocked.body.code === 'ACCOUNT_OWNS_COMPANY');
  const employeeBlocked = await api('DELETE', '/users/me', admin.token);
  check('an employee with a current membership is refused (ACCOUNT_IN_COMPANY)', employeeBlocked.status === 409 && employeeBlocked.body.code === 'ACCOUNT_IN_COMPANY');
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const admin = qa.users.findOne({email:"${admin.email}"});
    const own = qa.companies.findOne({name:/admin Del Co/});
    qa.companymemberships.updateOne({user:admin._id},{$set:{standing:"owner",company:own._id}})`);

  section('7. The approved 60-day recovery: an explicit, audited admin restore');
  const restore = await api('POST', `/moderation/accounts/${dana.userId}/restore`, admin.token, { reason: 'verification: recovery inside the window' });
  check('the admin restore answers success', restore.status === 200 || restore.status === 204, `status=${restore.status}`);
  const back = await api('POST', '/auth/login', undefined, { email: dana.email, password: PASSWORD });
  check('the restored account signs in again', back.status === 200);
  const restoreAudit = mongo(`db.getSiblingDB("blokta-qa").platformauditentries.countDocuments({action:"account.restored"})`);
  check('the restoration is itself audited', Number(restoreAudit) > 0);

  section('8. The user-facing flow says what is true (UI)');
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [TOKEN_KEY, back.body.accessToken]);
  const page = await context.newPage();
  await page.goto(`${APP}/settings`);
  await page.waitForSelector('text=בקשת סגירת חשבון', { timeout: 15000 });
  const sectionText = (await page.textContent('#root')) ?? '';
  check('UI: the section states that obligations continue outside the platform', sectionText.includes('ממשיכות מחוץ למערכת'));
  await page.click('text=בקשת סגירת חשבון');
  await page.waitForSelector('.settings-confirm', { timeout: 5000 });
  const confirmText = (await page.textContent('.settings-confirm')) ?? '';
  check('UI: the confirmation states immediacy, 60 days, preservation AND continuing obligations',
    confirmText.includes('מיידית') && confirmText.includes('60') && confirmText.includes('נשמרת') && confirmText.includes('ממשיכות מחוץ למערכת'));
  check('UI: the confirmation says explicitly that obligations are NOT cancelled', confirmText.includes('אינן מתבטלות'));
  await page.screenshot({ path: `${SHOTS}/qa-deletion-confirm.png` });
  await page.click('.settings-confirm .btn--primary');
  await page.waitForURL('**/login', { timeout: 15000 });
  check('UI: the closure (with the unfinished task back on the account) completes and signs out', true);
  await page.close();
  await context.close();

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('UNVERIFIED by design: the post-60-day PII anonymization and the neutral deleted-user');
  console.log('attribution after it — no anonymization job exists yet (reported as the remaining gap).');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
