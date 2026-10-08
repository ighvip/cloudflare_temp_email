import { Hono } from 'hono'
import { Context } from 'hono'

import utils, { getJsonSetting, saveSetting } from './utils';
import { CONSTANTS } from './constants';
import { isS3Enabled } from './mails_api/s3_attachment';
import { isAnySendMailEnabled } from './common';
import { getWebhookAttachment } from './open_api/webhook_attachment';
import { getUptimePayload } from './uptime';

const api = new Hono<HonoCustomType>

// admin editable site settings, saved via generic /admin/config API
const SITE_SETTINGS_KEY = 'admin-config:site-settings';
// announcement list, saved via generic /admin/config API as a JSON array
const ANNOUNCEMENTS_KEY = 'admin-config:announcements';
// public stats cache, refreshed at most once per interval
const PUBLIC_STATS_CACHE_KEY = 'admin-config:public-stats-cache';
const PUBLIC_STATS_CACHE_TTL_SECONDS = 60;
// public activity cache (minute buckets behind the homepage activity card)
const PUBLIC_ACTIVITY_CACHE_KEY = 'admin-config:public-activity-cache';

type SiteSettings = {
    title?: string;
    copyright?: string;
    intro?: string;
    guide?: string;
    statsMode?: string;
    statsManual?: { today?: number; week?: number; month?: number };
};

const pad = (value: number) => String(value).padStart(2, '0');

// UTC boundaries, created_at is stored as `datetime('now')` (UTC)
const getUtcBoundaries = () => {
    const now = new Date();
    const dayStart = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} 00:00:00`;
    const weekStartDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // JS: 0 = Sunday ... 6 = Saturday, shift so the week starts on Monday
    weekStartDay.setUTCDate(weekStartDay.getUTCDate() - ((weekStartDay.getUTCDay() + 6) % 7));
    const weekStart = `${weekStartDay.getUTCFullYear()}-${pad(weekStartDay.getUTCMonth() + 1)}-${pad(weekStartDay.getUTCDate())} 00:00:00`;
    const monthStart = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01 00:00:00`;
    return { dayStart, weekStart, monthStart };
};

const readCachedPublicStats = async (c: Context<HonoCustomType>) => {
    const cached = await getJsonSetting<{ expiresAt?: number }>(c, PUBLIC_STATS_CACHE_KEY);
    if (cached?.expiresAt && cached.expiresAt > Date.now()) {
        return cached;
    }
    return null;
};

