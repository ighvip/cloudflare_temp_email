<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { User, UserCheck, MailBulk } from '@vicons/fa'
import { SendOutlined, RefreshOutlined } from '@vicons/material'

import { api } from '../../api'

const message = useMessage()

const { t } = useScopedI18n('views.admin.Statistics')

const statistics = ref({
    addressCount: 0,
    userCount: 0,
    mailCount: 0,
    activeAddressCount7days: 0,
    activeAddressCount30days: 0,
    sendMailCount: 0,
    mailCount24h: 0,
    mailCount7days: 0,
    unreadMailCount: 0,
    // 问题11: server-side daily series, grouped by the site timezone day
    timezone: '+08:00',
    dailyMails: [],
    dailySend: [],
    dailyRegister: [],
    unknownDaily: [],
    domainReceive: [],
    sourceDomains: [],
    unknownMailCount: 0,
    security: {},
    topAddresses: [],
    databaseSize: null,
})

const serverStatus = ref({
    loading: false,
    ok: false,
    db: false,
    latencyMs: null,
    version: '',
    time: '',
    checked: false,
})

const refreshStatus = async () => {
    serverStatus.value.loading = true
    try {
        const res = await api.fetch('/open_api/status', { showLoading: false })
        serverStatus.value.ok = !!res?.ok
        serverStatus.value.db = !!res?.db
        serverStatus.value.latencyMs = res?.latencyMs ?? null
        serverStatus.value.version = res?.version || ''
        serverStatus.value.time = res?.time || ''
        serverStatus.value.checked = true
    } catch (error) {
        serverStatus.value.ok = false
        serverStatus.value.db = false
        serverStatus.value.checked = true
    } finally {
        serverStatus.value.loading = false
    }
}

const fetchStatistics = async () => {
    try {
        const res = await api.fetch(`/admin/statistics`);
        Object.assign(statistics.value, {
            mailCount: res.mailCount || 0,
            sendMailCount: res.sendMailCount || 0,
            userCount: res.userCount || 0,
            addressCount: res.addressCount || 0,
            activeAddressCount7days: res.activeAddressCount7days || 0,
            activeAddressCount30days: res.activeAddressCount30days || 0,
            mailCount24h: res.mailCount24h || 0,
            mailCount7days: res.mailCount7days || 0,
            unreadMailCount: res.unreadMailCount || 0,
            timezone: typeof res.timezone === 'string' && res.timezone ? res.timezone : '+08:00',
            dailyMails: res.dailyMails || [],
            dailySend: res.dailySend || [],
            dailyRegister: res.dailyRegister || [],
            unknownDaily: res.unknownDaily || [],
            domainReceive: res.domainReceive || [],
            sourceDomains: res.sourceDomains || [],
            unknownMailCount: res.unknownMailCount || 0,
            security: res.security || {},
            topAddresses: res.topAddresses || [],
            databaseSize: res.databaseSize ?? null,
        })
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '--'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ---- day series, aligned with the worker's `date(created_at, tz)` grouping ----

const pad = (n) => String(n).padStart(2, '0')

// "+08:00" / "-05:00" -> milliseconds east of UTC (fallback: Beijing)
const tzOffsetMs = computed(() => {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(statistics.value.timezone || '')
    if (!match) return 8 * 3600000
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60) * 1000
})

// the last `n` day keys (YYYY-MM-DD) on the site-timezone calendar, so the
// labels always match the server's GROUP BY buckets
const dayKeys = (n) => {
    const shifted = Date.now() + tzOffsetMs.value
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(shifted - (n - 1 - i) * 86400000)
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    })
}

// fill gaps with explicit zeros — a missing day is 0, not a shifted series
const fillSeries = (rows, n) => {
    const map = new Map((rows || []).map((row) => [row.day, Number(row.count) || 0]))
    return dayKeys(n).map((day) => ({ day, label: day.slice(5), count: map.get(day) || 0 }))
}

