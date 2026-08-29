/**
 * Shared plumbing for the profile verification scripts.
 *
 * Each script boots the *real* application — the same `createApp`, the same routes, the same
 * middleware — on an ephemeral port and drives it over real HTTP. Nothing is stubbed, so a check
 * that passes here passes against the server the client will talk to.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { config as loadEnvFile } from 'dotenv';

import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../../src/db/mongoose.js';

export interface Harness {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

export const startHarness = async (): Promise<Harness> => {
  loadEnvFile({ quiet: true });

  const config = loadConfig();
  await connectToDatabase(config.mongoUri);

  const server: Server = await new Promise((resolve) => {
    const listener = createApp(config).listen(0, () => resolve(listener));
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await disconnectFromDatabase();
    },
  };
};

export interface ApiResponse<T = Record<string, unknown>> {
  readonly status: number;
  readonly body: T;
}

const readBody = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (text.length === 0) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

export const request = async (
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
): Promise<ApiResponse> => {
  const headers: Record<string, string> = {};
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    // A FormData body sets its own multipart boundary; setting Content-Type by hand breaks it.
    body: options.form ?? (options.json === undefined ? null : JSON.stringify(options.json)),
  });

  return { status: response.status, body: await readBody(response) };
};

export const rawRequest = (
  baseUrl: string,
  path: string,
  token: string,
): Promise<Response> =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

/* ── tiny assertion helpers, so a failure names the rule that broke ─────────────────────────── */

let failures = 0;

export const check = (passed: boolean, description: string, detail?: unknown): void => {
  if (passed) {
    console.log(`  PASS  ${description}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${description}`);
  if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
};

export const section = (title: string): void => console.log(`\n${title}`);

export const finish = async (harness: Harness): Promise<never> => {
  await harness.stop();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};