const buildRealPublicStats = async (c: Context<HonoCustomType>) => {
    const { dayStart, weekStart, monthStart } = getUtcBoundaries();
    const row = await c.env.DB.prepare(
        `SELECT
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month
         FROM raw_mails`
    ).bind(dayStart, weekStart, monthStart)
        .first<{ today: number | null; week: number | null; month: number | null }>();
    const payload = {
        mode: 'real' as const,
        today: row?.today || 0,
        week: row?.week || 0,
        month: row?.month || 0,
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + PUBLIC_STATS_CACHE_TTL_SECONDS * 1000,
    };
    try {
        await saveSetting(c, PUBLIC_STATS_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
        // cache is best-effort, never break the public endpoint
        console.error('public stats cache write failed', e);
    }
    return payload;
};

const readCachedPublicActivity = async (c: Context<HonoCustomType>) => {
    const cached = await getJsonSetting<{ expiresAt?: number }>(c, PUBLIC_ACTIVITY_CACHE_KEY);
    if (cached?.expiresAt && cached.expiresAt > Date.now()) {
        return cached;
    }
    return null;
};

// per-minute counters for the last hour + today's address/sendbox totals.
// created_at is stored as `datetime('now')` (UTC) — substr(.., 1, 16) gives
// a 'YYYY-MM-DD HH:MM' bucket string that groups cleanly with COUNT.
const buildRealPublicActivity = async (c: Context<HonoCustomType>) => {
    const { dayStart } = getUtcBoundaries();
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 60 * 1000);
    const fromStr = `${from.getUTCFullYear()}-${pad(from.getUTCMonth() + 1)}-${pad(from.getUTCDate())} `
        + `${pad(from.getUTCHours())}:${pad(from.getUTCMinutes())}:00`;

    const bucketRows = await c.env.DB.prepare(
        `SELECT 'r' AS k, substr(created_at, 1, 16) AS bucket, COUNT(*) AS n
         FROM raw_mails WHERE created_at >= ?
         UNION ALL SELECT 'c', substr(created_at, 1, 16), COUNT(*)
         FROM address WHERE created_at >= ?
         UNION ALL SELECT 's', substr(created_at, 1, 16), COUNT(*)
         FROM sendbox WHERE created_at >= ?`
    ).bind(fromStr, fromStr, fromStr)
        .all<{ k: string; bucket: string; n: number }>();
    const todayRow = await c.env.DB.prepare(
        `SELECT
            (SELECT COUNT(*) FROM address WHERE created_at >= ?) AS created,
            (SELECT COUNT(*) FROM sendbox WHERE created_at >= ?) AS sent`
    ).bind(dayStart, dayStart)
        .first<{ created: number | null; sent: number | null }>();

    const byBucket: Record<string, { r: number; c: number; s: number }> = {};
    for (const row of bucketRows.results || []) {
        const slot = byBucket[row.bucket] || { r: 0, c: 0, s: 0 };
        if (row.k === 'r') slot.r = row.n;
        else if (row.k === 'c') slot.c = row.n;
        else if (row.k === 's') slot.s = row.n;
        byBucket[row.bucket] = slot;
    }

    const payload = {
        mode: 'real' as const,
        minutes: Object.entries(byBucket)
            .map(([t, v]) => ({ t, r: v.r, c: v.c, s: v.s }))
            .sort((a, b) => a.t.localeCompare(b.t)),
        today: { created: todayRow?.created || 0, sent: todayRow?.sent || 0 },
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + PUBLIC_STATS_CACHE_TTL_SECONDS * 1000,
    };
    try {
        await saveSetting(c, PUBLIC_ACTIVITY_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
        // cache is best-effort, never break the public endpoint
        console.error('public activity cache write failed', e);
    }
    return payload;
};

api.get('/open_api/settings', async (c) => {
    // check header x-custom-auth
    let needAuth = false;
    const siteSettings = await getJsonSetting<Record<string, string>>(c, SITE_SETTINGS_KEY) || {};
    const passwords = utils.getPasswords(c);
    if (passwords && passwords.length > 0) {
        const auth = c.req.raw.headers.get("x-custom-auth");
        needAuth = !auth || !passwords.includes(auth);
    }
    const smtpImapProxyConfig = utils.getJsonObjectValue<SmtpImapProxyConfig>(
        c.env.SMTP_IMAP_PROXY_CONFIG
    ) || {};
    const smtpProxyConfig = smtpImapProxyConfig.smtp || {};
    const imapProxyConfig = smtpImapProxyConfig.imap || {};

    // announcements managed in the admin panel, env ANNOUNCEMENT stays as fallback
    type AnnouncementItem = { id?: string; content?: string; enabled?: boolean };
    const storedAnnouncements = await getJsonSetting<AnnouncementItem[]>(c, ANNOUNCEMENTS_KEY);
    const announcements = (Array.isArray(storedAnnouncements) ? storedAnnouncements : [])
        .filter((item) => item && typeof item.content === 'string' && item.content.trim())
        .map((item, index) => ({
            id: item.id || String(index),
            content: item.content as string,
            enabled: item.enabled !== false,
        }));
    const enabledAnnouncements = announcements.filter((item) => item.enabled);
    // newest enabled announcement drives the legacy popup / About widget
    const latestAnnouncement = enabledAnnouncements.length > 0
        ? enabledAnnouncements[enabledAnnouncements.length - 1].content
        : utils.getStringValue(c.env.ANNOUNCEMENT);

    return c.json({
        "title": siteSettings.title || c.env.TITLE,
        "announcement": latestAnnouncement,
        "announcements": enabledAnnouncements.map((item) => item.content),
        // admin-selected default UI language, empty means "follow the browser"
        "defaultLocale": typeof siteSettings.defaultLocale === 'string' ? siteSettings.defaultLocale : "",
        "alwaysShowAnnouncement": utils.getBooleanValue(c.env.ALWAYS_SHOW_ANNOUNCEMENT),
        "prefix": utils.trimLower(c.env.PREFIX),
        "addressRegex": utils.getStringValue(c.env.ADDRESS_REGEX),
        "minAddressLen": utils.getIntValue(c.env.MIN_ADDRESS_LEN, 1),
        "maxAddressLen": utils.getIntValue(c.env.MAX_ADDRESS_LEN, 30),
        "defaultDomains": utils.getDefaultDomains(c),
        "domains": utils.getDomains(c),
        "randomSubdomainDomains": utils.getRandomSubdomainDomains(c),
        "domainLabels": utils.getStringArray(c.env.DOMAIN_LABELS),
        "needAuth": needAuth,
        "adminContact": c.env.ADMIN_CONTACT,
        "enableUserCreateEmail": utils.getBooleanValue(c.env.ENABLE_USER_CREATE_EMAIL),
        "disableAnonymousUserCreateEmail": utils.getBooleanValue(c.env.DISABLE_ANONYMOUS_USER_CREATE_EMAIL),
        "disableCustomAddressName": utils.getBooleanValue(c.env.DISABLE_CUSTOM_ADDRESS_NAME),
        "enableUserDeleteEmail": utils.getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL),
        "enableMailReadStatus": utils.getBooleanValue(c.env.ENABLE_MAIL_READ_STATUS),
        "enableAutoReply": utils.getBooleanValue(c.env.ENABLE_AUTO_REPLY),
        "enableIndexAbout": utils.getBooleanValue(c.env.ENABLE_INDEX_ABOUT),
        "copyright": siteSettings.copyright || c.env.COPYRIGHT,
        "siteIntro": siteSettings.intro || "",
        "siteGuide": siteSettings.guide || "",
        "cfTurnstileSiteKey": c.env.CF_TURNSTILE_SITE_KEY,
        "enableWebhook": utils.getBooleanValue(c.env.ENABLE_WEBHOOK),
        "isS3Enabled": isS3Enabled(c),
        "enableSendMail": isAnySendMailEnabled(c),
        "version": CONSTANTS.VERSION,
        "showGithub": !utils.getBooleanValue(c.env.DISABLE_SHOW_GITHUB),
        "showGithubForUser": !utils.getBooleanValue(c.env.DISABLE_SHOW_GITHUB_FOR_USER),
        "disableAdminPasswordCheck": utils.getBooleanValue(c.env.DISABLE_ADMIN_PASSWORD_CHECK),
        "enableAddressPassword": utils.getBooleanValue(c.env.ENABLE_ADDRESS_PASSWORD),
        "enableAgentEmailInfo": utils.getBooleanValue(c.env.ENABLE_AGENT_EMAIL_INFO),
        "enableRedeemCode": utils.getBooleanValue(c.env.ENABLE_REDEEM_CODE),
        "redeemCodeUrl": utils.getStringValue(c.env.REDEEM_CODE_URL),
        "smtpImapProxyConfig": {
            "smtp": {
                "host": utils.getStringValue(smtpProxyConfig.host),
                "port": utils.getIntValue(smtpProxyConfig.port, 8025),
                "starttls": utils.getBooleanValue(smtpProxyConfig.starttls),
            },
            "imap": {
                "host": utils.getStringValue(imapProxyConfig.host),
                "port": utils.getIntValue(imapProxyConfig.port, 11143),
                "starttls": utils.getBooleanValue(imapProxyConfig.starttls),
            },
        },
        "statusUrl": utils.getStringValue(c.env.STATUS_URL),
        "enableGlobalTurnstileCheck": utils.isGlobalTurnstileEnabled(c)
    });
})

