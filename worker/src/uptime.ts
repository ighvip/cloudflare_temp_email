import { Context } from 'hono';
import { CONSTANTS } from './constants';
import utils, { getJsonSetting, saveSetting } from './utils';

/**
 * Uptime Kuma style public status monitor.
 *
 * A cron trigger runs `runUptimeProbe` every minute: it probes the website,
 * the public API and the database, then stores one heartbeat row per monitor.
 * The homepage card reads `GET /open_api/uptime`, which aggregates the last
 * 48 hours into hourly bars (cached for 60s like the public stats endpoint).
 */
export const UPTIME_MONITORS = ['website', 'api', 'database'] as const;

// public status cache, refreshed at most once per interval
const UPTIME_CACHE_KEY = 'admin-config:public-uptime-cache';
const UPTIME_CACHE_TTL_SECONDS = 60;
// raw heartbeats are kept for 48h (one bar per hour on the card)
const RAW_WINDOW_SECONDS = 48 * 3600;
const HOUR_SECONDS = 3600;
// a monitor is "unknown" (grey) when its last probe is older than this
const STALE_SECONDS = 300;
// an hour shows red only when >=10% of its probes failed (single network
// blips stay green, the 24h uptime percentage still reflects them)
const DOWN_RATIO = 0.9;
// cap stored probe latency so a hung request cannot distort the bars
const MAX_PROBE_MS = 60000;

type HeartbeatRow = {
    monitor: string;
    ts: number;
    up: number;
    latency_ms: number;
};

type ProbeResult = {
    monitor: string;
    up: boolean;
    latencyMs: number;
    ts: number;
    note: string;
};

type UptimeBar = {
    t: number;      // hour start, unix seconds
    s: 'none' | 'up' | 'down';
    u: number | null;   // hour uptime percent (probes ok / probes)
    m: number | null;   // avg latency of successful probes, ms
};

type UptimeMonitorPayload = {
    id: string;
    state: 'up' | 'down' | 'unknown';
    latencyMs: number | null;
    uptime24h: number | null;
    lastDownAt: number | null;
    bars: UptimeBar[];
};

// scheduled() has no request context — mirror the pattern from scheduled.ts
const fakeCtx = (env: Bindings): Context<HonoCustomType> => ({ env } as Context<HonoCustomType>);

const probeUrl = async (url: string): Promise<{ up: boolean; latencyMs: number; note: string }> => {
    const start = Date.now();
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(MAX_PROBE_MS),
        });
        return {
            up: res.ok,
            latencyMs: Date.now() - start,
            note: `HTTP ${res.status}`,
        };
    } catch (e) {
        console.error('uptime probe failed', url, e);
        return {
            up: false,
            latencyMs: Date.now() - start,
            note: `ERR ${(e && (e as Error).message) || e}`,
        };
    }
};

/** Probe every monitor once and store the heartbeats (called by cron).
 *  Returns a short summary (probe outcomes) for the debug marker. */
export const runUptimeProbe = async (env: Bindings): Promise<string> => {
    const c = fakeCtx(env);
    const nowSec = Math.floor(Date.now() / 1000);
    const results: ProbeResult[] = [];

    // database: direct D1 round trip
    const dbStart = Date.now();
    try {
        await env.DB.prepare('SELECT 1 as ok').first();
        results.push({
            monitor: 'database', up: true,
            latencyMs: Date.now() - dbStart, ts: nowSec, note: 'ok',
        });
    } catch (e) {
        console.error('uptime db probe failed', e);
        results.push({
            monitor: 'database', up: false,
            latencyMs: Date.now() - dbStart, ts: nowSec,
            note: `ERR ${(e && (e as Error).message) || e}`,
        });
    }

    // website + public API: self-fetch over the public domain
    const domains = utils.getDomains(c);
    const origin = domains[0] ? `https://${domains[0]}` : '';
    if (origin) {
        const website = await probeUrl(`${origin}/`);
        results.push({
            monitor: 'website', up: website.up,
            latencyMs: website.latencyMs, ts: nowSec, note: website.note,
        });
        const api = await probeUrl(`${origin}/open_api/status`);
        results.push({
            monitor: 'api', up: api.up,
            latencyMs: api.latencyMs, ts: nowSec, note: api.note,
        });
    } else {
        results.push({ monitor: 'website', up: false, latencyMs: 0, ts: nowSec, note: 'no domain' });
        results.push({ monitor: 'api', up: false, latencyMs: 0, ts: nowSec, note: 'no domain' });
    }

    try {
        await env.DB.batch(results.map((r) => env.DB
            .prepare('INSERT INTO uptime_heartbeats (monitor, ts, up, latency_ms) VALUES (?, ?, ?, ?)')
            .bind(r.monitor, r.ts, r.up ? 1 : 0, Math.min(r.latencyMs, MAX_PROBE_MS))));
        // keep the raw window at 48h
        await env.DB
            .prepare('DELETE FROM uptime_heartbeats WHERE ts < ?')
            .bind(nowSec - RAW_WINDOW_SECONDS)
            .run();
    } catch (e) {
        console.error('uptime heartbeat write failed', e);
        return `write-failed: ${(e && (e as Error).message) || e}`;
    }

    return results.map((r) => `${r.monitor}=${r.note}`).join(',');
};

