import { Context } from "hono";

import { resolveRawEmail } from "../gzip";
import { getJsonSetting, saveSetting } from "../utils";
import { RawMailRow } from "../models";

// 邮件来源 IP 归属地：解析邮件头 Received 的发件方 MTA IP，
// 查 ip.guhong.vip（ip-api 兼容格式 /json/?query=IP），结果按 IP 缓存 30 天。
// 任何一步失败都降级为只返回 IP，绝不让详情页报错。

const CACHE_KEY_PREFIX = "ip-location-cache:";
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 4000;
// 固定 UA 便于在 Cloudflare WAF 上对它做 challenge 豁免
const LOOKUP_UA = "tempemail-iplookup/1.0";
const LOOKUP_BASE_URL = "https://ip.guhong.vip/json/";

type IpLocation = {
    ip: string;
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    isp?: string;
    org?: string;
    as?: string;
    timezone?: string;
};

type CachedLocation = IpLocation & { fetchedAt?: number };

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_REGEX = /^[0-9a-fA-F:]{2,45}$/;

const isValidIpv4 = (value: string): boolean => {
    const match = value.match(IPV4_REGEX);
    if (!match) return false;
    return match.slice(1).every((part) => Number(part) <= 255);
};

const isValidIpv6 = (value: string): boolean => {
    // 收信链路里 IPv6 罕见，只做形状校验并要求含冒号，避免把单词当 IP
    return value.includes(":") && IPV6_REGEX.test(value) && !value.includes("..");
};

/**
 * 从邮件原文提取发件方 MTA 的 IP：取最顶部一条 Received
 * （收信时最后追加 = 记录的前一跳发件服务器）里第一个方括号 IP。
 * Received 头存在 folded 续行，先把续行折叠回同一行再解析。
 */
export const parseSenderIp = (raw: string): string | null => {
    if (!raw) return null;
    // fold unfolding: lines starting with whitespace belong to the previous header
    const headerEnd = raw.search(/\r?\n\r?\n/);
    const headerSection = (headerEnd >= 0 ? raw.slice(0, headerEnd) : raw)
        .replace(/\r?\n[ \t]+/g, " ");
    const match = headerSection.match(/^Received:[^\n]*/mi);
    if (!match) return null;
    const bracketMatch = match[0].match(/\[([^\]]+)\]/);
    if (!bracketMatch) return null;
    const ip = bracketMatch[1].trim();
    if (isValidIpv4(ip) || isValidIpv6(ip)) return ip;
    return null;
};

const lookupLocation = async (ip: string): Promise<IpLocation | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(
            `${LOOKUP_BASE_URL}?query=${encodeURIComponent(ip)}`,
            { headers: { "User-Agent": LOOKUP_UA, "Accept": "application/json" }, signal: controller.signal }
        );
        if (!res.ok) {
            console.warn("ip location lookup non-200", res.status, ip);
            return null;
        }
        const data = await res.json<Record<string, unknown>>();
        // ip-api failure shape: { success: false, message }
        if (!data || data.success === false) {
            console.warn("ip location lookup failed response", ip, data?.message);
            return null;
        }
        const text = (key: string): string | undefined => {
            const value = data[key];
            return typeof value === "string" && value.trim() ? value.trim() : undefined;
        };
        return {
            ip,
            country: text("country"),
            countryCode: text("countryCode"),
            region: text("regionName") || text("region"),
            city: text("city"),
            isp: text("isp"),
            org: text("org"),
            as: text("as"),
            timezone: text("timezone"),
        };
    } catch (error) {
        console.warn("ip location lookup error", ip, error);
        return null;
    } finally {
        clearTimeout(timer);
    }
};

export default {
    getMailIpInfo: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const row = await c.env.DB.prepare(
            `SELECT raw, raw_blob FROM raw_mails WHERE id = ?`
        ).bind(id).first<RawMailRow>();
        if (!row) return c.json({ error: "mail_not_found" }, 404);
        const raw = await resolveRawEmail(row);
        const ip = parseSenderIp(raw);
        if (!ip) return c.json({ ip: null, location: null });
        const cacheKey = `${CACHE_KEY_PREFIX}${ip}`;
        // cache hit: 30-day window, stale entries just get refreshed lazily
        try {
            const cached = await getJsonSetting<CachedLocation>(c, cacheKey);
            if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
                const { fetchedAt: _, ...location } = cached;
                return c.json({ ip, location, cached: true });
            }
        } catch (error) {
            console.warn("ip location cache read failed", ip, error);
        }
        const location = await lookupLocation(ip);
        if (location) {
            try {
                await saveSetting(c, cacheKey,
                    JSON.stringify({ ...location, fetchedAt: Date.now() }));
            } catch (error) {
                // cache write is best-effort
                console.warn("ip location cache write failed", ip, error);
            }
        }
        // lookup failed (site down / challenge) -> frontend shows the bare IP
        return c.json({ ip, location, cached: false });
    }
}
