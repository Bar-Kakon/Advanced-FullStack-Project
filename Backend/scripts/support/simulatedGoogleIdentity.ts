/**
 * Preloaded into a local API process only, so Google ID tokens signed by a key generated here pass
 * the library's real signature, issuer, audience and expiry checks; genuine Google tokens are refused.
 */
import './developmentGuard.js';

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { OAuth2Client } from 'google-auth-library';

const keyFile = process.env['SIMULATED_GOOGLE_KEY_FILE'] ?? '';
if (keyFile.length === 0) {
  console.error('REFUSED: SIMULATED_GOOGLE_KEY_FILE is not set. Nothing was started.');
  process.exit(2);
}

const kid = `simulated-${Date.now()}`;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

writeFileSync(
  keyFile,
  JSON.stringify({ kid, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }),
  { mode: 0o600 },
);

const certs = { [kid]: publicKey.export({ type: 'spki', format: 'pem' }).toString() };

Object.assign(OAuth2Client.prototype, {
  getFederatedSignonCertsAsync: async () => ({ certs, format: 'PEM' }),
});

console.log('SIMULATED GOOGLE IDENTITY: this process trusts one locally generated key and no Google key.');
