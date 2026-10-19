// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NMessageProvider } from 'naive-ui'

import i18n from '../../i18n'
import PwaInstall from '../PwaInstall.vue'

const COLLAPSE_KEY = 'pwaInstallCollapsed'
const AUTO_SHOWN_KEY = 'pwaInstallAutoShownOn'
const INSTALLED_KEY = 'pwaInstallInstalled'
const VARIANT_KEY = 'pwaIconVariant'

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'

const today = () => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const resetHeadLinks = () => {
    document.head.querySelectorAll('link[rel="manifest"], link[rel="apple-touch-icon"]').forEach((l) => l.remove())
    const manifest = document.createElement('link')
    manifest.rel = 'manifest'
    manifest.href = '/manifest.webmanifest'
    const apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    apple.href = '/apple-touch-icon.png'
    document.head.append(manifest, apple)
}

const headLink = (rel) => document.head.querySelector(`link[rel="${rel}"]`).getAttribute('href')

// the component auto-shows on a timer, so every suite runs on fake timers
const flush = async (ms = 0) => {
    for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(ms)
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

const mountPrompt = async (path = '/') => {
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
    await flush()

    const banner = () => document.body.querySelector('.pwa-install')
    const button = (label) =>
        Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent.includes(label))
    const unmount = () => {
        app.unmount()
        el.remove()
    }
    return { banner, button, unmount }
}

const fireInstallPrompt = () => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    event.prompt = vi.fn().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(event)
    return event
}

beforeEach(() => {
    vi.useFakeTimers()
    setMatchMedia(false)
    setUserAgent(CHROME_UA)
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetHeadLinks()
})

afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
})

