<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'
import { resolveSupportedLocale } from '@/i18n/utils'

// Proactive PWA install prompt.
//
// When it shows
//   * homepage only, never inside an installed window, never again once the
//     app has been installed, never after the visitor collapsed it in this
//     tab, and at most once per calendar day — that daily cap is the "one
//     per session / per day" limit, so on a phone the card never comes back
//     the same day either.
//   * every browser auto-shows it: Chromium fires `beforeinstallprompt`
//     (one-tap install, we preventDefault so the site keeps control of the
//     wording), while iOS / Android / Firefox / desktop Safari get it from a
//     timer and, on click, a step-by-step guide that matches their browser.
//
// "收起" (collapse) means "not in this tab, not today" — a fresh visit
// tomorrow brings the card back, which is why the button is not called
// "never show again".
//
// Icon choice: the installed icon is a snapshot taken by the OS, so the
// visitor picks a plate style here; the manifest link and the
// apple-touch-icon are swapped before the app is added to the home screen.

const { t } = useScopedI18n('components.PwaInstall')
const route = useRoute()

const COLLAPSE_KEY = 'pwaInstallCollapsed' // sessionStorage — this tab only
const AUTO_SHOWN_KEY = 'pwaInstallAutoShownOn' // localStorage — 'YYYY-MM-DD'
const INSTALLED_KEY = 'pwaInstallInstalled' // localStorage — permanent
const VARIANT_KEY = 'pwaIconVariant'

const AUTO_DELAY_MS = 1200 // fallback for browsers that never fire the event
const IOS_AUTO_DELAY_MS = 6000 // iOS has no install event at all
// Firefox / desktop Safari cannot install web apps. They still get the card
// (the guide explains what to use instead); flip to false to leave them alone.
const AUTO_SHOW_UNSUPPORTED = true

const VARIANTS = {
    light: {
        manifest: '/manifest.webmanifest',
        appleTouchIcon: '/apple-touch-icon.png',
        preview: '/pwa-192x192.png',
    },
    dark: {
        manifest: '/manifest-dark.webmanifest',
        appleTouchIcon: '/apple-touch-icon-dark.png',
        preview: '/pwa-192x192-dark.png',
    },
}

const readLocal = (key) => {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

const writeLocal = (key, value) => {
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // private mode: the prompt simply returns next visit
    }
}

const readSession = (key) => {
    try {
        return window.sessionStorage.getItem(key)
    } catch {
        return null
    }
}

const writeSession = (key, value) => {
    try {
        window.sessionStorage.setItem(key, value)
    } catch {
        // private mode: only the daily cap applies
    }
}

// local calendar day, not UTC, so the cap flips at the visitor's midnight
const today = () => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const variant = ref(readLocal(VARIANT_KEY) === 'dark' ? 'dark' : 'light')
const deferredPrompt = ref(null)
const visible = ref(false)
const busy = ref(false)
const showGuide = ref(false)
let showTimer = null

const variantConfig = computed(() => VARIANTS[variant.value] || VARIANTS.light)

// The installed icon is read from the manifest (Android / desktop) and from
// apple-touch-icon (iOS) at add time, so swapping them is all it takes.
const applyVariant = (next) => {
    const config = VARIANTS[next] || VARIANTS.light
    const manifestLink = document.head.querySelector('link[rel="manifest"]')
    if (manifestLink) manifestLink.setAttribute('href', config.manifest)
    const appleTouchIcon = document.head.querySelector('link[rel="apple-touch-icon"]')
    if (appleTouchIcon) appleTouchIcon.setAttribute('href', config.appleTouchIcon)
}

const setVariant = (next) => {
    variant.value = next === 'dark' ? 'dark' : 'light'
    applyVariant(variant.value)
    writeLocal(VARIANT_KEY, variant.value)
}

const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true

const isIosDevice = computed(() => {
    const ua = window.navigator.userAgent || ''
    return /iPad|iPhone|iPod/.test(ua)
        || (ua.includes('Macintosh') && 'ontouchend' in document)
})

