<script setup>
import { computed, onMounted, ref, h } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { NButton, NPopconfirm, NInput, NSelect, NRadioGroup, NRadio } from 'naive-ui'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { findKeywordMatches, normalizeKeywordList } from '../../utils/keyword-filter'

const { openSettings } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.AccountSettings')

// 发信分区只有在明确开启时才渲染可编辑控件（配置缺失同样视为未启用）
const sendEnabled = computed(() => openSettings.value?.enableSendMail === true)
const kvEnabled = ref(true)

// ---- 分区保存状态：保存、错误都按分区隔离 ----
const sectionSaving = ref({
    receive: false, keyword: false, forward: false, send: false, address: false
})
const sectionError = ref({
    receive: '', keyword: '', forward: '', send: '', address: ''
})

// ---- 收信过滤 ----
const savedReceiveUnknown = ref(false)
const receiveUnknown = ref(false)

// ---- 关键词过滤（三个旧列表合并成的一个列表） ----
const keywordFilterList = ref([])
const testText = ref('')
// 测试器是纯函数：随输入与关键词列表实时给出结论
const keywordTest = computed(() => {
    const text = testText.value.trim()
    if (!text) return null
    return { matched: findKeywordMatches(keywordFilterList.value, text) }
})

// ---- 转发 ----
const showEmailForwardingModal = ref(false)
const savedForwardingList = ref([])
const forwardingList = ref([])
const forwardingDirty = ref(false)

// ---- 发信 ----
const verifiedAddressList = ref([])
const noLimitSendAddressList = ref([])
const DEFAULT_SEND_MAIL_DAILY_LIMIT = 100
const DEFAULT_SEND_MAIL_MONTHLY_LIMIT = 3000
const sendMailDailyLimitEnabled = ref(false)
const sendMailMonthlyLimitEnabled = ref(false)
const sendMailDailyLimit = ref(DEFAULT_SEND_MAIL_DAILY_LIMIT)
const sendMailMonthlyLimit = ref(DEFAULT_SEND_MAIL_MONTHLY_LIMIT)
const dailyLimitError = ref('')
const monthlyLimitError = ref('')

// ---- 地址创建 ----
const ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE = {
    FOLLOW_ENV: 'follow_env',
    FORCE_ENABLE: 'force_enable',
    FORCE_DISABLE: 'force_disable'
}
const addressCreationSubdomainMatchMode = ref(ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV)
const addressCreationSubdomainMatchStatus = ref({
    envConfigured: false,
    envEnabled: false,
    storedEnabled: undefined,
    effectiveEnabled: false
})
const subdomainMatchEnvLocked = computed(() => {
    return addressCreationSubdomainMatchStatus.value.envConfigured
        && !addressCreationSubdomainMatchStatus.value.envEnabled
})
const subdomainMatchModeOptions = computed(() => {
    return [
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV,
            label: t('create_address_subdomain_match_follow_env')
        },
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE,
            label: t('create_address_subdomain_match_force_enable')
        },
        {
            value: ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE,
            label: t('create_address_subdomain_match_force_disable')
        }
    ]
})

const copyForwardingRule = (rule) => ({
    domains: Array.isArray(rule?.domains) ? [...rule.domains] : [],
    forward: typeof rule?.forward === 'string' ? rule.forward : '',
    sourcePatterns: Array.isArray(rule?.sourcePatterns) ? [...rule.sourcePatterns] : [],
    sourceMatchMode: rule?.sourceMatchMode === 'all' ? 'all' : 'any'
})

// 只提交规则本身的字段，不带上行内校验用的临时字段
const buildForwardingPayload = () => forwardingList.value.map((rule) => ({
    domains: [...(rule.domains || [])],
    forward: rule.forward || '',
    sourcePatterns: [...(rule.sourcePatterns || [])],
    sourceMatchMode: rule.sourceMatchMode === 'all' ? 'all' : 'any'
}))

const markForwardingDirty = () => {
    forwardingDirty.value = true
}

