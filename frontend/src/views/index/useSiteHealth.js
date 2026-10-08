import { ref } from 'vue'
import { api } from '../../api'

/**
 * Shared public data pollers for the homepage: mail statistics, the
 * Uptime-Kuma-style service status and the per-minute activity stream.
 *
 * One subscriber-counted timer set serves every consumer (stats card,
 * uptime card, activity card, ...) so the homepage does not multiply its
 * background requests with each widget.
 *
 * Manual refreshes always pass showLoading=false: the request must stay
 * local to its card (a spinning icon inside the card) instead of
 * triggering the app-wide n-spin overlay.
 */

const stats = ref({
    today: 0, week: 0, month: 0, year: 0, mode: 'real',
    sendEnabled: false, sendToday: 0, sendWeek: 0, sendMonth: 0, sendYear: 0,
    timezone: '+08:00',
})
const statsError = ref(false)
const statsUpdatedAt = ref('')
const uptime = ref(null)
const uptimeError = ref(false)
const uptimeUpdatedAt = ref('')
const activity = ref({ mode: 'real', minutes: [], today: { created: 0, sent: 0 }, recent: [] })
const activityError = ref(false)
const activityUpdatedAt = ref('')

let subscribers = 0
let statsTimer = null
let uptimeTimer = null
let activityTimer = null

const fetchStats = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/stats', { showLoading: !!showLoading })
        stats.value = {
            today: Number(res?.today) || 0,
            week: Number(res?.week) || 0,
            month: Number(res?.month) || 0,
            year: Number(res?.year) || 0,
            mode: res?.mode === 'manual' ? 'manual' : 'real',
            // 问题18-①b: sending disabled => backend reports false, UI shows 0
            sendEnabled: res?.sendEnabled !== false,
            sendToday: Number(res?.sendToday) || 0,
            sendWeek: Number(res?.sendWeek) || 0,
            sendMonth: Number(res?.sendMonth) || 0,
            sendYear: Number(res?.sendYear) || 0,
            timezone: typeof res?.timezone === 'string' ? res.timezone : '+08:00',
        }
        statsError.value = false
        statsUpdatedAt.value = res?.updatedAt
            ? new Date(res.updatedAt).toLocaleTimeString()
            : new Date().toLocaleTimeString()
    } catch (error) {
        statsError.value = true
        statsUpdatedAt.value = new Date().toLocaleTimeString()
    }
}

const fetchUptime = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/uptime', { showLoading: !!showLoading })
        uptime.value = res
        uptimeError.value = !res || res.ok === false
        uptimeUpdatedAt.value = res?.updatedAt
            ? new Date(res.updatedAt).toLocaleTimeString()
            : new Date().toLocaleTimeString()
    } catch (error) {
        uptime.value = null
        uptimeError.value = true
        uptimeUpdatedAt.value = new Date().toLocaleTimeString()
    }
}

const fetchActivity = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/activity', { showLoading: !!showLoading })
        activity.value = {
            mode: res?.mode === 'manual' ? 'manual' : 'real',
            minutes: Array.isArray(res?.minutes) ? res.minutes : [],
            today: {
                created: Number(res?.today?.created) || 0,
                sent: Number(res?.today?.sent) || 0,
            },
            // 问题19: the 3 most recent events (type + UTC time)
            recent: Array.isArray(res?.recent) ? res.recent.slice(0, 3) : [],
        }
        activityError.value = false
        activityUpdatedAt.value = res?.updatedAt
            ? new Date(res.updatedAt).toLocaleTimeString()
            : new Date().toLocaleTimeString()
    } catch (error) {
        activity.value = { mode: 'real', minutes: [], today: { created: 0, sent: 0 }, recent: [] }
        activityError.value = true
        activityUpdatedAt.value = new Date().toLocaleTimeString()
    }
}

export const useSiteHealth = () => {
    const start = () => {
        if (subscribers === 0) {
            fetchStats(false)
            fetchUptime(false)
            fetchActivity(false)
            statsTimer = setInterval(() => fetchStats(false), 60000)
            uptimeTimer = setInterval(() => fetchUptime(false), 60000)
            activityTimer = setInterval(() => fetchActivity(false), 60000)
        }
        subscribers += 1
    }
    const stop = () => {
        subscribers = Math.max(0, subscribers - 1)
        if (subscribers === 0) {
            if (statsTimer) clearInterval(statsTimer)
            if (uptimeTimer) clearInterval(uptimeTimer)
            if (activityTimer) clearInterval(activityTimer)
            statsTimer = null
            uptimeTimer = null
            activityTimer = null
        }
    }
    return {
        stats, statsError, statsUpdatedAt,
        uptime, uptimeError, uptimeUpdatedAt,
        activity, activityError, activityUpdatedAt,
        fetchStats, fetchUptime, fetchActivity,
        start, stop,
    }
}
