<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * Uptime Kuma style status card: 48 hourly bars per monitor, 24h uptime
 * percentage and response time, overall badge on top. Data comes from the
 * public /open_api/uptime endpoint (heartbeats written by the cron probe).
 */
const { t } = useScopedI18n('views.Uptime')

// drag grip rendered in the head when the parent enables reordering
defineProps({ draggable: { type: Boolean, default: false } })
const emit = defineEmits(['dragstart', 'dragend'])

const { uptime, uptimeError, uptimeUpdatedAt, fetchUptime, start, stop } = useSiteHealth()

// re-key the bar strips on every data arrival — the strips remount and the
// CSS entrance cascade replays (the reference achieves the same by
// rebuilding the DOM with innerHTML: "bars re-appear on refresh")
const barsVersion = ref(0)
watch(uptime, () => { barsVersion.value += 1 })

onMounted(start)

// manual ↻ refreshes ONLY this card: showLoading=false keeps the request
// out of the global n-spin overlay (that was the "whole page refresh" bug)
const refreshing = ref(false)
// a one-shot tint flash across the rows when a manual refresh lands
const flashing = ref(false)
let flashTimer = null
const onRefresh = async () => {
    if (refreshing.value) return
    refreshing.value = true
    try {
        await fetchUptime(false)
        flashing.value = true
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => { flashing.value = false }, 500)
    } finally {
        refreshing.value = false
    }
}

onUnmounted(() => {
    stop()
    if (flashTimer) clearTimeout(flashTimer)
})

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
    <div class="uptime-card" :class="{ 'is-refreshing': refreshing }">
        <div class="uptime-head">
            <span v-if="draggable" class="card-grip" draggable="true"
                :title="t('cardDragLabel')" @dragstart="emit('dragstart', $event)"
                @dragend="emit('dragend')">⠿</span>
            <span class="uptime-title">
                <span class="uptime-led" :class="overallState" />
                {{ t('title') }}
            </span>
            <span class="uptime-badge" :class="overallState">{{ overallText }}</span>
        </div>

        <div class="uptime-rows" :class="{ 'is-flashing': flashing }">
            <div v-for="row in rows" :key="row.id" class="uptime-row">
                <div class="uptime-name">
                    <span class="uptime-dot" :class="row.state" />
                    <span class="uptime-name-text">{{ monitorName(row.id) }}</span>
                </div>
                <div class="uptime-bars-wrap">
                    <div class="uptime-bars" :key="`${row.id}-${barsVersion}`">
                        <span v-for="(bar, barIndex) in row.bars" :key="barIndex"
                            class="uptime-bar" :class="`bar-${bar.s}`"
                            :style="{ '--i': barIndex }" :title="barTitle(bar)" />
                    </div>
                    <span class="uptime-scan" aria-hidden="true" />
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
                @click="onRefresh">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <path d="M21 3v6h-6" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped>
.uptime-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 12px 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.uptime-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);
}

/* drag grip in the card head (touch devices don't drag — hidden <768px) */
.card-grip {
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 1;
    opacity: 0.3;
    cursor: grab;
    user-select: none;
    transition: opacity 0.15s ease;
}

.card-grip:hover {
    opacity: 0.65;
}

.card-grip:active {
    cursor: grabbing;
}

@media (max-width: 768px) {
    .card-grip {
        display: none;
    }
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
    animation: uptime-led-pulse 2s ease-in-out infinite;
}

/* probing: the LED stutters fast while the refresh request is in flight */
.uptime-card.is-refreshing .uptime-led {
    animation: uptime-led-fast 0.4s steps(2) infinite;
}

@keyframes uptime-led-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(29, 29, 31, 0.35); }
    50% { box-shadow: 0 0 0 4px rgba(29, 29, 31, 0); }
}

:global(html.dark .uptime-led.up) {
    animation-name: uptime-led-pulse-dark;
}

@keyframes uptime-led-pulse-dark {
    0%, 100% { box-shadow: 0 0 0 0 rgba(238, 238, 238, 0.35); }
    50% { box-shadow: 0 0 0 4px rgba(238, 238, 238, 0); }
}

@keyframes uptime-led-fast {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
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

/* one-shot tint when a manual refresh lands */
.uptime-rows.is-flashing {
    animation: uptime-rows-flash 0.5s ease;
    border-radius: 4px;
}

@keyframes uptime-rows-flash {
    0% { background: rgba(128, 128, 128, 0.1); }
    100% { background: transparent; }
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

.uptime-bars-wrap {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    border-radius: 3px;
}

.uptime-bars {
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
    /* staggered grow-in: --i cascades the delay 12ms per bar, left (oldest)
       to right (newest); replays on remount (barsVersion key) */
    animation: uptime-bar-in 0.4s ease both;
    animation-delay: calc(var(--i, 0) * 12ms);
}

@keyframes uptime-bar-in {
    from { opacity: 0; transform: scaleY(0.4); }
    to { opacity: 1; transform: none; }
}

.uptime-bar.bar-up { background: currentColor; }
.uptime-bar.bar-down { background: #e5484d; }

/* light sweep gliding across the strips (the reference's status-scan) */
.uptime-scan {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 48px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
    mix-blend-mode: overlay;
    animation: uptime-scan 3.6s linear infinite;
    pointer-events: none;
}

@keyframes uptime-scan {
    from { transform: translateX(-60px); }
    to { transform: translateX(calc(100% + 100vw)); }
}

/* overlay-white is nearly invisible on dark panels — screen it instead */
:global(html.dark .uptime-scan) {
    mix-blend-mode: screen;
    opacity: 0.5;
}

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
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    transition: opacity 0.15s ease, border-color 0.15s ease;
}

.uptime-refresh svg {
    width: 13px;
    height: 13px;
    display: block;
    transition: transform 0.3s ease;
}

.uptime-refresh:hover {
    opacity: 1;
    border-color: #1a1a1a;
}

.uptime-refresh:hover svg {
    transform: rotate(90deg);
}

:global(html.dark .uptime-refresh:hover) {
    border-color: #eee;
}

.uptime-refresh.is-refreshing {
    opacity: 1;
    border-color: #1a1a1a;
}

/* loading: the icon spins inside a rotating conic ring around the button */
.uptime-refresh.is-refreshing svg {
    animation: uptime-spin 0.8s linear infinite;
}

.uptime-refresh.is-refreshing::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 9px;
    background: conic-gradient(from 0deg, transparent 0 68%, #1a1a1a 82%, transparent 96%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
    animation: uptime-spin 1s linear infinite;
    pointer-events: none;
}

:global(html.dark .uptime-refresh.is-refreshing) {
    border-color: #eee;
}

:global(html.dark .uptime-refresh.is-refreshing::before) {
    background: conic-gradient(from 0deg, transparent 0 68%, #eee 82%, transparent 96%);
}

@keyframes uptime-spin {
    to { transform: rotate(360deg); }
}

/* loops off under reduced motion; the one-shot entrance cascade, the
   refresh flash and the loading spin stay (state, not decoration) */
@media (prefers-reduced-motion: reduce) {
    .uptime-scan {
        display: none;
    }

    .uptime-led,
    .uptime-led.up,
    .uptime-card.is-refreshing .uptime-led {
        animation: none;
    }

    .uptime-refresh.is-refreshing::before {
        display: none;
    }
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