const emailForwardingColumns = [
    {
        title: t('domain_list'),
        key: 'domains',
        render: (row, index) => {
            return h(NSelect, {
                value: Array.isArray(row.domains) ? row.domains : [],
                onUpdateValue: (val) => {
                    forwardingList.value[index].domains = val
                    markForwardingDirty()
                },
                options: openSettings.value?.domains || [],
                multiple: true,
                filterable: true,
                tag: true,
                placeholder: t('select_domain')
            })
        }
    },
    {
        title: t('source_patterns'),
        key: 'sourcePatterns',
        render: (row, index) => {
            return h('div', { style: 'display: flex; flex-direction: column; gap: 4px;' }, [
                h(NSelect, {
                    value: Array.isArray(row.sourcePatterns) ? row.sourcePatterns : [],
                    onUpdateValue: (val) => {
                        forwardingList.value[index].sourcePatterns = val
                        forwardingList.value[index].patternError = ''
                        markForwardingDirty()
                    },
                    multiple: true,
                    filterable: true,
                    tag: true,
                    placeholder: t('source_patterns_placeholder')
                }, {
                    empty: () => h('span', { style: 'color: #999; font-size: 12px;' }, t('manualInputPrompt'))
                }),
                row.patternError
                    ? h('span', {
                        style: 'font-size: 12px; line-height: 1.5; color: #e5484d; word-break: break-all;'
                    }, row.patternError)
                    : null,
                h(NRadioGroup, {
                    value: row.sourceMatchMode || 'any',
                    onUpdateValue: (val) => {
                        forwardingList.value[index].sourceMatchMode = val
                        markForwardingDirty()
                    },
                    size: 'small',
                    style: 'margin-top: 4px;'
                }, {
                    default: () => [
                        h(NRadio, { value: 'any' }, { default: () => t('match_any') }),
                        h(NRadio, { value: 'all' }, { default: () => t('match_all') })
                    ]
                })
            ])
        }
    },
    {
        title: t('forward_address'),
        key: 'forward',
        render: (row, index) => {
            return h('div', { style: 'display: flex; flex-direction: column; gap: 4px;' }, [
                h(NInput, {
                    value: row.forward,
                    onUpdateValue: (val) => {
                        forwardingList.value[index].forward = val
                        forwardingList.value[index].forwardError = ''
                        markForwardingDirty()
                    },
                    placeholder: t('forward_placeholder')
                }),
                row.forwardError
                    ? h('span', {
                        style: 'font-size: 12px; line-height: 1.5; color: #e5484d; word-break: break-all;'
                    }, row.forwardError)
                    : null
            ])
        }
    },
    {
        title: t('actions'),
        key: 'actions',
        render: (row, index) => {
            return h('div', { style: 'display: flex; gap: 8px;' }, [
                h(NPopconfirm, {
                    onPositiveClick: () => {
                        forwardingList.value = forwardingList.value.filter((_, i) => i !== index)
                        markForwardingDirty()
                        message.success(t('delete_success'))
                    }
                }, {
                    default: () => t('delete_rule_confirm'),
                    trigger: () => h(NButton, {
                        size: 'small',
                        type: 'error'
                    }, { default: () => t('delete_rule') })
                })
            ])
        }
    }
]

const openEmailForwardingModal = () => {
    // 上一次未保存的编辑保留在缓冲区里，避免误关弹窗丢内容；
    // 失败提示也保留，下一次点击「保存」时才会清除。
    if (!forwardingDirty.value) {
        forwardingList.value = savedForwardingList.value.map(copyForwardingRule)
    }
    showEmailForwardingModal.value = true
}

const addNewEmailForwardingItem = () => {
    forwardingList.value = [
        ...forwardingList.value,
        {
            domains: [],
            forward: '',
            sourcePatterns: [],
            sourceMatchMode: 'any',
            forwardError: '',
            patternError: ''
        }
    ]
    markForwardingDirty()
}

const MAX_REGEX_LENGTH = 200

// 逐行校验，错误直接标在出错的输入框下面，不打断其它行的编辑
const validateForwardingRules = () => {
    let valid = true
    for (const rule of forwardingList.value) {
        rule.forwardError = ''
        rule.patternError = ''
        if (!rule.forward || rule.forward.trim() === '') {
            rule.forwardError = t('forward_address_required')
            valid = false
        }
        for (const pattern of rule.sourcePatterns || []) {
            if (pattern.length > MAX_REGEX_LENGTH) {
                rule.patternError = `${t('regex_too_long')}: ${pattern.substring(0, 30)}...`
                valid = false
                break
            }
            try {
                new RegExp(pattern, 'i')
            } catch (e) {
                rule.patternError = `${t('regex_invalid')}: ${pattern}`
                valid = false
                break
            }
        }
    }
    return valid
}

