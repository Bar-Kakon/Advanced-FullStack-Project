/**
 * Settings: one canonical home per preference, entitlements enforced on the server, and no route
 * through which one account reaches another's.
 *
 *   npm run verify:settings
 */
import { Types } from 'mongoose';

import { PlanModel } from '../src/features/billing/plan.model.js';
import { PLAN_CATALOGUE } from '../src/features/billing/planCatalogue.js';
import { MuteModel } from '../src/features/mutes/mute.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-settings';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

interface Settings {
  readonly language: string;
  readonly notifications: {
    readonly operationalEmail: boolean;
    readonly timing: readonly unknown[];
    readonly digestHour: number | null;
  };
  readonly contactVisibility: { email: boolean; businessPhone: boolean; officePhone: boolean };
  readonly mutedProjects: readonly { projectId: string; name: string }[];
  readonly entitlements: Record<string, unknown>;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await MuteModel.deleteMany({}).exec();

  for (const seed of PLAN_CATALOGUE) {
    await PlanModel.updateOne(
      { code: seed.code },
      { $set: { ...seed, active: true, interval: 'month', provisional: true } },
      { upsert: true },
    ).exec();
  }

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const put = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PUT', path, { token, json });

  const owner = await createAccount(baseUrl, MARKER, 1);
  const other = await createAccount(baseUrl, MARKER, 2);

  const settingsOf = async (token: string): Promise<Settings> =>
    (((await get('/api/settings', token)).body as { settings: Settings }).settings);

  section('1. Settings read the fields the rest of the product already reads');
  const initial = await get('/api/settings', owner.token);
  check(initial.status === 200, 'the account reads its own settings', initial.status);
  const first = (initial.body as { settings: Settings }).settings;
  check(first.language === 'he', 'the language is the account language, defaulting to Hebrew',
    first.language);
  check(first.notifications.operationalEmail === true,
    'and the operational-email opt-in is the one chosen at registration');

  section('2. Language has one home, and Settings writes it there');
  const switched = await put('/api/settings/language', owner.token, { language: 'en' });
  check(switched.status === 200, 'the language is changed', switched.status);
  const stored = await UserModel.findById(owner.userId).lean().exec();
  check(stored?.language === 'en', 'and written to users.language, not to a settings blob',
    stored?.language);
  check((await settingsOf(owner.token)).language === 'en', 'the read agrees');

  const badLanguage = await put('/api/settings/language', owner.token, { language: 'fr' });
  check(badLanguage.status === 400, 'a language the product does not ship is refused',
    badLanguage.status);

  section('3. Operational email is optional, and refusing it breaks nothing');
  const optedOut = await put('/api/settings/notifications', owner.token, { operationalEmail: false });
  check(optedOut.status === 200, 'the opt-in can be withdrawn', optedOut.status);
  check((optedOut.body as { settings: Settings }).settings.notifications.operationalEmail === false,
    'and the answer reflects it');

  const stillWorks = await get('/api/settings', owner.token);
  check(stillWorks.status === 200, 'the account keeps working with no operational email at all',
    stillWorks.status);

  await put('/api/settings/notifications', owner.token, { operationalEmail: true });

  section('4. A partial write leaves the other preferences alone');
  await UserModel.updateOne({ _id: owner.userId }, { $set: { planCode: 'premium' } }).exec();
  await put('/api/settings/notifications', owner.token, {
    timing: [{ notificationClass: 'blocking', quietFromMinute: 1320, quietToMinute: 360 }],
    digestHour: 19,
  });
  const withTiming = await settingsOf(owner.token);
  check(withTiming.notifications.timing.length === 1, 'a Premium timing rule is stored',
    withTiming.notifications.timing.length);

  await put('/api/settings/notifications', owner.token, { operationalEmail: false });
  const afterPartial = await settingsOf(owner.token);
  check(afterPartial.notifications.timing.length === 1,
    'writing only the opt-in does not erase the timing rule beside it',
    afterPartial.notifications.timing.length);
  check(afterPartial.notifications.digestHour === 19, 'nor the digest hour',
    afterPartial.notifications.digestHour);
  await put('/api/settings/notifications', owner.token, { operationalEmail: true });

  section('5. Entitlements are reported, and enforced on the server');
  const premium = await settingsOf(owner.token);
  check(premium.entitlements['notificationTimingControls'] === true,
    'Premium carries the timing controls');
  check(premium.entitlements['notificationDigest'] === true, 'and the digest');

