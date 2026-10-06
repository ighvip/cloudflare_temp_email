<script setup>
import { ref, h, onMounted, onUnmounted, watch, computed } from 'vue';
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
    dailyMails: [],
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
            dailyMails: res.dailyMails || [],
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

// fill the last 7 days, zero for days without mails, labels as MM-DD (UTC days from server)
const trendDays = computed(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        const hit = statistics.value.dailyMails.find(x => x.day === key)
        days.push({ day: key, label: key.slice(5), count: hit ? Number(hit.count) : 0 })
    }
    return days
})

const trendMax = computed(() => Math.max(1, ...trendDays.value.map(d => d.count)))

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
        <n-card :bordered="false" embedded>
            <n-row>
                <n-col :span="8">
                    <n-statistic :label="t('addressCount')" :value="statistics.addressCount">
                        <template #prefix>
                            <n-icon :component="User" />
                        </template>
                    </n-statistic>
                </n-col>
                <n-col :span="8">
                    <n-statistic :label="t('activeAddressCount7days')" :value="statistics.activeAddressCount7days">
                        <template #prefix>
                            <n-icon :component="UserCheck" />
                        </template>
                    </n-statistic>
                </n-col>
                <n-col :span="8">
                    <n-statistic :label="t('activeAddressCount30days')" :value="statistics.activeAddressCount30days">
                        <template #prefix>
                            <n-icon :component="UserCheck" />
                        </template>
                    </n-statistic>
                </n-col>
            </n-row>
        </n-card>
        <n-card :bordered="false" embedded>
            <n-row>
                <n-col :span="8">
                    <n-statistic :label="t('userCount')" :value="statistics.userCount">
                        <template #prefix>
                            <n-icon :component="User" />
                        </template>
                    </n-statistic>
                </n-col>
                <n-col :span="8">
                    <n-statistic :label="t('mailCount')" :value="statistics.mailCount">
                        <template #prefix>
                            <n-icon :component="MailBulk" />
                        </template>
                    </n-statistic>
                </n-col>
                <n-col :span="8">
                    <n-statistic :label="t('sendMailCount')" :value="statistics.sendMailCount">
                        <template #prefix>
                            <n-icon :component="SendOutlined" />
                        </template>
                    </n-statistic>
                </n-col>
            </n-row>
        </n-card>
        <n-card :bordered="false" embedded title="收信统计">
            <n-row>
                <n-col :span="8">
                    <n-statistic label="24 小时收信" :value="statistics.mailCount24h" />
                </n-col>
                <n-col :span="8">
                    <n-statistic label="7 天收信" :value="statistics.mailCount7days" />
                </n-col>
                <n-col :span="8">
                    <n-statistic label="未读邮件" :value="statistics.unreadMailCount" />
                </n-col>
            </n-row>
            <n-divider style="margin: 12px 0" />
            <n-space align="center" :size="[24, 8]">
                <n-text depth="3">数据库大小：{{ formatSize(statistics.databaseSize) }}</n-text>
            </n-space>
            <div class="trend">
                <n-text depth="3" style="display: block; margin-bottom: 8px">最近 7 天收信趋势（按 UTC 日）</n-text>
                <div class="trend-bars">
                    <div v-for="d in trendDays" :key="d.day" class="trend-day" :title="`${d.day}: ${d.count}`">
                        <div class="trend-count">{{ d.count }}</div>
                        <div class="trend-track">
                            <div class="trend-fill" :style="{ height: `${Math.round(d.count / trendMax * 100)}%` }" />
                        </div>
                        <div class="trend-label">{{ d.label }}</div>
                    </div>
                </div>
            </div>
            <div v-if="statistics.topAddresses.length" class="top-addresses">
                <n-text depth="3" style="display: block; margin-bottom: 8px">热门地址 TOP 5</n-text>
                <n-space :size="8">
                    <n-tag v-for="a in statistics.topAddresses" :key="a.address" :bordered="false" size="small">
                        {{ a.address }} · {{ a.count }} 封
                    </n-tag>
                </n-space>
            </div>
        </n-card>
    </div>
</template>

<style scoped>
.n-card {
    margin-bottom: 20px;
}

.trend {
    margin-top: 16px;
}

.trend-bars {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    height: 140px;
}

.trend-day {
    flex: 1;
    max-width: 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    gap: 4px;
}

.trend-count {
    font-size: 12px;
    color: var(--n-text-color, #999);
}

.trend-track {
    flex: 1;
    width: 100%;
    background: rgba(128, 128, 128, 0.12);
    border-radius: 4px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
}

.trend-fill {
    width: 100%;
    background: #18a058;
    border-radius: 4px;
    min-height: 2px;
    transition: height 0.3s ease;
}

.trend-label {
    font-size: 12px;
    color: #999;
}

.top-addresses {
    margin-top: 16px;
}
</style>
