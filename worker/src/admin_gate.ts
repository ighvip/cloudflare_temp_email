import { Context } from "hono";

/**
 * P0-B4 → homepage-minted admin gate (static bootstrap key removed).
 *
 * Flow:
 *   homepage click → POST /open_api/admin_gate_mint (homepage nonce + rate limit)
 *     → T: one-time 64-hex token, 60s TTL, only its SHA-256 hash is stored
 *   new window opens `<adminPath>?k=T`
 *     → T is consumed atomically → S: session token (64 hex, 7 days, hashed)
 *     → 302 to `<adminPath>#gt=<S>` + HttpOnly session cookie (no Max-Age)
 *   the SPA keeps S in sessionStorage and sends it as `x-gate-tab` on every
 *   /admin/* request; a heartbeat refreshes `last_seen` every 30s.
 *
 * Closing the admin window destroys sessionStorage (the tab dies instantly)
 * and stops the heartbeat, so the server-side session goes stale after
 * SESSION_FRESH_SECONDS (APIs) — even a leaked S becomes useless.
 *
 * Without any gate the admin page answers a branded 404 and /admin/* APIs
 * answer the framework's plain 404 — the admin surface stays invisible.
 */

export const GATE_COOKIE_NAME = "admin_gate";
export const GATE_TAB_HEADER = "x-gate-tab";
export const TOKEN_TTL_SECONDS = 60;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** an /admin/* API call needs a heartbeat newer than this */
const SESSION_FRESH_SECONDS = 120;
/** the heartbeat endpoint gets a wider window so a sleeping tab can recover */
export const PING_FRESH_SECONDS = 600;
/** skip the D1 write when last_seen is already recent */
const TOUCH_INTERVAL_SECONDS = 25;
/** homepage nonce rotates every 5 minutes (current + previous bucket accepted) */
const NONCE_BUCKET_MS = 5 * 60 * 1000;

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

/**
 * `/`, `/zh-TW`, `/zh-TW/` — the homepage is the only page that gets the
 * gate nonce injected, so one-time admin tokens can only be minted there.
 * (2-letter single segments are locale prefixes; /user, /redeem, /admin...
 * are longer and never match.)
 */
export const isHomePath = (pathname: string): boolean =>
    pathname === "/" || /^\/[a-zA-Z]{2}(?:-[a-zA-Z]{2,4})?\/?$/.test(pathname);

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length === 0 || b.length === 0) return false;
    let diff = a.length ^ b.length;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
};

export const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
};

/** 32 random bytes → 64 hex chars (T one-time tokens and S session tokens) */
export const generateGateToken = (): string => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
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

type GateSessionRow = {
    token: string;
    created_at: number;
    expires_at: number;
    last_seen: number;
    revoked_at: number | null;
};

const getSessionRow = async (c: Context<HonoCustomType>, session: string): Promise<GateSessionRow | null> => {
    if (!session || session.length !== 64) return null;
    try {
        const hash = await sha256Hex(session);
        const row = await c.env.DB.prepare(
            `SELECT token, created_at, expires_at, last_seen, revoked_at
             FROM admin_gate_sessions WHERE token = ?`
        ).bind(hash).first();
        return (row as GateSessionRow) ?? null;
    } catch (e) {
        console.error("getSessionRow failed", e);
        return null;
    }
};

/** the SHA-256 hash of the session this browser holds, if any */
export const getCurrentGateHash = async (c: Context<HonoCustomType>): Promise<string | null> => {
    const session = readCookie(c, GATE_COOKIE_NAME);
    if (!session || session.length !== 64) return null;
    try {
        return await sha256Hex(session);
    } catch {
        return null;
    }
};

/** Session cookie: HttpOnly / Secure / SameSite=Strict, no Max-Age so the
 *  browser drops it when the browser itself is closed. */
export const issueGateCookie = (session: string): string =>
    `${GATE_COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict`;

