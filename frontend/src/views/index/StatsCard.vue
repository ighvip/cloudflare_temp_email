<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * "Run stats" card in the site's light card language: neutral gray frame,
 * indicator light, hairline dividers, monospace digits — same data source
 * as before, manual stats mode is shown honestly via the badge. The red
 * indicator is reserved for the error state (red = the only alert color).
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
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.stats-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);
}

.stats-led {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
    animation: stats-led-pulse 2s ease-in-out infinite;
}

.stats-led-error {
    background: #e5484d;
    box-shadow: 0 0 6px rgba(229, 72, 77, 0.8);
}

@keyframes stats-led-pulse {
    50% { opacity: 0.45; }
}

.stats-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
}

.stats-badge {
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.10);
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
    border-left: 1px solid rgba(128, 128, 128, 0.14);
}

.stats-cell:first-child {
    border-left: none;
}

.stats-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(24px, 2.4vw, 30px);
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
}

.stats-label {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stats-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(128, 128, 128, 0.14);
    font-size: 11px;
    line-height: 1.5;
}

.stats-foot-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
}

.stats-auto {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.8px;
    opacity: 0.7;
}
</style>