const buildPayload = async (c: Context<HonoCustomType>) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { results } = await c.env.DB
        .prepare('SELECT monitor, ts, up, latency_ms FROM uptime_heartbeats WHERE ts >= ? ORDER BY ts ASC')
        .bind(nowSec - RAW_WINDOW_SECONDS)
        .all<HeartbeatRow>();

    const currentHour = Math.floor(nowSec / HOUR_SECONDS);
    const firstHour = currentHour - 47; // 48 hourly bars
    const dayAgo = nowSec - 24 * 3600;
    let lastProbeTs = 0;

    const monitors: UptimeMonitorPayload[] = UPTIME_MONITORS.map((id) => {
        const rows = results.filter((r) => r.monitor === id);

        const buckets = new Map<number, { probes: number; ok: number; msTotal: number }>();
        for (let h = firstHour; h <= currentHour; h += 1) {
            buckets.set(h, { probes: 0, ok: 0, msTotal: 0 });
        }

        let dayProbes = 0;
        let dayOk = 0;
        let last: HeartbeatRow | null = null;
        let lastDownAt: number | null = null;

        for (const row of rows) {
            if (row.ts > lastProbeTs) lastProbeTs = row.ts;
            const bucket = buckets.get(Math.floor(row.ts / HOUR_SECONDS));
            if (bucket) {
                bucket.probes += 1;
                if (row.up) {
                    bucket.ok += 1;
                    bucket.msTotal += row.latency_ms;
                }
            }
            if (row.ts >= dayAgo) {
                dayProbes += 1;
                if (row.up) dayOk += 1;
            }
            last = row;
            if (!row.up) lastDownAt = row.ts;
        }

        const bars: UptimeBar[] = [...buckets.entries()].map(([hour, b]) => ({
            t: hour * HOUR_SECONDS,
            s: b.probes === 0 ? 'none' : (b.ok / b.probes >= DOWN_RATIO ? 'up' : 'down'),
            u: b.probes === 0 ? null : Math.round((b.ok / b.probes) * 10000) / 100,
            m: b.ok > 0 ? Math.round(b.msTotal / b.ok) : null,
        }));

        const stale = !last || last.ts < nowSec - STALE_SECONDS;
        const state: UptimeMonitorPayload['state'] = stale
            ? 'unknown'
            : (last?.up ? 'up' : 'down');

        return {
            id,
            state,
            latencyMs: last ? last.latency_ms : null,
            uptime24h: dayProbes > 0 ? Math.round((dayOk / dayProbes) * 10000) / 100 : null,
            lastDownAt,
            bars,
        };
    });

    const anyDown = monitors.some((m) => m.state === 'down');
    const anyUnknown = monitors.some((m) => m.state === 'unknown');
    const overall = anyDown ? 'down' : (anyUnknown ? 'unknown' : 'up');

    return {
        ok: true,
        overall,
        version: CONSTANTS.VERSION,
        windowHours: 48,
        updatedAt: new Date((lastProbeTs || nowSec) * 1000).toISOString(),
        monitors,
    };
};

/** Cached (60s) payload for GET /open_api/uptime. */
export const getUptimePayload = async (c: Context<HonoCustomType>) => {
    try {
        const cached = await getJsonSetting<{ expiresAt?: number }>(c, UPTIME_CACHE_KEY);
        if (cached && typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) {
            return { ...cached, cached: true };
        }
    } catch (e) {
        // cache is best-effort, never break the public endpoint
        console.error('public uptime cache read failed', e);
    }
    const payload = await buildPayload(c);
    try {
        const toSave = { ...payload, expiresAt: Date.now() + UPTIME_CACHE_TTL_SECONDS * 1000 };
        await saveSetting(c, UPTIME_CACHE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error('public uptime cache write failed', e);
    }
    return payload;
};