  await UserModel.updateOne({ _id: owner.userId }, { $set: { planCode: 'basic' } }).exec();
  const basic = await settingsOf(owner.token);
  check(basic.entitlements['notificationDigest'] === true,
    'Basic is where the digest starts, as the closed tier rule says');
  check(basic.entitlements['notificationTimingControls'] === false,
    'but the timing controls are Premium');
  check(basic.notifications.timing.length === 0,
    'a lapsed entitlement stops reporting the stored rules as in force',
    basic.notifications.timing.length);

  const stillStored = await UserModel.findById(owner.userId).lean().exec();
  check((stillStored?.notificationPreferences?.timing ?? []).length === 1,
    'though the rows survive the downgrade rather than being deleted');

  await UserModel.updateOne({ _id: owner.userId }, { $set: { planCode: 'free' } }).exec();
  const free = await settingsOf(owner.token);
  check(free.entitlements['notificationDigest'] === false, 'Free is blocking coverage only');
  check(free.entitlements['emailNotifications'] === false, 'and carries no email channel');

  section('6. A client cannot grant itself a Premium control');
  const grab = await put('/api/settings/notifications', owner.token, { digestHour: 2 });
  check(grab.status === 200, 'the request is answered rather than erroring', grab.status);
  const afterGrab = await UserModel.findById(owner.userId).lean().exec();
  check(afterGrab?.notificationPreferences?.digestHour === 19,
    'but the Free account did not move the digest hour',
    afterGrab?.notificationPreferences?.digestHour);

  section('7. Muted projects are listed from their own collection, not copied into settings');
  await UserModel.updateOne({ _id: owner.userId }, { $set: { planCode: 'premium' } }).exec();
  const created = await post('/api/projects', owner.token, {
    name: 'אתר ההגדרות', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;

  await put(`/api/mutes/projects/${projectId}`, owner.token, { muted: true });
  const withMute = await settingsOf(owner.token);
  check(withMute.mutedProjects.length === 1, 'the muted project is listed', withMute.mutedProjects.length);
  check(withMute.mutedProjects[0]?.projectId === projectId, 'and it is the right one');

  const settingsDoc = await UserModel.findById(owner.userId).lean<Record<string, unknown>>().exec();
  check(settingsDoc !== null && !('mutedProjects' in settingsDoc),
    'no copy of it was written onto the account document');
  const muteRows = await MuteModel.countDocuments({ user: owner.userId, scope: 'project' }).exec();
  check(muteRows === 1, 'the mute is still one row in its own collection', muteRows);

  await put(`/api/mutes/projects/${projectId}`, owner.token, { muted: false });
  check((await settingsOf(owner.token)).mutedProjects.length === 0, 'unmuting removes it from the list');

  section('8. Contact visibility is a preference here and a rule on the profile');
  const visibility = await put('/api/settings/contact-visibility', owner.token, {
    businessPhone: true, officePhone: true,
  });
  check(visibility.status === 200, 'the professional publishes their business numbers',
    visibility.status);
  const chosen = (visibility.body as { settings: Settings }).settings.contactVisibility;
  check(chosen.businessPhone === true && chosen.officePhone === true, 'both are recorded');
  check(chosen.email === true, 'and the email default is untouched by a partial write');

  section('9. No route reaches another account’s settings');
  const beforeOther = await settingsOf(other.token);
  const noUserId = await put('/api/settings/language', owner.token, {
    language: 'he', userId: other.userId.toString(),
  });
  check(noUserId.status === 200, 'naming somebody else is not a field the route has', noUserId.status);
  const afterOther = await settingsOf(other.token);
  check(afterOther.language === beforeOther.language,
    'and the other account’s language is unchanged', afterOther.language);

  const anonymous = await request(baseUrl, 'GET', '/api/settings', {});
  check(anonymous.status === 401, 'and settings need a session at all', anonymous.status);

  section('10. Nothing here duplicates Billing or invents a Messaging preference');
  const shape = JSON.stringify(await settingsOf(owner.token));
  for (const forbidden of ['price', 'amountMinor', 'paypal', 'checkout', 'message', 'conversation']) {
    check(!shape.toLowerCase().includes(forbidden.toLowerCase()),
      `settings carry no ${forbidden} field`);
  }
  check(shape.includes('planCode'),
    'the plan is named for entitlement reporting, which is not the same as owning billing');

  await MuteModel.deleteMany({}).exec();
  await ProjectMembershipModel.deleteMany({ user: owner.userId }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
