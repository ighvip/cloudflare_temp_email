import { Context } from 'hono';

import { getJsonSetting, saveSetting } from './utils';

// 实时汇率数据：以 CNY 为枢纽，rates[c] = 1 单位 c 兑多少人民币。
// 四层数据源：新浪（分钟级，12/12 覆盖）→ 腾讯（秒级，缺 MOP/THB）
// → 欧洲央行 ECB（工作日，缺 MOP/TWD）→ ExchangeRate-API（每日，全量兜底）。
// 60 秒缓存（D1 + isolate 内存 + 并发合并），任何一层挂掉都自动降级，
// 永远返回最近一次可用数据并带 stale 标记。

export type ExchangeRatesPayload = {
    base: 'CNY';
    // 1 unit of the key currency = rates[key] CNY（CNY 自身恒为 1）
    rates: Record<string, number>;
    // 数据源时间戳（ISO，北京时间 +08:00）
    updatedAt: string;
    source: 'sina' | 'tencent' | 'ecb' | 'erapi';
    // true = 实时源全挂，当前为最近一次可用缓存
    stale: boolean;
};

const CACHE_KEY = 'admin-config:exchange-rates-cache';
const CACHE_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export const EXCHANGE_CURRENCIES = [
    'CNY', 'USD', 'EUR', 'JPY', 'HKD', 'GBP', 'KRW', 'AUD', 'CAD', 'MOP', 'THB', 'TWD',
];

// sina 的外汇行情代码：fx_s<code>cny，值 = 1 <code> 兑多少人民币
const SINA_CODES = EXCHANGE_CURRENCIES.filter((code) => code !== 'CNY');
// 腾讯：wh<CODE>CNY，实测无 MOP / THB
const TENCENT_CODES = ['USD', 'EUR', 'JPY', 'HKD', 'GBP', 'KRW', 'AUD', 'CAD', 'TWD'];

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        return res.ok ? res : null;
    } catch (error) {
        console.warn('exchange rate fetch failed', url, error);
        return null;
    } finally {
        clearTimeout(timer);
    }
};

// sina 返回 GBK（中文字段乱码不影响解析）：
// var hq_str_fx_susdcny="18:52:00,买入,卖出,...,最新价(下标8),名称,...,2026-10-16";
// 下标 0 = 北京时间 HH:mm:ss，下标 8 = 最新中间价，末字段 = 日期
const fetchSinaRates = async (): Promise<{ rates: Record<string, number>, updatedAt: string } | null> => {
    const codes = SINA_CODES.map((code) => `fx_s${code.toLowerCase()}cny`).join(',');
    const res = await fetchWithTimeout(
        `https://hq.sinajs.cn/list=${codes}`,
        { headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': UA } }
    );
    if (!res) return null;
    const text = await res.text();
    const rates: Record<string, number> = {};
    let latest = '';
    for (const match of text.matchAll(/hq_str_fx_(\w+)="([^"]*)"/g)) {
        // susdcny -> usd
        const code = match[1].replace(/^s/, '').replace(/cny$/i, '').toUpperCase();
        const fields = match[2].split(',');
        const price = Number.parseFloat(fields[8]);
        if (!code || !Number.isFinite(price) || price <= 0) continue;
        rates[code] = price;
        const time = (fields[0] || '').trim();
        const date = (fields[fields.length - 1] || '').trim();
        if (/^\d{2}:\d{2}:\d{2}$/.test(time) && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            latest = `${date}T${time}+08:00`;
        }
    }
    return Object.keys(rates).length > 0 ? { rates, updatedAt: latest } : null;
};

