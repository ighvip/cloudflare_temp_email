import { Context } from 'hono'

import i18n from '../i18n'
import { deleteSetting, getJsonSetting, saveSetting } from '../utils'
import {
    getAddressCreationSettings,
    getAddressCreationSubdomainMatchStatus,
    resolveAnySendMailEnabled
} from '../common'
import { CONSTANTS } from '../constants'
import {
    getEffectiveSendMailLimitConfig,
    getSendMailLimitConfigToSave,
    getSendMailLimitDefaults,
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
    'sendMailGlobalEnabled',
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
        // 生效配置：未存储过限额配置时返回默认限额（100/3000，两个开关开启），
        // 这样管理员打开面板就能看到当前真正生效的值，并可直接关掉。
        const sendMailLimitConfig = await getEffectiveSendMailLimitConfig(c);
        // 全局发信开关三态：true=强制开启 / false=全站禁发 / null=未设置（跟随 env 与每域开关）
        const rawGlobalSendEnabled = await getJsonSetting<boolean>(c, CONSTANTS.SEND_MAIL_ENABLED_KEY);
        const sendMailGlobalEnabled = typeof rawGlobalSendEnabled === 'boolean'
            ? rawGlobalSendEnabled
            : null;
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
            // 默认限额下沉到 worker：前端表单据此回填，不再各自硬编码 100/3000
            sendMailLimitDefaults: getSendMailLimitDefaults(),
            sendMailGlobalEnabled,
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
        sendMailLimitConfig, sendMailGlobalEnabled, keywordFilterList
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
    if (has('sendMailGlobalEnabled')
        && sendMailGlobalEnabled !== null
        && typeof sendMailGlobalEnabled !== 'boolean') {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    // 已验证地址列表只在发信确实可用时才允许配置：本次提交带了全局开关就
    // 以提交值为准（允许一次保存里"开启 + 添加"），null 表示恢复"跟随环境"，
    // 仍按 env 与每域开关判定；未带该键则读当前生效状态。
    const sendEnabledForVerifiedList = has('sendMailGlobalEnabled') && sendMailGlobalEnabled !== null
        ? sendMailGlobalEnabled === true
        : await resolveAnySendMailEnabled(c);
    if (has('verifiedAddressList') && !sendEnabledForVerifiedList && verifiedAddressList.length > 0) {
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
    if (has('sendMailGlobalEnabled')) {
        if (sendMailGlobalEnabled === null) {
            // null = 清空覆盖，恢复"未设置"（跟随 env 与每域开关）
            await deleteSetting(c, CONSTANTS.SEND_MAIL_ENABLED_KEY);
        } else {
            await saveSetting(
                c, CONSTANTS.SEND_MAIL_ENABLED_KEY,
                JSON.stringify(sendMailGlobalEnabled)
            )
        }
    }
    return c.json({ success: true });
};

export default { get, save };
