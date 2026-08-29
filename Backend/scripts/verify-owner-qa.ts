/** Work-entry editing, work-entry photos, heavy-equipment storage and Browse self-exclusion. */
import { Types } from 'mongoose';

import { FileAssetModel } from '../src/features/files/fileAsset.model.js';
import { RatingModel } from '../src/features/ratings/rating.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { WorkEntryModel } from '../src/features/workentries/workEntry.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, rawRequest, request, section, startHarness } from './support/harness.js';

const MARKER = 'ownerqa-verify';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const workForm = (fields: Record<string, string>, imageName?: string): FormData => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (imageName !== undefined) {
    form.append('image', new Blob([new Uint8Array(PNG_BYTES)], { type: 'image/png' }), imageName);
  }
  return form;
};

interface WorkEntryShape {
  readonly id: string;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  readonly imageUrl: string | null;
}

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const owner = await createAccount(baseUrl, MARKER, 1);
  const stranger = await createAccount(baseUrl, MARKER, 2);

  const me = (token: string) => request(baseUrl, 'GET', '/api/users/me', { token });
  const workOf = (body: Record<string, unknown>): WorkEntryShape[] =>
    (body['user'] as { work: WorkEntryShape[] }).work;

  section('1. Editing a Completed Work entry');
  const created = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: owner.token,
    form: workForm({ title: 'Original title', meta: 'Haifa · 2024', scope: 'Original scope' }),
  });
  check(created.status === 201, 'an entry is created', created.body);
  const entry = created.body['entry'] as WorkEntryShape;

  const edited = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${entry.id}`, {
    token: owner.token,
    form: workForm({ title: 'Edited title', meta: 'Haifa · 2025' }),
  });
  check(edited.status === 200, 'editing answers 200', edited.body);
  const editedEntry = edited.body['entry'] as WorkEntryShape;
  check(editedEntry.title === 'Edited title', 'the title is the edited one', editedEntry.title);
  check(editedEntry.meta === 'Haifa · 2025', 'the meta is the edited one', editedEntry.meta);
  check(editedEntry.scope === 'Original scope', 'an untouched field is not wiped', editedEntry.scope);

  const reread = await me(owner.token);
  const rereadEntry = workOf(reread.body).find((row) => row.id === entry.id);
  check(rereadEntry?.title === 'Edited title', 'a fresh read still shows it', rereadEntry?.title);

  const stored = await WorkEntryModel.findById(entry.id).lean().exec();
  check(stored?.title === 'Edited title', 'and the database holds it', stored?.title);

  section('2. An empty scope clears the optional line');
  const cleared = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${entry.id}`, {
    token: owner.token,
    form: workForm({ scope: '' }),
  });
  check(cleared.status === 200, 'clearing the scope answers 200', cleared.body);
  const afterClear = await WorkEntryModel.findById(entry.id).lean().exec();
  check(afterClear?.scope === undefined, 'the field is absent, not blank', afterClear?.scope);

  section('3. A person can only edit their own work');
  const byStranger = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${entry.id}`, {
    token: stranger.token,
    form: workForm({ title: 'Hijacked' }),
  });
  check(byStranger.status === 404, 'another account is answered 404', byStranger.status);
  const untouched = await WorkEntryModel.findById(entry.id).lean().exec();
  check(untouched?.title === 'Edited title', 'and the entry is unchanged', untouched?.title);

  const anonymous = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${entry.id}`, {
    form: workForm({ title: 'Hijacked' }),
  });
  check(anonymous.status === 401, 'an unauthenticated caller is refused', anonymous.status);

  section('4. A failed edit is a failure, never a quiet success');
  const empty = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${entry.id}`, {
    token: owner.token,
    form: workForm({ title: '' }),
  });
  check(empty.status === 400, 'an empty title is refused', empty.status);
  const stillThere = await WorkEntryModel.findById(entry.id).lean().exec();
  check(stillThere?.title === 'Edited title', 'and nothing was written', stillThere?.title);

  const missing = await request(baseUrl, 'PATCH', '/api/users/me/work-entries/64b7f3a2c1d4e5f6a7b8c9d0', {
    token: owner.token,
    form: workForm({ title: 'Nowhere' }),
  });
  check(missing.status === 404, 'an unknown entry answers 404', missing.status);

  section('5. A work-entry photo is stored, served and survives a reload');
  const withPhoto = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: owner.token,
    form: workForm({ title: 'Photographed job', meta: 'Tel Aviv · 2025' }, 'job.png'),
  });
  check(withPhoto.status === 201, 'an entry with a picture is created', withPhoto.body);
  const photoEntry = withPhoto.body['entry'] as WorkEntryShape;
  check(photoEntry.imageUrl !== null, 'the answer carries an image URL', photoEntry.imageUrl);

  const firstAssetId = photoEntry.imageUrl?.split('/').pop() ?? '';
  const fetched = await rawRequest(baseUrl, `/api/users/me/assets/${firstAssetId}`, owner.token);
  check(fetched.status === 200, 'the owner can fetch the bytes', fetched.status);
  check(fetched.headers.get('content-type')?.startsWith('image/png') === true,
    'and they are served as a PNG', fetched.headers.get('content-type'));
  const bytes = Buffer.from(await fetched.arrayBuffer());
  check(bytes.equals(PNG_BYTES), 'byte for byte the file that was uploaded');

  const byOther = await rawRequest(baseUrl, `/api/users/me/assets/${firstAssetId}`, stranger.token);
  check(byOther.status === 404, 'another account cannot fetch it', byOther.status);

  const afterReload = await me(owner.token);
  const reloadedPhoto = workOf(afterReload.body).find((row) => row.id === photoEntry.id);
  check(reloadedPhoto?.imageUrl === photoEntry.imageUrl, 'a fresh read returns the same URL',
    reloadedPhoto?.imageUrl);

  section('6. Replacing a photo deletes the one it replaced');
  const assetsBefore = await FileAssetModel.countDocuments({ owner: owner.userId }).exec();
  const replaced = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${photoEntry.id}`, {
    token: owner.token,
    form: workForm({ title: 'Photographed job, corrected' }, 'job-2.png'),
  });
  check(replaced.status === 200, 'replacing answers 200', replaced.body);
  const replacedEntry = replaced.body['entry'] as WorkEntryShape;
  check(replacedEntry.imageUrl !== photoEntry.imageUrl, 'the image URL moved on', replacedEntry.imageUrl);
  check(replacedEntry.title === 'Photographed job, corrected', 'and the text edit landed too');

  const assetsAfter = await FileAssetModel.countDocuments({ owner: owner.userId }).exec();
  check(assetsAfter === assetsBefore, 'one asset in, one asset out', { assetsBefore, assetsAfter });
  const oldAsset = await rawRequest(baseUrl, `/api/users/me/assets/${firstAssetId}`, owner.token);
  check(oldAsset.status === 404, 'the replaced file is gone', oldAsset.status);

  section('7. A bad file is refused and leaves nothing behind');
  const assetsBeforeBad = await FileAssetModel.countDocuments({ owner: owner.userId }).exec();
  const badForm = new FormData();
  badForm.append('title', 'Text file');
  badForm.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'notes.txt');
  const badType = await request(baseUrl, 'PATCH', `/api/users/me/work-entries/${photoEntry.id}`, {
    token: owner.token, form: badForm,
  });
  check(badType.status === 415 || badType.status === 400, 'a non-image is refused', badType.status);
  const assetsAfterBad = await FileAssetModel.countDocuments({ owner: owner.userId }).exec();
  check(assetsAfterBad === assetsBeforeBad, 'and no asset row was written',
    { assetsBeforeBad, assetsAfterBad });

  section('8. The heavy-equipment selection is stored');
  const saved = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { specialties: ['heavy_equipment', 'drilling'], heavyEquipment: ['excavator', 'bobcat'] },
  });
  check(saved.status === 200, 'saving answers 200', saved.body);
  const savedUser = saved.body['user'] as { heavyEquipment: string[] };
  check(savedUser.heavyEquipment.length === 2, 'the answer carries both machines', savedUser.heavyEquipment);

  const storedUser = await UserModel.findById(owner.userId).lean().exec();
  check(
    JSON.stringify(storedUser?.heavyEquipment) === JSON.stringify(['excavator', 'bobcat']),
    'and the database holds them in order',
    storedUser?.heavyEquipment,
  );

  const afterProfileReload = await me(owner.token);
  const reloadedUser = afterProfileReload.body['user'] as { heavyEquipment: string[] };
  check(reloadedUser.heavyEquipment.includes('excavator'), 'a fresh read returns the saved list',
    reloadedUser.heavyEquipment);

  section('9. The machines cannot outlive the trade that carries them');
  const dropped = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { specialties: ['drilling'] },
  });
  check(dropped.status === 200, 'dropping the trade answers 200', dropped.body);
  const afterDrop = await UserModel.findById(owner.userId).lean().exec();
  check((afterDrop?.heavyEquipment ?? []).length === 0, 'the machine list is cleared with it',
    afterDrop?.heavyEquipment);

  const sneaked = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { heavyEquipment: ['bulldozer'] },
  });
  check(sneaked.status === 200, 'sending machines without the trade is accepted', sneaked.body);
  const afterSneak = await UserModel.findById(owner.userId).lean().exec();
  check((afterSneak?.heavyEquipment ?? []).length === 0, 'but nothing is stored',
    afterSneak?.heavyEquipment);

  section('10. Only the ten approved machine codes are accepted');
  const invented = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { specialties: ['heavy_equipment'], heavyEquipment: ['spaceship'] },
  });
  check(invented.status === 400, 'an invented code is refused', invented.status);

  const restored = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { specialties: ['heavy_equipment'], heavyEquipment: [] },
  });
  check(restored.status === 200, 'an empty list is a real answer', restored.status);
  const afterEmpty = await UserModel.findById(owner.userId).lean().exec();
  check((afterEmpty?.heavyEquipment ?? []).length === 0, 'and it is stored as empty',
    afterEmpty?.heavyEquipment);

  section('11. The searcher is never one of their own Browse results');
  const ownerId = owner.userId.toString();
  const paths = [
    '/api/browse/contractors',
    '/api/browse/contractors?q=Verify',
    '/api/browse/contractors?specialty=heavy_equipment',
    '/api/browse/contractors?region=haifa',
    '/api/browse/contractors?availability=open',
    '/api/browse/contractors?limit=1',
  ];

  for (const path of paths) {
    const page = await request(baseUrl, 'GET', path, { token: owner.token });
    const rows = (page.body['contractors'] ?? []) as { userId: string }[];
    check(page.status === 200, `${path} answers 200`, page.status);
    check(!rows.some((row) => row.userId === ownerId), `${path} does not contain the searcher`);
  }

  section('12. Paging past the first page still never shows the searcher');
  let cursor: string | null = null;
  let pages = 0;
  let sawSelf = false;
  do {
    const page: { status: number; body: Record<string, unknown> } = await request(
      baseUrl,
      'GET',
      `/api/browse/contractors?limit=1${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      { token: owner.token },
    );
    const rows = (page.body['contractors'] ?? []) as { userId: string }[];
    if (rows.some((row) => row.userId === ownerId)) sawSelf = true;
    cursor = (page.body['nextCursor'] ?? null) as string | null;
    pages += 1;
  } while (cursor !== null && pages < 12);
  check(!sawSelf, `walked ${pages} page(s) and never met the searcher`);

  section('13. Everybody else is still discoverable');
  const strangerSees = await request(baseUrl, 'GET', '/api/browse/contractors?q=Verify', {
    token: stranger.token,
  });
  const strangerRows = (strangerSees.body['contractors'] ?? []) as { userId: string }[];
  check(strangerRows.some((row) => row.userId === ownerId),
    'a different viewer still finds the same person');

  section('14. A public profile serves the pictures it advertises');
  const avatarForm = new FormData();
  avatarForm.append('avatar', new Blob([new Uint8Array(PNG_BYTES)], { type: 'image/png' }), 'me.png');
  const avatarUp = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: owner.token, form: avatarForm,
  });
  check(avatarUp.status === 200, 'the contractor has an avatar', avatarUp.status);

  const seen = await request(baseUrl, 'GET', `/api/browse/contractors/${ownerId}`, {
    token: stranger.token,
  });
  check(seen.status === 200, 'the profile is readable by another viewer', seen.status);
  const publicProfile = seen.body['profile'] as {
    avatarUrl: string | null;
    work: { id: string; imageUrl: string | null }[];
  };

  check(publicProfile.avatarUrl !== null, 'it advertises an avatar URL', publicProfile.avatarUrl);
  const avatarSeen = await rawRequest(baseUrl, publicProfile.avatarUrl ?? '', stranger.token);
  check(avatarSeen.status === 200, 'and that URL really serves the bytes', avatarSeen.status);
  const avatarBytes = Buffer.from(await avatarSeen.arrayBuffer());
  check(avatarBytes.equals(PNG_BYTES), 'byte for byte');

  const publicPhoto = publicProfile.work.find((row) => row.imageUrl !== null);
  check(publicPhoto !== undefined, 'a work entry advertises a photo URL', publicPhoto?.imageUrl);
  const photoSeen = await rawRequest(baseUrl, publicPhoto?.imageUrl ?? '', stranger.token);
  check(photoSeen.status === 200, 'and that URL serves it to another viewer', photoSeen.status);
  check(photoSeen.headers.get('content-type')?.startsWith('image/png') === true,
    'as a PNG', photoSeen.headers.get('content-type'));

  section('15. A public picture route discloses nothing it should not');
  const anonymousAvatar = await fetch(`${baseUrl}${publicProfile.avatarUrl ?? ''}`);
  check(anonymousAvatar.status === 401, 'an unauthenticated caller is refused', anonymousAvatar.status);

  const wrongOwner = await rawRequest(
    baseUrl,
    `/api/browse/contractors/${stranger.userId.toString()}/work-entries/${photoEntry.id}/image`,
    owner.token,
  );
  check(wrongOwner.status === 404, "another contractor's entry id answers 404", wrongOwner.status);

  const unknownPerson = await rawRequest(
    baseUrl, '/api/browse/contractors/64b7f3a2c1d4e5f6a7b8c9d0/avatar', owner.token,
  );
  check(unknownPerson.status === 404, 'an unknown person answers 404', unknownPerson.status);

  const blocked = await request(baseUrl, 'PUT', `/api/blocks/${ownerId}`, { token: stranger.token });
  check(blocked.status === 200 || blocked.status === 201, 'the viewer blocks the contractor', blocked.status);
  const blockedAvatar = await rawRequest(baseUrl, publicProfile.avatarUrl ?? '', stranger.token);
  check(blockedAvatar.status === 404, 'a blocked profile serves no picture either', blockedAvatar.status);
  await request(baseUrl, 'DELETE', `/api/blocks/${ownerId}`, { token: stranger.token });

  section('16. Browse can be sorted, and only in orders that exist');
  const rated = await createAccount(baseUrl, MARKER, 3);
  const alsoRated = await createAccount(baseUrl, MARKER, 4);

  const rate = (ratee: typeof rated, score: number) =>
    RatingModel.create({
      rater: stranger.userId, ratee: ratee.userId, score, task: new Types.ObjectId(),
    });
  await rate(rated, 5);
  await rate(alsoRated, 3);

  const byRating = await request(baseUrl, 'GET', '/api/browse/contractors?sort=rating_desc&q=Verify', {
    token: stranger.token,
  });
  check(byRating.status === 200, 'a rating-sorted page answers 200', byRating.body);
  const order = ((byRating.body['contractors'] ?? []) as { userId: string }[]).map((r) => r.userId);
  const highest = order.indexOf(rated.userId.toString());
  const middle = order.indexOf(alsoRated.userId.toString());
  const unrated = order.indexOf(owner.userId.toString());

  // Relative order, not absolute position: other rated accounts may share this search term.
  check(highest >= 0 && middle >= 0 && unrated >= 0, 'all three are on the page',
    { highest, middle, unrated });
  check(highest < middle, 'the five-star contractor sorts above the three-star one',
    { highest, middle });
  check(middle < unrated, 'and an unrated contractor sorts below both, never as a zero',
    { middle, unrated });

  section('17. A rating-sorted page still pages without repeating or skipping');
  let ratingCursor: string | null = null;
  const walked: string[] = [];
  let steps = 0;
  do {
    const page: { body: Record<string, unknown> } = await request(
      baseUrl,
      'GET',
      `/api/browse/contractors?sort=rating_desc&q=Verify&limit=1${ratingCursor === null ? '' : `&cursor=${encodeURIComponent(ratingCursor)}`}`,
      { token: stranger.token },
    );
    for (const row of (page.body['contractors'] ?? []) as { userId: string }[]) walked.push(row.userId);
    ratingCursor = (page.body['nextCursor'] ?? null) as string | null;
    steps += 1;
  } while (ratingCursor !== null && steps < 12);

  check(new Set(walked).size === walked.length, 'no contractor appeared twice', walked);
  check(walked[0] === rated.userId.toString(), 'and the order held across pages', walked[0]);

  section('18. The default order is unchanged, and an invented order is refused');
  const byDefault = await request(baseUrl, 'GET', '/api/browse/contractors?q=Verify', {
    token: stranger.token,
  });
  const explicit = await request(baseUrl, 'GET', '/api/browse/contractors?sort=relevance&q=Verify', {
    token: stranger.token,
  });
  check(
    JSON.stringify(byDefault.body['contractors']) === JSON.stringify(explicit.body['contractors']),
    'no sort and sort=relevance return the same page',
  );

  const inventedSort = await request(baseUrl, 'GET', '/api/browse/contractors?sort=flexibility_desc', {
    token: stranger.token,
  });
  check(inventedSort.status === 400, 'a flexibility order is refused, not silently ignored',
    inventedSort.status);

  await RatingModel.deleteMany({ rater: stranger.userId }).exec();
  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});