import { ref } from 'vue'
import { api } from '../../api'

/**
 * Shared public data pollers for the homepage: mail statistics and the
 * Uptime-Kuma-style service status.
 *
 * One subscriber-counted timer set serves every consumer (stats card,
 * uptime card, ...) so the homepage does not multiply its background
 * requests with each widget.
 */

const stats = ref({ today: 0, week: 0, month: 0, mode: 'real' })
const statsError = ref(false)
const statsUpdatedAt = ref('')
const uptime = ref(null)
const uptimeError = ref(false)
const uptimeUpdatedAt = ref('')

let subscribers = 0
let statsTimer = null
let uptimeTimer = null

const fetchStats = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/stats', { showLoading: !!showLoading })
        stats.value = {
            today: Number(res?.today) || 0,
            week: Number(res?.week) || 0,
            month: Number(res?.month) || 0,
            mode: res?.mode === 'manual' ? 'manual' : 'real',
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

export const useSiteHealth = () => {
    const start = () => {
        if (subscribers === 0) {
            fetchStats(false)
            fetchUptime(false)
            statsTimer = setInterval(() => fetchStats(false), 60000)
            uptimeTimer = setInterval(() => fetchUptime(false), 60000)
        }
        subscribers += 1
    }
    const stop = () => {
        subscribers = Math.max(0, subscribers - 1)
        if (subscribers === 0) {
            if (statsTimer) clearInterval(statsTimer)
            if (uptimeTimer) clearInterval(uptimeTimer)
            statsTimer = null
            uptimeTimer = null
        }
    }
    return {
        stats, statsError, statsUpdatedAt,
        uptime, uptimeError, uptimeUpdatedAt,
        fetchStats, fetchUptime,
        start, stop,
    }
}
