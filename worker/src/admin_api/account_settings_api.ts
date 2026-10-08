import { Context } from 'hono'

import i18n from '../i18n'
import { deleteSetting, getJsonSetting, saveSetting } from '../utils'
import {
    getAddressCreationSettings,
    getAddressCreationSubdomainMatchStatus,
    isAnySendMailEnabled
} from '../common'
import { CONSTANTS } from '../constants'
import {
    getSendMailLimitConfig,
    getSendMailLimitConfigToSave,
    validateSendMailLimitConfig
} from '../mails_api/send_mail_limit_utils'
import { EmailRuleSettings } from '../models'

const normalizeAddressCreationSettingsUpdate = (
    value: unknown
): {
    shouldUpdate: boolean,
    shouldClear: boolean,
    nextEnableSubdomainMatch?: boolean,
} | null => {
    if (typeof value === 'undefined') {
        return { shouldUpdate: false, shouldClear: false };
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const nextEnableSubdomainMatch = (value as Record<string, unknown>).enableSubdomainMatch;
    if (typeof nextEnableSubdomainMatch === 'undefined') {
        return { shouldUpdate: false, shouldClear: false };
    }
    // null 代表"清空后台覆盖，恢复为未设置并回退到 env"，这是给前端三态显式使用的正式路径。
    if (nextEnableSubdomainMatch === null) {
        return { shouldUpdate: true, shouldClear: true };
    }
    if (typeof nextEnableSubdomainMatch !== 'boolean') {
        return null;
    }
    return {
        shouldUpdate: true,
        shouldClear: false,
        nextEnableSubdomainMatch,
    };
};

const isStringArray = (value: unknown): value is string[] => {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

// 三个旧关键词列表（建址屏蔽 / 发信屏蔽 / 来信来源屏蔽）合并成的一个列表。
// 去空白、去重复（保留大小写差异，因为后端匹配是大小写敏感的）。
const unionKeywords = (...lists: unknown[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (typeof item !== 'string') continue;
            const keyword = item.trim();
            if (!keyword || seen.has(keyword)) continue;
            seen.add(keyword);
            result.push(keyword);
        }
    }
    return result;
};

// 只允许出现这些字段：老客户端仍然全量提交，新前端按分区提交
const PAYLOAD_KEYS = [
    'blockList',
    'sendBlockList',
    'verifiedAddressList',
    'fromBlockList',
    'noLimitSendAddressList',
    'emailRuleSettings',
    'addressCreationSettings',
    'sendMailLimitConfig',
    'keywordFilterList',
];

const get = async (c: Context<HonoCustomType>) => {
    try {
        const blockList = await getJsonSetting(c, CONSTANTS.ADDRESS_BLOCK_LIST_KEY);
        const sendBlockList = await getJsonSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY);
        const verifiedAddressList = await getJsonSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY);
        const fromBlockList = c.env.KV ? await c.env.KV.get<string[]>(CONSTANTS.EMAIL_KV_BLACK_LIST, 'json') : [];
        const emailRuleSettings = await getJsonSetting<EmailRuleSettings>(c, CONSTANTS.EMAIL_RULE_SETTINGS_KEY);
        const noLimitSendAddressList = await getJsonSetting(c, CONSTANTS.NO_LIMIT_SEND_ADDRESS_LIST_KEY);
        const addressCreationSettings = await getAddressCreationSettings(c);
        const addressCreationSubdomainMatchStatus = await getAddressCreationSubdomainMatchStatus(c, addressCreationSettings);
        const sendMailLimitConfig = await getSendMailLimitConfig(c);
        return c.json({
            blockList: blockList || [],
            sendBlockList: sendBlockList || [],
            verifiedAddressList: verifiedAddressList || [],
            fromBlockList: fromBlockList || [],
            noLimitSendAddressList: noLimitSendAddressList || [],
            // 合并后的关键词列表：由三个旧字段推导，老后端没有该字段时前端自行合并
            keywordFilterList: unionKeywords(blockList, sendBlockList, fromBlockList),
            kvEnabled: !!c.env.KV,
            emailRuleSettings: emailRuleSettings || {},
            addressCreationSettings: typeof addressCreationSettings.enableSubdomainMatch === 'boolean'
                ? { enableSubdomainMatch: addressCreationSettings.enableSubdomainMatch }
                : {},
            addressCreationSubdomainMatchStatus,
            sendMailLimitConfig,
        })
    } catch (error) {
        console.error(error);
        return c.json({})
    }
};

