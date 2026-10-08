import { Context } from 'hono';

import { isSendMailEnabled } from '../common';
import { MailDomainSetting } from '../models';
import {
    getMailDomainSettings,
    isValidMailDomain,
    saveMailDomainSettings,
} from '../mail_domains';
import { getDomains, normalizeDomain } from '../utils';

// 问题6 批次1: 站点域名管理 — the D1 switch list (收信 / 发信) per domain.
// env-only sites keep working untouched: everything below only reads/writes
// the stored list, the env DOMAINS stay the fallback everywhere else.

// 问题6 批次2: DNS auto-detect for the domain wizard. Cloudflare Email
// Routing receives on route{1,2,3}.mx.cloudflare.net — we query DoH
// (cloudflare-dns.com, no extra dependency) and report what we find.
type DnsAnswer = { name?: string, type?: number, data?: string };
type DohResponse = { Status?: number, Answer?: DnsAnswer[] };

const CF_ROUTE_MX_RE = /^route[123]\.mx\.cloudflare\.net\.?$/i;

const dohQuery = async (
    name: string, type: "MX" | "TXT"
): Promise<string[]> => {
    try {
        const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
        const res = await fetch(url, {
            headers: { "accept": "application/dns-json" },
        });
        if (!res.ok) return [];
        const json = await res.json() as DohResponse;
        // Status 3 = NXDOMAIN (no records at all)
        if (json.Status !== 0 && json.Status !== 3) return [];
        return (json.Answer || [])
            .filter((item) => item.type === (type === "MX" ? 15 : 16))
            .map((item) => (item.data || "").trim())
            .filter((data) => data.length > 0);
    } catch (e) {
        console.error(`doh query failed ${type} ${name}`, e);
        return [];
    }
}

type DomainListPayload = {
    domains: (MailDomainSetting & { inEnv: boolean })[],
    envDomains: string[],
}

const buildPayload = async (
    c: Context<HonoCustomType>
): Promise<DomainListPayload> => {
    const envDomains = getDomains(c);
    const stored = await getMailDomainSettings(c);
    return {
        domains: stored.map((item) => ({
            ...item,
            inEnv: envDomains.includes(item.name),
        })),
        envDomains,
    };
}

export default {
    // 问题6 批次2: wizard step-2 DNS auto-detect
    dnsCheck: async (c: Context<HonoCustomType>) => {
        const name = normalizeDomain(c.req.query("name"));
        if (!isValidMailDomain(name)) {
            return c.text(`域名格式不正确：${name}`, 400);
        }
        const [mxRecords, txtRecords] = await Promise.all([
            dohQuery(name, "MX"),
            dohQuery(name, "TXT"),
        ]);
        // MX answers look like "10 route1.mx.cloudflare.net."
        const mxHosts = mxRecords
            .map((data) => data.replace(/^\d+\s+/, "").replace(/\.$/, "").toLowerCase())
            .filter((host) => host.length > 0);
        const routeHosts = mxHosts.filter((host) => CF_ROUTE_MX_RE.test(host));
        const spf = txtRecords.some((data) => data.toLowerCase().includes("v=spf1"));
        const dedupe = (list: string[]) => [...new Set(list)];
        return c.json({
            name,
            mx: dedupe(mxHosts),
            routeMx: dedupe(routeHosts),
            otherMx: dedupe(mxHosts.filter((host) => !CF_ROUTE_MX_RE.test(host))),
            expectedRouteMx: ["route1.mx.cloudflare.net", "route2.mx.cloudflare.net", "route3.mx.cloudflare.net"],
            hasRouteMx: routeHosts.length > 0,
            spf,
        });
    },

    list: async (c: Context<HonoCustomType>) => {
        return c.json(await buildPayload(c));
    },

    add: async (c: Context<HonoCustomType>) => {
        let body: { name?: unknown };
        try {
            body = await c.req.json();
        } catch (e) {
            console.error("domain add invalid json", e);
            return c.text("参数错误", 400);
        }
        if (!isValidMailDomain(body.name)) {
            return c.text(`域名格式不正确：${normalizeDomain(body.name)}`, 400);
        }
        const name = normalizeDomain(body.name);
        const stored = await getMailDomainSettings(c);
        if (stored.some((item) => item.name === name)) {
            return c.text(`域名已存在：${name}`, 400);
        }
        stored.push({
            name,
            // 收信默认开启；发信默认跟随当前环境变量的实际状态，
            // 这样「添加」这个动作本身不会改变任何已有行为
            enabled: true,
            sendEnabled: isSendMailEnabled(c, name),
            isDefault: stored.length === 0,
            createdAt: new Date().toISOString(),
        });
        await saveMailDomainSettings(c, stored);
        return c.json({ success: true, ...(await buildPayload(c)) });
    },

    update: async (c: Context<HonoCustomType>) => {
        const name = normalizeDomain(c.req.param("name"));
        if (!name) {
            return c.text("域名格式不正确", 400);
        }
        let body: { enabled?: unknown, sendEnabled?: unknown, isDefault?: unknown };
        try {
            body = await c.req.json();
        } catch (e) {
            console.error("domain update invalid json", e);
            return c.text("参数错误", 400);
        }
        const updates: Partial<MailDomainSetting> = {};
        for (const key of ["enabled", "sendEnabled", "isDefault"] as const) {
            const value = body[key];
            if (value === undefined) continue;
            if (typeof value !== "boolean") {
                return c.text("参数错误", 400);
            }
            updates[key] = value;
        }
        if (Object.keys(updates).length === 0) {
            return c.text("没有需要更新的字段", 400);
        }
        const stored = await getMailDomainSettings(c);
        const target = stored.find((item) => item.name === name);
        if (!target) {
            return c.text(`域名不存在：${name}`, 404);
        }
        Object.assign(target, updates);
        // only one default domain at a time
        if (updates.isDefault === true) {
            for (const item of stored) {
                if (item.name !== name) item.isDefault = false;
            }
        }
        await saveMailDomainSettings(c, stored);
        return c.json({ success: true, ...(await buildPayload(c)) });
    },

    remove: async (c: Context<HonoCustomType>) => {
        const name = normalizeDomain(c.req.param("name"));
        if (!name) {
            return c.text("域名格式不正确", 400);
        }
        const stored = await getMailDomainSettings(c);
        if (!stored.some((item) => item.name === name)) {
            return c.text(`域名不存在：${name}`, 404);
        }
        // address rows store the full address in `name` — refuse to drop a
        // domain that still has addresses pointing at it
        const count = await c.env.DB.prepare(
            `SELECT count(*) as count FROM address WHERE name LIKE ?`
        ).bind(`%@${name}`).first<number>("count") || 0;
        if (count > 0) {
            return c.text(`该域名下仍有 ${count} 个邮箱地址，无法删除`, 400);
        }
        await saveMailDomainSettings(
            c, stored.filter((item) => item.name !== name)
        );
        return c.json({ success: true, ...(await buildPayload(c)) });
    },
}