const getSubdomainMatchModeByStoredValue = (storedEnabled) => {
    if (storedEnabled === true) {
        return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE
    }
    if (storedEnabled === false) {
        return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE
    }
    return ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FOLLOW_ENV
}

const getSubdomainMatchPayloadValue = (mode) => {
    if (mode === ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_ENABLE) {
        return true
    }
    if (mode === ADDRESS_CREATION_SUBDOMAIN_MATCH_MODE.FORCE_DISABLE) {
        return false
    }
    return null
}

const getSendMailLimitPayload = () => {
    return {
        dailyEnabled: sendMailDailyLimitEnabled.value,
        monthlyEnabled: sendMailMonthlyLimitEnabled.value,
        dailyLimit: sendMailDailyLimitEnabled.value ? sendMailDailyLimit.value : null,
        monthlyLimit: sendMailMonthlyLimitEnabled.value ? sendMailMonthlyLimit.value : null
    }
}

const isValidSendMailLimit = (value) => {
    return Number.isInteger(value) && value >= -1
}

// 校验失败时把错误标在对应输入框下方，只有发信分区受影响
const validateSendMailLimit = () => {
    dailyLimitError.value = ''
    monthlyLimitError.value = ''
    if (sendMailDailyLimitEnabled.value && !isValidSendMailLimit(sendMailDailyLimit.value)) {
        dailyLimitError.value = t('send_mail_daily_limit_invalid')
    }
    if (sendMailMonthlyLimitEnabled.value && !isValidSendMailLimit(sendMailMonthlyLimit.value)) {
        monthlyLimitError.value = t('send_mail_monthly_limit_invalid')
    }
    return !dailyLimitError.value && !monthlyLimitError.value
}

// ---- 读取：section 缺省表示整页刷新，否则只刷新指定分区 ----
const applyReceive = (res) => {
    const value = !!res.emailRuleSettings?.blockReceiveUnknowAddressEmail
    savedReceiveUnknown.value = value
    receiveUnknown.value = value
}

const applyKeyword = (res) => {
    // 新字段优先；旧后端只返回三个老列表时退回合并逻辑
    const merged = Array.isArray(res.keywordFilterList)
        ? res.keywordFilterList
        : [res.blockList, res.sendBlockList, res.fromBlockList]
    keywordFilterList.value = normalizeKeywordList(merged)
    kvEnabled.value = res.kvEnabled !== false
}

const applyForward = (res) => {
    const list = Array.isArray(res.emailRuleSettings?.emailForwardingList)
        ? res.emailRuleSettings.emailForwardingList
        : []
    savedForwardingList.value = list.map(copyForwardingRule)
    forwardingList.value = list.map(copyForwardingRule)
    forwardingDirty.value = false
}

const applySend = (res) => {
    verifiedAddressList.value = res.verifiedAddressList || []
    noLimitSendAddressList.value = res.noLimitSendAddressList || []
    const sendMailLimitConfig = res.sendMailLimitConfig
    sendMailDailyLimitEnabled.value = !!sendMailLimitConfig?.dailyEnabled
    sendMailMonthlyLimitEnabled.value = !!sendMailLimitConfig?.monthlyEnabled
    sendMailDailyLimit.value = sendMailDailyLimitEnabled.value
        ? sendMailLimitConfig.dailyLimit
        : DEFAULT_SEND_MAIL_DAILY_LIMIT
    sendMailMonthlyLimit.value = sendMailMonthlyLimitEnabled.value
        ? sendMailLimitConfig.monthlyLimit
        : DEFAULT_SEND_MAIL_MONTHLY_LIMIT
    dailyLimitError.value = ''
    monthlyLimitError.value = ''
}

const applyAddress = (res) => {
    addressCreationSubdomainMatchStatus.value = {
        envConfigured: !!res.addressCreationSubdomainMatchStatus?.envConfigured,
        envEnabled: !!res.addressCreationSubdomainMatchStatus?.envEnabled,
        storedEnabled: typeof res.addressCreationSubdomainMatchStatus?.storedEnabled === 'boolean'
            ? res.addressCreationSubdomainMatchStatus.storedEnabled
            : undefined,
        effectiveEnabled: !!res.addressCreationSubdomainMatchStatus?.effectiveEnabled
    }
    addressCreationSubdomainMatchMode.value = getSubdomainMatchModeByStoredValue(
        addressCreationSubdomainMatchStatus.value.storedEnabled
    )
}