const platform = computed(() => {
    if (isIosDevice.value) return 'ios'
    const ua = window.navigator.userAgent || ''
    if (/Android/.test(ua)) return 'android'
    if (/Chrome\/\d|Chromium\/\d|Edg[A-Z]?\//.test(ua) && !/Firefox\//.test(ua)) return 'desktop'
    return 'unsupported'
})

// the card copy follows the browser, the guide explains what that browser needs
const description = computed(() => {
    if (platform.value === 'ios') return t('descIos')
    if (platform.value === 'desktop') return t('descDesktop')
    if (platform.value === 'unsupported') return t('descUnsupported')
    return t('desc')
})

const guideTitle = computed(() => (platform.value === 'ios' ? t('iosTitle') : t('guideTitle')))

const guideSteps = computed(() => {
    if (platform.value === 'ios') return [t('iosStep1'), t('iosStep2'), t('iosStep3')]
    if (platform.value === 'android') return [t('androidStep1'), t('androidStep2'), t('androidStep3')]
    if (platform.value === 'desktop') return [t('desktopStep1'), t('desktopStep2'), t('desktopStep3')]
    return []
})

const isHome = computed(() => {
    const segments = (route.path || '/').split('/').filter(Boolean)
    if (segments.length && resolveSupportedLocale(segments[0])) segments.shift()
    return segments.length === 0
})

const collapsedInThisTab = () => readSession(COLLAPSE_KEY) === '1'
const shownToday = () => readLocal(AUTO_SHOWN_KEY) === today()
const alreadyInstalled = () => isStandalone() || readLocal(INSTALLED_KEY) === '1'

const mayAutoShow = () =>
    isHome.value
    && !alreadyInstalled()
    && !collapsedInThisTab()
    && !shownToday()
    && (AUTO_SHOW_UNSUPPORTED || platform.value !== 'unsupported')

// Revealing is what costs the daily quota: once the card has been on screen
// today, neither the browser event nor the fallback timer can bring it back.
const reveal = () => {
    if (!mayAutoShow()) return
    visible.value = true
    writeLocal(AUTO_SHOWN_KEY, today())
}

const onBeforeInstallPrompt = (event) => {
    event.preventDefault()
    deferredPrompt.value = event
    reveal()
}

const onInstalled = () => {
    writeLocal(INSTALLED_KEY, '1')
    visible.value = false
    deferredPrompt.value = null
}

const install = async () => {
    if (!deferredPrompt.value) {
        // no one-tap install available in this browser: show the how-to
        showGuide.value = true
        return
    }
    busy.value = true
    const prompt = deferredPrompt.value
    try {
        prompt.prompt()
        await prompt.userChoice
    } finally {
        busy.value = false
        visible.value = false
        deferredPrompt.value = null
    }
}

// "收起": gone for this tab (and, thanks to the daily cap, for today).
// A fresh visit brings the prompt back — no permanent opt-out here.
const collapse = () => {
    visible.value = false
    writeSession(COLLAPSE_KEY, '1')
}

// apply the remembered plate style as early as possible
applyVariant(variant.value)

onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (!mayAutoShow()) return
    const delay = platform.value === 'ios' ? IOS_AUTO_DELAY_MS : AUTO_DELAY_MS
    showTimer = setTimeout(reveal, delay)
})

onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    if (showTimer) clearTimeout(showTimer)
})
</script>

<template>
    <Transition name="pwa-slide">
        <div v-if="visible" class="pwa-install" role="dialog" aria-live="polite" :aria-label="t('title')">
            <img class="pwa-install-preview" :src="variantConfig.preview" :alt="t('iconStyle')" width="32"
                height="32" />

            <div class="pwa-install-text">
                <div class="pwa-install-title">{{ t('title') }}</div>
                <div class="pwa-install-desc">{{ description }}</div>
            </div>

            <div class="pwa-install-swatches" role="radiogroup" :aria-label="t('iconStyle')">
                <button type="button" class="pwa-swatch" :class="{ 'is-active': variant === 'light' }"
                    :aria-label="t('iconLight')" :aria-pressed="variant === 'light'" :title="t('iconLight')"
                    @click="setVariant('light')">
                    <img :src="VARIANTS.light.preview" alt="" />
                </button>
                <button type="button" class="pwa-swatch" :class="{ 'is-active': variant === 'dark' }"
                    :aria-label="t('iconDark')" :aria-pressed="variant === 'dark'" :title="t('iconDark')"
                    @click="setVariant('dark')">
                    <img :src="VARIANTS.dark.preview" alt="" />
                </button>
            </div>

            <div class="pwa-install-actions">
                <button type="button" class="pwa-collapse" :title="t('collapseHint')" :aria-label="t('collapseHint')"
                    @click="collapse">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M6 9.5L12 15.5L18 9.5" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
                <n-button size="small" type="primary" :loading="busy" @click="install">
                    <template #icon>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 4v10M12 14l-3.5-3.5M12 14l3.5-3.5" stroke="currentColor" stroke-width="1.8"
                                stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M5 15v2.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor"
                                stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                    </template>
                    {{ busy ? t('installing') : t('install') }}
                </n-button>
            </div>
        </div>
    </Transition>

    <n-modal v-model:show="showGuide" preset="card" :title="guideTitle" style="max-width: 460px;">
        <ol v-if="guideSteps.length" class="pwa-install-steps">
            <li v-for="(step, index) in guideSteps" :key="index">
                <span v-if="index === 0" class="pwa-install-step-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" />
                    </svg>
                </span>
                {{ step }}
            </li>
        </ol>

        <p v-else class="pwa-install-tip pwa-install-tip--first">{{ t('unsupportedText') }}</p>

        <div class="pwa-install-ios-icons">
            <span class="pwa-install-ios-label">{{ t('iconStyle') }}</span>
            <button type="button" class="pwa-ios-option" :class="{ 'is-active': variant === 'light' }"
                @click="setVariant('light')">
                <img :src="VARIANTS.light.preview" alt="" />
                {{ t('iconLight') }}
            </button>
            <button type="button" class="pwa-ios-option" :class="{ 'is-active': variant === 'dark' }"
                @click="setVariant('dark')">
                <img :src="VARIANTS.dark.preview" alt="" />
                {{ t('iconDark') }}
            </button>
        </div>

        <p v-if="platform === 'ios'" class="pwa-install-tip">{{ t('iosTip') }}</p>

        <div class="pwa-install-guide-foot">
            <n-button size="small" @click="showGuide = false">{{ t('gotIt') }}</n-button>
        </div>
    </n-modal>
