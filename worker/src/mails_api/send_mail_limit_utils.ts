import { Context } from "hono";
import i18n from "../i18n";
import { SendMailLimitConfig } from "../models";
import { CONSTANTS } from "../constants";
import { getJsonObjectValue, getSetting } from "../utils";
import { getSendMailLimitOverride } from "../mail_domains";

// 默认日/月限额：此前只在前端表单里硬编码（100/3000），现下沉到 worker 作为
// 单一源头，前端经 /admin/account_settings 读取 sendMailLimitDefaults 回填表单。
// 语义：数据库里没有存储过限额配置时，按以下默认值生效（两个开关都视为开启）；
// 管理员在面板里显式保存「两个开关都关闭」即为不限额。
export const DEFAULT_SEND_MAIL_DAILY_LIMIT = 100;
export const DEFAULT_SEND_MAIL_MONTHLY_LIMIT = 3000;

export const getSendMailLimitDefaults = (): {
    dailyLimit: number,
    monthlyLimit: number,
} => ({
    dailyLimit: DEFAULT_SEND_MAIL_DAILY_LIMIT,
    monthlyLimit: DEFAULT_SEND_MAIL_MONTHLY_LIMIT,
});

class SendMailLimitError extends Error {
    constructor(message: string) {
        super(message);
    }
}

const parseLimitValue = (value: unknown): number | null => {
    if (value === null || typeof value === "undefined") {
        return null;
    }
    if (!Number.isInteger(value) || (value as number) < -1) {
        return null;
    }
    return value as number;
}

const isValidLimitValue = (value: number | null): boolean => {
    return value === -1 || (value !== null && value >= 0);
}

const parseSendMailLimitConfig = (value: unknown): SendMailLimitConfig | null => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const config = value as Record<string, unknown>;
    if (typeof config.dailyEnabled !== "boolean" || typeof config.monthlyEnabled !== "boolean") {
        return null;
    }
    const dailyLimit = parseLimitValue(config.dailyLimit);
    const monthlyLimit = parseLimitValue(config.monthlyLimit);
    const monthlyValid = config.monthlyEnabled
        ? isValidLimitValue(monthlyLimit)
        : (config.monthlyLimit === null || typeof config.monthlyLimit === "undefined" || monthlyLimit !== null);
    const dailyValid = config.dailyEnabled
        ? isValidLimitValue(dailyLimit)
        : (config.dailyLimit === null || typeof config.dailyLimit === "undefined" || dailyLimit !== null);
    if (!dailyValid || !monthlyValid) {
        return null;
    }
    return {
        dailyEnabled: config.dailyEnabled,
        monthlyEnabled: config.monthlyEnabled,
        dailyLimit,
        monthlyLimit,
    };
}

export const validateSendMailLimitConfig = (value: unknown): boolean => {
    return !!parseSendMailLimitConfig(value);
}

export const getSendMailLimitConfigToSave = (
    value: unknown
): SendMailLimitConfig | null => {
    const sendMailLimitConfig = parseSendMailLimitConfig(value);
    if (!sendMailLimitConfig) {
        return null;
    }
    return {
        dailyEnabled: sendMailLimitConfig.dailyEnabled,
        monthlyEnabled: sendMailLimitConfig.monthlyEnabled,
        dailyLimit: sendMailLimitConfig.dailyEnabled ? sendMailLimitConfig.dailyLimit : null,
        monthlyLimit: sendMailLimitConfig.monthlyEnabled ? sendMailLimitConfig.monthlyLimit : null,
    };
}

export const getSendMailLimitConfig = async (
    c: Context<HonoCustomType>
): Promise<SendMailLimitConfig | null> => {
    return getSendMailLimitConfigToSave(getJsonObjectValue<SendMailLimitConfig>(
        await getSetting(c, CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY)
    ));
}

// 生效配置 = 存储配置；未存储时回落到默认限额（管理员未配置时也有一层基础防护）。
// 管理员显式保存「两个开关都关闭」即为不限额：存储配置优先，不回落默认值。
export const getEffectiveSendMailLimitConfig = async (
    c: Context<HonoCustomType>
): Promise<SendMailLimitConfig> => {
    const stored = await getSendMailLimitConfig(c);
    if (stored) {
        return stored;
    }
    return {
        dailyEnabled: true,
        monthlyEnabled: true,
        dailyLimit: DEFAULT_SEND_MAIL_DAILY_LIMIT,
        monthlyLimit: DEFAULT_SEND_MAIL_MONTHLY_LIMIT,
    };
}

