<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '../../i18n/app'
import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.DomainSettings')
const loading = ref(false)
const saving = ref(false)
const domains = ref([])
const envDomains = ref([])
const newDomain = ref('')

// wrangler.toml DOMAINS 中尚未在本页纳管的域名（仍按环境变量行为运行）
const envOnlyDomains = computed(() => {
    const managed = new Set(domains.value.map((item) => item.name))
    return envDomains.value.filter((name) => !managed.has(name))
})

const applyPayload = (res) => {
    if (Array.isArray(res?.domains)) domains.value = res.domains
    if (Array.isArray(res?.envDomains)) envDomains.value = res.envDomains
}

const load = async () => {
    loading.value = true
    try {
        // local n-spin is the feedback — skip the app-wide overlay
        applyPayload(await api.fetch('/admin/domains', { showLoading: false }))
    } catch (error) {
        message.error(error.message || t('loadFailed'))
    } finally {
        loading.value = false
    }
}

const addDomain = async () => {
    const name = newDomain.value.trim().toLowerCase()
    if (!name) {
        message.warning(t('pleaseInputDomain'))
        return
    }
    saving.value = true
    try {
        const res = await api.fetch('/admin/domains', {
            method: 'POST',
            body: { name },
            // button :loading="saving" is the feedback — no app-wide overlay
            showLoading: false,
        })
        applyPayload(res)
        newDomain.value = ''
        message.success(t('domainAdded'))
    } catch (error) {
        message.error(error.message || t('addFailed'))
    } finally {
        saving.value = false
    }
}

const patchDomain = async (row, patch) => {
    try {
        const res = await api.fetch(`/admin/domains/${row.name}`, {
            method: 'PATCH',
            body: patch,
        })
        applyPayload(res)
    } catch (error) {
        message.error(error.message || t('saveFailed'))
        // 回滚显示，让开关回到服务端的真实状态
        await load()
    }
}

const onReceiveChange = (row, value) => patchDomain(row, { enabled: value })
const onSendChange = (row, value) => patchDomain(row, { sendEnabled: value })

const removeDomain = async (row) => {
    try {
        const res = await api.fetch(`/admin/domains/${row.name}`, { method: 'DELETE' })
        applyPayload(res)
        message.success(t('domainDeleted'))
    } catch (error) {
        message.error(error.message || t('deleteFailed'))
    }
}

// ---- 问题6 批次2: 接入向导（三步：输入域名 → DNS 自动检测 → 确认添加） ----
const showWizard = ref(false)
const wizStep = ref(1)
const wizDomain = ref('')
const wizChecking = ref(false)
const wizResult = ref(null)
const wizError = ref('')
const wizAdding = ref(false)
const wizAdded = ref(false)

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

const openWizard = () => {
    wizStep.value = 1
    wizDomain.value = newDomain.value.trim().toLowerCase()
    wizResult.value = null
    wizError.value = ''
    wizAdded.value = false
    showWizard.value = true
}

const closeWizard = () => {
    showWizard.value = false
    newDomain.value = ''
    load()
}

const runDnsCheck = async (name) => {
    wizChecking.value = true
    wizError.value = ''
    try {
        const query = new URLSearchParams({ name })
        wizResult.value = await api.fetch(`/admin/domains/dns_check?${query.toString()}`,
            { showLoading: false })
    } catch (error) {
        wizResult.value = null
        wizError.value = error.message || t('dnsCheckFailed')
    } finally {
        wizChecking.value = false
    }
}

const wizNextFromDomain = async () => {
    const name = wizDomain.value.trim().toLowerCase()
    if (!DOMAIN_RE.test(name)) {
        message.warning(t('invalidDomainFormat'))
        return
    }
    wizStep.value = 2
    await runDnsCheck(name)
}

const wizConfirmAdd = async () => {
    const name = wizDomain.value.trim().toLowerCase()
    wizAdding.value = true
    try {
        const res = await api.fetch('/admin/domains', {
            method: 'POST',
            body: { name },
            // button :loading="wizAdding" is the feedback — no app-wide overlay
            showLoading: false,
        })
        applyPayload(res)
        wizAdded.value = true
        wizStep.value = 3
    } catch (error) {
        message.error(error.message || t('addFailed'))
    } finally {
        wizAdding.value = false
    }
}

