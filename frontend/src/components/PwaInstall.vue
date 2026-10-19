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

const { t } = useScopedI18n('components.PwaInstall')
const route = useRoute()

const DISMISS_KEY = 'pwaInstallHideUntil'
const HIDE_DAYS = 3

const deferredPrompt = ref(null)
const visible = ref(false)
const busy = ref(false)
const showIosGuide = ref(false)
let showTimer = null

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

const hiddenByUser = () => {
    try {
        return Number(window.localStorage.getItem(DISMISS_KEY) || 0) > Date.now()
    } catch {
        return false
    }
}

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
        <span class="pwa-install-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="18" width="52" height="34" rx="6" stroke="currentColor" stroke-width="4" />
                <path d="M9 23 L32 40 L55 23" stroke="currentColor" stroke-width="4" stroke-linecap="round"
                    stroke-linejoin="round" />
                <rect x="22" y="6" width="20" height="16" rx="2" stroke="currentColor" stroke-width="3" />
                <path d="M26 12 H38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <path d="M26 17 H34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
        </span>
        <div class="pwa-install-text">
            <div class="pwa-install-title">{{ t('title') }}</div>
            <div class="pwa-install-desc">{{ t('desc') }}</div>
        </div>
        <n-space :size="8" class="pwa-install-actions">
            <n-button size="small" @click="later">{{ t('later') }}</n-button>
            <n-button size="small" type="primary" :loading="busy" @click="install">
                {{ busy ? t('installing') : t('install') }}
            </n-button>
        </n-space>
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
    gap: 12px;
    max-width: min(92vw, 460px);
    padding: 10px 14px;
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

.pwa-install-icon {
    flex: 0 0 auto;
    display: inline-flex;
    width: 30px;
    height: 30px;
}

.pwa-install-icon svg {
    width: 100%;
    height: 100%;
}

.pwa-install-text {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
}

.pwa-install-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
}

.pwa-install-desc {
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.66;
}

.pwa-install-actions {
    flex: 0 0 auto;
}

.pwa-install-steps {
    margin: 0;
    padding-left: 18px;
    text-align: left;
    line-height: 2;
}

.pwa-install-steps li {
    display: list-item;
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

.pwa-install-tip {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    opacity: 0.66;
    text-align: left;
}

/* keep clear of the back-to-top button on phones */
@media (max-width: 640px) {
    .pwa-install {
        bottom: 96px;
        padding: 8px 12px;
        gap: 8px;
    }

    .pwa-install-desc {
        display: none;
    }
}
</style>
