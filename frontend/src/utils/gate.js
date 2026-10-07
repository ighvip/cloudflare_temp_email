import { getAdminPath } from './index'

/**
 * P0-B4 rework: per-tab admin gate session.
 *
 * `S` (64-hex session token) is delivered once via `?gt=<S>` when the
 * homepage-minted one-time token `?k=<T>` is redeemed, stored in
 * sessionStorage only (never localStorage) and sent as `x-gate-tab` on
 * every /admin/* request. Closing the window destroys it; the server-side
 * heartbeat timeout (120s) is the backstop.
 *
 * This module deliberately avoids importing the api wrapper (api/index.js
 * imports it for the header) — it uses plain fetch to stay cycle-free.
 */

const GATE_SESSION_KEY = 'adminGateSession'

export const getGateSession = () => {
    try {
        return window.sessionStorage.getItem(GATE_SESSION_KEY) || ''
    } catch (_) {
        return ''
    }
}

export const setGateSession = (value) => {
    try {
        if (value) window.sessionStorage.setItem(GATE_SESSION_KEY, value)
    } catch (_) { /* private mode etc. */ }
}

export const clearGateSession = () => {
    try {
        window.sessionStorage.removeItem(GATE_SESSION_KEY)
    } catch (_) { /* private mode etc. */ }
}

const parseNonce = (html) => {
    const match = html.match(/window\.__GATE_NONCE__="([^"]+)"/)
    return match ? match[1] : ''
}

const requestMint = (nonce) => fetch('/open_api/admin_gate_mint', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-gate-src': nonce || '',
    },
})

/**
 * Mint a one-time 64-hex admin entry token (60s TTL) from the homepage
 * nonce in `window.__GATE_NONCE__`. When the homepage came out of a stale
 * PWA cache the nonce may have rotated — refetch a fresh homepage once and
 * retry with its nonce.
 */
export const mintGateToken = async () => {
    let response = await requestMint(window.__GATE_NONCE__ || '')
    if (response.status === 400) {
        try {
            const html = await (await fetch('/', { cache: 'no-store' })).text()
            response = await requestMint(parseNonce(html))
        } catch (_) { /* fall through to the error below */ }
    }
    if (!response.ok) {
        const error = new Error(`mint failed: ${response.status}`)
        error.status = response.status
        throw error
    }
    const data = await response.json().catch(() => null)
    if (!data || !data.token) throw new Error('mint failed')
    return data.token
}

/**
 * Homepage admin entry: open a placeholder window synchronously (keeps the
 * user gesture so popup blockers allow it), mint T, then navigate the
 * placeholder to `<admin>?k=<T>`.
 */
export const openAdminGate = async () => {
    const popup = window.open('about:blank', '_blank')
    if (popup) {
        try {
            popup.document.write(
                '<!DOCTYPE html><meta charset="utf-8"><title>tempemail</title>' +
                '<body style="margin:0;display:flex;align-items:center;justify-content:center;' +
                'height:100vh;font-family:system-ui,sans-serif;background:#0b0e14;color:#8b949e">' +
                '<span style="font-size:14px">…</span></body>'
            )
        } catch (_) { /* cross-origin edge cases */ }
    }
    try {
        const token = await mintGateToken()
        const url = `${getAdminPath()}?k=${token}`
        if (popup && !popup.closed) {
            try { popup.opener = null } catch (_) { /* ignore */ }
            popup.location.replace(url)
        } else {
            // placeholder was blocked — try a direct (possibly blocked) open
            window.open(url, '_blank')
        }
        return true
    } catch (error) {
        if (popup && !popup.closed) popup.close()
        throw error
    }
}
