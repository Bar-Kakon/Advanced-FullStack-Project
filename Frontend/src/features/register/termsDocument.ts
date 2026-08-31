/**
 * The version of the Terms of Use this client renders.
 *
 * The server records its own `TERMS_VERSION` against every acceptance and never trusts a value from
 * the browser, so this constant does not travel with the request — it is here so the document on
 * screen names the version a reader is agreeing to. It mirrors `PUBLISHED_TERMS_VERSION` in
 * `Backend/src/config/env.ts`, which is also the server's default, so an unconfigured deployment
 * shows and records the same version. Change the two together when new Terms are published.
 */
export const PUBLISHED_TERMS_VERSION = '2026-08-31';