const TREND_DAYS = 14
const sendDays = computed(() => fillSeries(statistics.value.dailySend, TREND_DAYS))
const registerDays = computed(() => fillSeries(statistics.value.dailyRegister, TREND_DAYS))
const receiveDays = computed(() => fillSeries(statistics.value.dailyMails, TREND_DAYS))
const unknownSpark = computed(() => fillSeries(statistics.value.unknownDaily, TREND_DAYS))

const seriesCounts = (series) => series.map((d) => d.count)
const seriesSum = (series) => series.reduce((sum, d) => sum + d.count, 0)
const seriesMax = (series) => Math.max(1, ...seriesCounts(series))
const todayOf = (series) => (series.length ? series[series.length - 1].count : 0)

// vertical position (%) shared by the step polyline and the HTML dots:
// zero sits on the baseline (95%), the max value at 10%
const yPct = (value, max) => (max > 0 ? 95 - (value / max) * 85 : 95)

// stepped outline: each day is a flat segment across its slot, joined by
// hairline verticals — an editorial histogram line, no fills, no curves
const stepPoints = (values, max) => {
    const n = values.length
    if (!n) return ''
    const seg = 100 / n
    const pts = []
    values.forEach((value, i) => {
        const y = yPct(value, max).toFixed(2)
        const x0 = (i * seg).toFixed(2)
        const x1 = ((i + 1) * seg).toFixed(2)
        if (i === 0) pts.push(`${x0},${y}`)
        pts.push(`${x1},${y}`)
        if (i < n - 1) {
            const nextY = yPct(values[i + 1], max).toFixed(2)
            if (nextY !== y) pts.push(`${x1},${nextY}`)
        }
    })
    return pts.join(' ')
}

const dotStyle = (value, max, i, n) => ({
    left: `${((i + 0.5) / n) * 100}%`,
    top: `${yPct(value, max)}%`,
})

