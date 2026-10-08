import { Context } from 'hono'
import { getJsonSetting } from '../utils'
import { CONSTANTS } from '../constants'
// 问题11: reuse the shared day-boundary parser so admin statistics, the
// public stats and the activity card all agree on what "today" means
import { parseTimezoneOffsetMinutes } from '../commom_api'

// admin-editable site settings row (same key commom_api reads)
const SITE_SETTINGS_KEY = CONSTANTS.SITE_SETTINGS_KEY;
// 问题11: documented default day-boundary timezone (Beijing, used by
// parseTimezoneOffsetMinutes when the settings carry no timezone yet) —
// every daily aggregation falls back to this
const DEFAULT_TIMEZONE = '+08:00'

type StatisticsSiteSettings = {
    timezone?: string;
    statsTimezone?: string;
};

// minutes east of UTC -> SQLite date()/datetime() modifier ("+08:00" style);
// SQLite shifts the value forward by that amount, which matches the frontend's
// `Date.now() + offset` day labels — and only that shape is safe to pass
// through the prepared-statement bind slot
const formatTimezoneOffset = (offsetMinutes: number): string => {
    const sign = offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(offsetMinutes);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const getStatisticsTimezone = async (
    c: Context<HonoCustomType>
): Promise<string> => {
    try {
        const settings = await getJsonSetting<StatisticsSiteSettings>(
            c, SITE_SETTINGS_KEY
        );
        // "timezone" first (问题11 site-settings field), then the public-stats
        // "statsTimezone" (SiteSettings.vue); the shared parser returns 480
        // minutes (Beijing) when the value is missing or malformed
        const raw = settings?.timezone || settings?.statsTimezone;
        return formatTimezoneOffset(parseTimezoneOffsetMinutes(raw));
    } catch (error) {
        console.error('statistics: failed to read site timezone', error);
        return DEFAULT_TIMEZONE;
    }
};

const get = async (c: Context<HonoCustomType>) => {
    const { count: mailCount } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM raw_mails`
    ).first<{ count: number }>() || {};
    const { count: addressCount } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM address`
    ).first<{ count: number }>() || {};
    const { count: activeAddressCount7days } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM address where updated_at > datetime('now', '-7 day')`
    ).first<{ count: number }>() || {};
    const { count: activeAddressCount30days } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM address where updated_at > datetime('now', '-30 day')`
    ).first<{ count: number }>() || {};
    const { count: sendMailCount } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM sendbox`
    ).first<{ count: number }>() || {};
    const { count: userCount } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM users`
    ).first<{ count: number }>() || {};
    const { count: mailCount24h } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM raw_mails where created_at > datetime('now', '-1 day')`
    ).first<{ count: number }>() || {};
    const { count: mailCount7days } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM raw_mails where created_at > datetime('now', '-7 day')`
    ).first<{ count: number }>() || {};
    const { count: unreadMailCount } = await c.env.DB.prepare(
        `SELECT count(*) as count FROM raw_mails where COALESCE(is_unread, 0) = 1`
    ).first<{ count: number }>() || {};

    // 问题11: daily metrics below are grouped by `date(created_at, ?)` where
    // the bound modifier is the site timezone ("+08:00" style, default
    // Beijing) — every daily series on the admin page then shares one day
    // boundary. Windows are bounded (-15/-30 day) so the created_at indexes
    // keep every aggregation cheap.
    const timezone = await getStatisticsTimezone(c);
    const [
        dailyMailsRes,
        dailySendRes,
        dailyRegisterRes,
        unknownDailyRes,
        domainReceiveRes,
        sourceDomainsRes,
        unknownMailCountRow,
        security,
    ] = await Promise.all([
        // 收信趋势 (secondary) — last 14 site-local days
        c.env.DB.prepare(
            `SELECT date(created_at, ?) as day, count(*) as count FROM raw_mails
             WHERE created_at >= datetime('now', ?, '-15 day')
             GROUP BY day ORDER BY day`
        ).bind(timezone, timezone).all<{ day: string, count: number }>(),
        // 每日发送趋势 — sendbox, last 14 site-local days
        c.env.DB.prepare(
            `SELECT date(created_at, ?) as day, count(*) as count FROM sendbox
             WHERE created_at >= datetime('now', ?, '-15 day')
             GROUP BY day ORDER BY day`
        ).bind(timezone, timezone).all<{ day: string, count: number }>(),
        // 注册趋势 — new addresses, last 14 site-local days (idx_address_created_at)
        c.env.DB.prepare(
            `SELECT date(created_at, ?) as day, count(*) as count FROM address
             WHERE created_at >= datetime('now', ?, '-15 day')
             GROUP BY day ORDER BY day`
        ).bind(timezone, timezone).all<{ day: string, count: number }>(),
        // 未知收件人邮件 sparkline — last 14 site-local days
        c.env.DB.prepare(
            `SELECT date(created_at, ?) as day, count(*) as count FROM raw_mails
             WHERE address NOT IN (select name from address)
               AND created_at >= datetime('now', ?, '-15 day')
             GROUP BY day ORDER BY day`
        ).bind(timezone, timezone).all<{ day: string, count: number }>(),
        // 每域名收信 — recipient domain top 10, last 30 site-local days
        c.env.DB.prepare(
            `SELECT substr(address, instr(address, '@') + 1) as domain, count(*) as count
             FROM raw_mails
             WHERE created_at >= datetime('now', ?, '-30 day')
               AND instr(address, '@') > 0
             GROUP BY domain ORDER BY count DESC LIMIT 10`
        ).bind(timezone).all<{ domain: string, count: number }>(),
        // 来源分布 — raw_mails.source holds the envelope sender, so this is
        // the sender-domain top 10 over the last 30 site-local days
        c.env.DB.prepare(
            `SELECT substr(source, instr(source, '@') + 1) as domain, count(*) as count
             FROM raw_mails
             WHERE created_at >= datetime('now', ?, '-30 day')
               AND instr(source, '@') > 0
             GROUP BY domain ORDER BY count DESC LIMIT 10`
        ).bind(timezone).all<{ domain: string, count: number }>(),
        // 未知收件人邮件数 — same predicate as GET /admin/mails_unknow so the
        // number matches what the unknown-mail list shows
        c.env.DB.prepare(
            `SELECT count(*) as count FROM raw_mails
             WHERE address NOT IN (select name from address)`
        ).first<{ count: number }>(),
        // 安全审计摘要 (secondary) — rate-limit lockouts + live panel sessions
        getSecuritySummary(c),
    ]);

    const sizeResult = await c.env.DB.prepare("SELECT 1").run();
    return c.json({
        mailCount,
        addressCount,
        activeAddressCount7days,
        activeAddressCount30days,
        userCount,
        sendMailCount,
        mailCount24h,
        mailCount7days,
        unreadMailCount,
        timezone,
        dailyMails: dailyMailsRes.results ?? [],
        dailySend: dailySendRes.results ?? [],
        dailyRegister: dailyRegisterRes.results ?? [],
        unknownDaily: unknownDailyRes.results ?? [],
        domainReceive: domainReceiveRes.results ?? [],
        sourceDomains: sourceDomainsRes.results ?? [],
        unknownMailCount: unknownMailCountRow?.count ?? 0,
        security,
        topAddresses: await getTopAddresses(c),
        databaseSize: sizeResult.meta.size_after ?? null,
    });
};