const applySection = (res, section) => {
    if (!section || section === 'receive') applyReceive(res)
    if (!section || section === 'keyword') applyKeyword(res)
    if (!section || section === 'forward') applyForward(res)
    if (!section || section === 'send') applySend(res)
    if (!section || section === 'address') applyAddress(res)
}

const fetchData = async () => {
    try {
        const res = await api.fetch(`/admin/account_settings`)
        applySection(res)
    } catch (error) {
        message.error(error.message || "error");
        throw error
    }
}

// ---- 分区保存：一次只提交一个分区，400 只标记该分区 ----
const saveSection = async (section, payload) => {
    sectionError.value[section] = ''
    sectionSaving.value[section] = true
    try {
        await api.fetch(`/admin/account_settings`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        message.success(t('successTip'))
        try {
            // 回读只刷新本分区，其它分区未保存的编辑不会被覆盖
            const res = await api.fetch(`/admin/account_settings`)
            applySection(res, section)
        } catch (refreshError) {
            console.warn('refresh account settings after save failed', refreshError)
        }
        return true
    } catch (error) {
        sectionError.value[section] = error?.message || "error";
        return false
    } finally {
        sectionSaving.value[section] = false
    }
}

const saveReceiveSection = () => {
    return saveSection('receive', {
        emailRuleSettings: {
            blockReceiveUnknowAddressEmail: receiveUnknown.value,
            emailForwardingList: savedForwardingList.value
        }
    })
}

const saveKeywordSection = () => {
    // 保存前统一规范化（去空白、去重），同一个数组扇出给三个旧字段
    keywordFilterList.value = normalizeKeywordList(keywordFilterList.value)
    return saveSection('keyword', { keywordFilterList: keywordFilterList.value })
}

const saveForwardSection = async () => {
    if (!validateForwardingRules()) {
        return false
    }
    const ok = await saveSection('forward', {
        emailRuleSettings: {
            blockReceiveUnknowAddressEmail: savedReceiveUnknown.value,
            emailForwardingList: buildForwardingPayload()
        }
    })
    if (ok) {
        showEmailForwardingModal.value = false
    }
    return ok
}

const saveSendSection = () => {
    if (!validateSendMailLimit()) {
        return false
    }
    return saveSection('send', {
        verifiedAddressList: verifiedAddressList.value || [],
        noLimitSendAddressList: noLimitSendAddressList.value || [],
        sendMailLimitConfig: getSendMailLimitPayload()
    })
}

const saveAddressSection = () => {
    return saveSection('address', {
        addressCreationSettings: {
            enableSubdomainMatch: getSubdomainMatchPayloadValue(addressCreationSubdomainMatchMode.value)
        }
    })
}

onMounted(async () => {
    try {
        await fetchData();
    } catch {
        // 首次加载失败时，错误提示已经在 fetchData 内部统一处理，这里无需重复提示。
    }
})
</script>

<template>
    <div class="center">
        <!-- 收信过滤 -->
        <n-card class="section-card" :title="t('receiveCard')">
            <p class="acc-usage">{{ t('receiveUsage') }}</p>
            <n-form-item-row :label="t('block_receive_unknow_address_email')">
                <n-switch v-model:value="receiveUnknown" :round="false" />
            </n-form-item-row>
            <p v-if="sectionError.receive" class="acc-error">{{ t('sectionSaveFailed', { msg: sectionError.receive }) }}</p>
            <div class="acc-actions">
                <n-button type="primary" :loading="sectionSaving.receive" @click="saveReceiveSection">
                    {{ t('save') }}
                </n-button>
            </div>
        </n-card>

        <!-- 关键词过滤 -->
        <n-card class="section-card" :title="t('keywordCard')">
            <p class="acc-usage">{{ t('keywordUsage') }}</p>
            <n-form-item-row :label="t('keywordLabel')">
                <n-select v-model:value="keywordFilterList" filterable multiple tag
                    :placeholder="t('address_block_list_placeholder')">
                    <template #empty>
                        <n-text depth="3">
                            {{ t('manualInputPrompt') }}
                        </n-text>
                    </template>
                </n-select>
            </n-form-item-row>
            <p v-if="!kvEnabled" class="acc-note">
                {{ t('kvKeywordNote') }}
            </p>
            <n-form-item-row :label="t('testLabel')">
                <div class="acc-test-row">
                    <n-input v-model:value="testText" clearable :placeholder="t('testPlaceholder')"
                        class="acc-test-input" />
                </div>
            </n-form-item-row>
            <p v-if="keywordTest" :class="keywordTest.matched.length ? 'acc-error' : 'acc-pass'">
                <template v-if="keywordTest.matched.length">
                    {{ t('keywordTestFailed', { list: keywordTest.matched.join('、') }) }}
                </template>
                <template v-else>
                    {{ t('keywordTestPassed') }}
                </template>
            </p>
            <p v-if="sectionError.keyword" class="acc-error">{{ t('sectionSaveFailed', { msg: sectionError.keyword }) }}</p>
            <div class="acc-actions">
                <n-button type="primary" :loading="sectionSaving.keyword" @click="saveKeywordSection">
                    {{ t('save') }}
                </n-button>
            </div>
        </n-card>

        <!-- 转发 -->
        <n-card class="section-card" :title="t('forwardCard')">
            <p class="acc-usage">{{ t('forwardUsage') }}</p>
            <div class="acc-row">
                <n-text depth="3">{{ t('forwardingRuleCount', { count: savedForwardingList.length }) }}</n-text>
                <n-button @click="openEmailForwardingModal">{{ t('config') }}</n-button>
            </div>
        </n-card>

        <!-- 发信 -->
        <n-card class="section-card" :class="{ 'is-off': !sendEnabled }" :title="t('sendCard')">
            <p class="acc-usage">{{ t('sendUsage') }}</p>
            <template v-if="sendEnabled">
                <n-form-item-row :label="t('verified_address_list')">
                    <n-select v-model:value="verifiedAddressList" filterable multiple tag
                        :placeholder="t('verified_address_list')">
                        <template #empty>
                            <n-text depth="3">
                                {{ t('manualInputPrompt') }}
                            </n-text>
                        </template>
                    </n-select>
                </n-form-item-row>
                <n-form-item-row :label="t('noLimitSendAddressList')">
                    <n-select v-model:value="noLimitSendAddressList" filterable multiple tag
                        :placeholder="t('noLimitSendAddressList')">
                        <template #empty>
                            <n-text depth="3">
                                {{ t('manualInputPrompt') }}
                            </n-text>
                        </template>
                    </n-select>
                </n-form-item-row>
                <n-form-item-row :label="t('send_mail_limit')">
                    <n-flex vertical style="width: 100%;">
                        <div class="acc-limit-row">
                            <n-text>{{ t('send_mail_daily_limit') }}</n-text>
                            <n-flex align="center">
                                <n-switch v-model:value="sendMailDailyLimitEnabled" :round="false" />
                                <n-input-number v-model:value="sendMailDailyLimit" :disabled="!sendMailDailyLimitEnabled"
                                    :min="-1" />
                            </n-flex>
                        </div>
                        <p v-if="dailyLimitError" class="acc-error acc-field-error">{{ dailyLimitError }}</p>
                        <div class="acc-limit-row">
                            <n-text>{{ t('send_mail_monthly_limit') }}</n-text>
                            <n-flex align="center">
                                <n-switch v-model:value="sendMailMonthlyLimitEnabled" :round="false" />
                                <n-input-number v-model:value="sendMailMonthlyLimit"
                                    :disabled="!sendMailMonthlyLimitEnabled" :min="-1" />
                            </n-flex>
                        </div>
                        <p v-if="monthlyLimitError" class="acc-error acc-field-error">{{ monthlyLimitError }}</p>
                        <n-text depth="3">
                            {{ t('send_mail_limit_tip') }}
                        </n-text>
                    </n-flex>
                </n-form-item-row>
                <p v-if="sectionError.send" class="acc-error">{{ t('sectionSaveFailed', { msg: sectionError.send }) }}</p>
                <div class="acc-actions">
                    <n-button type="primary" :loading="sectionSaving.send" @click="saveSendSection">
                        {{ t('save') }}
                    </n-button>
                </div>
            </template>
            <p v-else class="acc-off-note">{{ t('sendDisabledNote') }}</p>
        </n-card>

        <!-- 地址创建 -->
        <n-card class="section-card" :title="t('addressCard')">
            <p class="acc-usage">{{ t('addressUsage') }}</p>
            <n-form-item-row :label="t('create_address_subdomain_match')">
                <n-flex vertical style="width: 100%;">
                    <n-radio-group v-model:value="addressCreationSubdomainMatchMode">
                        <n-space vertical size="small">
                            <n-radio v-for="item in subdomainMatchModeOptions" :key="item.value" :value="item.value">
                                {{ item.label }}
                            </n-radio>
                        </n-space>
                    </n-radio-group>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_tip') }}
                    </n-text>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_note') }}
                    </n-text>
                    <n-text depth="3">
                        {{ t('create_address_subdomain_match_follow_env_note') }}
                    </n-text>
                    <n-alert v-if="subdomainMatchEnvLocked" type="warning" :show-icon="false" :bordered="false">
                        {{ t('create_address_subdomain_match_env_locked') }}
                    </n-alert>
                </n-flex>
            </n-form-item-row>
            <p v-if="sectionError.address" class="acc-error">{{ t('sectionSaveFailed', { msg: sectionError.address }) }}</p>
            <div class="acc-actions">
                <n-button type="primary" :loading="sectionSaving.address" @click="saveAddressSection">
                    {{ t('save') }}
                </n-button>
            </div>
        </n-card>
    </div>

    <!-- 邮件转发配置弹窗 -->
    <n-modal v-model:show="showEmailForwardingModal" preset="card" :title="t('email_forwarding_config')"
        style="max-width: 1000px;">
        <n-space vertical>
            <n-alert :show-icon="false" :bordered="false" type="warning">
                <span>{{ t('forwarding_rule_warning') }}</span>
                <br />
                <span>{{ t('source_patterns_tip') }}</span>
            </n-alert>
            <p v-if="sectionError.forward" class="acc-error">{{ t('sectionSaveFailed', { msg: sectionError.forward }) }}</p>
            <n-space justify="end">
                <n-button @click="addNewEmailForwardingItem">{{ t('add') }}</n-button>
            </n-space>
            <n-data-table :columns="emailForwardingColumns" :data="forwardingList" :bordered="false" striped
                :scroll-x="760" />
            <n-space justify="end">
                <n-button @click="showEmailForwardingModal = false">{{ t('cancel') }}</n-button>
                <n-button type="primary" :loading="sectionSaving.forward" @click="saveForwardSection">
                    {{ t('save') }}
                </n-button>
            </n-space>
        </n-space>
    </n-modal>
</template>

<style scoped>
.center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    margin: 20px;
    text-align: left;
}

