import { Hono } from 'hono'
import { Context } from 'hono'

import utils, { getJsonSetting, getSetting, saveSetting } from './utils';
import { CONSTANTS } from './constants';
import { isS3Enabled } from './mails_api/s3_attachment';
import { isAnySendMailEnabled, getSitePrefix } from './common';
import { getWebhookAttachment } from './open_api/webhook_attachment';
import { getUptimePayload } from './uptime';
import { getManagedDomains } from './mail_domains';

const api = new Hono<HonoCustomType>

// admin editable site settings, saved via generic /admin/config API
const SITE_SETTINGS_KEY = CONSTANTS.SITE_SETTINGS_KEY;
// announcement list, saved via generic /admin/config API as a JSON array
const ANNOUNCEMENTS_KEY = 'admin-config:announcements';
// header marquee on/off switch ("true"/"false", default on when absent)
const ANNOUNCEMENT_MARQUEE_KEY = 'admin-config:announcement-marquee';
// public stats cache, refreshed at most once per interval
const PUBLIC_STATS_CACHE_KEY = 'admin-config:public-stats-cache';
const PUBLIC_STATS_CACHE_TTL_SECONDS = 60;

type SiteSettings = {
    title?: string;
    copyright?: string;
    intro?: string;
    guide?: string;
    // 问题5: address prefix, editable in the admin site settings,
    // falls back to env PREFIX when unset/empty
    prefix?: string;
    statsMode?: string;
    statsManual?: {
        today?: number; week?: number; month?: number; year?: number;
        sendToday?: number; sendWeek?: number; sendMonth?: number; sendYear?: number;
    };
    // day-boundary timezone for the public stats, "+08:00" style
    statsTimezone?: string;
};

// parse "+08:00" / "-0530" into minutes east of UTC; default Beijing (+08:00).
// exported so admin_api/statistics_api shares the same day-boundary parsing
// (问题11) as the public stats below
export const parseTimezoneOffsetMinutes = (value: unknown): number => {
    if (typeof value !== 'string') return 480;
    const match = value.trim().match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return 480;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);
    if (hours > 14 || minutes > 59) return 480;
    return sign * (hours * 60 + minutes);
};

// day / week (Monday) / month / year boundaries expressed as UTC strings,
// computed against the admin-selected timezone so "today" means the
// visitor's local day (default: Beijing time); exported for reuse by the
// admin statistics daily aggregations (问题11)
export const getStatsBoundaries = (offsetMinutes: number) => {
    const shifted = new Date(Date.now() + offsetMinutes * 60000);
    const dayLocal = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    const dayDate = new Date(dayLocal);
    // JS: 0 = Sunday ... 6 = Saturday, shift so the week starts on Monday
    const weekLocal = dayLocal - ((dayDate.getUTCDay() + 6) % 7) * 86400000;
    const monthLocal = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
    const yearLocal = Date.UTC(shifted.getUTCFullYear(), 0, 1);
    const toUtcString = (localMs: number) => new Date(localMs - offsetMinutes * 60000)
        .toISOString().replace('T', ' ').slice(0, 19);
    return {
        dayStart: toUtcString(dayLocal),
        weekStart: toUtcString(weekLocal),
        monthStart: toUtcString(monthLocal),
        yearStart: toUtcString(yearLocal),
    };
};

const readCachedPublicStats = async (c: Context<HonoCustomType>) => {
    const cached = await getJsonSetting<{ expiresAt?: number }>(c, PUBLIC_STATS_CACHE_KEY);
    if (cached?.expiresAt && cached.expiresAt > Date.now()) {
        return cached;
    }
    return null;
};

const buildRealPublicStats = async (c: Context<HonoCustomType>) => {
    const siteSettings = await getJsonSetting<SiteSettings>(c, SITE_SETTINGS_KEY) || {};
    const offset = parseTimezoneOffsetMinutes(siteSettings.statsTimezone);
    const { dayStart, weekStart, monthStart, yearStart } = getStatsBoundaries(offset);
    // receive counts (raw_mails) + send counts (sendbox) across four ranges
    const row = await c.env.DB.prepare(
        `SELECT
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as year
         FROM raw_mails`
    ).bind(dayStart, weekStart, monthStart, yearStart)
        .first<{ today: number | null; week: number | null; month: number | null; year: number | null }>();
    // send feature off => show 0 honestly (问题18-①b, 照实显示 0)
    const sendEnabled = isAnySendMailEnabled(c);
    let sendRow = { today: 0, week: 0, month: 0, year: 0 };
    if (sendEnabled) {
        sendRow = await c.env.DB.prepare(
            `SELECT
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as year
             FROM sendbox`
        ).bind(dayStart, weekStart, monthStart, yearStart)
            .first<{ today: number | null; week: number | null; month: number | null; year: number | null }>()
            || sendRow;
    }
    const payload = {
        mode: 'real' as const,
        today: row?.today || 0,
        week: row?.week || 0,
        month: row?.month || 0,
        year: row?.year || 0,
        sendEnabled,
        sendToday: sendRow.today || 0,
        sendWeek: sendRow.week || 0,
        sendMonth: sendRow.month || 0,
        sendYear: sendRow.year || 0,
        timezone: siteSettings.statsTimezone || '+08:00',
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
        // header ticker: admins may turn the perpetual marquee off (default on)
        "announcementMarquee": (await getSetting(c, ANNOUNCEMENT_MARQUEE_KEY)) !== 'false',
        // admin-selected default UI language, empty means "follow the browser"
        "defaultLocale": typeof siteSettings.defaultLocale === 'string' ? siteSettings.defaultLocale : "",
        "alwaysShowAnnouncement": utils.getBooleanValue(c.env.ALWAYS_SHOW_ANNOUNCEMENT),
        "prefix": await getSitePrefix(c),
        "addressRegex": utils.getStringValue(c.env.ADDRESS_REGEX),
        "minAddressLen": utils.getIntValue(c.env.MIN_ADDRESS_LEN, 1),
        "maxAddressLen": utils.getIntValue(c.env.MAX_ADDRESS_LEN, 30),
        "defaultDomains": utils.getDefaultDomains(c),
        "domains": await getManagedDomains(c),
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
        const sendEnabled = isAnySendMailEnabled(c);
        return c.json({
            mode: 'manual',
            today: Number(manual.today) || 0,
            week: Number(manual.week) || 0,
            month: Number(manual.month) || 0,
            year: Number(manual.year) || 0,
            sendEnabled,
            // send feature off => honest 0 even in manual mode (问题18-①b)
            sendToday: sendEnabled ? Number(manual.sendToday) || 0 : 0,
            sendWeek: sendEnabled ? Number(manual.sendWeek) || 0 : 0,
            sendMonth: sendEnabled ? Number(manual.sendMonth) || 0 : 0,
            sendYear: sendEnabled ? Number(manual.sendYear) || 0 : 0,
            timezone: siteSettings.statsTimezone || '+08:00',
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
            year: 0,
            sendEnabled: false,
            sendToday: 0,
            sendWeek: 0,
            sendMonth: 0,
            sendYear: 0,
            timezone: siteSettings.statsTimezone || '+08:00',
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
