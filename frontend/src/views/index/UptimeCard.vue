<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
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
            <button class="uptime-refresh" type="button" :aria-label="t('refresh')"
                @click="fetchUptime(true)">↻</button>
        </div>
    </div>
</template>

<style scoped>
.uptime-card {
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

.uptime-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.uptime-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #e6edf3;
    white-space: nowrap;
}

.uptime-led {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #6e7681;
}

.uptime-led.up {
    background: #5cdd8b;
    box-shadow: 0 0 6px rgba(92, 221, 139, 0.9);
}

.uptime-led.down {
    background: #ff5f6d;
    box-shadow: 0 0 6px rgba(255, 95, 109, 0.9);
    animation: uptime-blink 1.2s ease-in-out infinite;
}

@keyframes uptime-blink {
    50% { opacity: 0.4; }
}

.uptime-badge {
    margin-left: auto;
    padding: 2px 10px;
    border: 1px solid rgba(110, 118, 129, 0.5);
    border-radius: 999px;
    background: rgba(110, 118, 129, 0.15);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
}

.uptime-badge.up {
    color: #5cdd8b;
    border-color: rgba(92, 221, 139, 0.5);
    background: rgba(92, 221, 139, 0.12);
}

.uptime-badge.down {
    color: #ff808a;
    border-color: rgba(255, 95, 109, 0.55);
    background: rgba(255, 95, 109, 0.14);
}

.uptime-badge.unknown {
    color: #9aa4b2;
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
    color: #c9d1d9;
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
    background: #6e7681;
}

.uptime-dot.up { background: #5cdd8b; }
.uptime-dot.down { background: #ff5f6d; }

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
    background: rgba(110, 118, 129, 0.22);
}

.uptime-bar.bar-up { background: #5cdd8b; }
.uptime-bar.bar-down { background: #ff5f6d; }

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
    color: #e6edf3;
    cursor: help;
}

.uptime-ms {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: #8b949e;
    width: 54px;
    text-align: right;
}

.uptime-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    font-size: 11px;
    color: #8b949e;
    line-height: 1.5;
}

.uptime-foot-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.uptime-version {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    color: #58a6ff;
    opacity: 0.85;
}

.uptime-refresh {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 6px;
    background: transparent;
    color: #8b949e;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
}

.uptime-refresh:hover {
    color: #58a6ff;
    border-color: rgba(88, 166, 255, 0.6);
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
