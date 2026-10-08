<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * Uptime Kuma style status card: 48 hourly bars per monitor, 24h uptime
 * percentage and response time, overall badge on top. Data comes from the
 * public /open_api/uptime endpoint (heartbeats written by the cron probe).
 */
const { t } = useScopedI18n('views.Uptime')

const { uptime, uptimeError, uptimeUpdatedAt, fetchUptime, start, stop } = useSiteHealth()

onMounted(start)
onUnmounted(stop)

// manual ↻ refreshes ONLY this card: showLoading=false keeps the request
// out of the global n-spin overlay (that was the "whole page refresh" bug)
const refreshing = ref(false)
const onRefresh = async () => {
    if (refreshing.value) return
    refreshing.value = true
    try {
        await fetchUptime(false)
    } finally {
        refreshing.value = false
    }
}

const MONITOR_IDS = ['website', 'api', 'database']

const rows = computed(() => {
    const monitors = uptime.value?.monitors
    if (monitors && monitors.length) return monitors
    // placeholder while the first probe has not arrived yet
    const currentHour = Math.floor(Date.now() / 3600000)
    return MONITOR_IDS.map((id) => ({
        id,
        state: 'unknown',
        latencyMs: null,
        uptime24h: null,
        bars: Array.from({ length: 48 }, (_, i) => ({
            t: (currentHour - 47 + i) * 3600,
            s: 'none',
            u: null,
            m: null,
        })),
    }))
})

const overallState = computed(() => {
    if (uptimeError.value || !uptime.value) return 'unknown'
    return uptime.value.overall || 'unknown'
})

const overallText = computed(() => {
    if (uptimeError.value) return t('error')
    return {
        up: t('badgeUp'),
        down: t('badgeDown'),
        unknown: t('badgeUnknown'),
    }[overallState.value] || t('badgeUnknown')
})

const monitorName = (id) => ({
    website: t('monitorWebsite'),
    api: t('monitorApi'),
    database: t('monitorDb'),
}[id] || id)

const hourLabel = (ts) => {
    const d = new Date(ts * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:00`
}

const barTitle = (bar) => {
    const time = hourLabel(bar.t)
    if (bar.s === 'none') return t('tipNone', { time })
    if (bar.s === 'down') return t('tipDown', { time, uptime: bar.u ?? 0 })
    return t('tipUp', { time, ms: bar.m ?? '-', uptime: bar.u ?? 100 })
}

const fmtUptime = (value) =>
    (value === null || value === undefined) ? '--' : `${Number(value).toFixed(2)}%`

const fmtLatency = (value) =>
    (value === null || value === undefined) ? '--' : `${value}ms`
</script>

<template>
    <div class="uptime-card">
        <div class="uptime-head">
            <span class="uptime-title">
                <span class="uptime-led" :class="overallState" />
                {{ t('title') }}
            </span>
            <span class="uptime-badge" :class="overallState">{{ overallText }}</span>
        </div>

        <div class="uptime-rows">
            <div v-for="row in rows" :key="row.id" class="uptime-row">
                <div class="uptime-name">
                    <span class="uptime-dot" :class="row.state" />
                    <span class="uptime-name-text">{{ monitorName(row.id) }}</span>
                </div>
                <div class="uptime-bars" aria-hidden="true">
                    <span v-for="(bar, barIndex) in row.bars" :key="barIndex"
                        class="uptime-bar" :class="`bar-${bar.s}`" :title="barTitle(bar)" />
                </div>
                <div class="uptime-stats">
                    <span class="uptime-pct" :title="t('uptimeTip')">{{ fmtUptime(row.uptime24h) }}</span>
                    <span class="uptime-ms">{{ fmtLatency(row.latencyMs) }}</span>
                </div>
            </div>
        </div>

        <div class="uptime-foot">
            <span class="uptime-foot-text">
                <template v-if="uptimeError">{{ t('error') }}</template>
                <template v-else>{{ t('checkedAt', { time: uptimeUpdatedAt }) }}</template>
            </span>
            <span v-if="uptime?.version" class="uptime-version">{{ uptime.version }}</span>
            <button class="uptime-refresh" type="button" :class="{ 'is-refreshing': refreshing }"
                :aria-label="t('refresh')" :disabled="refreshing"
                @click="onRefresh">↻</button>
        </div>
    </div>
</template>

<style scoped>
.uptime-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.uptime-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);
}

.uptime-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
    white-space: nowrap;
}

.uptime-led {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.6);
}

.uptime-led.up {
    background: currentColor;
}

.uptime-led.down {
    background: #e5484d;
    box-shadow: 0 0 6px rgba(229, 72, 77, 0.8);
    animation: uptime-blink 1.2s ease-in-out infinite;
}

@keyframes uptime-blink {
    50% { opacity: 0.4; }
}

/* 18-②: identical pill to the stats card's "公开数据" badge — mono 10px
   hairline capsule; only the alert red marks an outage */
.uptime-badge {
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

.uptime-badge.down {
    color: #e5484d;
    border-color: rgba(229, 72, 77, 0.6);
    background: rgba(229, 72, 77, 0.10);
}

.uptime-badge.unknown {
    opacity: 0.75;
}

.uptime-rows {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    padding: 6px 0;
}

.uptime-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 7px 0;
}

.uptime-name {
    flex: 0 0 78px;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: 12.5px;
}

.uptime-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.uptime-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.6);
}

.uptime-dot.up { background: currentColor; }
.uptime-dot.down { background: #e5484d; }

.uptime-bars {
    flex: 1 1 auto;
    display: flex;
    gap: 2px;
    min-width: 0;
}

.uptime-bar {
    flex: 1 1 0;
    min-width: 2px;
    height: 24px;
    border-radius: 3px;
    background: rgba(128, 128, 128, 0.18);
}

.uptime-bar.bar-up { background: currentColor; }
.uptime-bar.bar-down { background: #e5484d; }

.uptime-stats {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 8px;
    width: 124px;
}

.uptime-pct {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    cursor: help;
}

.uptime-ms {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
    width: 54px;
    text-align: right;
}

.uptime-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(128, 128, 128, 0.14);
    font-size: 11px;
    line-height: 1.5;
}

.uptime-foot-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
}

.uptime-version {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    opacity: 0.7;
}

.uptime-refresh {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 13px;
    line-height: 1;
    opacity: 0.7;
    cursor: pointer;
    transition: opacity 0.15s ease, border-color 0.15s ease;
}

.uptime-refresh:hover {
    opacity: 1;
    border-color: #1a1a1a;
}

:global(html.dark .uptime-refresh:hover) {
    border-color: #eee;
}

.uptime-refresh.is-refreshing {
    opacity: 1;
    border-color: #1a1a1a;
    animation: uptime-spin 0.9s linear infinite;
}

:global(html.dark .uptime-refresh.is-refreshing) {
    border-color: #eee;
}

@keyframes uptime-spin {
    to { transform: rotate(360deg); }
}

@media (max-width: 560px) {
    .uptime-name {
        flex-basis: 70px;
    }

    .uptime-stats {
        width: 74px;
    }

    .uptime-ms {
        display: none;
    }

    .uptime-bar {
        height: 20px;
    }
}
</style>