.section-card {
    width: 100%;
    max-width: 800px;
}

/* 发信未启用：整卡置灰、不可交互，只留一行说明 */
.section-card.is-off {
    opacity: 0.6;
    pointer-events: none;
    user-select: none;
}

.acc-actions {
    display: flex;
    justify-content: flex-end;
}

.acc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
}

.acc-test-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
}

.acc-limit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}

.acc-test-input {
    flex: 1 1 200px;
    min-width: 0;
}

@media (max-width: 768px) {
    .center {
        margin: 12px;
        gap: 12px;
    }

    /* 窄屏下额度行改为上下堆叠，避免开关 + 数字输入被挤成一条 */
    .acc-limit-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
    }
}
</style>

<!-- 文案类样式放在全局块：表格行内的错误提示由 h() 动态生成， -->
<!-- 拿不到 scoped 属性，所以这些 class 必须是全局的（acc- 前缀避免冲突）。 -->
<style>
.acc-usage {
    font-size: 13px;
    line-height: 1.6;
    color: #666;
    margin: 0 0 12px;
}

.acc-note {
    font-size: 12px;
    line-height: 1.6;
    color: #666;
    margin: -4px 0 12px;
}

.acc-off-note {
    font-size: 13px;
    line-height: 1.6;
    color: #666;
    margin: 0;
}

.acc-error {
    font-size: 12px;
    line-height: 1.6;
    color: #e5484d;
    margin: 0 0 8px;
    word-break: break-all;
}

.acc-pass {
    font-size: 12px;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0 0 8px;
    font-weight: 600;
}

.acc-field-error {
    margin: -4px 0 8px;
}

html.dark .acc-usage,
html.dark .acc-note,
html.dark .acc-off-note {
    color: #9a9a9a;
}

html.dark .acc-pass {
    color: #eeeeee;
}
</style>
