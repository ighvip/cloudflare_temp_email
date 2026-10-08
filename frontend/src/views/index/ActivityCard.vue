<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useSiteHealth } from './useSiteHealth'

/**
 * "Live activity" card — the third monitoring module: three headline
 * counters (mails in the last 60 minutes, addresses created today, mails
 * sent today) over a 60-bar per-minute activity strip. Same light-card
 * language as the stats/uptime cards; the data comes from the public
 * /open_api/activity endpoint (60s cache, honest manual-mode fallback).
 *
 * The bottom-right ↻ refreshes ONLY this module (showLoading=false — a
 * local spinning icon, never the app-wide loading overlay).
 */
const { t } = useScopedI18n('views.index.ActivityCard')

const {
    activity, activityError, activityUpdatedAt,
    fetchActivity, start, stop,
} = useSiteHealth()

onMounted(start)
onUnmounted(stop)

const refreshing = ref(false)
const onRefresh = async () => {
    if (refreshing.value) return
    refreshing.value = true
    try {
        await fetchActivity(false)
    } finally {
        refreshing.value = false
    }
}

const SLOTS = 60
const pad = (n) => String(n).padStart(2, '0')
// same 'YYYY-MM-DD HH:MM' UTC bucket format the worker returns
const bucketKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

// fill the last 60 minute slots (aligned to the local clock) so gaps in
// the payload become explicit zero bars instead of shifting the strip
const slots = computed(() => {
    const src = activity.value?.minutes || []
    const map = new Map(src.map((m) => [m.t, m]))
    const now = Date.now()
    const out = []
    for (let i = SLOTS - 1; i >= 0; i--) {
        const d = new Date(now - i * 60000)
        const hit = map.get(bucketKey(d)) || {}
        out.push({
            label: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            r: Number(hit.r) || 0,
            c: Number(hit.c) || 0,
            s: Number(hit.s) || 0,
        })
    }
    return out
})

const totals = computed(() => slots.value.reduce(
    (acc, slot) => ({ r: acc.r + slot.r, c: acc.c + slot.c, s: acc.s + slot.s }),
    { r: 0, c: 0, s: 0 },
))

const maxAct = computed(() => Math.max(
    1, ...slots.value.map((slot) => slot.r + slot.c + slot.s),
))

// 问题19: exactly 3 recent events — the payload ships them sorted desc;
// pad with empty rows so the card keeps a stable layout
const EVENT_TYPES = ['received', 'created', 'sent']
const eventLabelKey = { received: 'eventReceived', created: 'eventCreated', sent: 'eventSent' }

const parseUtc = (at) => {
    if (!at) return null
    const d = new Date(`${at.replace(' ', 'T')}Z`)
    return Number.isNaN(d.getTime()) ? null : d
}

const recentEvents = computed(() => {
    const src = Array.isArray(activity.value?.recent) ? activity.value.recent : []
    const out = src.slice(0, 3).map((item) => {
        const d = parseUtc(item.at)
        return {
            type: EVENT_TYPES.includes(item.type) ? item.type : 'received',
            time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '--:--:--',
        }
    })
    while (out.length < 3) out.push({ type: '', time: '--:--:--' })
    return out
})

const legendItems = [
    { key: 'received', labelKey: 'eventReceived' },
    { key: 'created', labelKey: 'eventCreated' },
    { key: 'sent', labelKey: 'eventSent' },
]

const isManual = computed(() => activity.value?.mode === 'manual')

const statItems = computed(() => [
    { key: 'hour', label: t('statHour'), value: isManual.value ? null : totals.value.r },
    { key: 'created', label: t('statCreated'), value: isManual.value ? null : activity.value?.today?.created ?? 0 },
    { key: 'sent', label: t('statSent'), value: isManual.value ? null : activity.value?.today?.sent ?? 0 },
])

const modeBadge = computed(() => (isManual.value ? t('badgeManual') : t('badge')))

const formatCount = (value) => {
    if (value === null || value === undefined) return '--'
    // locale-neutral numerals so the same format works for every language
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return String(value)
}

// bar geometry: quiet minutes stay as a visible baseline tick, busy
// minutes grow to the full strip height. 问题19: each bar is a stack of
// three segments (收/建/发) in three grey shades.
const barHeight = (slot) => {
    const total = slot.r + slot.c + slot.s
    if (total === 0) return 3
    return Math.round(4 + (total / maxAct.value) * 42)
}

// segment heights inside the bar (percent of the bar itself); the 1px
// separators come from the flex gap, so tiny segments never disappear
const barSegments = (slot) => {
    const total = slot.r + slot.c + slot.s
    if (total === 0) return []
    return [
        { key: 'r', value: slot.r },
        { key: 'c', value: slot.c },
        { key: 's', value: slot.s },
    ].filter((seg) => seg.value > 0)
        .map((seg) => ({ ...seg, grow: seg.value }))
}

const barTitle = (slot) => t('barTip', {
    time: slot.label, r: slot.r, c: slot.c, s: slot.s,
})
</script>