// 检测结论：route MX 全齐 = 就绪；部分 = 待生效；无 = 未配置
const wizStatus = computed(() => {
    const res = wizResult.value
    if (!res) return 'unknown'
    if (res.hasRouteMx && res.routeMx.length >= 3) return 'ready'
    if (res.hasRouteMx) return 'partial'
    return 'missing'
})

onMounted(load)
</script>

<template>
    <div class="domain-settings">
        <div class="page-head">
            <h2>{{ t('pageTitle') }}</h2>
            <p>{{ t('pageDesc') }}</p>
        </div>

        <n-card :bordered="false" embedded :title="t('domainList')" style="margin-bottom: 12px;">
            <n-spin :show="loading">
                <div class="add-row">
                    <n-input v-model:value="newDomain" :placeholder="t('domainInputPlaceholder')"
                        style="max-width: 320px;" @keyup.enter="addDomain" />
                    <n-button type="primary" :loading="saving" @click="addDomain">{{ t('addDomain') }}</n-button>
                    <n-button secondary @click="openWizard">{{ t('setupWizard') }}</n-button>
                </div>

                <n-empty v-if="!domains.length" :description="t('emptyDomains')" style="margin-top: 16px;" />

                <div v-else class="table-wrap">
                    <n-table :bordered="false" :single-line="false" style="margin-top: 12px;">
                        <thead>
                            <tr>
                                <th>{{ t('domain') }}</th>
                                <th class="col-switch">{{ t('receive') }}</th>
                                <th class="col-switch">{{ t('send') }}</th>
                                <th class="col-time">{{ t('createdAt') }}</th>
                                <th class="col-action">{{ t('action') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in domains" :key="row.name">
                                <td>
                                    <span class="domain-name">{{ row.name }}</span>
                                    <n-tag v-if="row.inEnv" size="tiny" :bordered="false" class="env-tag">
                                        env
                                    </n-tag>
                                </td>
                                <td>
                                    <n-switch :value="row.enabled" size="small"
                                        @update:value="(value) => onReceiveChange(row, value)" />
                                </td>
                                <td>
                                    <n-switch :value="row.sendEnabled" size="small"
                                        @update:value="(value) => onSendChange(row, value)" />
                                </td>
                                <td class="cell-muted">{{ (row.createdAt || '').slice(0, 10) || '-' }}</td>
                                <td>
                                    <n-popconfirm @positive-click="removeDomain(row)">
                                        <template #trigger>
                                            <n-button size="tiny" type="error" secondary>{{ t('delete') }}</n-button>
                                        </template>
                                        {{ t('deleteConfirm', { name: row.name }) }}
                                    </n-popconfirm>
                                </td>
                            </tr>
                        </tbody>
                    </n-table>
                </div>

                <p v-if="envOnlyDomains.length" class="env-hint">
                    {{ t('envHint', { domains: envOnlyDomains.join('、') }) }}
                </p>
            </n-spin>
        </n-card>

        <n-card :bordered="false" embedded :title="t('routingGuideTitle')">
            <ol class="guide-list">
                <li>
                    {{ t('guideStep1Prefix') }} <strong>Email</strong> {{ t('guideStep1Middle') }} <strong>Email Routing</strong>{{ t('guideStep1Suffix') }}
                </li>
                <li>
                    {{ t('guideStep2') }}
                </li>
                <li>
                    {{ t('guideStep3Prefix') }} <code>temp-mail.your-worker.workers.dev</code> {{ t('guideStep3Suffix') }}
                </li>
                <li>
                    {{ t('guideStep4') }}
                </li>
                <li>
                    {{ t('guideStep5') }}
                </li>
                <li>
                    {{ t('guideStep6') }}
                </li>
            </ol>
        </n-card>

        <!-- 问题6 批次2: 接入向导 — 输入域名 → DNS 自动检测 → 确认添加 -->
        <n-modal v-model:show="showWizard" preset="card" :title="t('wizardTitle')"
            style="max-width: 640px;" :mask-closable="!wizAdding" @after-leave="wizAdded && load()">
            <n-steps :current="wizStep" size="small" style="margin-bottom: 16px;">
                <n-step :title="t('stepDomain')" />
                <n-step :title="t('stepDnsCheck')" />
                <n-step :title="t('done')" />
            </n-steps>

            <!-- 步骤 1: 输入域名 -->
            <div v-if="wizStep === 1">
                <n-form-item :label="t('domain')" :show-feedback="false" style="margin-bottom: 8px;">
                    <n-input v-model:value="wizDomain" :placeholder="t('examplePlaceholder')"
                        @keyup.enter="wizNextFromDomain" />
                </n-form-item>
                <p class="wiz-note">
                    {{ t('domainNote') }}
                </p>
                <div class="wiz-actions">
                    <n-button size="small" type="primary" @click="wizNextFromDomain">{{ t('nextStep') }}</n-button>
                </div>
            </div>

            <!-- 步骤 2: DNS 自动检测 -->
            <div v-else-if="wizStep === 2">
                <div class="wiz-check-head">
                    <span class="wiz-domain">{{ wizDomain }}</span>
                    <n-button size="small" secondary :loading="wizChecking" @click="runDnsCheck(wizDomain)">
                        {{ t('recheck') }}
                    </n-button>
                </div>

                <div v-if="wizChecking && !wizResult" class="wiz-muted">{{ t('checkingDns') }}</div>

                <div v-else-if="wizError" class="wiz-muted">
                    {{ wizError }}
                </div>

                <template v-else-if="wizResult">
                    <div class="wiz-status" :class="`wiz-status--${wizStatus}`">
                        <template v-if="wizStatus === 'ready'">
                            {{ t('statusReady') }}
                        </template>
                        <template v-else-if="wizStatus === 'partial'">
                            {{ t('statusPartial') }}
                        </template>
                        <template v-else>
                            {{ t('statusMissing') }}
                        </template>
                    </div>

                    <div class="wiz-record-block">
                        <div class="wiz-record-title">{{ t('mxRecordTitle', { count: wizResult.mx.length }) }}</div>
                        <div v-if="!wizResult.mx.length" class="wiz-muted">{{ t('noMxRecords') }}</div>
                        <div v-for="(host, index) in wizResult.mx" :key="`mx-${index}`" class="wiz-record"
                            :class="{ 'wiz-record--ok': wizResult.routeMx.includes(host) }">
                            <span class="wiz-record-mark">{{ wizResult.routeMx.includes(host) ? '✓' : '·' }}</span>
                            <span class="wiz-record-data">{{ host }}</span>
                        </div>
                    </div>

                    <div class="wiz-record-block">
                        <div class="wiz-record-title">{{ t('spfRecordTitle') }}</div>
                        <div class="wiz-record" :class="{ 'wiz-record--ok': wizResult.spf }">
                            <span class="wiz-record-mark">{{ wizResult.spf ? '✓' : '·' }}</span>
                            <span class="wiz-record-data">
                                {{ wizResult.spf ? t('spfFound') : t('spfNotFound') }}
                            </span>
                        </div>
                    </div>
                </template>

                <div class="wiz-actions">
                    <n-button size="small" secondary @click="wizStep = 1">{{ t('prevStep') }}</n-button>
                    <n-button size="small" type="primary" :loading="wizChecking" @click="wizStep = 3">
                        {{ wizStatus === 'ready' ? t('nextStep') : t('addAnyway') }}
                    </n-button>
                </div>
            </div>

            <!-- 步骤 3: 确认与收尾 -->
            <div v-else>
                <template v-if="!wizAdded">
                    <p class="wiz-note" style="margin-bottom: 12px;">
                        {{ t('confirmAddPrefix') }} <strong>{{ wizDomain }}</strong> {{ t('confirmAddSuffix') }}
                    </p>
                    <div class="wiz-actions">
                        <n-button size="small" secondary @click="wizStep = 2">{{ t('prevStep') }}</n-button>
                        <n-button size="small" type="primary" :loading="wizAdding" @click="wizConfirmAdd">
                            {{ t('confirmAdd') }}
                        </n-button>
                    </div>
                </template>

                <template v-else>
                    <div class="wiz-status wiz-status--ready">{{ t('wizardAdded', { name: wizDomain }) }}</div>
                    <ol class="guide-list" style="margin-top: 10px;">
                        <li>
                            {{ t('postAddStep1Prefix') }} <strong>Send to Worker</strong>{{ t('postAddStep1Suffix') }}
                        </li>
                        <li>
                            {{ t('postAddStep2') }}
                        </li>
                        <li>
                            {{ t('postAddStep3Prefix') }}<code>*</code>{{ t('postAddStep3Suffix') }}
                        </li>
                        <li>
                            {{ t('postAddStep4') }}
                        </li>
                    </ol>
                    <div class="wiz-actions">
                        <n-button size="small" type="primary" @click="closeWizard">{{ t('done') }}</n-button>
                    </div>
                </template>
            </div>
        </n-modal>
    </div>
</template>

<style scoped>
.domain-settings {
    text-align: left;
}

.domain-settings .page-head {
    margin-bottom: 12px;
    text-align: left;
}

.domain-settings .page-head h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
    text-align: left;
}

.domain-settings .page-head p {
    font-size: 12.5px;
    opacity: 0.6;
    line-height: 1.6;
    text-align: left;
}

.domain-settings :deep(.n-card-header) {
    text-align: left;
}

.domain-settings :deep(.n-card-header__main) {
    text-align: left;
}

.domain-settings .env-hint {
    text-align: left;
}

.domain-settings .guide-list {
    text-align: left;
}

.domain-settings .guide-list li {
    text-align: left;
}

.domain-settings .wiz-note {
    text-align: left;
}

/* naive's empty state flex-centers itself (not inheritable) — keep the
   icon/description on the page's left axis instead of a stranded
   centered island between left-aligned rows */
.domain-settings :deep(.n-empty) {
    align-items: flex-start;
    text-align: left;
}

.domain-settings :deep(.n-empty__extra) {
    text-align: left;
}

.add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.table-wrap {
    overflow-x: auto;
}

.table-wrap n-table {
    min-width: 560px;
}

.domain-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    word-break: break-all;
}