// fixed-size sparkline geometry (viewBox units), uniform scaling
const sparkPoints = computed(() => {
    const values = seriesCounts(unknownSpark.value)
    const max = seriesMax(unknownSpark.value)
    const w = 120
    const h = 40
    return values.map((value, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * w : 0
        const y = max > 0 ? h - 2 - (value / max) * (h - 6) : h - 2
        return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
})

// ---- horizontal bar charts (每域名收信 / 来源分布) ----

const domainRows = computed(() => statistics.value.domainReceive || [])
const sourceRows = computed(() => statistics.value.sourceDomains || [])
const domainMax = computed(() => Math.max(1, ...domainRows.value.map((r) => Number(r.count) || 0)))
const sourceMax = computed(() => Math.max(1, ...sourceRows.value.map((r) => Number(r.count) || 0)))
const domainTotal = computed(() => domainRows.value.reduce((s, r) => s + (Number(r.count) || 0), 0))
const sourceTotal = computed(() => sourceRows.value.reduce((s, r) => s + (Number(r.count) || 0), 0))

const barWidth = (count, max) => {
    const value = Number(count) || 0
    if (value <= 0) return '0%'
    return `${Math.max(2, (value / max) * 100).toFixed(1)}%`
}

let statusTimer = null

onMounted(async () => {
    await Promise.all([fetchStatistics(), refreshStatus()])
    statusTimer = setInterval(refreshStatus, 30000)
})

onUnmounted(() => {
    if (statusTimer) clearInterval(statusTimer)
})
</script>

<template>
    <div>
        <n-card :bordered="false" embedded title="服务器状态">
            <n-space align="center" :size="[24, 12]">
                <n-tag :type="serverStatus.ok && serverStatus.db ? 'success' : (serverStatus.checked ? 'error' : 'default')" size="large">
                    {{ serverStatus.ok && serverStatus.db ? '运行正常' : (serverStatus.checked ? '异常' : '检测中…') }}
                </n-tag>
                <n-text depth="3">数据库：{{ serverStatus.db ? '在线' : '—' }}</n-text>
                <n-text depth="3">响应延迟：{{ serverStatus.latencyMs !== null ? `${serverStatus.latencyMs} ms` : '—' }}</n-text>
                <n-text depth="3">版本：{{ serverStatus.version || '—' }}</n-text>
                <n-text depth="3">检查于 {{ serverStatus.time ? new Date(serverStatus.time).toLocaleTimeString() : '—' }}（每 30 秒自动刷新）</n-text>
                <n-button size="small" secondary :loading="serverStatus.loading" @click="refreshStatus">
                    <template #icon>
                        <n-icon :component="RefreshOutlined" />
                    </template>
                    刷新
                </n-button>
            </n-space>
        </n-card>

        <div class="overview">
            <div class="overview-cell">
                <n-statistic :label="t('addressCount')" :value="statistics.addressCount">
                    <template #prefix>
                        <n-icon :component="User" />
                    </template>
                </n-statistic>
            </div>
            <div class="overview-cell">
                <n-statistic :label="t('activeAddressCount7days')" :value="statistics.activeAddressCount7days">
                    <template #prefix>
                        <n-icon :component="UserCheck" />
                    </template>
                </n-statistic>
            </div>
            <div class="overview-cell">
                <n-statistic :label="t('activeAddressCount30days')" :value="statistics.activeAddressCount30days">
                    <template #prefix>
                        <n-icon :component="UserCheck" />
                    </template>
                </n-statistic>
            </div>
            <div class="overview-cell">
                <n-statistic :label="t('userCount')" :value="statistics.userCount">
                    <template #prefix>
                        <n-icon :component="User" />
                    </template>
                </n-statistic>
            </div>
            <div class="overview-cell">
                <n-statistic :label="t('mailCount')" :value="statistics.mailCount">
                    <template #prefix>
                        <n-icon :component="MailBulk" />
                    </template>
                </n-statistic>
            </div>
            <div class="overview-cell">
                <n-statistic :label="t('sendMailCount')" :value="statistics.sendMailCount">
                    <template #prefix>
                        <n-icon :component="SendOutlined" />
                    </template>
                </n-statistic>
            </div>
        </div>

        <!-- ---- primary charts (问题11 metric priority a-e) ---- -->
        <div class="chart-grid">
            <!-- a. 每域名收信 — horizontal bars, solid black fill -->
            <section class="chart-card">
                <div class="chart-head">
                    <span class="chart-title">每域名收信</span>
                    <span class="chart-badge">TOP 10 · 30 天</span>
                </div>
                <div class="chart-value-row">
                    <span class="chart-value">{{ domainTotal }}</span>
                    <span class="chart-unit">封 · 合计</span>
                </div>
                <div class="hbars">
                    <div v-for="row in domainRows" :key="row.domain" class="hbar" :title="`${row.domain}: ${row.count}`">
                        <span class="hbar-label">{{ row.domain }}</span>
                        <span class="hbar-track">
                            <span class="hbar-fill" :style="{ width: barWidth(row.count, domainMax) }" />
                        </span>
                        <span class="hbar-value">{{ row.count }}</span>
                    </div>
                    <div v-if="!domainRows.length" class="chart-empty">暂无数据</div>
                </div>
            </section>

            <!-- b. 来源分布 — sender-domain top 10 (raw_mails.source), honest dimension -->
            <section class="chart-card">
                <div class="chart-head">
                    <span class="chart-title">来源分布</span>
                    <span class="chart-badge">发件域名 · 30 天</span>
                </div>
                <div class="chart-value-row">
                    <span class="chart-value">{{ sourceTotal }}</span>
                    <span class="chart-unit">封 · 合计</span>
                </div>
                <div class="hbars">
                    <div v-for="row in sourceRows" :key="row.domain" class="hbar" :title="`${row.domain}: ${row.count}`">
                        <span class="hbar-label">{{ row.domain }}</span>
                        <span class="hbar-track">
                            <span class="hbar-fill" :style="{ width: barWidth(row.count, sourceMax) }" />
                        </span>
                        <span class="hbar-value">{{ row.count }}</span>
                    </div>
                    <div v-if="!sourceRows.length" class="chart-empty">暂无数据</div>
                </div>
            </section>

            <!-- c. 每日发送趋势 — stepped SVG line + hairline grid -->
            <section class="chart-card">
                <div class="chart-head">
                    <span class="chart-title">每日发送趋势</span>
                    <span class="chart-badge">近 14 天</span>
                </div>
                <div class="chart-value-row">
                    <span class="chart-value">{{ seriesSum(sendDays) }}</span>
                    <span class="chart-unit">封 · 合计</span>
                    <span class="chart-today">今日 {{ todayOf(sendDays) }}</span>
                </div>
                <div class="plot" role="img" aria-label="每日发送趋势">
                    <svg class="plot-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <line v-for="gy in [0.5, 25, 50, 75, 99.5]" :key="gy" class="plot-grid" x1="0" x2="100"
                            :y1="gy" :y2="gy" vector-effect="non-scaling-stroke" />
                        <polyline class="plot-line" :points="stepPoints(seriesCounts(sendDays), seriesMax(sendDays))"
                            fill="none" vector-effect="non-scaling-stroke" />
                    </svg>
                    <span v-for="(d, i) in sendDays" v-show="d.count > 0 || i === sendDays.length - 1" :key="d.day"
                        class="plot-dot" :style="dotStyle(d.count, seriesMax(sendDays), i, sendDays.length)"
                        :title="`${d.day}: ${d.count}`" />
                </div>
                <div class="plot-axis">
                    <span>{{ sendDays[0]?.label }}</span>
                    <span>{{ sendDays[Math.floor(sendDays.length / 2)]?.label }}</span>
                    <span>{{ sendDays[sendDays.length - 1]?.label }}</span>
                </div>
                <div class="chart-foot">日界线 {{ statistics.timezone }}（站点时区）· 峰值 {{ seriesMax(sendDays) }}</div>
            </section>

            <!-- d. 注册趋势 — same stepped line style, daily new addresses -->
            <section class="chart-card">
                <div class="chart-head">
                    <span class="chart-title">注册趋势</span>
                    <span class="chart-badge">近 14 天</span>
                </div>
                <div class="chart-value-row">
                    <span class="chart-value">{{ seriesSum(registerDays) }}</span>
                    <span class="chart-unit">个 · 合计</span>
                    <span class="chart-today">今日 {{ todayOf(registerDays) }}</span>
                </div>
                <div class="plot" role="img" aria-label="注册趋势">
                    <svg class="plot-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <line v-for="gy in [0.5, 25, 50, 75, 99.5]" :key="gy" class="plot-grid" x1="0" x2="100"
                            :y1="gy" :y2="gy" vector-effect="non-scaling-stroke" />
                        <polyline class="plot-line"
                            :points="stepPoints(seriesCounts(registerDays), seriesMax(registerDays))" fill="none"
                            vector-effect="non-scaling-stroke" />
                    </svg>
                    <span v-for="(d, i) in registerDays" v-show="d.count > 0 || i === registerDays.length - 1"
                        :key="d.day" class="plot-dot"
                        :style="dotStyle(d.count, seriesMax(registerDays), i, registerDays.length)"
                        :title="`${d.day}: ${d.count}`" />
                </div>
                <div class="plot-axis">
                    <span>{{ registerDays[0]?.label }}</span>
                    <span>{{ registerDays[Math.floor(registerDays.length / 2)]?.label }}</span>
                    <span>{{ registerDays[registerDays.length - 1]?.label }}</span>
                </div>
                <div class="chart-foot">日界线 {{ statistics.timezone }}（站点时区）· 峰值 {{ seriesMax(registerDays) }}</div>
            </section>

            <!-- e. 未知收件人邮件数 — big number + tiny sparkline -->
            <section class="chart-card">
                <div class="chart-head">
                    <span class="chart-title">未知收件人邮件数</span>
                    <span class="chart-badge">走势 · 14 天</span>
                </div>
                <div class="chart-value-row">
                    <span class="chart-value chart-value-big">{{ statistics.unknownMailCount }}</span>
                    <span class="chart-unit">封</span>
                </div>
                <div class="spark" role="img" aria-label="未知收件人邮件走势">
                    <svg class="spark-svg" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
                        <line class="plot-grid" x1="0" y1="39.5" x2="120" y2="39.5" vector-effect="non-scaling-stroke" />
                        <polyline class="plot-line" :points="sparkPoints" fill="none" vector-effect="non-scaling-stroke" />
                    </svg>
                </div>
                <div class="chart-foot">总数为全量；走势为近 14 天按日新增（与「未知邮件」列表同口径）</div>
            </section>
        </div>

        <!-- ---- secondary: low-frequency metrics + security audit ---- -->
        <n-card :bordered="false" embedded class="secondary">
            <n-collapse :trigger-areas="['main', 'arrow']">
                <n-collapse-item title="低频指标" name="low">
                    <div class="low-grid">
                        <n-statistic label="24 小时收信" :value="statistics.mailCount24h" />
                        <n-statistic label="7 天收信" :value="statistics.mailCount7days" />
                        <n-statistic label="未读邮件" :value="statistics.unreadMailCount" />
                        <n-statistic label="数据库大小" :value="formatSize(statistics.databaseSize)" />
                    </div>
                    <div class="plot plot-tall" role="img" aria-label="最近 14 天收信趋势">
                        <svg class="plot-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            <line v-for="gy in [0.5, 25, 50, 75, 99.5]" :key="gy" class="plot-grid" x1="0" x2="100"
                                :y1="gy" :y2="gy" vector-effect="non-scaling-stroke" />
                            <polyline class="plot-line"
                                :points="stepPoints(seriesCounts(receiveDays), seriesMax(receiveDays))" fill="none"
                                vector-effect="non-scaling-stroke" />
                        </svg>
                        <span v-for="(d, i) in receiveDays" v-show="d.count > 0 || i === receiveDays.length - 1"
                            :key="d.day" class="plot-dot"
                            :style="dotStyle(d.count, seriesMax(receiveDays), i, receiveDays.length)"
                            :title="`${d.day}: ${d.count}`" />
                    </div>
                    <div class="plot-axis">
                        <span>{{ receiveDays[0]?.label }}</span>
                        <span>{{ receiveDays[Math.floor(receiveDays.length / 2)]?.label }}</span>
                        <span>{{ receiveDays[receiveDays.length - 1]?.label }}</span>
                    </div>
                    <n-text depth="3" class="sub-note">最近 14 天收信趋势 · 日界线 {{ statistics.timezone }}</n-text>
                    <div v-if="statistics.topAddresses.length" class="top-addresses">
                        <n-text depth="3" style="display: block; margin-bottom: 8px">热门地址 TOP 5</n-text>
                        <n-space :size="8">
                            <n-tag v-for="a in statistics.topAddresses" :key="a.address" :bordered="false" size="small">
                                {{ a.address }} · {{ a.count }} 封
                            </n-tag>
                        </n-space>
                    </div>
                </n-collapse-item>
                <n-collapse-item title="安全审计" name="security">
                    <div class="low-grid">
                        <n-statistic label="登录锁定数" :value="statistics.security?.lockedKeys ?? '—'" />
                        <n-statistic label="24 小时内失败尝试" :value="statistics.security?.failedAttempts24h ?? '—'" />
                        <n-statistic label="在线管理会话" :value="statistics.security?.activeSessions ?? '—'" />
                    </div>
                    <n-text depth="3" class="sub-note">来自登录风控计数与管理面板会话表，失败记录 24 小时后自动清理</n-text>
                </n-collapse-item>
            </n-collapse>
        </n-card>
    </div>
</template>

<style scoped>
/* ---- overview strip: homepage hairline-cell language ---- */
.overview {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin-bottom: 20px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.overview-cell {
    min-width: 0;
    padding: 14px 12px;
    border-left: 1px solid rgba(128, 128, 128, 0.14);
}

.overview-cell:first-child {
    border-left: none;
}

.overview :deep(.n-statistic-value) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
}

/* ---- chart grid: auto-fit, one column on tablet/phone ---- */
.chart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.chart-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    text-align: left;
}

.chart-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);
}