// public mailbox stats (today / this week / this month), cached for 60s
api.get('/open_api/stats', async (c) => {
    const siteSettings = await getJsonSetting<SiteSettings>(c, SITE_SETTINGS_KEY) || {};
    // manual mode: admin typed the numbers in the site settings form
    if (siteSettings.statsMode === 'manual') {
        const manual = siteSettings.statsManual || {};
        return c.json({
            mode: 'manual',
            today: Number(manual.today) || 0,
            week: Number(manual.week) || 0,
            month: Number(manual.month) || 0,
            updatedAt: new Date().toISOString(),
        });
    }
    try {
        const cached = await readCachedPublicStats(c);
        if (cached) {
            return c.json({ ...cached, cached: true });
        }
        return c.json(await buildRealPublicStats(c));
    } catch (e) {
        console.error('public stats failed', e);
        return c.json({
            mode: 'real',
            today: 0,
            week: 0,
            month: 0,
            updatedAt: new Date().toISOString(),
            error: true,
        });
    }
})

// public activity stream (per-minute counters for the homepage activity
// card), cached for 60s — same cadence and manual-mode rule as stats
api.get('/open_api/activity', async (c) => {
    const siteSettings = await getJsonSetting<SiteSettings>(c, SITE_SETTINGS_KEY) || {};
    // manual mode: admin shows hand-typed numbers, no live counters
    if (siteSettings.statsMode === 'manual') {
        return c.json({
            mode: 'manual',
            minutes: [],
            today: { created: 0, sent: 0 },
            updatedAt: new Date().toISOString(),
        });
    }
    try {
        const cached = await readCachedPublicActivity(c);
        if (cached) {
            return c.json({ ...cached, cached: true });
        }
        return c.json(await buildRealPublicActivity(c));
    } catch (e) {
        console.error('public activity failed', e);
        return c.json({
            mode: 'real',
            minutes: [],
            today: { created: 0, sent: 0 },
            updatedAt: new Date().toISOString(),
            error: true,
        });
    }
})

// public uptime monitor (Uptime Kuma style bars), cached for 60s
api.get('/open_api/uptime', async (c) => {
    try {
        return c.json(await getUptimePayload(c));
    } catch (e) {
        console.error('public uptime failed', e);
        return c.json({
            ok: false,
            overall: 'unknown',
            version: CONSTANTS.VERSION,
            windowHours: 48,
            updatedAt: new Date().toISOString(),
            monitors: [],
            error: true,
        });
    }
})

api.get('/open_api/a/:mail_id/:index/:expires/:signature', getWebhookAttachment)

// public service status, used by homepage status widget
api.get('/open_api/status', async (c) => {
    const start = Date.now();
    let dbOk = false;
    try {
        await c.env.DB.prepare('SELECT 1 as ok').first();
        dbOk = true;
    } catch (e) {
        console.error('status db check failed', e);
    }
    return c.json({
        ok: dbOk,
        db: dbOk,
        latencyMs: Date.now() - start,
        version: CONSTANTS.VERSION,
        domains: utils.getDomains(c),
        time: new Date().toISOString(),
    });
})

export { api }