.env-tag {
    margin-left: 6px;
    font-size: 11px;
    opacity: 0.7;
}

.col-switch {
    width: 96px;
}

.col-time {
    width: 110px;
}

.col-action {
    width: 84px;
}

.cell-muted {
    font-size: 12px;
    opacity: 0.6;
    white-space: nowrap;
}

.env-hint {
    margin-top: 10px;
    font-size: 12px;
    opacity: 0.6;
    line-height: 1.6;
}

.guide-list {
    margin: 0;
    padding-left: 20px;
    max-width: 760px;
}

.guide-list li {
    font-size: 13px;
    line-height: 1.8;
    margin-bottom: 4px;
}

.guide-list code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    padding: 1px 5px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 4px;
    word-break: break-all;
}

/* ---- 问题6 批次2: 接入向导 ---- */
.wiz-note {
    font-size: 12.5px;
    line-height: 1.7;
    opacity: 0.6;
}

.wiz-check-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}

.wiz-domain {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    font-weight: 700;
    word-break: break-all;
}

.wiz-status {
    padding: 10px 12px;
    border: 1px dashed rgba(128, 128, 128, 0.45);
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.06);
    font-size: 13px;
    line-height: 1.7;
}

.wiz-status--ready {
    border-style: solid;
    border-color: rgba(26, 26, 26, 0.55);
    background: rgba(26, 26, 26, 0.06);
}

.wiz-muted {
    font-size: 12.5px;
    line-height: 1.7;
    opacity: 0.55;
}

.wiz-record-block {
    margin-top: 12px;
}

.wiz-record-title {
    font-size: 12px;
    font-weight: 700;
    opacity: 0.65;
    margin-bottom: 4px;
}

.wiz-record {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12.5px;
    line-height: 1.8;
    opacity: 0.6;
}

.wiz-record--ok {
    opacity: 1;
}

.wiz-record-mark {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    width: 12px;
    text-align: center;
}

.wiz-record-data {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-all;
}

.wiz-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
</style>
