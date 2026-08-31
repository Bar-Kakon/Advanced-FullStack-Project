/**
 * Proves the upload and serving rules over real HTTP.
 *
 * The rules under test: only the approved image types are accepted, an oversized file is rejected,
 * the bytes land in GridFS rather than on disk, an asset is served only to the person who owns it,
 * replacing an avatar deletes the file it replaced, and a rejected upload leaves nothing behind.
 *
 *   npm run verify:media
 */
import mongoose from 'mongoose';

import { FileAssetModel } from '../src/features/files/fileAsset.model.js';
import { MAX_IMAGE_BYTES } from '../src/features/files/upload.middleware.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, rawRequest, request, section, startHarness } from './support/harness.js';

const MARKER = 'media-verify';

/** The shortest byte sequence a browser and a MIME sniffer both read as a PNG. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const imageForm = (field: string, bytes: Buffer, type: string, name: string): FormData => {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)], { type }), name);
  return form;
};

const countGridFsFiles = async (): Promise<number> => {
  const { db } = mongoose.connection;
  if (!db) throw new Error('No database connection.');

  return db.collection('uploads.files').countDocuments();
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const filesBefore = await countGridFsFiles();

  section('PUT /api/users/me/avatar');
  const uploaded = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: alice.token,
    form: imageForm('avatar', PNG_BYTES, 'image/png', 'avatar.png'),
  });
  const user = (uploaded.body['user'] ?? {}) as Record<string, unknown>;

  check(uploaded.status === 200, 'accepts a PNG', uploaded.status);
  check(typeof user['avatarUrl'] === 'string', 'returns an API path for the avatar', user['avatarUrl']);
  check(
    String(user['avatarUrl']).startsWith('/api/users/me/assets/'),
    'never exposes a storage path to the client',
    user['avatarUrl'],
  );

  const asset = await FileAssetModel.findOne({ owner: alice.userId, 'scope.type': 'avatar' }).lean().exec();
  check(asset?.storage?.driver === 'gridfs', 'recorded the file as stored in GridFS', asset?.storage?.driver);
  check((asset?.sizeBytes ?? 0) === PNG_BYTES.length, 'recorded the size the store counted', asset?.sizeBytes);
  check((await countGridFsFiles()) === filesBefore + 1, 'wrote exactly one file to the bucket');

  section('GET the asset');
  const own = await rawRequest(baseUrl, String(user['avatarUrl']), alice.token);
  const served = Buffer.from(await own.arrayBuffer());
  check(own.status === 200, 'serves the asset to its owner', own.status);
  check(own.headers.get('content-type')?.includes('image/png') === true, 'serves the recorded MIME type');
  check(served.equals(PNG_BYTES), 'serves the bytes unchanged');

  const foreign = await rawRequest(baseUrl, String(user['avatarUrl']), bob.token);
  check(foreign.status === 404, 'refuses the asset to anyone else — an id is not authorization', foreign.status);

  const anonymous = await fetch(`${baseUrl}${String(user['avatarUrl'])}`);
  check(anonymous.status === 401, 'refuses the asset without a token', anonymous.status);

  section('Rejected uploads');
  const wrongType = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: alice.token,
    // A .png name over a type the rules do not allow: the MIME type is what is checked.
    form: imageForm('avatar', Buffer.from('MZ'), 'application/x-msdownload', 'payload.png'),
  });
  check(wrongType.status === 400, 'refuses a type outside the approved list', wrongType.status);
  check(wrongType.body['code'] === 'UNSUPPORTED_FILE_TYPE', 'answers with the documented code', wrongType.body);

  const tooLarge = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: alice.token,
    form: imageForm('avatar', Buffer.alloc(MAX_IMAGE_BYTES + 1024, 1), 'image/png', 'huge.png'),
  });
  check(tooLarge.status === 413, 'refuses a file over the size limit', tooLarge.status);
  check(tooLarge.body['code'] === 'FILE_TOO_LARGE', 'answers with the documented code', tooLarge.body);

  const wrongField = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: alice.token,
    form: imageForm('portrait', PNG_BYTES, 'image/png', 'avatar.png'),
  });
  check(wrongField.status === 400, 'refuses a file under an unexpected field name', wrongField.status);

  check(
    (await countGridFsFiles()) === filesBefore + 1,
    'left no bytes behind from any rejected upload',
    await countGridFsFiles(),
  );

  section('Replacing and removing');
  const replaced = await request(baseUrl, 'PUT', '/api/users/me/avatar', {
    token: alice.token,
    form: imageForm('avatar', PNG_BYTES, 'image/png', 'avatar-2.png'),
  });
  check(replaced.status === 200, 'accepts a replacement', replaced.status);
  check(
    (await FileAssetModel.countDocuments({ owner: alice.userId, 'scope.type': 'avatar' }).exec()) === 1,
    'kept exactly one avatar row after the replacement',
  );
  check((await countGridFsFiles()) === filesBefore + 1, 'deleted the file it replaced');

  const removedAvatar = await request(baseUrl, 'DELETE', '/api/users/me/avatar', { token: alice.token });
  check(removedAvatar.status === 200, 'removes the avatar', removedAvatar.status);
  check(
    ((removedAvatar.body['user'] ?? {}) as Record<string, unknown>)['avatarUrl'] === null,
    'reports no avatar afterwards',
  );
  check((await countGridFsFiles()) === filesBefore, 'deleted the removed avatar’s bytes');

  section('A work entry with an image');
  const withImage = await request(baseUrl, 'POST', '/api/users/me/work-entries', {
    token: alice.token,
    form: (() => {
      const form = imageForm('image', PNG_BYTES, 'image/png', 'site.png');
      form.append('title', 'מגדל הראשונים');
      form.append('meta', '2025 · תל אביב');
      return form;
    })(),
  });
  const entry = (withImage.body['entry'] ?? {}) as Record<string, unknown>;
  check(withImage.status === 201, 'creates an entry carrying an image', withImage.status);
  check(typeof entry['imageUrl'] === 'string', 'returns an API path for the image', entry['imageUrl']);
  check((await countGridFsFiles()) === filesBefore + 1, 'stored the entry image');

  const deleted = await request(baseUrl, 'DELETE', `/api/users/me/work-entries/${String(entry['id'])}`, {
    token: alice.token,
  });
  check(deleted.status === 204, 'deletes the entry', deleted.status);
  check((await countGridFsFiles()) === filesBefore, 'deleted the image with the entry that referenced it');

  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
