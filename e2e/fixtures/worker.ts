import { Hono } from 'hono';
import worker from '../../worker/src/worker';
import { CONSTANTS } from '../../worker/src/constants';
import mailApi from './mail-api';
import dbApi from '../../worker/src/admin_api/db_api';
import { sha256Hex } from '../../worker/src/admin_gate';

const testApi = new Hono<HonoCustomType>();
testApi.post('/seed_mail', c => mailApi.seedMail(c.req.raw, c.env));
testApi.post('/receive_mail', c => mailApi.receiveMail(c.req.raw, c.env, c.executionCtx as ExecutionContext));
testApi.get('/telegram_binding', async c => {
  const address = c.req.query('address');
  if (!address) return c.text('address is required', 400);
  return c.json(await c.env.KV.get(`${CONSTANTS.TG_KV_PREFIX}:${address}`));
});

// ---- P0-B4 admin gate support (test-only) ----------------------------------
// Production only mints gate sessions through the served homepage shell
// (`?k=` redemption in the ASSETS branch), which this harness has no equivalent
// for (the SPA is served by vite, not by the worker). These routes let
// scripts/gate-setup.mjs bootstrap the tables and register one shared session
// for the whole suite; every /admin/* call the suite makes then goes through
// the real gate with Cookie + `x-gate-tab`.
const TEST_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

testApi.post('/db_initialize', c => dbApi.initialize(c));
testApi.post('/gate_session', async c => {
  const body = await c.req.json().catch(() => null);
  const session = body?.session;
  if (typeof session !== 'string' || session.length !== 64 || !/^[0-9a-f]+$/.test(session)) {
    return c.text('session must be a 64-char hex token', 400);
  }
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO admin_gate_sessions (token, created_at, expires_at, last_seen)
     VALUES (?, ?, ?, ?)`
  ).bind(await sha256Hex(session), now, now + TEST_SESSION_MAX_AGE_SECONDS, now).run();
  return c.json({ success: true });
});

const app = new Hono<HonoCustomType>();
// Keep the shared gate session's heartbeat fresh. Production refreshes
// `last_seen` on every successful gated call (admin_gate.ts checkGatePair),
// but a session on a rarely-used variant worker (gzip / send-mail-domain)
// exceeds the 120s freshness window between provisioning and the suite's
// first /admin call there, so the gate 404s. Every suite request carries the
// admin_gate cookie (storageState), so refreshing it here — BEFORE the
// worker's gate check — mirrors the production per-call heartbeat. The
// `last_seen <= ?` guard caps this at one write per 30s per worker.
app.use('*', async (c, next) => {
  const cookie = c.req.raw.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)admin_gate=([0-9a-f]{64})(?:\s*;|$)/);
  if (match) {
    try {
      const now = Math.floor(Date.now() / 1000);
      await c.env.DB.prepare(
        'UPDATE admin_gate_sessions SET last_seen = ? WHERE token = ? AND last_seen <= ?'
      ).bind(now, await sha256Hex(match[1]), now - 30).run();
    } catch {
      // session may not exist yet; the gate rejects it as usual
    }
  }
  await next();
});
app.route('/__test', testApi);
app.all('*', c => worker.fetch(c.req.raw, c.env, c.executionCtx));

export default { ...worker, fetch: app.fetch };