.chart-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
}

/* mono pill badge, same capsule as the homepage stats card */
.chart-badge {
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.10);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    white-space: nowrap;
}

.chart-value-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 0 6px;
}

.chart-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(24px, 2.4vw, 30px);
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
}

.chart-value-big {
    font-size: clamp(34px, 3.6vw, 44px);
}

.chart-unit {
    font-size: 12px;
    opacity: 0.65;
}

.chart-today {
    margin-left: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

.chart-empty {
    padding: 24px 0;
    text-align: center;
    font-size: 12px;
    opacity: 0.5;
}

.chart-foot {
    padding-top: 8px;
    font-size: 11px;
    line-height: 1.5;
    opacity: 0.6;
}

/* ---- horizontal bars: solid black rectangles, hairline track, no radius ---- */
.hbars {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding-top: 4px;
}

.hbar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.hbar-label {
    flex: 0 0 108px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    opacity: 0.85;
}

.hbar-track {
    flex: 1 1 auto;
    min-width: 0;
    height: 12px;
    border: 1px solid rgba(128, 128, 128, 0.28);
    background: rgba(128, 128, 128, 0.07);
}

.hbar-fill {
    display: block;
    height: 100%;
    background: #1a1a1a;
    transition: width 0.3s ease;
}

:global(html.dark .hbar-fill) {
    background: #eeeeee;
}

.hbar-value {
    flex: 0 0 44px;
    text-align: right;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
}

/* ---- stepped line plot: hairline grid, black polyline, square dots ---- */
.plot {
    position: relative;
    height: 132px;
    margin-top: 6px;
}

.plot-tall {
    height: 160px;
}

.plot-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}

