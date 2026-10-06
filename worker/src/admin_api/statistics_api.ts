import { Context } from 'hono'

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
    // daily mail count for the last 7 days (UTC, matches created_at default)
    const dailyMails = await c.env.DB.prepare(
        `SELECT date(created_at) as day, count(*) as count FROM raw_mails
         where created_at > datetime('now', '-7 day')
         GROUP BY day ORDER BY day`
    ).all<{ day: string, count: number }>();
    // top 5 addresses by received mail count
    const topAddresses = await c.env.DB.prepare(
        `SELECT address, count(*) as count FROM raw_mails
         GROUP BY address ORDER BY count DESC LIMIT 5`
    ).all<{ address: string, count: number }>();
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
        dailyMails: dailyMails.results ?? [],
        topAddresses: topAddresses.results ?? [],
        databaseSize: sizeResult.meta.size_after ?? null,
    });
};

export default { get };