describe('PwaInstall prompt', () => {
    it('auto-shows on the homepage and books the daily slot', async () => {
        const page = await mountPrompt('/')
        try {
            expect(page.banner()).toBeNull()

            // 1200ms fallback: no need to wait for beforeinstallprompt at all
            await flush(1200)

            expect(page.banner()).not.toBeNull()
            expect(page.banner().textContent).toContain('安装到桌面')
            expect(window.localStorage.getItem(AUTO_SHOWN_KEY)).toBe(today())
        } finally {
            page.unmount()
        }
    })

    it('shows it immediately when the browser announces installability', async () => {
        const page = await mountPrompt('/')
        try {
            const event = fireInstallPrompt()
            await flush()

            expect(event.defaultPrevented).toBe(true)
            expect(page.banner()).not.toBeNull()
            expect(window.localStorage.getItem(AUTO_SHOWN_KEY)).toBe(today())
        } finally {
            page.unmount()
        }
    })

    it('books the daily slot only once, even for a second tab', async () => {
        const first = await mountPrompt('/')
        try {
            await flush(1200)
            expect(first.banner()).not.toBeNull()
        } finally {
            first.unmount()
        }

        // localStorage is shared, so a brand new tab the same day stays quiet
        const second = await mountPrompt('/')
        try {
            await flush(1200)
            expect(second.banner()).toBeNull()
        } finally {
            second.unmount()
        }
    })

    it('"收起" hides the card and stays quiet in this tab', async () => {
        const page = await mountPrompt('/')
        try {
            await flush(1200)
            const collapse = page.banner().querySelector('.pwa-collapse')
            expect(collapse).toBeTruthy()
            expect(collapse.getAttribute('title')).toContain('收起')
            collapse.click()
            await flush(50)

            expect(page.banner()).toBeNull()
            expect(window.sessionStorage.getItem(COLLAPSE_KEY)).toBe('1')
            // nothing permanent was written: the promise is "not today, this tab"
            expect(window.localStorage.getItem(AUTO_SHOWN_KEY)).toBe(today())
        } finally {
            page.unmount()
        }
    })

    it('stays quiet in a tab where the visitor already collapsed it', async () => {
        window.sessionStorage.setItem(COLLAPSE_KEY, '1')
        window.localStorage.removeItem(AUTO_SHOWN_KEY)
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush(1200)
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('does not prompt again on a fresh visit once the app is installed', async () => {
        window.localStorage.setItem(INSTALLED_KEY, '1')
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush(1200)
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('does not prompt inside an installed window', async () => {
        setMatchMedia(true)
        const page = await mountPrompt('/')
        try {
            fireInstallPrompt()
            await flush(1200)
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('only prompts on the homepage', async () => {
        const page = await mountPrompt('/admin')
        try {
            fireInstallPrompt()
            await flush(1200)
            expect(page.banner()).toBeNull()
        } finally {
            page.unmount()
        }
    })

    it('auto-shows on iOS too, with the "Add to Home Screen" wording', async () => {
        setUserAgent(IOS_UA)
        const page = await mountPrompt('/')
        try {
            expect(page.banner()).toBeNull()
            await flush(6000)

            expect(page.banner()).not.toBeNull()
            expect(page.banner().textContent).toContain('分享')
            expect(window.localStorage.getItem(AUTO_SHOWN_KEY)).toBe(today())
        } finally {
            page.unmount()
        }
    })

    it('walks iOS through the manual guide', async () => {
        setUserAgent(IOS_UA)
        const page = await mountPrompt('/')
        try {
            await flush(6000)
            page.button('安装').click()
            await flush()

            const guide = document.body.textContent || ''
            expect(guide).toContain('添加到主屏幕')
            expect(guide).toContain('「分享」')
            expect(guide).toContain('图标')
        } finally {
            page.unmount()
        }
    })

    it('walks desktop Chromium through the address-bar guide', async () => {
        const page = await mountPrompt('/')
        try {
            await flush(1200)
            expect(page.banner().textContent).toContain('桌面')

            page.button('安装').click()
            await flush()

            const guide = document.body.textContent || ''
            expect(guide).toContain('地址栏')
            expect(guide).toContain('安装 Temp-Mail')
        } finally {
            page.unmount()
        }
    })

    it('walks Android through the browser-menu guide', async () => {
        setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')
        const page = await mountPrompt('/')
        try {
            await flush(1200)
            page.button('安装').click()
            await flush()

            const guide = document.body.textContent || ''
            expect(guide).toContain('「⋮」菜单')
            expect(guide).toContain('「安装应用」')
        } finally {
            page.unmount()
        }
    })

    it('tells unsupported browsers (Firefox) what to use instead', async () => {
        setUserAgent(FIREFOX_UA)
        const page = await mountPrompt('/')
        try {
            await flush(1200)
            expect(page.banner()).not.toBeNull()
            expect(page.banner().textContent).toContain('不支持')

            page.button('安装').click()
            await flush()

            const guide = document.body.textContent || ''
            expect(guide).toContain('不支持把网页安装为应用')
        } finally {
            page.unmount()
        }
    })

    it('switches the install icon between light and dark plates', async () => {
        const page = await mountPrompt('/')
        try {
            await flush(1200)

            expect(headLink('manifest')).toBe('/manifest.webmanifest')
            expect(headLink('apple-touch-icon')).toBe('/apple-touch-icon.png')

            const swatches = page.banner().querySelectorAll('.pwa-swatch')
            expect(swatches).toHaveLength(2)
            swatches[1].click()
            await flush()

            expect(headLink('manifest')).toBe('/manifest-dark.webmanifest')
            expect(headLink('apple-touch-icon')).toBe('/apple-touch-icon-dark.png')
            expect(window.localStorage.getItem(VARIANT_KEY)).toBe('dark')
            expect(swatches[1].className).toContain('is-active')
            expect(page.banner().querySelector('.pwa-install-preview').getAttribute('src'))
                .toBe('/pwa-192x192-dark.png')
        } finally {
            page.unmount()
        }
    })

    it('restores the saved icon plate on the next visit', async () => {
        window.localStorage.setItem(VARIANT_KEY, 'dark')
        const page = await mountPrompt('/')
        try {
            expect(headLink('manifest')).toBe('/manifest-dark.webmanifest')
            expect(headLink('apple-touch-icon')).toBe('/apple-touch-icon-dark.png')
        } finally {
            page.unmount()
        }
    })
})