.plot-grid {
    stroke: rgba(128, 128, 128, 0.28);
    stroke-width: 1;
}

.plot-line {
    stroke: #1a1a1a;
    stroke-width: 1.5;
    stroke-linejoin: miter;
    stroke-linecap: butt;
}

:global(html.dark .plot-line) {
    stroke: #eeeeee;
}

/* data points as tiny squares — editorial ticks, not candy dots */
.plot-dot {
    position: absolute;
    width: 5px;
    height: 5px;
    transform: translate(-50%, -50%);
    background: #1a1a1a;
}

:global(html.dark .plot-dot) {
    background: #eeeeee;
}

.plot-axis {
    display: flex;
    justify-content: space-between;
    padding-top: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.4px;
    opacity: 0.6;
}

/* ---- unknown-mail sparkline ---- */
.spark {
    height: 44px;
    margin-top: 4px;
}

.spark-svg {
    display: block;
    width: 100%;
    height: 100%;
}

/* ---- secondary collapse ---- */
.secondary {
    margin-bottom: 20px;
}

.low-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
    gap: 12px;
    margin-bottom: 14px;
}

.low-grid :deep(.n-statistic-value) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
}

.sub-note {
    display: block;
    margin-top: 8px;
    font-size: 11px;
}

.top-addresses {
    margin-top: 16px;
}

@media (max-width: 768px) {
    .overview {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .overview-cell:nth-child(odd) {
        border-left: none;
    }

    .overview-cell:nth-child(n + 3) {
        border-top: 1px solid rgba(128, 128, 128, 0.14);
    }

    .hbar-label {
        flex-basis: 88px;
    }
}
</style>
