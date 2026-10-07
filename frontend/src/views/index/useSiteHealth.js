import { ref } from 'vue'
import { api } from '../../api'

/**
 * Shared server status + public mail statistics for the homepage.
 *
 * One poller serves every consumer (HomeInfo card on desktop, the compact
 * status line in the action card, ...) so the homepage does not multiply
 * its background requests with each widget.
 */

const status = ref(null)
const statusError = ref(false)
const checkedAt = ref('')
const stats = ref({ today: 0, week: 0, month: 0 })
const statsError = ref(false)
const statsUpdatedAt = ref('')

let subscribers = 0
let statusTimer = null
let statsTimer = null

const fetchStatus = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/status', { showLoading: !!showLoading })
        status.value = res
        statusError.value = !res || res.ok === false
        checkedAt.value = res?.time
            ? new Date(res.time).toLocaleTimeString()
            : new Date().toLocaleTimeString()
    } catch (error) {
        status.value = null
        statusError.value = true
        checkedAt.value = new Date().toLocaleTimeString()
    }
}

const fetchStats = async (showLoading) => {
    try {
        const res = await api.fetch('/open_api/stats', { showLoading: !!showLoading })
        stats.value = {
            today: Number(res?.today) || 0,
            week: Number(res?.week) || 0,
            month: Number(res?.month) || 0,
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

export const useSiteHealth = () => {
    const start = () => {
        if (subscribers === 0) {
            fetchStatus(false)
            fetchStats(false)
            statusTimer = setInterval(() => fetchStatus(false), 30000)
            statsTimer = setInterval(() => fetchStats(false), 60000)
        }
        subscribers += 1
    }
    const stop = () => {
        subscribers = Math.max(0, subscribers - 1)
        if (subscribers === 0) {
            if (statusTimer) clearInterval(statusTimer)
            if (statsTimer) clearInterval(statsTimer)
            statusTimer = null
            statsTimer = null
        }
    }
    return {
        status, statusError, checkedAt,
        stats, statsError, statsUpdatedAt,
        fetchStatus, fetchStats,
        start, stop,
    }
}
