import { Context } from "hono";
import { getAdminPath } from "../admin_gate";

/**
 * P0-B4 (G1): one-time admin gate tokens.
 * Created from the (already authenticated) admin panel, shown once,
 * consumed on the first `?k=` redemption and then dead.
 */

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 24 * 30;

const generateToken = (): string => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
};

export default {
    create: async (c: Context<HonoCustomType>) => {
        const body = await c.req.json().catch(() => ({} as any));
        const hours = Math.min(
            Math.max(Number(body?.ttl_hours) || DEFAULT_TTL_HOURS, 1),
            MAX_TTL_HOURS
        );
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + hours * 3600;
        const token = generateToken();
        await c.env.DB.prepare(
            `INSERT INTO admin_gate_tokens (token, created_at, expires_at) VALUES (?, ?, ?)`
        ).bind(token, now, expiresAt).run();
        const origin = new URL(c.req.url).origin;
        const adminPath = getAdminPath(c);
        return c.json({
            success: true,
            token,
            url: `${origin}${adminPath}?k=${token}`,
            ttl_hours: hours,
            expires_at: expiresAt,
        });
    },
    list: async (c: Context<HonoCustomType>) => {
        const now = Math.floor(Date.now() / 1000);
        const res = await c.env.DB.prepare(
            `SELECT token, created_at, expires_at FROM admin_gate_tokens
             WHERE used_at IS NULL AND expires_at > ?
             ORDER BY created_at DESC LIMIT 50`
        ).bind(now).all();
        return c.json({
            tokens: res.results ?? [],
            admin_path: getAdminPath(c),
            origin: new URL(c.req.url).origin,
        });
    },
    revoke: async (c: Context<HonoCustomType>) => {
        const body = await c.req.json().catch(() => ({} as any));
        if (!body?.token) return c.json({ success: false, message: "token required" }, 400);
        await c.env.DB.prepare(
            `DELETE FROM admin_gate_tokens WHERE token = ? AND used_at IS NULL`
        ).bind(body.token).run();
        return c.json({ success: true });
    },
}
