<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * Compact status line + mini metrics for the action card (right column).
 * Reuses the shared poller from useSiteHealth — no extra requests.
 */
const { t } = useScopedI18n('views.index.HomeInfo')

const {
    status, statusError, checkedAt, stats,
    start, stop, fetchStatus,
} = useSiteHealth()

onMounted(start)
onUnmounted(stop)

const healthy = computed(() => !statusError.value && !!status.value?.db)

const statusText = computed(() => {
    if (statusError.value) return t('statusError')
    if (!status.value) return t('statusChecking')
    return status.value.db ? t('statusOk') : t('statusDbDown')
})

const metrics = computed(() => [
    {
        label: t('statToday'),
        value: String(stats.value.today),
        tone: 'blue',
    },
    {
        label: t('latency', { ms: status.value?.latencyMs ?? '-' }),
        value: status.value ? `${status.value.latencyMs}ms` : '-',
        tone: 'violet',
    },
    {
        label: t('database'),
        value: status.value ? (status.value.db ? t('online') : t('offline')) : '-',
        tone: healthy.value ? 'green' : 'amber',
    },
])
</script>

<template>
    <div class="action-status">
        <div class="action-status-line" role="status">
            <span class="status-light" :class="healthy ? 'status-light-ok' : 'status-light-warn'"></span>
            <span class="status-text">{{ statusText }}</span>
            <button type="button" class="status-refresh" @click="fetchStatus(true)">
                {{ t('refresh') }}
            </button>
        </div>
        <div class="mini-metrics">
            <div v-for="(item, index) in metrics" :key="index" class="mini-metric" :class="`tone-${item.tone}`">
                <div class="mini-value">{{ item.value }}</div>
                <div class="mini-label">{{ item.label }}</div>
            </div>
        </div>
        <div v-if="checkedAt" class="action-status-checked">
            {{ t('statusCheckedAt', { time: checkedAt }) }}
        </div>
    </div>
</template>

<style scoped>
.action-status {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px dashed rgba(128, 128, 128, 0.3);
}

.action-status-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.status-light {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.status-light-ok {
    background: #27c93f;
    box-shadow: 0 0 6px rgba(39, 201, 63, 0.9);
    animation: status-breathe 2s ease-in-out infinite;
}

.status-light-warn {
    background: #f0a020;
    box-shadow: 0 0 6px rgba(240, 160, 32, 0.9);
    animation: status-breathe 1.2s ease-in-out infinite;
}

@keyframes status-breathe {
    50% { opacity: 0.45; }
}

.status-text {
    font-weight: 600;
}

.status-refresh {
    margin-left: auto;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12px;
    opacity: 0.6;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
}

.status-refresh:hover {
    opacity: 1;
}

.mini-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
}

.mini-metric {
    padding: 8px 6px;
    text-align: center;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.05);
}

.mini-value {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
}

.tone-blue .mini-value { color: #2080f0; }
.tone-violet .mini-value { color: #722ed1; }
.tone-green .mini-value { color: #18a058; }
.tone-amber .mini-value { color: #d48806; }

.mini-label {
    margin-top: 2px;
    font-size: 11px;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.action-status-checked {
    margin-top: 8px;
    font-size: 11px;
    opacity: 0.55;
}
</style>
