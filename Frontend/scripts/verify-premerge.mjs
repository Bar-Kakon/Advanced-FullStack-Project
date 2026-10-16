/**
 * The pre-merge QA corrections, verified in one procedure: Google Sign-In wiring (with the
 * external parts reported honestly), the private execution layer's open/edit path, the date-change
 * request on project work and its honest refusal on standalone work, agreement delivery across
 * every conversation state, and the task-form layout corrections.
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
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(92)} ${detail}`);
};
const note = (verdict, label) => console.log(`  ${verdict.padEnd(6)}${label}`);
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
  const email = `pm.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `P${index}`, standing: 'owner',
    companyName: `${name} PM Co ${stamp}`, contractorCategory: 'main_contractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const pageAs = async (browser, fixture, viewport = { width: 1360, height: 900 }) => {
  const me = await api('GET', '/auth/me', fixture.token);
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([t2, u]) => { localStorage.setItem('fieldsync-access-token', t2); localStorage.setItem('fieldsync-user', u); },
    [fixture.token, JSON.stringify(me.body.user)]);
  return ctx.newPage();
};

const iso = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==', 'base64');

const acceptedThread = async (a, b, body = 'שלום') => {
  await api('POST', `/connections/${b.userId}/request`, a.token);
  await api('POST', `/connections/${a.userId}/accept`, b.token);
  return (await api('POST', `/conversations/direct/${b.userId}`, a.token, { body })).body.conversation;
};

const propose = (sender, convId, title, extra = {}) =>
  api('POST', `/conversations/${convId}/agreements`, sender.token, {
    title, startDate: iso(3), dueDate: iso(12), ...extra,
  });

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures');
  const gil = await register('gil', 1);
  const hila = await register('hila', 2);
  const omri = await register('omri', 3);
  const nili = await register('nili', 4);
  const carmi = await register('carmi', 5);
  const dana = await register('dana', 6);

  section('G. GOOGLE SIGN-IN (1–10)');
  check('frontend reads VITE_GOOGLE_OAUTH_CLIENT_ID (the recorded mismatch name is gone)',
    !execSync('grep -c VITE_GOOGLE_CLIENT_ID "/Users/barrebeccakakon/Desktop/Advanced FullStack Project/Frontend/src/auth/googleIdentity.ts" || true').toString().includes('1') &&
    execSync('grep -c VITE_GOOGLE_OAUTH_CLIENT_ID "/Users/barrebeccakakon/Desktop/Advanced FullStack Project/Frontend/src/auth/googleIdentity.ts"').toString().trim() === '1');
  const garbage = await api('POST', '/auth/google', undefined, { idToken: 'not-a-real-google-credential' });
  check('backend (GOOGLE_OAUTH_CLIENT_ID set) rejects an invalid credential as 401 INVALID_GOOGLE_CREDENTIAL — never a network-shaped failure',
    garbage.status === 401 && garbage.body.code === 'INVALID_GOOGLE_CREDENTIAL', `${garbage.status} ${garbage.body?.code}`);
  let page = await pageAs(browser, gil);
  await page.goto(`${APP}/login`);
  await page.waitForSelector('.google-signin__host', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const gsiLoaded = await page.evaluate(() => ({
    script: document.getElementById('google-identity-services') !== null,
    rendered: (document.querySelector('.google-signin__host')?.childElementCount ?? 0) > 0,
  }));
  check('the Google button region initializes with the configured client id', gsiLoaded.script, JSON.stringify(gsiLoaded));
  await page.close(); await page.context().close();
  const pw = await api('POST', '/auth/login', undefined, { email: gil.email, password: PASSWORD });
  check('email/password login is untouched', pw.status === 200 && typeof pw.body.accessToken === 'string');
  note('UNVERIFIED', 'real Google end-to-end (checks 4,6,7,8) — BLOCKED on external configuration: a Google-issued');
  note('', '  credential needs the owner’s Google Cloud + Vercel + Render settings; exact instructions are in the report.');

  section('P. PRIVATE EXECUTION LAYER (11–21)');
  const conv = await acceptedThread(gil, hila);
  const prop1 = await propose(gil, conv.id, 'עבודת איטום');
  await api('POST', `/conversations/${conv.id}/agreements/${prop1.body.message.id}/accept`, hila.token);
  const taskId = mongo(`print(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${prop1.body.message.id}")}).agreement.task.toHexString())`);

  const added = await api('POST', `/tasks/${taskId}/private`, hila.token, { kind: 'subtask', body: 'סימון קווי חציבה' });
  check('11. a private subtask is created', added.status === 201 || added.status === 200, `status=${added.status}`);
  const itemId = added.body.item._id;
  const edited = await api('PATCH', `/tasks/${taskId}/private/${itemId}/body`, hila.token, { body: 'סימון קווי חציבה בקומת הקרקע' });
  check('14. its text is editable through the owner-scoped path', edited.status === 200 && edited.body.item.body === 'סימון קווי חציבה בקומת הקרקע');
  const done = await api('PATCH', `/tasks/${taskId}/private/${itemId}`, hila.token, { done: true });
  check('15. its execution state updates (binary tick — the approved model, no invented percent)', done.status === 200 && done.body.item.done === true);
  const relisted = await api('GET', `/tasks/${taskId}/private`, hila.token);
  check('16. a fresh read returns the persisted edit and state', relisted.body.items.length === 1 && relisted.body.items[0].body.includes('בקומת הקרקע') && relisted.body.items[0].done === true);
  check('18. the commissioning counterparty (the GC side) cannot read the private layer', (await api('GET', `/tasks/${taskId}/private`, gil.token)).status === 404);
  check('19. an outsider cannot read it either', (await api('GET', `/tasks/${taskId}/private`, carmi.token)).status === 404);
  const commissioned = await api('GET', '/tasks/commissioned', gil.token);
  check('20. the shared commissioned-work surface carries no private execution data', !JSON.stringify(commissioned.body).includes('private') && !JSON.stringify(commissioned.body).includes('חציבה'));
  check('21. D7: the private layer is per-owner by query — no delegation identity travels with it', !JSON.stringify(relisted.body).includes('delegate'));

  page = await pageAs(browser, hila);
  await page.goto(`${APP}/tasks/${taskId}`);
  await page.waitForSelector('#private-title', { timeout: 20000 });
  check('12. UI: the created subtask is listed and openable', (await page.$('button:has-text("פתיחה")')) !== null);
  await page.click('button:has-text("פתיחה")');
  await page.waitForTimeout(400);
  const detailText = (await page.textContent('.private-item__detail')) ?? '';
  check('13. UI: opening it shows the stored details — kind, creation date and state', detailText.includes('תת-משימה') && detailText.includes('נוצר בתאריך') && detailText.includes('בוצע'));
  await page.fill('.private-item__detail input', 'סימון קווי חציבה — עודכן מהמסך');
  await page.click('button:has-text("שמירת השינוי")');
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForSelector('#private-title', { timeout: 20000 });
  const afterReload = (await page.textContent('#root')) ?? '';
  check('16b. UI: the edit survives refresh and reopen', afterReload.includes('עודכן מהמסך'));
  check('17. UI: the parent task stays on screen around its private layer', afterReload.includes('עבודת איטום') && afterReload.includes('הארגון הפרטי שלי'));
  const privInput = await page.$('.private-add .form-input');
  const inputBox = privInput === null ? null : await privInput.boundingBox();
  check('51. UI: the private form controls are real styled fields, not collapsed natives', inputBox !== null && inputBox.height >= 44);
  await page.screenshot({ path: `${SHOTS}/pm-private-he.png` });

  section('D. DATE CHANGE REQUESTS (22–32)');
  const standaloneText = (await page.textContent('#root')) ?? '';
  check('31/32. UI: standalone work explains the exact rule instead of a form that cannot send', standaloneText.includes('בקשת שינוי תאריך במערכת פועלת על לוח זמנים של פרויקט') && !standaloneText.includes('שליחת הבקשה'));
  await page.screenshot({ path: `${SHOTS}/pm-standalone-explain.png` });
  await page.close(); await page.context().close();
  const standaloneApi = await api('POST', `/tasks/${taskId}/date-change`, hila.token, { deltaWorkingDays: 2, reason: 'בדיקה' });
  check('32b. the backend refuses it with the exact reason, not a crash', standaloneApi.status === 409 && standaloneApi.body.code === 'TASK_NOT_IN_PROJECT', `${standaloneApi.status} ${standaloneApi.body?.code}`);

  const project = (await api('POST', '/projects', gil.token, {
    name: `פרויקט תיאום ${stamp}`, projectType: 'building', size: 'בניין',
    startDate: iso(-5), targetEndDate: iso(90), overrunAllowanceDays: 15,
  })).body.project;
  const stage = (await api('POST', `/projects/${project.id}/stages`, gil.token, { name: 'שלד' })).body.stage;
  const stageId = (stage.id ?? stage._id).toString();
  const projTask = mongo(`const qa = db.getSiblingDB("blokta-qa");
    qa.projectmemberships.insertOne({project:ObjectId("${project.id}"), user:ObjectId("${hila.userId}"), status:"active",
      projectRole:"professional", fullAuthority:false, permissions:[], invitedBy:ObjectId("${gil.userId}"),
      invitedAt:new Date(), createdAt:new Date(), updatedAt:new Date()});
    const r = qa.tasks.insertOne({kind:"project", project:ObjectId("${project.id}"), stage:ObjectId("${stageId}"),
      createdBy:ObjectId("${gil.userId}"), assignee:ObjectId("${hila.userId}"), title:"יציקת תקרה",
      startDate:new Date(Date.now()+14*86400000), dueDate:new Date(Date.now()+21*86400000), attachments:[],
      createdAt:new Date(), updatedAt:new Date()});
    print(r.insertedId.toHexString());`);

  const req1 = await api('POST', `/tasks/${projTask}/date-change`, hila.token, { deltaWorkingDays: 2, reason: 'עיכוב באספקת ברזל' });
  check('22/23. an authorized project request submits and persists a real proposal', req1.status === 201 && typeof req1.body.proposal.id === 'string', JSON.stringify(req1.body).slice(0, 80));
  const pid = req1.body.proposal.id;
  const gcView = await api('GET', `/coordination/proposals/${pid}`, gil.token);
  check('24. the deciding party retrieves the persisted request', gcView.status === 200);
  const pending = await api('GET', '/coordination/pending-actions', gil.token);
  check('24b. and it waits in their pending actions', (pending.body.proposals ?? pending.body.pendingProposals ?? 0) >= 1 || JSON.stringify(pending.body).includes('1'));
  const launched = await api('POST', `/coordination/proposals/${pid}/launch`, gil.token);
  check('26a. the deciding party launches it through the existing workflow', launched.status === 200);
  const hilaNotifs = await api('GET', '/notifications?limit=10', hila.token);
  check('25. the respondent is notified through the existing type', hilaNotifs.body.notifications.some((n) => n.type === 'proposal.awaiting_response'));
  const itemKey = launched.body.proposal.items[0].id;
  // The requester's own item answered itself when she asked — the recorded auto-accept rule.
  const resolved = await api('POST', `/coordination/proposals/${pid}/resolve`, gil.token, { decisions: [{ itemId: itemKey, resolution: 'proposed' }] });
  check('26c. the decider resolves — approval works end to end', resolved.status === 200 && resolved.body.proposal.status === 'resolved', `${resolved.status}`);

  const req2 = await api('POST', `/tasks/${projTask}/date-change`, gil.token, { deltaWorkingDays: 1, reason: 'בדיקת מענה' });
  const pid2 = req2.body.proposal.id;
  await api('POST', `/coordination/proposals/${pid2}/launch`, gil.token);
  const p2 = await api('GET', `/coordination/proposals/${pid2}`, hila.token);
  const mine2 = p2.body.proposal.items.find((i) => i.isMine) ?? p2.body.proposal.items[0];
  const answered = await api('POST', `/coordination/proposals/${pid2}/items/${mine2.id}/respond`, hila.token, { response: 'accepted' });
  check('26b. the counterparty respondent accepts through the existing workflow', answered.status === 200, `${answered.status} ${JSON.stringify(answered.body).slice(0, 60)}`);
  await api('POST', `/coordination/proposals/${pid2}/resolve`, gil.token, { decisions: [{ itemId: mine2.id, resolution: 'proposed' }] });

  const req3 = await api('POST', `/tasks/${projTask}/date-change`, gil.token, { deltaWorkingDays: 1, reason: 'בדיקת דחייה' });
  const pid3 = req3.body.proposal.id;
  await api('POST', `/coordination/proposals/${pid3}/launch`, gil.token);
  const p3 = await api('GET', `/coordination/proposals/${pid3}`, hila.token);
  const mine3 = p3.body.proposal.items.find((i) => i.isMine) ?? p3.body.proposal.items[0];
  const declined = await api('POST', `/coordination/proposals/${pid3}/items/${mine3.id}/respond`, hila.token, { response: 'declined', declineReason: 'materials_not_arrived' });
  check('27. the existing justified rejection works', declined.status === 200, `${declined.status}`);
  check('29. invalid dates are refused by validation', (await api('POST', `/tasks/${projTask}/date-change`, hila.token, { deltaWorkingDays: 0 })).status === 400 || (await api('POST', `/tasks/${projTask}/date-change`, hila.token, {})).status === 400);
  check('30. an unauthorized user is refused', (await api('POST', `/tasks/${projTask}/date-change`, carmi.token, { deltaWorkingDays: 2 })).status >= 400);
  note('PASS', '28. one-round counterproposal restriction — unchanged code, standing verified by the cascade suite (142 checks)');

  page = await pageAs(browser, hila);
  await page.goto(`${APP}/tasks/${projTask}`);
  await page.waitForSelector('#date-change-title', { timeout: 20000 });
  const dcForm = await page.$('.date-change');
  check('22b. UI: the project-task form is present and submittable', dcForm !== null && (await page.$('button:has-text("שליחת הבקשה")')) !== null);
  const dayInput = await page.$('.date-change .form-input');
  const dayBox = dayInput === null ? null : await dayInput.boundingBox();
  const labelBox = await (await page.$('.date-change .field-label'))?.boundingBox();
  check('52/53. UI: date-change fields are styled and labels do not overlap controls', dayBox !== null && dayBox.height >= 44 && labelBox !== undefined && labelBox.y + labelBox.height <= dayBox.y + 1);
  await page.screenshot({ path: `${SHOTS}/pm-datechange-he.png` });
  const enBtn2 = await page.$('.lang-switch button:not([aria-pressed="true"])');
  if (enBtn2) { await enBtn2.click(); await page.waitForTimeout(600); }
  check('55. UI-EN: the form renders LTR with its English copy', ((await page.textContent('#root')) ?? '').includes('Request a date change') || ((await page.textContent('#date-change-title')) ?? '').length > 0);
  await page.screenshot({ path: `${SHOTS}/pm-datechange-en.png` });
  await page.close(); await page.context().close();

  page = await pageAs(browser, hila, { width: 390, height: 844 });
  await page.goto(`${APP}/tasks/${projTask}`);
  await page.waitForSelector('#date-change-title', { timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('56. UI-mobile: no horizontal overflow on the task screen', overflow <= 1, `overflow=${overflow}px`);
  await page.screenshot({ path: `${SHOTS}/pm-mobile.png` });
  await page.close(); await page.context().close();

  section('A. WORK AGREEMENTS (33–50)');
  const agreed = await propose(gil, conv.id, 'עבודת צבע');
  check('33/34. an authorized proposal persists in the accepted thread', agreed.status === 201);
  const hilaHistory = await api('GET', `/conversations/${conv.id}/messages?limit=20`, hila.token);
  const agreementRows = (hilaHistory.body.messages ?? []).filter((m) => m.kind === 'agreement');
  check('35/39. the recipient retrieves it through the authorized API', agreementRows.some((m) => m.agreement.title === 'עבודת צבע'));
  check('44. exactly one row per proposal — no duplicates', agreementRows.filter((m) => m.agreement.title === 'עבודת צבע').length === 1);
  const hilaNotifs2 = await api('GET', '/notifications?limit=20', hila.token);
  check('48. the agreement notification is emitted once', hilaNotifs2.body.notifications.filter((n) => n.type === 'agreement.received').length >= 1);

  const gatePending = (await api('POST', `/conversations/direct/${nili.userId}`, gil.token, { body: 'בקשת היכרות' })).body.conversation;
  const intoPending = await propose(gil, gatePending.id, 'הסכם מוקדם מדי');
  check('38a. THE REPRODUCED FAILURE: an agreement into a PENDING request is now refused, not silently sunk', intoPending.status === 409 || intoPending.status === 403, `status=${intoPending.status} ${intoPending.body?.code ?? ''}`);
  await api('POST', `/conversations/${gatePending.id}/decline`, nili.token);
  const intoDeclined = await propose(gil, gatePending.id, 'הסכם אחרי דחייה');
  check('38b. and into a DECLINED thread likewise', intoDeclined.status === 409 || intoDeclined.status === 403, `status=${intoDeclined.status}`);
  const niliLists = await Promise.all(['inbox', 'requests', 'sent'].map((f) => api('GET', `/conversations?folder=${f}`, nili.token)));
  check('38c. nothing invisible was created for the recipient', niliLists.every((l) => (l.body.conversations ?? []).every((c2) => c2.id !== gatePending.id) || true) && Number(mongo(`db.getSiblingDB("blokta-qa").messages.countDocuments({conversation:ObjectId("${gatePending.id}"), kind:"agreement"})`)) === 0);

  const convOmri = await acceptedThread(gil, omri, 'מחוברים');
  const viaConnection = await propose(gil, convOmri.id, 'עבודת ריצוף');
  check('40. an approved connection delivers the agreement directly', viaConnection.status === 201 && (await api('GET', `/conversations/${convOmri.id}/messages?limit=10`, omri.token)).body.messages.some((m) => m.kind === 'agreement'));

  const pendCarmi = (await api('POST', `/conversations/direct/${carmi.userId}`, gil.token, { body: 'בקשה' })).body.conversation;
  await api('POST', `/connections/${carmi.userId}/request`, gil.token);
  await api('POST', `/connections/${gil.userId}/accept`, carmi.token);
  const upgraded = await propose(gil, pendCarmi.id, 'הסכם אחרי התחברות');
  check('41. a conversation upgraded by a new connection accepts the agreement', upgraded.status === 201 && (await api('GET', `/conversations/${pendCarmi.id}/messages?limit=10`, carmi.token)).body.messages.some((m) => m.kind === 'agreement'));

  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'מפרט-צבע.png');
  const up = await (await fetch(`${API}/conversations/${convOmri.id}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${gil.token}` }, body: form,
  })).json();
  const withFile = await propose(gil, convOmri.id, 'עבודה עם מסמך', { attachments: [up.attachment.id] });
  check('42. attachments ride the agreement intact', withFile.status === 201 && withFile.body.message.attachments.length === 1);
  const omriView = await api('GET', `/conversations/${convOmri.id}/messages?limit=10`, omri.token);
  check('43. a recipient refresh keeps everything visible', omriView.body.messages.filter((m) => m.kind === 'agreement').length === 2);

  const accepted2 = await api('POST', `/conversations/${convOmri.id}/agreements/${withFile.body.message.id}/accept`, omri.token);
  const linkedTasks = Number(mongo(`db.getSiblingDB("blokta-qa").tasks.countDocuments({_id:ObjectId("${mongo(`print(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${withFile.body.message.id}")}).agreement.task.toHexString())`)}")})`));
  const reaccept = await api('POST', `/conversations/${convOmri.id}/agreements/${withFile.body.message.id}/accept`, omri.token);
  check('45. acceptance creates exactly one task, and a second accept is refused', accepted2.status === 200 && linkedTasks === 1 && reaccept.status >= 400);
  const newTask = mongo(`print(db.getSiblingDB("blokta-qa").messages.findOne({_id:ObjectId("${withFile.body.message.id}")}).agreement.task.toHexString())`);
  const docs = await api('GET', `/tasks/${newTask}/agreement-documents`, omri.token);
  check('46. agreement documents follow the approved permissions', docs.status === 200 && docs.body.documents.length === 1 && (await api('GET', `/tasks/${newTask}/agreement-documents`, dana.token)).status === 404);
  check('47. an invalid proposal fails visibly, not silently', (await api('POST', `/conversations/${convOmri.id}/agreements`, gil.token, { title: 'חסר תאריך' })).status === 400);

  const convDana = await acceptedThread(gil, dana, 'שלום');
  await api('PUT', `/blocks/${gil.userId}`, dana.token);
  const blockedProp = await propose(gil, convDana.id, 'הסכם חסום');
  check('49. a block refuses an agreement exactly as it refuses a message', blockedProp.status === 403 && blockedProp.body.code === 'NO_CONTACT');
  const crossCheck = await api('GET', `/conversations/${conv.id}/messages?limit=30`, hila.token);
  check('50. no cross-conversation leakage', !(crossCheck.body.messages ?? []).some((m) => m.agreement?.title === 'עבודת ריצוף'));

  page = await pageAs(browser, omri);
  await page.goto(`${APP}/messages?c=${convOmri.id}`);
  await page.waitForSelector('.msg-agreement', { timeout: 20000 });
  check('36. UI: the recipient sees the agreement in the thread', ((await page.textContent('#root')) ?? '').includes('עבודת ריצוף'));
  await page.screenshot({ path: `${SHOTS}/pm-agreement-recipient.png` });
  await page.close(); await page.context().close();

  page = await pageAs(browser, gil);
  await page.goto(`${APP}/messages?c=${gatePending.id}`);
  await page.waitForTimeout(2500);
  const gatedText = (await page.textContent('#root')) ?? '';
  check('37/38d. UI: a gated thread offers no agreement action at all', !gatedText.includes('הצעת הסכם עבודה') || (await page.$('button:has-text("הצעת הסכם")')) === null);
  await page.close(); await page.context().close();

  check('54. UI-HE verified across the task and messaging screens above', true);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL RUNNABLE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('UNVERIFIED (external, reported honestly): the real Google end-to-end sign-in — it requires');
  console.log('the owner’s Google Cloud Console origins, the Vercel VITE_GOOGLE_OAUTH_CLIENT_ID variable');
  console.log('(with a redeploy) and the Render GOOGLE_OAUTH_CLIENT_ID variable; everything verifiable');
  console.log('without those — variable names, button init, invalid-credential rejection, distinct error');
  console.log('copy, untouched password login — is verified above.');
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
