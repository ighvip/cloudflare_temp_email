#!/usr/bin/env node
// Provision the P0-B4 admin gate + database for the e2e suite.
//
// For every worker URL in the environment:
//   1. POST /__test/db_initialize  — bootstrap tables (test-only escape hatch;
//      the real /admin/db_initialize is gated and needs a session first)
//   2. POST /__test/gate_session   — register ONE shared session S in that
//      worker's admin_gate_sessions
//   3. POST /admin/db_migration    — through the REAL gate (Cookie +
//      x-gate-tab) so the gate itself is exercised and verified
//
// Then writes a Playwright storageState file carrying the `admin_gate` cookie
// for every worker origin and prints S (stdout only — diagnostics go to
// stderr) for the runner to export as GATE_SESSION.
//
// Used by both scripts/docker-entrypoint.sh (Docker) and local non-Docker runs.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workers = [
  { env: 'WORKER_URL', url: process.env.WORKER_URL },
  { env: 'WORKER_URL_SUBDOMAIN', url: process.env.WORKER_URL_SUBDOMAIN },
  { env: 'WORKER_URL_ENV_OFF', url: process.env.WORKER_URL_ENV_OFF },
  { env: 'WORKER_GZIP_URL', url: process.env.WORKER_GZIP_URL },
  { env: 'WORKER_URL_SEND_MAIL_DOMAIN', url: process.env.WORKER_URL_SEND_MAIL_DOMAIN },
  {
    env: 'WORKER_URL_SITE_PASSWORD',
    url: process.env.WORKER_URL_SITE_PASSWORD,
    // this worker sits behind the site-password gate (x-custom-auth)
    extraHeaders: { 'x-custom-auth': process.env.E2E_SITE_PASSWORD || 'e2e-site-pass' },
  },
].filter(w => w.url);

if (!workers.some(w => w.env === 'WORKER_URL')) {
  console.error('[gate-setup] WORKER_URL is required');
  process.exit(1);
}

const session = process.env.GATE_SESSION || randomBytes(32).toString('hex');
if (!/^[0-9a-f]{64}$/.test(session)) {
  console.error('[gate-setup] GATE_SESSION must be 64 hex chars');
  process.exit(1);
}

const stateFile = process.env.GATE_STATE_FILE
  || fileURLToPath(new URL('../.gate-state.json', import.meta.url));

const gateHeaders = {
  'x-gate-tab': session,
  cookie: `admin_gate=${session}`,
  // site-password worker fixtures do not disable the admin password check
  'x-admin-auth': process.env.E2E_ADMIN_PASSWORD || 'e2e-admin-pass',
};

const post = async (base, path, headers, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${base}${path} -> ${res.status} ${await res.text()}`);
  }
  return res;
};

for (const worker of workers) {
  const base = worker.url.replace(/\/$/, '');
  const extra = worker.extraHeaders || {};
  console.error(`[gate-setup] ${worker.env}=${base}`);
  await post(base, '/__test/db_initialize', extra);
  await post(base, '/__test/gate_session', extra, { session });
  // real gate path: must pass Cookie + x-gate-tab or this throws
  await post(base, '/admin/db_migration', { ...extra, ...gateHeaders });
}

const cookies = workers.map(w => {
  const { hostname } = new URL(w.url);
  return {
    name: 'admin_gate',
    value: session,
    // storageState requires domain/path (the `url` shorthand is addCookies-only)
    domain: hostname,
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: 'Strict',
  };
});
writeFileSync(stateFile, JSON.stringify({ cookies, origins: [] }, null, 2));
console.error(`[gate-setup] state written: ${stateFile} (${cookies.length} origin(s))`);

// stdout = session only, for the runner to export as GATE_SESSION
process.stdout.write(session);
