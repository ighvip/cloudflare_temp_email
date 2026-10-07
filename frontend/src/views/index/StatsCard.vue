<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * Sci-fi "run stats" card: dark instrument-panel look (black background,
 * indicator light, hairline dividers, monospace digits) — same data source
 * as before, manual stats mode is shown honestly via the badge.
 */
const { t } = useScopedI18n('views.index.HomeInfo')

const { stats, statsError, statsUpdatedAt, start, stop } = useSiteHealth()

onMounted(start)
onUnmounted(stop)

const statItems = computed(() => [
    { key: 'today', label: t('statToday'), value: stats.value.today },
    { key: 'week', label: t('statWeek'), value: stats.value.week },
    { key: 'month', label: t('statMonth'), value: stats.value.month },
])

const modeBadge = computed(() =>
    stats.value.mode === 'manual' ? t('statsBadgeManual') : t('statsBadge'))

const formatCount = (value) => {
    // locale-neutral numerals so the same format works for every language
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return String(value)
}
</script>

<template>
    <div class="stats-card">
        <div class="stats-head">
            <span class="stats-led" :class="{ 'stats-led-error': statsError }" />
            <span class="stats-title">{{ t('statsTitle') }}</span>
            <span class="stats-badge">{{ modeBadge }}</span>
        </div>

        <div class="stats-row">
            <div v-for="item in statItems" :key="item.key" class="stats-cell">
                <div class="stats-value">{{ formatCount(item.value) }}</div>
                <div class="stats-label">{{ item.label }}</div>
            </div>
        </div>

        <div class="stats-foot">
            <span class="stats-foot-text">
                <template v-if="statsError">{{ t('statsUnavailable') }}</template>
                <template v-else>{{ t('statsUpdatedAt', { time: statsUpdatedAt }) }}</template>
            </span>
            <span class="stats-auto">AUTO · 60S</span>
        </div>
    </div>
</template>

<style scoped>
.stats-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid rgba(120, 140, 170, 0.25);
    border-radius: 12px;
    background: linear-gradient(165deg, #0c1017 0%, #0a0e15 60%, #0b0f16 100%);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    color: #c9d1d9;
}

.stats-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.stats-led {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #3fb950;
    box-shadow: 0 0 6px rgba(63, 185, 80, 0.9);
    animation: stats-led-pulse 2s ease-in-out infinite;
}

.stats-led-error {
    background: #f85149;
    box-shadow: 0 0 6px rgba(248, 81, 73, 0.9);
}

@keyframes stats-led-pulse {
    50% { opacity: 0.45; }
}

.stats-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #e6edf3;
}

.stats-badge {
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid rgba(88, 166, 255, 0.4);
    border-radius: 999px;
    background: rgba(88, 166, 255, 0.1);
    color: #58a6ff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    white-space: nowrap;
}

.stats-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: 1 1 auto;
    align-items: center;
    padding: 6px 0;
}

.stats-cell {
    min-width: 0;
    padding: 8px 6px;
    text-align: center;
    border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.stats-cell:first-child {
    border-left: none;
}

.stats-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(24px, 2.4vw, 30px);
    font-weight: 700;
    line-height: 1.2;
    color: #3fb950;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
    text-shadow: 0 0 12px rgba(63, 185, 80, 0.35);
}

.stats-label {
    margin-top: 4px;
    font-size: 12px;
    color: #8b949e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stats-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    font-size: 11px;
    color: #8b949e;
    line-height: 1.5;
}

.stats-foot-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stats-auto {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.8px;
    color: #58a6ff;
    opacity: 0.85;
}
</style>