const save = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const payload = await c.req.json();
    const {
        blockList, sendBlockList, noLimitSendAddressList,
        verifiedAddressList, fromBlockList, emailRuleSettings, addressCreationSettings,
        sendMailLimitConfig, keywordFilterList
    } = payload || {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(payload || {}, key);
    if (!PAYLOAD_KEYS.some((key) => has(key))) {
        // 分区保存允许只带部分字段，但一个已知字段都没有说明请求本身不合法
        return c.text(msgs.InvalidInputMsg, 400)
    }
    // 合并后的关键词列表扇出到三个旧字段；显式给出的旧字段优先，
    // 这样 e2e / 老客户端只改其中一个列表时行为完全不变。
    if (has('keywordFilterList') && !isStringArray(keywordFilterList)) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const nextBlockList = has('blockList') ? blockList : keywordFilterList;
    const nextSendBlockList = has('sendBlockList') ? sendBlockList : keywordFilterList;
    const nextFromBlockList = has('fromBlockList') ? fromBlockList : keywordFilterList;
    // 所有输入依赖都先校验，再执行任意写入，避免接口返回 400 时出现部分设置已落库的半成功状态。
    const stringArrayFields: Array<[string, unknown]> = [
        ['blockList', nextBlockList],
        ['sendBlockList', nextSendBlockList],
        ['fromBlockList', nextFromBlockList],
        ['verifiedAddressList', verifiedAddressList],
        ['noLimitSendAddressList', noLimitSendAddressList],
    ];
    for (const [, value] of stringArrayFields) {
        if (typeof value !== 'undefined' && !isStringArray(value)) {
            return c.text(msgs.InvalidInputMsg, 400)
        }
    }
    if (has('emailRuleSettings')
        && (emailRuleSettings === null || typeof emailRuleSettings !== 'object' || Array.isArray(emailRuleSettings))) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const addressCreationSettingsUpdate = normalizeAddressCreationSettingsUpdate(
        has('addressCreationSettings') ? addressCreationSettings : undefined
    );
    if (!addressCreationSettingsUpdate) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    if (has('verifiedAddressList') && !isAnySendMailEnabled(c) && verifiedAddressList.length > 0) {
        return c.text(msgs.EnableSendMailMsg, 400)
    }
    if (sendMailLimitConfig && !validateSendMailLimitConfig(sendMailLimitConfig)) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const sendMailLimitConfigToSave = sendMailLimitConfig
        ? getSendMailLimitConfigToSave(sendMailLimitConfig)
        : null;
    // ---- 校验全部通过，开始写入（分区保存：只有提交的字段才会被覆盖） ----
    if (typeof nextBlockList !== 'undefined') {
        await saveSetting(c, CONSTANTS.ADDRESS_BLOCK_LIST_KEY, JSON.stringify(nextBlockList));
    }
    if (typeof nextSendBlockList !== 'undefined') {
        await saveSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY, JSON.stringify(nextSendBlockList));
    }
    if (has('verifiedAddressList')) {
        await saveSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY, JSON.stringify(verifiedAddressList));
    }
    if (typeof nextFromBlockList !== 'undefined' && c.env.KV) {
        // 未配置 KV 时跳过来源屏蔽（GET 的 kvEnabled 让前端提前提示），不再整单 400
        await c.env.KV.put(CONSTANTS.EMAIL_KV_BLACK_LIST, JSON.stringify(nextFromBlockList))
    }
    if (has('noLimitSendAddressList')) {
        await saveSetting(c, CONSTANTS.NO_LIMIT_SEND_ADDRESS_LIST_KEY, JSON.stringify(noLimitSendAddressList));
    }
    if (has('emailRuleSettings')) {
        await saveSetting(c, CONSTANTS.EMAIL_RULE_SETTINGS_KEY, JSON.stringify(emailRuleSettings));
    }
    if (addressCreationSettingsUpdate.shouldUpdate) {
        if (addressCreationSettingsUpdate.shouldClear) {
            await deleteSetting(c, CONSTANTS.ADDRESS_CREATION_SETTINGS_KEY);
        } else {
            await saveSetting(
                c, CONSTANTS.ADDRESS_CREATION_SETTINGS_KEY,
                JSON.stringify({
                    enableSubdomainMatch: addressCreationSettingsUpdate.nextEnableSubdomainMatch
                })
            )
        }
    }
    if (sendMailLimitConfigToSave) {
        await saveSetting(
            c, CONSTANTS.SEND_MAIL_LIMIT_CONFIG_KEY,
            JSON.stringify(sendMailLimitConfigToSave)
        )
    }
    return c.json({ success: true });
};

export default { get, save };
