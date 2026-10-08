import { Context } from 'hono';

import { CONSTANTS } from './constants';
import { MailDomainSetting, MailDomainSettings } from './models';
import { getDomains, getJsonSetting, normalizeDomain, saveSetting } from './utils';

// 问题6 批次1: the D1-backed per-domain switch list. Same label rules as
// common.ts (DOMAIN_LABEL_RE / MAX_DOMAIN_LENGTH) so the admin panel and the
// address checks agree on what a valid domain looks like.
export const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const MAX_DOMAIN_LENGTH = 253;

export const isValidMailDomain = (value: unknown): value is string => {
    if (typeof value !== "string") {
        return false;
    }
    const domain = normalizeDomain(value);
    if (!domain || domain.length > MAX_DOMAIN_LENGTH) {
        return false;
    }
    const labels = domain.split(".");
    return labels.length > 0
        && labels.every((label) => DOMAIN_LABEL_RE.test(label));
}

// normalize one stored record: keep unknown (future wizard) fields verbatim,
// coerce the known switches to booleans. Invalid names are dropped so a
// hand-edited record can never poison the LIKE pattern / switch lookups.
const normalizeStoredDomain = (item: unknown): MailDomainSetting | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
    }
    const raw = item as Record<string, unknown>;
    if (!isValidMailDomain(raw.name)) {
        return null;
    }
    return {
        ...raw,
        name: normalizeDomain(raw.name),
        enabled: raw.enabled !== false,
        sendEnabled: raw.sendEnabled === true,
        isDefault: raw.isDefault === true,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    };
}

/**
 * Read the stored domain switch list (empty until an admin adds domains —
 * env-only sites therefore behave exactly as before).
 */
export const getMailDomainSettings = async (
    c: Context<HonoCustomType>
): Promise<MailDomainSetting[]> => {
    try {
        const stored = await getJsonSetting<MailDomainSettings | MailDomainSetting[]>(
            c, CONSTANTS.MAIL_DOMAIN_SETTINGS_KEY
        );
        const list = Array.isArray(stored)
            ? stored
            : (Array.isArray(stored?.domains) ? stored.domains : []);
        return list
            .map(normalizeStoredDomain)
            .filter((item): item is MailDomainSetting => item !== null);
    } catch (error) {
        console.error("getMailDomainSettings failed", error);
    }
    return [];
}

export const saveMailDomainSettings = async (
    c: Context<HonoCustomType>, domains: MailDomainSetting[]
): Promise<void> => {
    await saveSetting(
        c,
        CONSTANTS.MAIL_DOMAIN_SETTINGS_KEY,
        JSON.stringify({ domains } satisfies MailDomainSettings)
    );
}

// 问题6 批次2: env 域名 ∪ 纳管域名（去重，env 在前）。
// 用于建址下拉 / 域名校验等"用户可选域名"场景；getDomains() 本身保持
// env-only 语义不动（uptime / telegram / send_mail 等仍按 env 假设运行）。
export const getManagedDomains = async (
    c: Context<HonoCustomType>
): Promise<string[]> => {
    const envDomains = getDomains(c);
    const envSet = new Set(envDomains.map((d) => d.toLowerCase()));
    const stored = await getMailDomainSettings(c);
    const extras = stored
        .map((item) => item.name)
        .filter((name) => !envSet.has(name.toLowerCase()));
    return [...envDomains, ...extras];
}

const findStoredDomain = async (
    c: Context<HonoCustomType>, domain: unknown
): Promise<MailDomainSetting | null> => {
    const name = normalizeDomain(domain);
    if (!name) {
        return null;
    }
    const list = await getMailDomainSettings(c);
    return list.find((item) => item.name === name) || null;
}

/**
 * 收信 switch: only a domain present in the stored list is affected —
 * everything else keeps the previous behaviour (CF Email Routing decides
 * what reaches the worker, exactly as before).
 */
export const isReceiveMailEnabled = async (
    c: Context<HonoCustomType>, domain: unknown
): Promise<boolean> => {
    const stored = await findStoredDomain(c, domain);
    if (!stored) {
        return true;
    }
    return stored.enabled !== false;
}

/**
 * 发信 switch: `true`/`false` when the domain is in the stored list
 * (the stored value wins over the env behaviour), `null` otherwise —
 * callers then fall back to the env-based isSendMailEnabled.
 */
export const getSendMailOverride = async (
    c: Context<HonoCustomType>, domain: unknown
): Promise<boolean | null> => {
    const stored = await findStoredDomain(c, domain);
    if (!stored) {
        return null;
    }
    return stored.sendEnabled === true;
}
