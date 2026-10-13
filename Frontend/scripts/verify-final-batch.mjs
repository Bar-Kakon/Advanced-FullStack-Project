/**
 * The final-corrections batch, verified in one procedure: the hybrid Employee Management
 * experience, agreement documents reachable from task details (FIL-04), and the formula-level
 * audit of the Professional Rating and the Flexibility Score — every expected number below is
 * computed independently from the approved specification, never from the code under test.
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
const report = (verdict, label, detail = '') =>
  console.log(`  ${verdict.padEnd(6)}${String(label).padEnd(88)} ${detail}`);
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  report(passed ? 'PASS' : 'FAIL', label, detail);
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
  try { body = await res.json(); } catch { /* stream or 204 */ }
  return { status: res.status, body };
};

const register = async (name, index) => {
  const email = `fb.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `F${index}`, standing: 'owner',
    companyName: `${name} FB Co ${stamp}`, contractorCategory: 'main_contractor',
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

const seedCompletedTask = (createdBy, assignee, title) => mongo(`
  const qa = db.getSiblingDB("blokta-qa");
  const r = qa.tasks.insertOne({kind:"project", project:new ObjectId(), createdBy:ObjectId("${createdBy}"),
    assignee:ObjectId("${assignee}"), title:${JSON.stringify(title)}, startDate:new Date(Date.now()-20*86400000),
    dueDate:new Date(Date.now()-10*86400000), startedAt:new Date(Date.now()-19*86400000),
    completedAt:new Date(Date.now()-9*86400000), attachments:[], createdAt:new Date(), updatedAt:new Date()});
  print(r.insertedId.toHexString());`);

/**
 * One resolved reschedule proposal with one item for the respondent, in the exact stored shape the
 * coordination domain writes. `outcome` picks the approved event class being seeded.
 */
const seedOutcome = (respondent, requestedBy, outcome, { noticeDays = 0 } = {}) => {
  const base = `
    const qa = db.getSiblingDB("blokta-qa");
    const now = Date.now();
    const currentStart = new Date(now + 10*86400000);
    const createdAt = new Date(currentStart.getTime() - ${noticeDays}*86400000);
    const resolvedAt = new Date(currentStart.getTime() - 1);
    const taskId = new ObjectId();`;
  const item = (fields) => `
    qa.rescheduleproposals.insertOne({project:new ObjectId(), initiatingTask:taskId,
      requestedBy:ObjectId("${requestedBy}"), changes:CHANGES, status:"resolved", responseHours:72,
      items:[{task:taskId, respondent:ObjectId("${respondent}"), currentStart:currentStart,
        currentDue:new Date(currentStart.getTime()+5*86400000), proposedStart:new Date(currentStart.getTime()+2*86400000),
        proposedDue:new Date(currentStart.getTime()+7*86400000), reason:"initiating", excluded:false, ${fields}}],
      resolution:{by:ObjectId("${requestedBy}"), at:resolvedAt}, createdAt:createdAt, updatedAt:resolvedAt});`;
  const shapes = {
    accepted: item('response:"accepted", resolution:"proposed"').replace('CHANGES', '{deltaWorkingDays:2}'),
    alternative_agreed: item('response:"accepted", resolution:"proposed"').replace('CHANGES', '{alternativeStart:new Date(now+12*86400000)}'),
    counter_agreed: item('response:"countered", resolution:"counter", counterStart:new Date(now+12*86400000)').replace('CHANGES', '{deltaWorkingDays:2}'),
    other_solution_agreed: item('response:"other_proposed", resolution:"other", otherSolution:"קבלן משנה מטעמי"').replace('CHANGES', '{deltaWorkingDays:2}'),
    declined_justified: item('response:"declined", resolution:"proposed", declineReason:"health"').replace('CHANGES', '{deltaWorkingDays:2}'),
    unresolved_replaced: item('response:"declined", resolution:"replaced"').replace('CHANGES', '{deltaWorkingDays:2}') + `
    qa.workhandoffs.insertOne({task:taskId, from:ObjectId("${respondent}"), to:new ObjectId(),
      state:"accepted", decidedAt:new Date(resolvedAt.getTime()+1000), createdAt:new Date(), updatedAt:new Date()});`,
  };
  mongo(base + shapes[outcome]);
};

const flexibilityOf = async (viewerToken, userId) => {
  const { body } = await api('GET', `/browse/contractors/${userId}`, viewerToken);
  return body?.profile?.flexibility ?? null;
};

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures');
  const gil = await register('gil', 1);
  const hila = await register('hila', 2);
  const omri = await register('omri', 3);
  const nili = await register('nili', 4);
  const carmi = await register('carmi', 5);
  const adi = await register('adi', 6);
  const dana = await register('dana', 7);
  await api('POST', `/connections/${hila.userId}/request`, gil.token);
  await api('POST', `/connections/${gil.userId}/accept`, hila.token);

  section('E. EMPLOYEE MANAGEMENT — the hybrid model');
  let page = await pageAs(browser, gil);
  await page.goto(`${APP}/login`);
  await page.waitForTimeout(800);
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('#management-title', { timeout: 20000 });
  check('a normal login lands on /dashboard, never a forced onboarding', page.url().endsWith('/dashboard'));
  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('section[aria-labelledby]')].map((s) => s.getAttribute('aria-labelledby'));
    return { mgmt: ids.indexOf('management-title'), network: ids.indexOf('dashboard-network-title'), pending: ids.indexOf('dashboard-pending-title') };
  });
  check('the Management section sits after the summary and pending actions', order.mgmt > order.pending, JSON.stringify(order));
  check('and before the network and later sections', order.mgmt < order.network, '');
  check('its title is the approved one-word heading', (await page.textContent('#management-title'))?.trim() === 'ניהול');
  await page.screenshot({ path: `${SHOTS}/fb-dashboard-he.png` });
  await page.click('#management-title ~ ul a:has-text("ניהול עובדים"), .tool-list a:has-text("ניהול עובדים")');
  await page.waitForURL('**/employees', { timeout: 15000 });
  check('the dashboard entry opens /employees', page.url().includes('/employees'));
  await page.reload();
  await page.waitForTimeout(1500);
  check('the screen survives a refresh', page.url().includes('/employees'));
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('.app-nav__link:has-text("ניהול עובדים")', { timeout: 15000 });
  await page.click('.app-nav__link:has-text("ניהול עובדים")');
  await page.waitForURL('**/employees', { timeout: 15000 });
  check('the navbar entry still opens /employees', true);
  const langBtn = await page.$('.lang-switch button:not([aria-pressed="true"])');
  if (langBtn) {
    await page.goto(`${APP}/dashboard`); await page.waitForSelector('#management-title', { timeout: 15000 });
    await (await page.$('.lang-switch button:not([aria-pressed="true"])'))?.click();
    await page.waitForTimeout(600);
    check('EN: the section renders under its English title', ((await page.textContent('#management-title')) ?? '').trim() === 'Management');
    await page.screenshot({ path: `${SHOTS}/fb-dashboard-en.png` });
    await (await page.$('.lang-switch button:not([aria-pressed="true"])'))?.click();
  }
  await page.close(); await page.context().close();

  const meGil = await api('GET', '/auth/me', gil.token);
  check('onboarding state is the canonical employeeSetupComplete, initially false', meGil.body.user.company.employeeSetupComplete === false);
  page = await pageAs(browser, gil);
  await page.goto(`${APP}/onboarding/employees`);
  await page.waitForSelector('button', { timeout: 15000 });
  const skipBtn = await page.$('button:has-text("דילוג"), button:has-text("אדלג"), button:has-text("דלג")');
  check('UI: the optional onboarding screen is reachable and offers its two actions', skipBtn !== null);
  if (skipBtn) { await skipBtn.click(); await page.waitForTimeout(1500); }
  const afterSkip = await api('GET', '/auth/me', gil.token);
  check('Skip completes through the backend mechanism', afterSkip.body.user.company.employeeSetupComplete === true);
  await page.close(); await page.context().close();
  const finish = await api('POST', '/companies/employee-setup/complete', hila.token);
  check('Finish uses the same canonical completion', finish.status === 200 && (await api('GET', '/auth/me', hila.token)).body.user.company.employeeSetupComplete === true);
  check('skipping removed no access: the management screen still answers', (await api('GET', '/companies/employees', gil.token)).status === 200);

  mongo(`const qa = db.getSiblingDB("blokta-qa");
    const u = qa.users.findOne({email:"${nili.email}"});
    qa.companymemberships.updateOne({user:u._id},{$set:{permissions:[]}});`);
  check('the backend refuses a user without the capability', (await api('GET', '/companies/employees', nili.token)).status === 403);
  page = await pageAs(browser, nili);
  await page.goto(`${APP}/dashboard`);
  await page.waitForSelector('.app-nav__link', { timeout: 20000 });
  await page.waitForTimeout(1000);
  check('UI: no empty Management section for the unauthorized', (await page.$('#management-title')) === null);
  check('UI: and no navbar entry either', !((await page.textContent('nav')) ?? '').includes('ניהול עובדים'));
  await page.close(); await page.context().close();

  section('D. FIL-04 — agreement documents reach the task');
  const conv = (await api('POST', `/conversations/direct/${hila.userId}`, gil.token, { body: 'מתחילים' })).body.conversation;
  const assetsBefore = Number(mongo('db.getSiblingDB("blokta-qa").fileassets.countDocuments({})'));
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'תוכנית-עבודה.png');
  const up = await (await fetch(`${API}/conversations/${conv.id}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${gil.token}` }, body: form,
  })).json();
  const proposal = await api('POST', `/conversations/${conv.id}/agreements`, gil.token, {
    title: 'עבודת איטום', startDate: iso(3), dueDate: iso(12), attachments: [up.attachment.id],
  });
  const accepted = await api('POST', `/conversations/${conv.id}/agreements/${proposal.body.message.id}/accept`, hila.token);
  const taskId = mongo(`const qa = db.getSiblingDB("blokta-qa");
    print(qa.messages.findOne({_id:ObjectId("${proposal.body.message.id}")}).agreement.task.toHexString());`);
  check('the accepted agreement created its task', accepted.status === 200 && /^[0-9a-f]{24}$/.test(taskId), `task=${taskId}`);

  const detail = await api('GET', `/tasks/${taskId}`, hila.token);
  const docs = detail.body?.task?.agreementDocuments ?? [];
  check('the performer’s task detail lists the agreement document with its metadata',
    docs.length === 1 && docs[0].filename === 'תוכנית-עבודה.png' && docs[0].mimeType === 'image/png' && docs[0].sizeBytes > 0,
    JSON.stringify(docs));
  const bytes = await fetch(`${API}/tasks/${taskId}/agreement-files/${docs[0]?.id}`, { headers: { Authorization: `Bearer ${hila.token}` } });
  check('the performer retrieves the bytes through the task, not the conversation', bytes.status === 200 && (await bytes.arrayBuffer()).byteLength === docs[0].sizeBytes);
  const proposerBytes = await fetch(`${API}/tasks/${taskId}/agreement-files/${docs[0]?.id}`, { headers: { Authorization: `Bearer ${gil.token}` } });
  check('the commissioning party retrieves them too', proposerBytes.status === 200);
  const outsiderBytes = await fetch(`${API}/tasks/${taskId}/agreement-files/${docs[0]?.id}`, { headers: { Authorization: `Bearer ${omri.token}` } });
  check('an outsider is refused the bytes', outsiderBytes.status === 404);
  check('an outsider is refused the task detail itself', (await api('GET', `/tasks/${taskId}`, omri.token)).status === 404);
  const wrongFile = await fetch(`${API}/tasks/${taskId}/agreement-files/aaaaaaaaaaaaaaaaaaaaaaaa`, { headers: { Authorization: `Bearer ${hila.token}` } });
  check('a file the agreement never carried is refused', wrongFile.status === 404);
  const assetsAfter = Number(mongo('db.getSiblingDB("blokta-qa").fileassets.countDocuments({})'));
  check('no file bytes or asset rows were duplicated', assetsAfter === assetsBefore + 1, `before=${assetsBefore} after=${assetsAfter}`);
  const history = await api('GET', `/conversations/${conv.id}/messages?limit=10`, gil.token);
  const agreementRow = (history.body.messages ?? []).find((m) => m.kind === 'agreement');
  check('the original agreement message is intact, accepted, with its attachment', agreementRow?.agreement?.state === 'accepted' && (agreementRow?.attachments ?? []).length === 1);
  page = await pageAs(browser, hila);
  await page.goto(`${APP}/tasks/${taskId}`);
  await page.waitForSelector('#agreement-docs-title', { timeout: 20000 });
  const docText = (await page.textContent('#agreement-docs-title ~ ul, section:has(#agreement-docs-title)')) ?? '';
  check('UI: the «מסמכי ההסכם» section presents the file and its action', docText.includes('תוכנית-עבודה.png') && docText.includes('הורדת הקובץ'));
  await page.screenshot({ path: `${SHOTS}/fb-task-docs.png` });
  await page.close(); await page.context().close();
  const plainDetail = await api('GET', `/tasks/${await seedPlainTask(hila.userId)}`, hila.token);
  check('a task that never came from an agreement carries no documents section', (plainDetail.body?.task?.agreementDocuments ?? []).length === 0 && plainDetail.body?.task?.fromAgreement === false);

  section('R. PROFESSIONAL RATING — the formula against independent arithmetic');
  const w1 = seedCompletedTask(gil.userId, hila.userId, 'קידוח א');
  const w2 = seedCompletedTask(omri.userId, hila.userId, 'קידוח ב');
  const w3 = seedCompletedTask(nili.userId, hila.userId, 'קידוח ג');
  check('rating is a single approved 1–5 dimension; non-integers are refused by the contract',
    (await api('POST', '/ratings', gil.token, { rateeUserId: hila.userId, workId: w1, score: 3.5 })).status === 400);
  check('a score above the approved range is refused', (await api('POST', '/ratings', gil.token, { rateeUserId: hila.userId, workId: w1, score: 6 })).status === 400);
  check('a score below it is refused', (await api('POST', '/ratings', gil.token, { rateeUserId: hila.userId, workId: w1, score: 0 })).status === 400);
  for (const [who, work, score] of [[gil, w1, 5], [omri, w2, 4], [nili, w3, 2]]) {
    const r = await api('POST', '/ratings', who.token, { rateeUserId: hila.userId, workId: work, score });
    if (r.status !== 201) report('FAIL', `rating by ${who.name}`, JSON.stringify(r.body)), failures++;
  }
  const expectedMean = 11 / 3; // (5+4+2)/3, straight arithmetic mean — the approved aggregation
  const profile1 = await api('GET', `/browse/contractors/${hila.userId}`, carmi.token);
  const ratingOut = profile1.body.profile.rating;
  check('EXACT: the average is the unweighted mean of every rating', Math.abs(ratingOut.average - expectedMean) < 1e-9 && ratingOut.count === 3, `got ${ratingOut.average}`);
  check('EXACT: the displayed value renders at one decimal (3.7)', ratingOut.average.toFixed(1) === '3.7');
  check('one work carries one rating per rater', (await api('POST', '/ratings', gil.token, { rateeUserId: hila.userId, workId: w1, score: 1 })).status === 409);
  check('the other party may rate the same shared work from their side', (await api('POST', '/ratings', hila.token, { rateeUserId: gil.userId, workId: w1, score: 5 })).status === 201);
  check('no shared completed work — no rating', (await api('POST', '/ratings', carmi.token, { rateeUserId: hila.userId, workId: w1, score: 5 })).status === 403);
  check('self-rating is refused server-side', (await api('POST', '/ratings', hila.token, { rateeUserId: hila.userId, workId: w2, score: 5 })).status >= 400);
  const w4 = seedCompletedTask(omri.userId, dana.userId, 'עבודת גבס');
  await api('POST', '/ratings', omri.token, { rateeUserId: dana.userId, workId: w4, score: 3 });
  const atThree = await api('GET', `/browse/contractors?minRating=3&limit=48`, gil.token);
  const atFour = await api('GET', `/browse/contractors?minRating=4&limit=48`, gil.token);
  const listHas = (res, id) => (res.body.contractors ?? []).some((c) => c.userId === id);
  check('EXACT: an average of exactly 3.0 meets minRating=3 (inclusive threshold)', listHas(atThree, dana.userId));
  check('and does not meet minRating=4', !listHas(atFour, dana.userId));

  section('F. FLEXIBILITY SCORE — the formula against independent arithmetic');
  seedOutcome(hila.userId, gil.userId, 'accepted', { noticeDays: 5 });
  seedOutcome(hila.userId, gil.userId, 'counter_agreed');
  seedOutcome(hila.userId, hila.userId, 'alternative_agreed');
  seedOutcome(hila.userId, gil.userId, 'declined_justified');
  seedOutcome(hila.userId, gil.userId, 'unresolved_replaced');
  // Oracle: relevant = 4 (the justified decline leaves numerator AND denominator);
  // workable = 3 (acceptance, counter and alternative weigh the same); round(100*3/4) = 75.
  const flexHila = await flexibilityOf(carmi.token, hila.userId);
  check('EXACT: 3 workable of 4 relevant events → 75', flexHila?.schedule?.score === 75, `got ${flexHila?.schedule?.score}`);
  check('EXACT: the justified decline is outside numerator AND denominator', flexHila?.schedule?.context.events === 4 && flexHila?.schedule?.context.justifiedDeclines === 1);
  check('EXACT: a counter and an alternative weigh exactly like an acceptance', flexHila?.schedule?.context.workableResolutions === 3 && flexHila?.schedule?.context.directAcceptances === 1);
  check('the requester is context, never arithmetic', flexHila?.schedule?.context.changesRequestedBySelf === 1 && flexHila?.schedule?.context.changesRequestedByCounterparty === 3);
  check('CORRECTED: notice counts from the announcement, not the resolution', flexHila?.schedule?.context.withAdvanceNotice === 1, `withAdvanceNotice=${flexHila?.schedule?.context.withAdvanceNotice}`);
  const contextValues = Object.values(flexHila?.schedule?.context ?? {});
  check('privacy: the context is integers alone — no name, project, task, date or reason',
    contextValues.length > 0 && contextValues.every((v) => Number.isInteger(v)) && !/[א-ת]/.test(JSON.stringify(flexHila)));

  for (const o of ['accepted', 'counter_agreed', 'other_solution_agreed', 'alternative_agreed']) seedOutcome(omri.userId, gil.userId, o);
  const flexOmri = await flexibilityOf(carmi.token, omri.userId);
  check('EXACT: every workable kind, nothing else → 100', flexOmri?.schedule?.score === 100, `got ${flexOmri?.schedule?.score}`);
  seedOutcome(carmi.userId, gil.userId, 'unresolved_replaced');
  const flexCarmi = await flexibilityOf(gil.token, carmi.userId);
  check('EXACT: one unjustified failure and nothing else → a real 0', flexCarmi?.schedule?.score === 0, `got ${flexCarmi?.schedule?.score}`);
  seedOutcome(adi.userId, gil.userId, 'declined_justified');
  seedOutcome(adi.userId, gil.userId, 'declined_justified');
  const flexAdi = await flexibilityOf(gil.token, adi.userId);
  check('EXACT: justified declines alone produce NO score — null, never a lowered number', flexAdi === null || flexAdi.schedule === null, JSON.stringify(flexAdi));
  const flexDana = await flexibilityOf(gil.token, dana.userId);
  check('cold start stays the neutral no-score state', flexDana === null || flexDana.schedule === null);
  seedOutcome(gil.userId, omri.userId, 'accepted');
  seedOutcome(gil.userId, omri.userId, 'accepted');
  seedOutcome(gil.userId, omri.userId, 'unresolved_replaced');
  const flexGil = await flexibilityOf(omri.token, gil.userId);
  check('EXACT: rounding is to the nearest integer — 2 of 3 → 67', flexGil?.schedule?.score === 67, `got ${flexGil?.schedule?.score}`);
  check('scope flexibility stays null: no resolved scope evidence exists in the model', (flexHila?.scope ?? null) === null);

  page = await pageAs(browser, carmi);
  await page.goto(`${APP}/browse`);
  await page.waitForSelector('.c-card', { timeout: 20000 });
  const cardsText = (await page.textContent('#root')) ?? '';
  check('UI: the browse card now carries the real number for scored contractors', cardsText.includes('גמישות 75/100') && cardsText.includes('גמישות 100/100'));
  check('UI: and the honest empty mark for the unscored', cardsText.includes('אין עדיין ציון גמישות'));
  check('UI: no verbal judgement label anywhere (the owner forbade High/Medium/Low)', !cardsText.includes('גמישות גבוהה') && !cardsText.includes('גמישות נמוכה') && !cardsText.includes('גמישות בינונית'));
  await page.click(`.c-card:has-text("hila") button:has-text("צפייה בפרופיל")`);
  await page.waitForSelector('.pp-signals', { timeout: 15000 });
  const ppText = (await page.textContent('.pp-signals')) ?? '';
  check('UI: the public profile pairs the score with its aggregate context', ppText.includes('גמישות 75/100') && ppText.includes('4 אירועי תיאום'));
  check('UI: the rating beside it reads 3.7', ppText.includes('3.7'));
  await page.screenshot({ path: `${SHOTS}/fb-profile-signals.png` });
  await page.close(); await page.context().close();

  seedOutcome(hila.userId, gil.userId, 'accepted');
  const flexAfter = await flexibilityOf(carmi.token, hila.userId);
  check('EXACT: new resolved evidence moves the score on the next read — round(100*4/5) = 80', flexAfter?.schedule?.score === 80, `got ${flexAfter?.schedule?.score}`);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('NOT DETERMINABLE FROM APPROVED SOURCES (reported, deliberately not implemented):');
  console.log(' - the verbal category: the father required «גם ציון מספרי וגם קטגוריה מילולית», the owner');
  console.log('   later forbade any High/Medium/Low label (D6, 2026-08-30), and no category boundaries were');
  console.log('   ever approved — the contradiction needs one owner decision.');
  console.log(' - time weighting past 5 years (תשובות מאבא חלק 4, §15): qualitative guidance with no approved');
  console.log('   numeric decay — the current no-decay arithmetic is the recorded owner decision.');
  console.log(' - scope-flexibility events: no resolved scope-change record exists in the model; the dimension');
  console.log('   stays null rather than fabricated.');
  process.exit(failures === 0 ? 0 : 1);
};

const seedPlainTask = async (assignee) => mongo(`
  const qa = db.getSiblingDB("blokta-qa");
  const r = qa.tasks.insertOne({kind:"standalone", createdBy:ObjectId("${assignee}"), assignee:ObjectId("${assignee}"),
    title:"עבודה עצמאית", startDate:new Date(), dueDate:new Date(Date.now()+5*86400000), attachments:[],
    createdAt:new Date(), updatedAt:new Date()});
  print(r.insertedId.toHexString());`);

run().catch((e) => { console.error(e); process.exit(1); });
