<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { useSiteHealth } from './useSiteHealth'

const { openSettings } = useGlobalState()
const { t } = useScopedI18n('views.index.HomeInfo')

// P0 redesign: on the split homepage the intro text becomes the hero
// subtitle, so the card can drop its own copy (`hideIntro`) — the text is
// still shown, just in the hero (nothing is removed from the page).
const props = defineProps({
    hideIntro: {
        type: Boolean,
        default: false,
    },
})

const introText = computed(() => (openSettings.value.siteIntro || '').trim() || t('defaultIntro'))

// shared poller: one set of requests serves this card and the compact
// status line in the action card
const {
    status, statusError, checkedAt,
    stats, statsError, statsUpdatedAt,
    fetchStatus, start, stop,
} = useSiteHealth()

onMounted(start)
onUnmounted(stop)

const statusType = computed(() => {
    if (statusError.value) return 'error';
    if (!status.value) return 'default';
    return status.value.db ? 'success' : 'warning';
})

const statusText = computed(() => {
    if (statusError.value) return t('statusError');
    if (!status.value) return t('statusChecking');
    return status.value.db ? t('statusOk') : t('statusDbDown');
})

const statItems = computed(() => [
    { key: 'today', label: t('statToday'), value: stats.value.today, tone: 'blue' },
    { key: 'week', label: t('statWeek'), value: stats.value.week, tone: 'violet' },
    { key: 'month', label: t('statMonth'), value: stats.value.month, tone: 'amber' },
])

const formatCount = (value) => {
    // locale-neutral numerals so the same format works for every language
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return String(value)
}
</script>

<template>
    <n-card class="home-info" :bordered="false" embedded>
        <div class="home-info-grid" :class="{ 'home-info-grid-2': props.hideIntro }">
            <div v-if="!props.hideIntro" class="home-info-section">
                <div class="home-info-title">{{ t('introTitle') }}</div>
                <p class="home-info-intro">{{ introText }}</p>
            </div>

            <div class="home-info-section home-info-stats">
                <div class="home-info-title">
                    {{ t('statsTitle') }}
                    <span class="home-info-stats-badge">{{ t('statsBadge') }}</span>
                </div>
                <div class="stat-grid">
                    <div v-for="item in statItems" :key="item.key" class="stat-item" :class="`stat-${item.tone}`">
                        <div class="stat-value">{{ formatCount(item.value) }}</div>
                        <div class="stat-label">{{ item.label }}</div>
                    </div>
                </div>
                <div class="home-info-status-meta" v-if="!statsError && statsUpdatedAt">
                    <span>{{ t('statsUpdatedAt', { time: statsUpdatedAt }) }}</span>
                </div>
                <div class="home-info-status-meta" v-else-if="statsError">
                    <span>{{ t('statsUnavailable') }}</span>
                </div>
            </div>

            <div class="home-info-section home-info-status">
                <div class="home-info-title">{{ t('statusTitle') }}</div>
                <n-space align="center" :size="[8, 8]">
                    <n-tag :type="statusType" size="medium" round>
                        {{ statusText }}
                    </n-tag>
                    <n-button size="tiny" tertiary @click="fetchStatus(true)">{{ t('refresh') }}</n-button>
                </n-space>
                <div class="home-info-status-meta" v-if="status && !statusError">
                    <span>{{ t('latency', { ms: status.latencyMs }) }}</span>
                    <span>· {{ t('database') }} {{ status.db ? t('online') : t('offline') }}</span>
                    <span>· {{ t('version') }} {{ status.version }}</span>
                </div>
                <div class="home-info-status-meta" v-else-if="statusError">
                    <span>{{ t('statusUnavailable') }}</span>
                </div>
                <div class="home-info-status-meta" v-if="checkedAt">
                    <span>{{ t('statusCheckedAt', { time: checkedAt }) }}</span>
                </div>
            </div>
        </div>
    </n-card>
</template>

<style scoped>
.home-info {
    margin-top: 10px;
}

.home-info-grid {
    display: grid;
    grid-template-columns: 1.3fr 1.3fr 1fr;
    gap: 20px;
}

/* intro moved to the hero: stats + status share the card */
.home-info-grid-2 {
    grid-template-columns: 1.4fr 1fr;
}

@media (max-width: 768px) {
    .home-info-grid,
    .home-info-grid-2 {
        grid-template-columns: 1fr;
    }
}

.home-info-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 10px;
}

.home-info-intro {
    margin: 0;
    line-height: 1.7;
    text-align: justify;
}

.home-info-stats-badge {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    color: var(--n-text-color-2);
    background: var(--n-color-target);
    opacity: 0.75;
}

.stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
}

.stat-item {
    position: relative;
    overflow: hidden;
    padding: 12px 10px;
    border-radius: 10px;
    text-align: center;
    border: 1px solid rgba(128, 128, 128, 0.16);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-item::before {
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    content: '';
}

.stat-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10);
}

.stat-blue::before { background: linear-gradient(90deg, #2080f0, #51a2ff); }
.stat-violet::before { background: linear-gradient(90deg, #722ed1, #b37feb); }
.stat-amber::before { background: linear-gradient(90deg, #f0a020, #ffc53d); }

.stat-value {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
}

.stat-blue .stat-value { color: #2080f0; }
.stat-violet .stat-value { color: #722ed1; }
.stat-amber .stat-value { color: #d48806; }

.stat-label {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.7;
}

.home-info-status-meta {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.8;
}

.home-info-status-meta span {
    margin-right: 6px;
}
</style>
