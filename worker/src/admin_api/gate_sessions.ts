import { Context } from "hono";
import { clearGateCookie, getCurrentGateHash } from "../admin_gate";

/**
 * P0-B4 rework: admin gate SESSION manager (panel "管理员" tab).
 *
 * One-time `?k=` tokens can no longer be created from the panel — the only
 * mint source is the homepage admin link (POST /open_api/admin_gate_mint).
 * The panel therefore only *lists and revokes live sessions*: the browser
 * that clicked the homepage entry, plus any other window still holding one.
 */

type SessionRow = {
    token: string;
    created_at: number;
    expires_at: number;
    last_seen: number;
    revoked_at: number | null;
};

export default {
    list: async (c: Context<HonoCustomType>) => {
        const now = Math.floor(Date.now() / 1000);
        const res = await c.env.DB.prepare(
            `SELECT token, created_at, expires_at, last_seen, revoked_at
             FROM admin_gate_sessions
             ORDER BY created_at DESC LIMIT 50`
        ).all();
        const currentHash = await getCurrentGateHash(c);
        const sessions = ((res.results ?? []) as SessionRow[]).map(row => ({
            // hash prefix only — the plaintext session never leaves the browser
            token_hash: row.token,
            prefix: `${row.token.slice(0, 16)}…`,
            created_at: row.created_at,
            expires_at: row.expires_at,
            last_seen: row.last_seen,
            revoked_at: row.revoked_at,
            active: !row.revoked_at && row.expires_at > now,
            current: !!currentHash && row.token === currentHash,
        }));
        return c.json({ sessions });
    },
    revoke: async (c: Context<HonoCustomType>) => {
        const body = await c.req.json().catch(() => ({} as any));
        const now = Math.floor(Date.now() / 1000);
        const currentHash = await getCurrentGateHash(c);

        if (body?.current) {
            // logout path: kill the session of this browser and drop the cookie
            if (!currentHash) return c.json({ success: true });
            await c.env.DB.prepare(
                `UPDATE admin_gate_sessions SET revoked_at = ?
                 WHERE token = ? AND revoked_at IS NULL`
            ).bind(now, currentHash).run();
            c.header("Set-Cookie", clearGateCookie());
            return c.json({ success: true });
        }

        if (body?.all_except_current) {
            await c.env.DB.prepare(
                `UPDATE admin_gate_sessions SET revoked_at = ?
                 WHERE revoked_at IS NULL AND token != ?`
            ).bind(now, currentHash || "").run();
            return c.json({ success: true });
        }

        if (typeof body?.token_hash === "string" && body.token_hash.length === 64) {
            const res = await c.env.DB.prepare(
                `UPDATE admin_gate_sessions SET revoked_at = ?
                 WHERE token = ? AND revoked_at IS NULL`
            ).bind(now, body.token_hash).run();
            const revoked = (res.meta.changes ?? 0) > 0;
            // revoking our own session logs this window out as well
            if (revoked && body.token_hash === currentHash) {
                c.header("Set-Cookie", clearGateCookie());
            }
            return c.json({ success: true, revoked });
        }

        return c.json({ success: false, message: "token_hash required" }, 400);
    },
};