</template>

<style scoped>
/* monochrome, 12px card radius, no red — the site's design system */
.pwa-install {
    position: fixed;
    /* centred with auto margins instead of translateX(-50%) so the enter/leave
       transition is free to own `transform` */
    left: 0;
    right: 0;
    bottom: 16px;
    margin: 0 auto;
    width: max-content;
    max-width: min(94vw, 520px);
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 12px;
    background: #fff;
    color: #1a1a1a;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
}

html.dark .pwa-install {
    background: #18181c;
    color: #eee;
    border-color: rgba(238, 238, 238, 0.25);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

/* "收起" lifts the card away and it slides back on the next visit */
.pwa-slide-enter-active {
    transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.pwa-slide-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.pwa-slide-enter-from,
.pwa-slide-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {

    /* No animation — and, just as important, no waiting on a frame before the
       card becomes visible (rAF is paused in hidden tabs, which would leave
       the card stuck at opacity 0 until the tab is looked at). */
    .pwa-slide-enter-from,
    .pwa-slide-leave-to {
        opacity: 1;
        transform: none;
    }

    .pwa-slide-enter-active,
    .pwa-slide-leave-active {
        transition: none;
    }
}

.pwa-install-preview {
    flex: 0 0 auto;
    display: block;
    width: 32px;
    height: 32px;
    border-radius: 8px;
}

.pwa-install-text {
    flex: 1 1 auto;
    /* a floor keeps the title on one line instead of stacking characters */
    min-width: 7.5em;
    text-align: left;
}

.pwa-install-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
}

.pwa-install-desc {
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.66;
}

.pwa-install-swatches {
    flex: 0 0 auto;
    display: flex;
    gap: 4px;
}

.pwa-swatch {
    display: block;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.pwa-swatch img {
    display: block;
    width: 100%;
    height: 100%;
}

.pwa-swatch.is-active {
    border-color: currentColor;
    box-shadow: 0 0 0 1px currentColor;
}

.pwa-install-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
}

/* icon-only "collapse", matching the swatch chrome */
.pwa-collapse {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: border-color 0.15s, opacity 0.15s;
}

.pwa-collapse:hover {
    border-color: currentColor;
}

.pwa-collapse svg {
    width: 16px;
    height: 16px;
}

.pwa-install-steps {
    margin: 0;
    padding-left: 18px;
    text-align: left;
    line-height: 2;
}

.pwa-install-step-icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    vertical-align: -3px;
    margin-right: 2px;
}

.pwa-install-step-icon svg {
    width: 100%;
    height: 100%;
}

.pwa-install-ios-icons {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
}

.pwa-install-ios-label {
    font-size: 12px;
    opacity: 0.66;
}

.pwa-ios-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 4px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
}

.pwa-ios-option img {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: block;
}

.pwa-ios-option.is-active {
    border-color: currentColor;
    box-shadow: 0 0 0 1px currentColor;
}

.pwa-install-tip {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    opacity: 0.66;
    text-align: left;
}

.pwa-install-tip--first {
    margin-top: 0;
}

.pwa-install-guide-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
}

/* phones: drop the description and let the actions fall to a second row
   instead of squeezing the title */
@media (max-width: 640px) {
    .pwa-install {
        bottom: 96px;
        left: 12px;
        right: 12px;
        margin: 0;
        width: auto;
        max-width: none;
        flex-wrap: wrap;
    }

    .pwa-install-desc {
        display: none;
    }

    .pwa-install-actions {
        margin-left: auto;
    }
}
</style>