export const clearGateCookie = (): string =>
    `${GATE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/**
 * G2 page gate: the admin HTML shell needs the session cookie and an active
 * (not revoked, not expired) session. Freshness is deliberately ignored here
 * so a slow password typing session is not thrown out mid page-load —
 * the API gate below enforces the heartbeat.
 */
export const hasValidGate = async (c: Context<HonoCustomType>): Promise<boolean> => {
    const session = readCookie(c, GATE_COOKIE_NAME);
    const row = await getSessionRow(c, session || "");
    if (!row || row.revoked_at) return false;
    return row.expires_at > Math.floor(Date.now() / 1000);
};

/**
 * Cookie + per-tab token + fresh heartbeat in one check.
 * Returns true when the request may proceed; when `touch` is set the row's
 * `last_seen` is refreshed (at most once per TOUCH_INTERVAL_SECONDS).
 */
export const checkGatePair = async (
    c: Context<HonoCustomType>, freshSeconds: number, touch: boolean
): Promise<boolean> => {
    const session = readCookie(c, GATE_COOKIE_NAME);
    const tab = c.req.raw.headers.get(GATE_TAB_HEADER);
    if (!session || !tab || session.length !== 64 || !timingSafeEqual(session, tab)) {
        return false;
    }
    const row = await getSessionRow(c, session);
    if (!row || row.revoked_at) return false;
    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at <= now) return false;
    if (now - row.last_seen > freshSeconds) return false;
    if (touch && now - row.last_seen > TOUCH_INTERVAL_SECONDS) {
        try {
            await c.env.DB.prepare(
                `UPDATE admin_gate_sessions SET last_seen = ? WHERE token = ? AND revoked_at IS NULL`
            ).bind(now, row.token).run();
        } catch (e) {
            console.error("touch gate session failed", e);
        }
    }
    return true;
};

const apiDenied = (c: Context<HonoCustomType>): Response => {
    c.header("Cache-Control", "no-store");
    return c.notFound();
};

/** G2 API gate for /admin/* (non-HTML) requests. */
export const checkAdminApiGate = async (c: Context<HonoCustomType>): Promise<Response | null> => {
    const ok = await checkGatePair(c, SESSION_FRESH_SECONDS, true);
    return ok ? null : apiDenied(c);
};

/**
 * G1: redeem `?k=<T>`. Returns the plaintext session token S on success,
 * null when T is unknown / spent / expired. T is always a 64-hex one-time
 * token minted from the homepage — there is no static bootstrap key anymore.
 */
export const redeemGateToken = async (
    c: Context<HonoCustomType>, key: string
): Promise<string | null> => {
    if (!key || key.length !== 64) return null;
    try {
        const hash = await sha256Hex(key);
        const now = Math.floor(Date.now() / 1000);
        const row = await c.env.DB.prepare(
            `SELECT token FROM admin_gate_tokens
             WHERE token = ? AND used_at IS NULL AND expires_at > ?`
        ).bind(hash, now).first();
        if (!row) return null;
        const res = await c.env.DB.prepare(
            `UPDATE admin_gate_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL`
        ).bind(now, hash).run();
        if ((res.meta.changes ?? 0) === 0) return null;
        const session = generateGateToken();
        const sessionHash = await sha256Hex(session);
        await c.env.DB.prepare(
            `INSERT INTO admin_gate_sessions (token, created_at, expires_at, last_seen)
             VALUES (?, ?, ?, ?)`
        ).bind(sessionHash, now, now + SESSION_MAX_AGE_SECONDS, now).run();
        return session;
    } catch (e) {
        console.error("redeemGateToken failed", e);
        return null;
    }
};

// ---- homepage nonce (stateless HMAC of a 5-minute time bucket) -------------
let nonceKeyPromise: Promise<CryptoKey> | null = null;
let nonceKeySecret = "";

const getNonceKey = (secret: string): Promise<CryptoKey> => {
    if (!nonceKeyPromise || nonceKeySecret !== secret) {
        nonceKeySecret = secret;
        nonceKeyPromise = crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
    }
    return nonceKeyPromise;
};

const toBase64Url = (bytes: Uint8Array): string => {
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const computeGateNonce = async (
    c: Context<HonoCustomType>, offset = 0
): Promise<string> => {
    const secret = typeof c.env.JWT_SECRET === "string" ? c.env.JWT_SECRET : "";
    if (!secret) return "";
    try {
        const key = await getNonceKey(secret);
        const bucket = Math.floor(Date.now() / NONCE_BUCKET_MS) + offset;
        const sig = await crypto.subtle.sign(
            "HMAC", key, new TextEncoder().encode(`gate-nonce:${bucket}`)
        );
        return toBase64Url(new Uint8Array(sig));
    } catch (e) {
        console.error("computeGateNonce failed", e);
        return "";
    }
};

/** accept the current or the previous 5-minute bucket (client clock skew +
 *  a stale homepage out of the PWA cache still work for ~10 minutes) */
export const verifyGateNonce = async (
    c: Context<HonoCustomType>, value: string
): Promise<boolean> => {
    if (!value) return false;
    const current = await computeGateNonce(c, 0);
    if (!current) return false;
    const previous = await computeGateNonce(c, -1);
    return timingSafeEqual(value, current) || timingSafeEqual(value, previous);
};

/** Branded 404 for the admin *page*. */
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

/** Inject the server-side admin path and (on the homepage) the gate nonce
 *  into the SPA shell. The nonce is only minted for the homepage so the
 *  one-time token can only be requested from there. */
export const injectAdminPath = (
    html: string, adminPath: string, gateNonce?: string
): string => {
    let snippet = `<script>window.__ADMIN_PATH__=${JSON.stringify(adminPath)};`;
    if (gateNonce) snippet += `window.__GATE_NONCE__=${JSON.stringify(gateNonce)};`;
    snippet += `</script>`;
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>${snippet}`);
    }
    return snippet + html;
};