const getDailyCountKey = (date: Date = new Date(), domain?: string): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const suffix = domain ? `:${domain}` : "";
    return `${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}daily:${yyyy}-${mm}-${dd}${suffix}`;
}

const getMonthlyCountKey = (date: Date = new Date(), domain?: string): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const suffix = domain ? `:${domain}` : "";
    return `${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}monthly:${yyyy}-${mm}${suffix}`;
}

const getCount = async (
    c: Context<HonoCustomType>,
    key: string
): Promise<number> => {
    const value = await getSetting(c, key);
    if (!value) {
        return 0;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

const cleanupSendMailLimitCount = async (
    c: Context<HonoCustomType>,
    currentDailyKey: string,
    currentMonthlyKey: string
): Promise<void> => {
    await c.env.DB.batch([
        c.env.DB.prepare(
            `DELETE FROM settings
            WHERE key LIKE ?
            AND key < ?`
        ).bind(`${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}daily:%`, currentDailyKey),
        c.env.DB.prepare(
            `DELETE FROM settings
            WHERE key LIKE ?
            AND key < ?`
        ).bind(`${CONSTANTS.SEND_MAIL_LIMIT_COUNT_KEY_PREFIX}monthly:%`, currentMonthlyKey),
    ]);
}

export const ensureSendMailLimit = async (
    c: Context<HonoCustomType>,
    mailDomain?: string
): Promise<void> => {
    try {
        const msgs = i18n.getMessagesbyContext(c);
        const config = await getEffectiveSendMailLimitConfig(c);
        const override = await getSendMailLimitOverride(c, mailDomain);
        // 第一层：全局限额（null/-1 表示不限）
        if (config.dailyEnabled && config.dailyLimit !== null && config.dailyLimit !== -1) {
            const current = await getCount(c, getDailyCountKey());
            if (current >= config.dailyLimit) {
                throw new SendMailLimitError(msgs.ServerSendMailDailyLimitMsg);
            }
        }
        if (config.monthlyEnabled && config.monthlyLimit !== null && config.monthlyLimit !== -1) {
            const current = await getCount(c, getMonthlyCountKey());
            if (current >= config.monthlyLimit) {
                throw new SendMailLimitError(msgs.ServerSendMailMonthlyLimitMsg);
            }
        }
        // 第二层：每域限额（管理员显式配置时才生效，计数按域名独立）
        if (mailDomain && override.dailyLimit !== null) {
            const current = await getCount(c, getDailyCountKey(new Date(), mailDomain));
            if (current >= override.dailyLimit) {
                throw new SendMailLimitError(msgs.ServerSendMailDailyLimitMsg);
            }
        }
        if (mailDomain && override.monthlyLimit !== null) {
            const current = await getCount(c, getMonthlyCountKey(new Date(), mailDomain));
            if (current >= override.monthlyLimit) {
                throw new SendMailLimitError(msgs.ServerSendMailMonthlyLimitMsg);
            }
        }
    } catch (error) {
        if (error instanceof SendMailLimitError) {
            throw error;
        }
        console.warn("Failed to ensure send mail limit", error);
    }
}

const increaseCount = async (
    c: Context<HonoCustomType>,
    key: string,
): Promise<void> => {
    await c.env.DB.prepare(
        `INSERT INTO settings (key, value)
        VALUES (?, '1')
        ON CONFLICT(key) DO UPDATE SET
            value = CAST(COALESCE(value, '0') AS INTEGER) + 1,
            updated_at = datetime('now')`
    ).bind(key).run();
}

export const increaseSendMailLimitCount = async (
    c: Context<HonoCustomType>,
    mailDomain?: string
): Promise<void> => {
    try {
        const config = await getEffectiveSendMailLimitConfig(c);
        const override = await getSendMailLimitOverride(c, mailDomain);
        const dailyKey = getDailyCountKey();
        const monthlyKey = getMonthlyCountKey();
        if (config.dailyEnabled) {
            await increaseCount(c, dailyKey);
        }
        if (config.monthlyEnabled) {
            await increaseCount(c, monthlyKey);
        }
        // 每域计数只在该域显式配置限额时维护（未配置的域名共用全局计数）
        if (mailDomain && override.dailyLimit !== null) {
            await increaseCount(c, getDailyCountKey(new Date(), mailDomain));
        }
        if (mailDomain && override.monthlyLimit !== null) {
            await increaseCount(c, getMonthlyCountKey(new Date(), mailDomain));
        }
        await cleanupSendMailLimitCount(c, dailyKey, monthlyKey);
    } catch (error) {
        if (error instanceof SendMailLimitError) {
            throw error;
        }
        console.warn(`Failed to increment send_mail_limit_count`, error);
    }
}
