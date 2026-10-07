import { Context } from "hono";
import { Jwt } from "hono/utils/jwt";

/**
 * P0-B4 (G1 + G2): admin gate.
 *
 * - G2: an HttpOnly / Secure / SameSite=Strict cookie (`admin_gate`, 7 days)
 *   is required to see the admin SPA page and to call any /admin/* API.
 * - G1: the cookie is obtained by visiting a page with `?k=<key>`:
 *     * the static bootstrap key from the `ADMIN_GATE_TOKEN` secret, or
 *     * a one-time token from D1 (`admin_gate_tokens`, consumed on first use).
 * Without the gate, the admin page answers a real branded 404 and /admin/*
 * APIs answer the framework's plain 404 — the admin surface is invisible.
 */

export const GATE_COOKIE_NAME = "admin_gate";
const GATE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const getAdminPath = (c: Context<HonoCustomType>): string => {
    let p = typeof c.env.ADMIN_PATH === "string" ? c.env.ADMIN_PATH.trim() : "";
    if (!p) p = "/admin";
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
};

/** `/admin`, `/admin/mails`, `/zh-TW/admin` ... for the configured admin path */
export const isAdminPagePath = (pathname: string, adminPath: string): boolean => {
    const candidates = [pathname];
    // language-prefixed alias, e.g. /zh-TW/admin
    const langMatch = pathname.match(/^\/[a-zA-Z]{2}(?:-[a-zA-Z]{2,4})?(\/.*)$/);
    if (langMatch) candidates.push(langMatch[1]);
    return candidates.some(p => p === adminPath || p.startsWith(adminPath + "/"));
};

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length === 0 || b.length === 0) return false;
    let diff = a.length ^ b.length;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
};

export const issueGateCookie = async (c: Context<HonoCustomType>): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const token = await Jwt.sign(
        { scope: "gate", iat: now, exp: now + GATE_MAX_AGE_SECONDS },
        c.env.JWT_SECRET, "HS256"
    );
    return `${GATE_COOKIE_NAME}=${token}; Path=/; Max-Age=${GATE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
};

const readCookie = (c: Context<HonoCustomType>, name: string): string | null => {
    const header = c.req.raw.headers.get("Cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx < 0) continue;
        if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
    }
    return null;
};

export const hasValidGate = async (c: Context<HonoCustomType>): Promise<boolean> => {
    const value = readCookie(c, GATE_COOKIE_NAME);
    if (!value) return false;
    try {
        const payload: any = await Jwt.verify(value, c.env.JWT_SECRET, "HS256");
        if (payload.scope !== "gate") return false;
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) return false;
        return true;
    } catch {
        return false;
    }
};

/**
 * G1: redeem `?k=`. Returns true when the key was valid.
 * One-time D1 tokens are consumed atomically on success.
 */
export const redeemGateKey = async (
    c: Context<HonoCustomType>, key: string
): Promise<boolean> => {
    if (!key) return false;
    const staticKey = typeof c.env.ADMIN_GATE_TOKEN === "string" ? c.env.ADMIN_GATE_TOKEN : "";
    if (staticKey && timingSafeEqual(key, staticKey)) return true;
    try {
        const now = Math.floor(Date.now() / 1000);
        const row = await c.env.DB.prepare(
            `SELECT token FROM admin_gate_tokens WHERE token = ? AND used_at IS NULL AND expires_at > ?`
        ).bind(key, now).first();
        if (!row) return false;
        const res = await c.env.DB.prepare(
            `UPDATE admin_gate_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL`
        ).bind(now, key).run();
        return (res.meta.changes ?? 0) > 0;
    } catch (e) {
        console.error("redeemGateKey failed", e);
        return false;
    }
};

/** Branded, indexable-by-nobody 404 for the admin *page*. */
export const notFoundPage = (title: string): Response => {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>404 | ${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #0b0e14; color: #e6e8ee; }
  .box { text-align: center; padding: 40px; }
  .code { font-size: 96px; font-weight: 800; letter-spacing: 8px; line-height: 1;
          background: linear-gradient(180deg, #7d8590, #30363d);
          -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tip { margin-top: 14px; color: #8b949e; font-size: 14px; }
  a { display: inline-block; margin-top: 22px; padding: 8px 18px; border: 1px solid #30363d;
      border-radius: 6px; color: #e6e8ee; text-decoration: none; font-size: 14px; }
  a:hover { border-color: #8b949e; }
  @media (prefers-color-scheme: light) {
    body { background: #f6f8fa; color: #1f2328; }
    .tip { color: #656d76; }
    a { border-color: #d0d7de; color: #1f2328; }
  }
</style>
</head>
<body>
  <div class="box">
    <div class="code">404</div>
    <div class="tip">页面不存在或已被移除</div>
    <a href="/">返回首页</a>
  </div>
</body>
</html>`;
    return new Response(html, {
        status: 404,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            // 404 responses are heuristically cacheable — never let a
            // gated-out admin page stick in the HTTP/PWA cache
            "Cache-Control": "no-store",
        },
    });
};

/** Inject the (server-side configurable) admin path into the SPA shell. */
export const injectAdminPath = (html: string, adminPath: string): string => {
    const snippet = `<script>window.__ADMIN_PATH__=${JSON.stringify(adminPath)};</script>`;
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>${snippet}`);
    }
    return snippet + html;
};
