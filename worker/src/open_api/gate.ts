import { Hono } from 'hono'

import {
    TOKEN_TTL_SECONDS, PING_FRESH_SECONDS,
    verifyGateNonce, generateGateToken, sha256Hex, checkGatePair,
} from '../admin_gate'

const api = new Hono<HonoCustomType>()

/**
 * POST /open_api/admin_gate_mint — the ONLY way to create an admin entry token.
 *
 * Called from the homepage admin link (Header dot). Requires the homepage
 * nonce (`window.__GATE_NONCE__`, 5-minute HMAC bucket) and is burst-limited
 * by the global RATE_LIMITER (10/min/IP) in worker.ts.
 *
 * Returns a single-use 64-hex token T valid for 60 seconds; only its
 * SHA-256 hash is persisted in `admin_gate_tokens`.
 */
api.post('/open_api/admin_gate_mint', async (c) => {
    const src = c.req.raw.headers.get('x-gate-src') || '';
    if (!await verifyGateNonce(c, src)) {
        return c.json({ message: 'invalid gate source' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const token = generateGateToken();
    try {
        const hash = await sha256Hex(token);
        await c.env.DB.prepare(
            `INSERT INTO admin_gate_tokens (token, created_at, expires_at) VALUES (?, ?, ?)`
        ).bind(hash, now, now + TOKEN_TTL_SECONDS).run();
        // opportunistic cleanup of long-spent tokens
        await c.env.DB.prepare(
            `DELETE FROM admin_gate_tokens WHERE expires_at < ?`
        ).bind(now - 3600).run();
    } catch (e) {
        console.error('admin_gate_mint failed', e);
        return c.json({ message: 'mint failed' }, 500);
    }
    return c.json({ success: true, token, expires_in: TOKEN_TTL_SECONDS });
});

/**
 * POST /open_api/admin_gate_ping — heartbeat for the admin tab.
 *
 * Deliberately outside /admin/* so it does not require an admin JWT (the
 * panel pings while the password prompt is still open). Needs the same
 * cookie + x-gate-tab pair as the API gate, with a wider freshness window
 * so a throttled / sleeping tab can recover; any successful ping restores
 * the normal 120s window.
 */
api.post('/open_api/admin_gate_ping', async (c) => {
    const ok = await checkGatePair(c, PING_FRESH_SECONDS, true);
    if (!ok) {
        c.header('Cache-Control', 'no-store');
        return c.notFound();
    }
    return c.json({ success: true });
});

export { api }
