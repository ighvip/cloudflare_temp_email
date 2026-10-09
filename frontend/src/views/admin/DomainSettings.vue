<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '../../api'

const message = useMessage()
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
        applyPayload(await api.fetch('/admin/domains'))
    } catch (error) {
        message.error(error.message || '加载失败')
    } finally {
        loading.value = false
    }
}

const addDomain = async () => {
    const name = newDomain.value.trim().toLowerCase()
    if (!name) {
        message.warning('请输入域名')
        return
    }
    saving.value = true
    try {
        const res = await api.fetch('/admin/domains', {
            method: 'POST',
            body: { name },
        })
        applyPayload(res)
        newDomain.value = ''
        message.success('域名已添加')
    } catch (error) {
        message.error(error.message || '添加失败')
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
        message.error(error.message || '保存失败')
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
        message.success('域名已删除')
    } catch (error) {
        message.error(error.message || '删除失败')
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
        wizResult.value = await api.fetch(`/admin/domains/dns_check?${query.toString()}`)
    } catch (error) {
        wizResult.value = null
        wizError.value = error.message || 'DNS 检测失败'
    } finally {
        wizChecking.value = false
    }
}

const wizNextFromDomain = async () => {
    const name = wizDomain.value.trim().toLowerCase()
    if (!DOMAIN_RE.test(name)) {
        message.warning('域名格式不正确')
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
        })
        applyPayload(res)
        wizAdded.value = true
        wizStep.value = 3
    } catch (error) {
        message.error(error.message || '添加失败')
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
            <h2>站点域名</h2>
            <p>
                管理站点的收信 / 发信域名：每个域名可单独开关「收信」与「发信」，
                本页的开关优先于 wrangler.toml 环境变量（DOMAINS / SEND_MAIL_DOMAINS）。
            </p>
        </div>

        <n-card :bordered="false" embedded title="域名列表" style="margin-bottom: 12px;">
            <n-spin :show="loading">
                <div class="add-row">
                    <n-input v-model:value="newDomain" placeholder="输入域名，例如 example.com"
                        style="max-width: 320px;" @keyup.enter="addDomain" />
                    <n-button type="primary" :loading="saving" @click="addDomain">添加域名</n-button>
                    <n-button secondary @click="openWizard">接入向导</n-button>
                </div>

                <n-empty v-if="!domains.length" description="暂无已纳管域名" style="margin-top: 16px;" />

                <div v-else class="table-wrap">
                    <n-table :bordered="false" :single-line="false" style="margin-top: 12px;">
                        <thead>
                            <tr>
                                <th>域名</th>
                                <th class="col-switch">收信</th>
                                <th class="col-switch">发信</th>
                                <th class="col-time">添加时间</th>
                                <th class="col-action">操作</th>
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
                                            <n-button size="tiny" type="error" secondary>删除</n-button>
                                        </template>
                                        确认删除 {{ row.name }}？该域名将不再受本页开关管理。
                                    </n-popconfirm>
                                </td>
                            </tr>
                        </tbody>
                    </n-table>
                </div>

                <p v-if="envOnlyDomains.length" class="env-hint">
                    wrangler.toml 中还有未纳管的域名：{{ envOnlyDomains.join('、') }}，
                    它们仍按环境变量运行，可在上方输入框添加纳管。
                </p>
            </n-spin>
        </n-card>

        <n-card :bordered="false" embedded title="Cloudflare Email Routing 配置步骤">
            <ol class="guide-list">
                <li>
                    登录 Cloudflare 控制台，进入目标域名 → <strong>Email</strong> →
                    <strong>Email Routing</strong>，把要使用的域名接入并开启 Email Routing
                    （域名需已托管在 Cloudflare）。
                </li>
                <li>
                    开启后 Cloudflare 会自动写入 MX、TXT 等 DNS 记录，等待这些 DNS 记录出现并生效。
                </li>
                <li>
                    在 Email Routing 的路由规则中，把邮件的目标设为「Send to Worker」，
                    选择 <code>temp-mail.your-worker.workers.dev</code> 对应的 Worker。
                </li>
                <li>
                    开启 Catch-all 地址（或添加一条路由规则）并同样指向该 Worker，
                    确保任意收件人的邮件都会进入本系统。
                </li>
                <li>
                    回到本页上方的「域名列表」，在输入框录入与 Cloudflare 中完全一致的域名（小写），
                    点击「添加域名」。
                </li>
                <li>
                    打开该域名的「收信」开关；需要从该域名发信时再打开「发信」开关
                    （发信还需在 wrangler.toml 配置 RESEND_TOKEN、SMTP_CONFIG 或 SEND_MAIL 中的任一通道）。
                </li>
            </ol>
        </n-card>

        <!-- 问题6 批次2: 接入向导 — 输入域名 → DNS 自动检测 → 确认添加 -->
        <n-modal v-model:show="showWizard" preset="card" title="域名接入向导"
            style="max-width: 640px;" :mask-closable="!wizAdding" @after-leave="wizAdded && load()">
            <n-steps :current="wizStep" size="small" style="margin-bottom: 16px;">
                <n-step title="输入域名" />
                <n-step title="DNS 自动检测" />
                <n-step title="完成" />
            </n-steps>

            <!-- 步骤 1: 输入域名 -->
            <div v-if="wizStep === 1">
                <n-form-item label="域名" :show-feedback="false" style="margin-bottom: 8px;">
                    <n-input v-model:value="wizDomain" placeholder="例如 example.com"
                        @keyup.enter="wizNextFromDomain" />
                </n-form-item>
                <p class="wiz-note">
                    请输入要接入的完整域名（小写）。前提：该域名已托管在 Cloudflare，
                    且已在 CF 控制台开启 Email Routing（子域名不会继承主域的 Email Routing，需单独接入）。
                </p>
                <div class="wiz-actions">
                    <n-button size="small" type="primary" @click="wizNextFromDomain">下一步</n-button>
                </div>
            </div>

            <!-- 步骤 2: DNS 自动检测 -->
            <div v-else-if="wizStep === 2">
                <div class="wiz-check-head">
                    <span class="wiz-domain">{{ wizDomain }}</span>
                    <n-button size="small" secondary :loading="wizChecking" @click="runDnsCheck(wizDomain)">
                        重新检测
                    </n-button>
                </div>

                <div v-if="wizChecking && !wizResult" class="wiz-muted">正在查询 DNS（MX / TXT）…</div>

                <div v-else-if="wizError" class="wiz-muted">
                    {{ wizError }}
                </div>

                <template v-else-if="wizResult">
                    <div class="wiz-status" :class="`wiz-status--${wizStatus}`">
                        <template v-if="wizStatus === 'ready'">
                            检测通过：已找到 Cloudflare Email Routing 的 route1/2/3 MX 记录，收信链路就绪。
                        </template>
                        <template v-else-if="wizStatus === 'partial'">
                            部分就绪：已找到部分 route*.mx.cloudflare.net 记录，DNS 可能仍在生效中，稍后可点「重新检测」。
                        </template>
                        <template v-else>
                            未检测到 Cloudflare Email Routing 的 MX 记录。请先在 CF 控制台为目标域名开启
                            Email Routing（会自动写入 route1/2/3.mx.cloudflare.net），生效后再重新检测；
                            也可以先添加域名，稍后补齐 DNS。
                        </template>
                    </div>

                    <div class="wiz-record-block">
                        <div class="wiz-record-title">MX 记录（{{ wizResult.mx.length }}）</div>
                        <div v-if="!wizResult.mx.length" class="wiz-muted">无 MX 记录</div>
                        <div v-for="(host, index) in wizResult.mx" :key="`mx-${index}`" class="wiz-record"
                            :class="{ 'wiz-record--ok': wizResult.routeMx.includes(host) }">
                            <span class="wiz-record-mark">{{ wizResult.routeMx.includes(host) ? '✓' : '·' }}</span>
                            <span class="wiz-record-data">{{ host }}</span>
                        </div>
                    </div>

                    <div class="wiz-record-block">
                        <div class="wiz-record-title">SPF（TXT）</div>
                        <div class="wiz-record" :class="{ 'wiz-record--ok': wizResult.spf }">
                            <span class="wiz-record-mark">{{ wizResult.spf ? '✓' : '·' }}</span>
                            <span class="wiz-record-data">
                                {{ wizResult.spf ? '已找到 v=spf1 记录' : '未找到 v=spf1 记录（发信前建议补齐）' }}
                            </span>
                        </div>
                    </div>
                </template>

                <div class="wiz-actions">
                    <n-button size="small" secondary @click="wizStep = 1">上一步</n-button>
                    <n-button size="small" type="primary" :loading="wizChecking" @click="wizStep = 3">
                        {{ wizStatus === 'ready' ? '下一步' : '仍要添加' }}
                    </n-button>
                </div>
            </div>

            <!-- 步骤 3: 确认与收尾 -->
            <div v-else>
                <template v-if="!wizAdded">
                    <p class="wiz-note" style="margin-bottom: 12px;">
                        将把 <strong>{{ wizDomain }}</strong> 加入站点域名列表（收信默认开启，发信跟随当前环境变量状态）。
                    </p>
                    <div class="wiz-actions">
                        <n-button size="small" secondary @click="wizStep = 2">上一步</n-button>
                        <n-button size="small" type="primary" :loading="wizAdding" @click="wizConfirmAdd">
                            确认添加
                        </n-button>
                    </div>
                </template>

                <template v-else>
                    <div class="wiz-status wiz-status--ready">已添加 {{ wizDomain }}。</div>
                    <ol class="guide-list" style="margin-top: 10px;">
                        <li>
                            回到 CF 控制台 → Email Routing → 路由规则，把邮件目标设为
                            <strong>Send to Worker</strong>，选择本项目对应的 Worker。
                        </li>
                        <li>
                            开启 Catch-all 地址（或添加路由规则）并同样指向该 Worker，
                            确保任意收件人的邮件都会进入本系统。
                        </li>
                        <li>
                            子域名（如随机前缀域名）不会继承主域规则：需在 Email Routing 中为子域单独接入，
                            或在 DNS 中为子域配置指向 route1/2/3.mx.cloudflare.net 的通配 MX（<code>*</code>）。
                        </li>
                        <li>
                            回到域名列表打开「收信」开关；需要发信时再打开「发信」开关
                            （发信还需配置 RESEND_TOKEN、SMTP_CONFIG 或 SEND_MAIL 任一通道）。
                        </li>
                    </ol>
                    <div class="wiz-actions">
                        <n-button size="small" type="primary" @click="closeWizard">完成</n-button>
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