// 腾讯：v_whUSDCNY="310~美元人民币~USDCNY~现价~0~20261016185253~..."
// 下标 3 = 现价，下标 5 = yyyyMMddHHmmss（北京时间）
const fetchTencentRates = async (): Promise<{ rates: Record<string, number>, updatedAt: string } | null> => {
    const codes = TENCENT_CODES.map((code) => `wh${code}CNY`).join(',');
    const res = await fetchWithTimeout(
        `https://qt.gtimg.cn/q=${codes}`,
        { headers: { 'User-Agent': UA } }
    );
    if (!res) return null;
    const text = await res.text();
    const rates: Record<string, number> = {};
    let latest = '';
    for (const match of text.matchAll(/wh(\w+CNY)="([^"]*)"/g)) {
        const code = match[1].replace(/CNY$/i, '').toUpperCase();
        const fields = match[2].split('~');
        const price = Number.parseFloat(fields[3]);
        if (!code || !Number.isFinite(price) || price <= 0) continue;
        rates[code] = price;
        const ts = fields[5] || '';
        const m = ts.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
        if (m) latest = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`;
    }
    return Object.keys(rates).length > 0 ? { rates, updatedAt: latest } : null;
};

// 欧洲央行参考汇率（工作日每日一次），base=USD 拿到「1 USD = X 各币种」，
// 再折算成「1 币种 = Y CNY」；无 MOP / TWD。
const ECB_CODES = ['CNY', 'EUR', 'JPY', 'HKD', 'GBP', 'KRW', 'AUD', 'CAD', 'THB'];
const fetchEcbRates = async (): Promise<{ rates: Record<string, number>, updatedAt: string } | null> => {
    const res = await fetchWithTimeout(
        `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${ECB_CODES.join(',')}`,
        { headers: { 'User-Agent': UA } }
    );
    if (!res) return null;
    try {
        const data = await res.json<{ base?: string, date?: string, rates?: Record<string, number> }>();
        const usdCny = data?.rates?.CNY;
        if (!data?.rates || !usdCny || !data.date) return null;
        const rates: Record<string, number> = {};
        for (const [code, perUsd] of Object.entries(data.rates)) {
            if (code === 'USD' || !Number.isFinite(perUsd) || perUsd <= 0) continue;
            // 1 code = usdCny / perUsd CNY
            rates[code] = usdCny / perUsd;
        }
        return { rates, updatedAt: `${data.date}T00:00:00+08:00` };
    } catch (error) {
        console.warn('exchange rate ecb parse failed', error);
        return null;
    }
};

// ExchangeRate-API 每日免费层（全量币种兜底），base=CNY 得到「1 CNY = X 各币种」
const fetchErApiRates = async (): Promise<{ rates: Record<string, number>, updatedAt: string } | null> => {
    const res = await fetchWithTimeout(
        'https://open.er-api.com/v6/latest/CNY',
        { headers: { 'User-Agent': UA } }
    );
    if (!res) return null;
    try {
        const data = await res.json<{ result?: string, rates?: Record<string, number>, time_last_update_utc?: string }>();
        if (data?.result !== 'success' || !data.rates) return null;
        const rates: Record<string, number> = {};
        for (const code of EXCHANGE_CURRENCIES) {
            if (code === 'CNY') continue;
            const perCny = data.rates[code];
            if (Number.isFinite(perCny) && perCny > 0) rates[code] = 1 / perCny;
        }
        let updatedAt = '';
        const ts = data.time_last_update_utc ? new Date(data.time_last_update_utc) : null;
        if (ts && !Number.isNaN(ts.getTime())) updatedAt = ts.toISOString();
        return { rates, updatedAt };
    } catch (error) {
        console.warn('exchange rate er-api parse failed', error);
        return null;
    }
};

const buildPayload = async (): Promise<ExchangeRatesPayload | null> => {
    const rates: Record<string, number> = { CNY: 1 };
    let updatedAt = '';
    let source: ExchangeRatesPayload['source'] | null = null;
    const missing = () => EXCHANGE_CURRENCIES.filter((code) => !(code in rates));
    const fill = (extra: Record<string, number>) => {
        for (const [code, rate] of Object.entries(extra)) {
            if (!(code in rates) && Number.isFinite(rate) && rate > 0) {
                rates[code] = rate;
            }
        }
    };
    const noteLatest = (time: string) => {
        // Sources report in different zones (the er-api fallback uses UTC "Z"),
        // so compare absolute instants -- lexicographic comparison would pick
        // the wrong "latest" across timezone formats.
        const candidate = Date.parse(time);
        const current = Date.parse(updatedAt);
        if (Number.isFinite(candidate) && (!Number.isFinite(current) || candidate > current)) {
            updatedAt = time;
        }
    };

    const sina = await fetchSinaRates();
    if (sina) {
        fill(sina.rates);
        source = 'sina';
        noteLatest(sina.updatedAt);
    }
    if (missing().length > 0) {
        const tencent = await fetchTencentRates();
        if (tencent) {
            fill(tencent.rates);
            source = source || 'tencent';
            noteLatest(tencent.updatedAt);
        }
    }
    if (missing().length > 0) {
        const ecb = await fetchEcbRates();
        if (ecb) {
            fill(ecb.rates);
            source = source || 'ecb';
            noteLatest(ecb.updatedAt);
        }
    }
    if (missing().length > 0) {
        const erapi = await fetchErApiRates();
        if (erapi) {
            fill(erapi.rates);
            source = source || 'erapi';
            noteLatest(erapi.updatedAt);
        }
    }
    if (!source) return null;
    return {
        base: 'CNY',
        rates,
        updatedAt: updatedAt || new Date().toISOString(),
        source,
        stale: false,
    };
};

type CachedEnvelope = ExchangeRatesPayload & { cacheUntil?: number };

let memCache: { payload: ExchangeRatesPayload, expiresAt: number } | null = null;
let inflight: Promise<ExchangeRatesPayload | null> | null = null;

const stripEnvelope = (cached: CachedEnvelope): ExchangeRatesPayload => ({
    base: 'CNY',
    rates: cached.rates,
    updatedAt: cached.updatedAt,
    source: cached.source,
    stale: false,
});

export const getExchangeRates = async (
    c: Context<HonoCustomType>
): Promise<ExchangeRatesPayload | null> => {
    const now = Date.now();
    if (memCache && memCache.expiresAt > now) {
        return memCache.payload;
    }
    if (inflight) {
        return inflight;
    }
    inflight = (async () => {
        let stored: CachedEnvelope | null = null;
        try {
            stored = await getJsonSetting<CachedEnvelope>(c, CACHE_KEY);
        } catch (error) {
            console.warn('exchange rate cache read failed', error);
        }
        if (stored?.cacheUntil && stored.cacheUntil > now && stored.rates) {
            const payload = stripEnvelope(stored);
            memCache = { payload, expiresAt: stored.cacheUntil };
            return payload;
        }
        let payload: ExchangeRatesPayload | null = null;
        try {
            payload = await buildPayload();
        } catch (error) {
            console.error('exchange rate build failed', error);
        }
        if (payload) {
            const cacheUntil = Date.now() + CACHE_TTL_SECONDS * 1000;
            memCache = { payload, expiresAt: cacheUntil };
            try {
                await saveSetting(c, CACHE_KEY, JSON.stringify({ ...payload, cacheUntil }));
            } catch (error) {
                // cache write is best-effort, the payload is still served
                console.warn('exchange rate cache write failed', error);
            }
            return payload;
        }
        // 所有实时源都失败：退回上一次成功的缓存并标记 stale
        if (stored?.rates) {
            const stalePayload = { ...stripEnvelope(stored), stale: true };
            // 短内存缓存 60s，避免每个请求都去敲已经挂掉的源
            memCache = { payload: stalePayload, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 };
            return stalePayload;
        }
        return null;
    })().finally(() => {
        inflight = null;
    });
    return inflight;
};