// top 5 addresses by received mail count (kept out of the Promise.all above
// only for readability — same cost either way)
const getTopAddresses = async (
    c: Context<HonoCustomType>
): Promise<{ address: string, count: number }[]> => {
    const res = await c.env.DB.prepare(
        `SELECT address, count(*) as count FROM raw_mails
         GROUP BY address ORDER BY count DESC LIMIT 5`
    ).all<{ address: string, count: number }>();
    return res.results ?? [];
};

type SecuritySummary = {
    lockedKeys: number | null;
    failedAttempts24h: number | null;
    activeSessions: number | null;
};

// 安全审计摘要 — counters only, no log table exists; login_attempts is
// pruned after 24h by login_rate_limit, sessions are the panel gate ones
const getSecuritySummary = async (
    c: Context<HonoCustomType>
): Promise<SecuritySummary> => {
    try {
        const nowSec = Math.floor(Date.now() / 1000);
        const [locked, failed, sessions] = await Promise.all([
            c.env.DB.prepare(
                `SELECT count(*) as count FROM login_attempts WHERE locked_until > ?`
            ).bind(nowSec).first<{ count: number }>(),
            c.env.DB.prepare(
                `SELECT count(*) as count FROM login_attempts
                 WHERE fail_count > 0 AND updated_at > ?`
            ).bind(nowSec - 24 * 3600).first<{ count: number }>(),
            c.env.DB.prepare(
                `SELECT count(*) as count FROM admin_gate_sessions
                 WHERE revoked_at IS NULL AND expires_at > ?`
            ).bind(nowSec).first<{ count: number }>(),
        ]);
        return {
            lockedKeys: locked?.count ?? 0,
            failedAttempts24h: failed?.count ?? 0,
            activeSessions: sessions?.count ?? 0,
        };
    } catch (error) {
        // a missing table (un-migrated DB) must not break the whole page
        console.error('statistics: security summary failed', error);
        return { lockedKeys: null, failedAttempts24h: null, activeSessions: null };
    }
};

export default { get };
