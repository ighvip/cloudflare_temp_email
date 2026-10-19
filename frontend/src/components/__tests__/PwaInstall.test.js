// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NMessageProvider } from 'naive-ui'

import i18n from '../../i18n'
import PwaInstall from '../PwaInstall.vue'

const DISMISS_KEY = 'pwaInstallHideUntil'

const flush = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
    }
}

// same settle helper for suites that run on fake timers
const flushFake = async () => {
    for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(0)
        await nextTick()
    }
}

const setMatchMedia = (standalone) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: standalone && query.includes('display-mode: standalone'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))
}

const setUserAgent = (ua) => {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

const mountPrompt = async (path = '/', settle = flush) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
    })
    await router.push(path)
    await router.isReady()

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
        render: () => h(NMessageProvider, null, { default: () => h(PwaInstall) }),
    })
    app.use(router)
    app.use(i18n)
    app.mount(el)
    await settle()

    const banner = () => document.body.querySelector('.pwa-install')
    const unmount = () => {
        app.unmount()
        el.remove()
    }
    return { banner, unmount }
}

const fireInstallPrompt = () => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    event.prompt = vi.fn().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(event)
    return event
}

beforeEach(() => {
    setMatchMedia(false)
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36')
    window.localStorage.clear()
})

afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
})

describe('PwaInstall prompt', () => {
    it('stays hidden until the browser announces installability', async () => {
        const page = await mountPrompt('/')
        try {
            expect(page.banner()).toBeNull()

            const event = fireInstallPrompt()
            await flush()

            expect(event.defaultPrevented).toBe(true)
            expect(page.banner()).not.toBeNull()
            expect(page.banner().textContent).toContain('安装到桌面')
        } finally {
            page.unmount()
        }
    })

    it('"later" hides the prompt and remembers it for a few days', async () => {
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush()

            const laterButton = Array.from(page.banner().querySelectorAll('button'))
                .find((button) => button.textContent.includes('以后再说'))
            expect(laterButton).toBeTruthy()
            laterButton.click()
            await flush()

            expect(page.banner()).toBeNull()
            expect(Number(window.localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(Date.now())
        } finally {
            page.unmount()
        }
    })

    it('does not prompt while the prompt is snoozed', async () => {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now() + 864e5))
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush()
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('does not prompt when already running as an installed app', async () => {
        setMatchMedia(true)
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush()
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('only prompts on the homepage', async () => {
        const page = await mountPrompt('/admin')
        try {
            fireInstallPrompt()
            await flush()
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('falls back to the iOS "Add to Home Screen" guide (no beforeinstallprompt on iOS)', async () => {
        vi.useFakeTimers()
        setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')

        const page = await mountPrompt('/', flushFake)
        try {
            await vi.advanceTimersByTimeAsync(6000)
            await nextTick()

            expect(page.banner()).not.toBeNull()
            expect(page.banner().textContent).toContain('安装到桌面')

            const installButton = Array.from(page.banner().querySelectorAll('button'))
                .find((button) => button.textContent.includes('安装'))
            expect(installButton).toBeTruthy()
            installButton.click()
            await flushFake()

            const guide = document.body.textContent || ''
            expect(guide).toContain('添加到主屏幕')
            expect(guide).toContain('「分享」')
        } finally {
            page.unmount()
        }
    })
})
