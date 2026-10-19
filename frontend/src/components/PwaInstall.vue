<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'
import { resolveSupportedLocale } from '@/i18n/utils'

// Proactive PWA install prompt.
// - Chromium (Chrome / Edge / Android): we catch `beforeinstallprompt` and
//   offer a one-tap install; the browser's own banner is suppressed by
//   preventDefault so the site stays in control of wording and timing.
// - iOS / iPadOS Safari: no `beforeinstallprompt` exists, so after the
//   visitor settles on the homepage we show the manual
//   "Share -> Add to Home Screen" guide instead.
// Dismissing hides the prompt for a few days; an installed app never sees it.
//
// Icon choice: the installed icon is a snapshot taken by the OS, so the
// visitor can pick a plate style here; the manifest link and the
// apple-touch-icon are swapped before they add it to the home screen.

const { t } = useScopedI18n('components.PwaInstall')
const route = useRoute()

const DISMISS_KEY = 'pwaInstallHideUntil'
const VARIANT_KEY = 'pwaIconVariant'
const HIDE_DAYS = 3

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

const readStorage = (key) => {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

const variant = ref(readStorage(VARIANT_KEY) === 'dark' ? 'dark' : 'light')
const deferredPrompt = ref(null)
const visible = ref(false)
const busy = ref(false)
const showIosGuide = ref(false)
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
    try {
        window.localStorage.setItem(VARIANT_KEY, variant.value)
    } catch {
        // private mode: the choice simply is not remembered
    }
}

const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true

const isIosDevice = computed(() => {
    const ua = window.navigator.userAgent || ''
    return /iPad|iPhone|iPod/.test(ua)
        || (ua.includes('Macintosh') && 'ontouchend' in document)
})

const isHome = computed(() => {
    const segments = (route.path || '/').split('/').filter(Boolean)
    if (segments.length && resolveSupportedLocale(segments[0])) segments.shift()
    return segments.length === 0
})

const hiddenByUser = () => Number(readStorage(DISMISS_KEY) || 0) > Date.now()

const reveal = () => {
    if (isHome.value && !isStandalone() && !hiddenByUser()) visible.value = true
}

const onBeforeInstallPrompt = (event) => {
    event.preventDefault()
    deferredPrompt.value = event
    reveal()
}

const onInstalled = () => {
    visible.value = false
    deferredPrompt.value = null
}

const install = async () => {
    const prompt = deferredPrompt.value
    if (!prompt) {
        showIosGuide.value = true
        return
    }
    busy.value = true
    try {
        prompt.prompt()
        await prompt.userChoice
    } finally {
        busy.value = false
        visible.value = false
        deferredPrompt.value = null
    }
}

const later = () => {
    visible.value = false
    try {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now() + HIDE_DAYS * 864e5))
    } catch {
        // private mode: the prompt simply returns next visit
    }
}

// apply the remembered plate style as early as possible
applyVariant(variant.value)

onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // iOS has no installability signal, so offer the guide once the
    // visitor has settled on the homepage
    if (isIosDevice.value && !isStandalone()) showTimer = setTimeout(reveal, 6000)
})

onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    if (showTimer) clearTimeout(showTimer)
})
</script>

<template>
    <div v-if="visible" class="pwa-install" role="dialog" aria-live="polite">
        <img class="pwa-install-preview" :src="variantConfig.preview" :alt="t('iconStyle')" width="32" height="32" />

        <div class="pwa-install-text">
            <div class="pwa-install-title">{{ t('title') }}</div>
            <div class="pwa-install-desc">{{ t('desc') }}</div>
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
            <n-button size="small" @click="later">{{ t('later') }}</n-button>
            <n-button size="small" type="primary" :loading="busy" @click="install">
                {{ busy ? t('installing') : t('install') }}
            </n-button>
        </div>
    </div>

    <n-modal v-model:show="showIosGuide" preset="card" :title="t('iosTitle')" style="max-width: 460px;">
        <ol class="pwa-install-steps">
            <li>
                <span class="pwa-install-step-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" />
                    </svg>
                </span>
                {{ t('iosStep1') }}
            </li>
            <li>{{ t('iosStep2') }}</li>
            <li>{{ t('iosStep3') }}</li>
        </ol>

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

        <p class="pwa-install-tip">{{ t('iosTip') }}</p>
    </n-modal>
</template>

<style scoped>
/* monochrome, 12px card radius, no red — the site's design system */
.pwa-install {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 900;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: min(94vw, 520px);
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

/* phones: drop the description and let the buttons fall to a second row
   instead of squeezing the title */
@media (max-width: 640px) {
    .pwa-install {
        bottom: 96px;
        flex-wrap: wrap;
        width: auto;
        left: 12px;
        right: 12px;
        transform: none;
        max-width: none;
    }

    .pwa-install-desc {
        display: none;
    }

    .pwa-install-actions {
        margin-left: auto;
    }
}
</style>
