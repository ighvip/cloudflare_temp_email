import { Context } from 'hono'
import i18n from './i18n'
import { ErrorCode } from './error_codes'

// P0 B2 — login brute-force protection
//
// A client that fails `FAIL_THRESHOLD` logins for the same scope inside a
// rolling `WINDOW_SECONDS` window is locked out with exponential backoff:
//   5th failure -> 60s, 6th -> 120s, 7th -> 240s ... capped at MAX_BACKOFF_SECONDS.
// Counters live in D1 so they survive worker restarts, and a successful login
// clears the counter immediately.
//
// The check only ever reads; failures are recorded by the login handlers after
// the password comparison, so a locked client never reaches the credential
// comparison at all.

const WINDOW_SECONDS = 15 * 60
const FAIL_THRESHOLD = 5
const BASE_BACKOFF_SECONDS = 60
const MAX_BACKOFF_SECONDS = 15 * 60
// opportunistic cleanup keeps the table from growing forever
const STALE_SECONDS = 24 * 60 * 60

type LoginAttemptRow = {
    fail_count: number
    first_fail_at: number
    locked_until: number
}

const attemptKey = (scope: string, ip: string): string => `${scope}|${ip}`

const getClientIp = (c: Context<HonoCustomType>): string | null =>
    c.req.raw.headers.get('cf-connecting-ip')?.trim() || null

/**
 * Returns a 429 response when the client is currently locked out,
 * or null when the login attempt may proceed.
 */
export const checkLoginRateLimit = async (
    c: Context<HonoCustomType>,
    scope: string
): Promise<Response | null> => {
    const ip = getClientIp(c)
    if (!ip) return null
    try {
        const row = await c.env.DB.prepare(
            `SELECT fail_count, first_fail_at, locked_until FROM login_attempts WHERE key = ?`
        ).bind(attemptKey(scope, ip)).first<LoginAttemptRow>()
        if (!row) return null
        const now = Math.floor(Date.now() / 1000)
        if (row.locked_until <= now) return null
        const retryAfter = row.locked_until - now
        const msgs = i18n.getMessagesbyContext(c)
        return c.json(
            {
                code: ErrorCode.RATE_LIMITED,
                message: `${msgs.RateLimitedMsg} (${retryAfter}s)`,
                retry_after: retryAfter,
            },
            429,
            { 'Retry-After': String(retryAfter) }
        )
    } catch (error) {
        // never lock people out because of a broken counter table
        console.error('login rate limit check failed', error)
        return null
    }
}

/** Record a failed login and (re)compute the exponential lockout. */
export const recordLoginFailure = async (
    c: Context<HonoCustomType>,
    scope: string
): Promise<void> => {
    const ip = getClientIp(c)
    if (!ip) return
    const key = attemptKey(scope, ip)
    const now = Math.floor(Date.now() / 1000)
    try {
        const row = await c.env.DB.prepare(
            `SELECT fail_count, first_fail_at FROM login_attempts WHERE key = ?`
        ).bind(key).first<Pick<LoginAttemptRow, 'fail_count' | 'first_fail_at'>>()
        const inWindow = !!row && row.first_fail_at > 0
            && (now - row.first_fail_at) <= WINDOW_SECONDS
        const failCount = inWindow ? (row?.fail_count || 0) + 1 : 1
        const firstFailAt = inWindow ? row!.first_fail_at : now
        let lockedUntil = 0
        if (failCount >= FAIL_THRESHOLD) {
            const exponential = BASE_BACKOFF_SECONDS * 2 ** (failCount - FAIL_THRESHOLD)
            lockedUntil = now + Math.min(exponential, MAX_BACKOFF_SECONDS)
        }
        await c.env.DB.prepare(
            `INSERT INTO login_attempts (key, fail_count, first_fail_at, locked_until, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                fail_count = excluded.fail_count,
                first_fail_at = excluded.first_fail_at,
                locked_until = excluded.locked_until,
                updated_at = excluded.updated_at`
        ).bind(key, failCount, firstFailAt, lockedUntil, now).run()
        // best-effort housekeeping, runs for ~1 in 20 recorded failures
        if (Math.random() < 0.05) {
            await c.env.DB.prepare(
                `DELETE FROM login_attempts WHERE updated_at < ?`
            ).bind(now - STALE_SECONDS).run()
        }
    } catch (error) {
        // a missing table must not turn a login failure into a 500
        console.error('failed to record login failure', error)
    }
}

/** A successful login wipes the counter for that scope + IP. */
export const clearLoginFailures = async (
    c: Context<HonoCustomType>,
    scope: string
): Promise<void> => {
    const ip = getClientIp(c)
    if (!ip) return
    try {
        await c.env.DB.prepare(
            `DELETE FROM login_attempts WHERE key = ?`
        ).bind(attemptKey(scope, ip)).run()
    } catch (error) {
        console.error('failed to clear login failures', error)
    }
}