<template>
    <div class="activity-card">
        <div class="activity-head">
            <span class="activity-led" :class="{ 'activity-led-error': activityError }" />
            <span class="activity-title">{{ t('title') }}</span>
            <span class="activity-live">LIVE</span>
            <span class="activity-badge">{{ modeBadge }}</span>
        </div>

        <div class="activity-row">
            <div v-for="item in statItems" :key="item.key" class="activity-cell">
                <div class="activity-value">{{ formatCount(item.value) }}</div>
                <div class="activity-label">{{ item.label }}</div>
            </div>
        </div>

        <div class="activity-strip" :aria-label="t('stripLabel')" role="img">
            <span v-for="(slot, slotIndex) in slots" :key="slotIndex" class="activity-bar"
                :class="{ 'activity-bar-live': slotIndex === slots.length - 1, 'activity-bar-empty': !(slot.r || slot.c || slot.s) }"
                :style="{ height: `${barHeight(slot)}px` }"
                :title="barTitle(slot)">
                <span v-for="seg in barSegments(slot)" :key="seg.key" class="activity-seg"
                    :class="`activity-seg-${seg.key}`" :style="{ flexGrow: seg.grow }" />
            </span>
        </div>

        <!-- 问题19: three grey swatches — 收 / 建 / 发 -->
        <div class="activity-legend">
            <span v-for="item in legendItems" :key="item.key" class="activity-legend-item">
                <span class="activity-legend-swatch" :class="`activity-seg-${item.key}`" />
                {{ t(item.labelKey) }}
            </span>
        </div>

        <!-- 问题19: the 3 most recent events, stable layout even when empty -->
        <div class="activity-stream">
            <div v-for="(event, eventIndex) in recentEvents" :key="eventIndex" class="activity-event"
                :class="{ 'is-empty': !event.type }">
                <span class="activity-event-dot" :class="event.type ? `activity-seg-${event.type}` : 'activity-seg-empty'" />
                <span class="activity-event-type">
                    {{ event.type ? t(eventLabelKey[event.type]) : t('eventEmpty') }}
                </span>
                <span class="activity-event-time">{{ event.time }}</span>
            </div>
        </div>

        <div class="activity-foot">
            <span class="activity-foot-text">
                <template v-if="activityError">{{ t('unavailable') }}</template>
                <template v-else>{{ t('updatedAt', { time: activityUpdatedAt }) }}</template>
            </span>
            <button class="activity-refresh" type="button" :class="{ 'is-refreshing': refreshing }"
                :aria-label="t('refresh')" :disabled="refreshing" @click="onRefresh">↻</button>
        </div>
    </div>
</template>

<style scoped>
.activity-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.activity-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);
}

.activity-led {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
    animation: activity-led-pulse 2s ease-in-out infinite;
}

.activity-led-error {
    background: #e5484d;
    box-shadow: 0 0 6px rgba(229, 72, 77, 0.8);
}

@keyframes activity-led-pulse {
    50% { opacity: 0.45; }
}

.activity-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.4px;
}

.activity-live {
    padding: 1px 7px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.10);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    animation: activity-live-blink 2s ease-in-out infinite;
}

@keyframes activity-live-blink {

    0%,
    100% { opacity: 1; }

    50% { opacity: 0.5; }
}

.activity-badge {
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

.activity-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px 0;
}

.activity-cell {
    min-width: 0;
    padding: 8px 6px;
    text-align: center;
    border-left: 1px solid rgba(128, 128, 128, 0.14);
}

.activity-cell:first-child {
    border-left: none;
}

.activity-value {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(22px, 2.2vw, 28px);
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
}

.activity-label {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.activity-strip {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 54px;
    padding-top: 6px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.22);
}

.activity-bar {
    flex: 1 1 0;
    min-width: 3px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s ease;
}

/* 问题19: stacked segment shades — solid / mid / light grey (inverted in
   dark mode); also used by the legend swatches and the event dots */
.activity-seg-r,
.activity-seg-received {
    background: #1a1a1a;
}

.activity-seg-c,
.activity-seg-created {
    background: #8a8a8a;
}

.activity-seg-s,
.activity-seg-sent {
    background: #d0d0d0;
}

.activity-seg-empty,
.activity-bar-empty {
    background: rgba(128, 128, 128, 0.16);
}

:global(html.dark .activity-seg-r),
:global(html.dark .activity-seg-received) {
    background: #eeeeee;
}

:global(html.dark .activity-seg-c),
:global(html.dark .activity-seg-created) {
    background: #8a8a8a;
}

:global(html.dark .activity-seg-s),
:global(html.dark .activity-seg-sent) {
    background: #3d3d3d;
}

.activity-seg {
    min-height: 1px;
}

/* 问题19: legend row under the strip */
.activity-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 8px;
    font-size: 11px;
    opacity: 0.7;
}

.activity-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.activity-legend-swatch {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 2px;
}

/* 问题19: event stream — exactly 3 rows, hairline separators, mono time */
.activity-stream {
    margin-top: 8px;
    padding-top: 4px;
    border-top: 1px solid rgba(128, 128, 128, 0.14);
}

.activity-event {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    font-size: 12px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.10);
}

.activity-event:last-child {
    border-bottom: none;
}

.activity-event.is-empty {
    opacity: 0.4;
}

.activity-event-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 2px;
    border: 1px solid rgba(128, 128, 128, 0.3);
}

.activity-event-type {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.activity-event-time {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    letter-spacing: 0.5px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

.activity-bar-live {
    animation: activity-bar-pulse 2s ease-in-out infinite;
}

@keyframes activity-bar-pulse {

    0%,
    100% { opacity: 1; }

    50% { opacity: 0.4; }
}

.activity-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 10px;
    font-size: 11px;
    line-height: 1.5;
}

.activity-foot-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
}

.activity-refresh {
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

.activity-refresh:hover {
    opacity: 1;
    border-color: #1a1a1a;
}

:global(html.dark .activity-refresh:hover) {
    border-color: #eee;
}

.activity-refresh.is-refreshing {
    opacity: 1;
    border-color: #1a1a1a;
    animation: activity-spin 0.9s linear infinite;
}

:global(html.dark .activity-refresh.is-refreshing) {
    border-color: #eee;
}

@keyframes activity-spin {
    to { transform: rotate(360deg); }
}
</style>
