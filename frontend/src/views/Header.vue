<script setup>
import { ref, h, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useIsMobile } from '../utils/composables'
import {
    MenuFilled,
    MonitorHeartFilled, HelpOutlineOutlined, KeyboardArrowDownOutlined
} from '@vicons/material'
import { Envelope, Language, User } from '@vicons/fa'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword, getAdminPath } from '../utils'
import { openAdminGate } from '../utils/gate'
import { DEFAULT_LOCALE, isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../i18n/locale-registry'
import Turnstile from '../components/Turnstile.vue'
import SiteLogo from '../components/SiteLogo.vue'
import { NButton, NIcon } from 'naive-ui'

const message = useMessage()
const notification = useNotification()

const {
    isTelegram,
    showAuth, auth, loading, openSettings, preferredLocale, userSettings
} = useGlobalState()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const showMobileMenu = ref(false)
const menuValue = computed(() => {
    if (route.path.includes("user")) return "user";
    if (route.path.includes("admin")) return "admin";
    if (route.path.includes("help")) return "help";
    return "home";
});

// P0-B4 rework: admin entry only exists on the homepage — the one-time
// token can only be minted from a click there
const isHomeRoute = computed(() => {
    const path = route.path;
    if (path === '/') return true;
    // locale-prefixed home: /zh-TW, /zh-TW/ (longer segments like /user,
    // /redeem, /admin never match the 2-letter locale shape)
    return /^\/[a-zA-Z]{2}(-[a-zA-Z]{2,4})?\/?$/.test(path);
});

const adminEntryBusy = ref(false);
const onAdminEntry = async () => {
    if (adminEntryBusy.value) return;
    adminEntryBusy.value = true;
    showMobileMenu.value = false;
    try {
        // mint a 60s one-time token and open the admin page in a new window
        await openAdminGate();
    } catch (error) {
        if (error?.status === 429) {
            message.warning(t('adminEntryRateLimited'));
        } else if (error?.status === 400) {
            message.error(t('adminEntryStale'));
        } else {
            message.error(t('adminEntryFailed'));
        }
    } finally {
        adminEntryBusy.value = false;
    }
};

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(auth.value),
                cf_token: cfToken.value
            })
        });
        location.reload()
    } catch (error) {
        message.error(error.message || "error");
        turnstileRef.value?.refresh?.();
    }
}

const languageOptions = SUPPORTED_LOCALES.map((locale) => ({
    label: getLocaleLabel(locale),
    value: locale,
    key: locale,
}))

const currentLocaleLabel = computed(() => {
    return languageOptions.find(opt => opt.value === locale.value)?.label || locale.value;
});

const { t, locale } = useScopedI18n('views.Header')

const changeLocale = async (lang) => {
    if (!isSupportedLocale(lang)) {
        return;
    }

    const currentFullPath = route.fullPath;
    const targetFullPath = replaceLocaleInFullPath(currentFullPath, lang);

    if (lang === locale.value && targetFullPath === currentFullPath) {
        showMobileMenu.value = false;
        return;
    }

    if (lang === DEFAULT_LOCALE) {
        preferredLocale.value = DEFAULT_LOCALE;
    }

    let localeSwitched = false;
    try {
        await router.push({ path: targetFullPath, force: true });
        localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        if (!localeSwitched) {
            await router.replace({ path: targetFullPath, force: true });
            localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        }
    } catch (error) {
        console.error('Failed to switch locale', error);
    } finally {
        showMobileMenu.value = false;
    }

    if (localeSwitched) preferredLocale.value = lang;
}

// 问题4: no "管理后台" list item any more — the homepage dot is the one
// and only entry point (it mints the one-time token)
const menuOptions = computed(() => [
    {
        label: () => h(NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "home" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    await router.push(getRouterPathWithLang('/', locale.value));
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('mailbox'),
                icon: () => h(NIcon, { component: Envelope })
            }),
        key: "home"
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "user" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    await router.push(getRouterPathWithLang("/user", locale.value));
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('userCenter'),
                icon: () => h(NIcon, { component: User }),
            }
        ),
        key: "user",
        show: !isTelegram.value
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                type: menuValue.value == "help" ? "primary" : "default",
                style: "width: 100%",
                onClick: async () => {
                    await router.push(getRouterPathWithLang("/help", locale.value));
                    showMobileMenu.value = false;
                }
            },
            {
                default: () => t('help'),
                icon: () => h(NIcon, { component: HelpOutlineOutlined }),
            }
        ),
        key: "help",
        show: !isTelegram.value
    },
    {
        label: () => h(
            NButton,
            {
                text: true,
                size: "small",
                style: "width: 100%",
                tag: "a",
                target: "_blank",
                href: openSettings.value?.statusUrl,
            },
            {
                default: () => t('status'),
                icon: () => h(NIcon, { component: MonitorHeartFilled })
            }
        ),
        show: !!openSettings.value?.statusUrl,
        key: "status"
    }
]);

useHead({
    // only resolve once open settings arrive, otherwise keep the static
    // <title> from index.html instead of flashing a fallback string
    title: () => openSettings.value.fetched
        ? (openSettings.value.title || t('title'))
        : undefined,
    meta: [
        { name: "description", content: openSettings.value.description || t('title') },
    ]
});

// 问题4: the logo's click-count easter egg is removed together with the
// menu link — the dot in the title row is the only admin entry left

// ---- header clock ----
// P0-B4: admin entry dot (opens in a new tab, see template)
const adminPath = getAdminPath();
const now = ref(new Date());
const pad2 = (n) => String(n).padStart(2, '0');
// Intl keeps the weekday name correct for every supported locale
const clockDate = computed(() => new Intl.DateTimeFormat(locale.value === 'zh-TW' ? 'zh-TW'
    : locale.value === 'zh' ? 'zh-CN' : locale.value, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
}).format(now.value));
const clockTime = computed(() =>
    `${pad2(now.value.getHours())}:${pad2(now.value.getMinutes())}:${pad2(now.value.getSeconds())}`
);
let clockTimer = null;

// ---- header announcement ----
const announcementIndex = ref(0);
const announcementList = computed(() => (openSettings.value.announcements || []).filter(Boolean));
const currentAnnouncement = computed(() => {
    const list = announcementList.value;
    if (!list.length) return '';
    return list[announcementIndex.value % list.length];
});
const showAllAnnouncements = ref(false);
let announcementTimer = null;

// 问题1: the ticker scrolls right-to-left when the text does not fit —
// the viewport is measured against the non-shrinking text span, and the
// sweep duration follows the measured width (~45px/s)
const announcementViewport = ref(null);
const announcementOverflow = ref(false);
const announcementDuration = ref('12s');
const measureAnnouncement = () => {
    const el = announcementViewport.value;
    if (!el) {
        announcementOverflow.value = false;
        return;
    }
    const overflows = el.scrollWidth > el.clientWidth + 2;
    announcementOverflow.value = overflows;
    if (overflows) {
        const seconds = Math.min(60, Math.max(6, (el.clientWidth + el.scrollWidth) / 45));
        announcementDuration.value = `${seconds.toFixed(1)}s`;
    }
};
watch(currentAnnouncement, async () => {
    await nextTick();
    measureAnnouncement();
});

onMounted(async () => {
    clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
    // 问题1: re-measure the marquee whenever the header width changes
    window.addEventListener('resize', measureAnnouncement);
    // rotate the announcement ticker every 10s when there is more than one
    announcementTimer = setInterval(() => {
        if (announcementList.value.length > 1) {
            announcementIndex.value = (announcementIndex.value + 1) % announcementList.value.length;
        }
    }, 10000);
    await api.getOpenSettings(message, notification);
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
});

onUnmounted(() => {
    if (clockTimer) clearInterval(clockTimer);
    if (announcementTimer) clearInterval(announcementTimer);
    window.removeEventListener('resize', measureAnnouncement);
});
</script>

<template>
    <div>
        <n-page-header>
            <template #title>
                <div class="header-title-row">
                    <!-- logo + brand name + tagline (the only place the brand
                         name appears at full size on the homepage) -->
                    <div class="header-brand">
                        <h3 v-if="openSettings.fetched">{{ openSettings.title || t('title') }}</h3>
                        <h3 v-else>&nbsp;</h3>
                        <div class="header-tagline">{{ t('tagline') }}</div>
                    </div>
                    <!-- P0-B4 rework: inconspicuous 4px dot — homepage-only
                         new-window admin entry (mints a 60s one-time token) -->
                    <a v-if="isHomeRoute" class="header-admin-dot" :href="adminPath"
                        role="button" title="Admin" aria-label="Admin"
                        @click.prevent="onAdminEntry"></a>
                    <div class="header-clock">
                        <div class="header-clock-date">{{ clockDate }}</div>
                        <div class="header-clock-time">{{ clockTime }}</div>
                    </div>
                    <!-- 问题1: bar + ticker travel as one group, so the
                         ticker wraps to its own full-width line on phones -->
                    <div v-if="currentAnnouncement" class="header-announcement-group">
                        <span class="header-announcement-divider" aria-hidden="true"></span>
                        <div class="header-announcement" @click="showAllAnnouncements = true"
                            :title="currentAnnouncement">
                            <span class="header-announcement-tag">{{ t('announcementTag') }}</span>
                            <!-- 问题1: overflow scrolls right-to-left instead of being cut off -->
                            <span ref="announcementViewport" class="header-announcement-viewport">
                                <span class="header-announcement-text"
                                    :class="{ 'is-scrolling': announcementOverflow }"
                                    :style="{ animationDuration: announcementDuration }">{{ currentAnnouncement }}</span>
                            </span>
                            <span v-if="announcementList.length > 1" class="header-announcement-more">
                                {{ t('announcementMore', { count: announcementList.length }) }}
                            </span>
                        </div>
                    </div>
                </div>
            </template>
            <template #avatar>
                <div class="header-logo">
                    <SiteLogo style="margin-left: 10px;" />
                </div>
            </template>
            <template #extra>
                <n-space align="center" class="header-extra">
                    <n-menu v-if="!isMobile" mode="horizontal" :options="menuOptions" responsive />
                    <n-button v-else :text="true" @click="showMobileMenu = !showMobileMenu">
                        <template #icon>
                            <n-icon :component="MenuFilled" />
                        </template>
                        {{ t('menu') }}
                    </n-button>
                    <n-dropdown v-if="!isMobile" :options="languageOptions" @select="changeLocale" trigger="click" class="header-locale-dropdown">
                        <n-button text size="small" class="header-locale-button" style="padding: 0 10px;">
                            <template #icon>
                                <n-icon :component="Language" />
                            </template>
                            {{ currentLocaleLabel }}
                            <n-icon :component="KeyboardArrowDownOutlined" style="margin-left: 4px;" />
                        </n-button>
                    </n-dropdown>
                </n-space>
            </template>
        </n-page-header>
        <n-drawer v-model:show="showMobileMenu" placement="top" style="height: 100vh;">
            <n-drawer-content :title="t('menu')" closable>
                <n-menu :options="menuOptions" />
                <div class="mobile-menu-actions">
                    <n-dropdown :options="languageOptions" @select="changeLocale" trigger="click" class="header-locale-dropdown">
                        <button type="button" class="mobile-menu-utility-button">
                            <n-icon :component="Language" />
                            <span class="mobile-menu-action-label">{{ currentLocaleLabel }}</span>
                            <n-icon :component="KeyboardArrowDownOutlined" class="mobile-menu-action-arrow" />
                        </button>
                    </n-dropdown>
                </div>
            </n-drawer-content>
        </n-drawer>
        <n-modal v-model:show="showAllAnnouncements" preset="card" :title="t('announcementTitle')"
            style="max-width: 560px;">
            <n-list v-if="announcementList.length" :show-divider="false">
                <n-list-item v-for="(item, idx) in announcementList" :key="idx">
                    <span class="announcement-modal-item">{{ item }}</span>
                </n-list-item>
            </n-list>
            <n-empty v-else :description="t('announcementEmpty')" />
        </n-modal>
        <n-modal v-model:show="showAuth" :closable="false" :closeOnEsc="false" :maskClosable="false" preset="dialog"
            :title="t('accessHeader')">
            <p>{{ t('accessTip') }}</p>
            <n-input v-model:value="auth" type="password" show-password-on="click" @keyup.enter="authFunc" />
            <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
            <template #action>
                <n-button :loading="loading" @click="authFunc" type="primary">
                    {{ t('ok') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
:deep(.n-page-header) {
    align-items: center;
    flex-wrap: nowrap;
}

:deep(.n-page-header__main) {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

/* 问题1: the title row stretches to the menu — the announcement's right
   gap is then exactly the row's 14px gap (naive's 16px title margin is
   overridden deep enough to win) */
:deep(.n-page-header .n-page-header__main .n-page-header__title) {
    flex: 1 1 auto;
    min-width: 0;
    margin-right: 14px;
    overflow: hidden;
}

:deep(.n-page-header__title h3) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:deep(.n-page-header__extra) {
    flex: 0 0 auto;
}

.n-layout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.header-logo {
    display: inline-flex;
    align-items: center;
}

/* P0-B4: 4px admin entry dot between the logo and the clock */
.header-admin-dot {
    width: 4px;
    height: 4px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.55);
    text-decoration: none;
    transition: background-color 0.2s ease, box-shadow 0.2s ease;
}

/* 问题15: monochrome hover (was an off-palette blue glow) */
.header-admin-dot:hover,
.header-admin-dot:focus-visible {
    background: #1a1a1a;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.55);
}

:global(html.dark .header-admin-dot:hover),
:global(html.dark .header-admin-dot:focus-visible) {
    background: #eee;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.55);
}

.header-title-row {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
}

/* the site name must never be squeezed out by the clock / announcement */
.header-title-row h3 {
    flex: 0 0 auto;
}

/* brand name + tagline stack in the top bar (brand appears here only);
   问题1: an 80px floor keeps the site name readable — the ticker takes
   the squeeze instead (it can marquee, the title cannot) */
.header-brand {
    display: flex;
    flex-direction: column;
    min-width: 80px;
}

.header-brand h3 {
    margin: 0;
}

.header-tagline {
    max-width: 340px;
    font-size: 11px;
    line-height: 1.3;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (max-width: 640px) {
    .header-tagline {
        display: none;
    }
}

/* ---- clock ---- */
/* 问题1: only the leading hairline stays — the bar in front of the
   announcement is its own element now (no double rule) */
.header-clock {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    padding: 2px 12px;
    border-left: 1px solid rgba(128, 128, 128, 0.28);
}

.header-clock-date {
    font-size: 11px;
    opacity: 0.65;
    white-space: nowrap;
}

.header-clock-time {
    font-size: 19px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
    white-space: nowrap;
}

/* ---- announcement ---- */
/* 问题1: bar + ticker are one flex item so they wrap together; the
   ticker fills the row, so its right gap is the same adaptive 14px as
   every other gap in the header (the old 460px cap is gone) */
.header-announcement-group {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.header-announcement {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 5px 10px;
    border: 1px solid rgba(240, 160, 32, 0.5);
    border-radius: 8px;
    background: rgba(240, 160, 32, 0.10);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s ease;
}

.header-announcement:hover {
    background: rgba(240, 160, 32, 0.18);
}

/* 问题1: the vertical bar in front of the ticker */
.header-announcement-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 16px;
    background: rgba(128, 128, 128, 0.45);
}

.header-announcement-tag {
    flex: 0 0 auto;
    padding: 0 6px;
    border-radius: 4px;
    background: #f0a020;
    color: #fff;
    font-size: 11px;
    line-height: 18px;
    font-weight: 600;
}

/* 问题1: between 768px and 1100px the full menu owns the header — the
   decorative clock and the ticker's label/counter step aside so the
   site name and the announcement text both stay readable */

/* 问题1: the viewport clips, the text never shrinks — overflowing copy
   sweeps right-to-left at a readable pace, and pauses on hover */
.header-announcement-viewport {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
}

.header-announcement-text {
    flex: 0 0 auto;
    white-space: nowrap;
}

.header-announcement-text.is-scrolling {
    animation: header-announcement-marquee linear infinite;
}

.header-announcement:hover .header-announcement-text.is-scrolling {
    animation-play-state: paused;
}

@keyframes header-announcement-marquee {
    0% {
        transform: translateX(100%);
    }

    100% {
        transform: translateX(-100%);
    }
}

.header-announcement-more {
    flex: 0 0 auto;
    opacity: 0.7;
    font-size: 11px;
}

.announcement-modal-item {
    line-height: 1.7;
    word-break: break-word;
}

/* 问题1: the ticker is shown on every viewport (was hidden <=1100px) */

/* 问题1: between 768px and 1100px the full menu owns the header — the
   decorative clock and the ticker's label/counter step aside so the
   site name and the announcement text both stay readable */
@media (max-width: 1100px) {
    .header-clock {
        display: none;
    }

    .header-announcement-tag,
    .header-announcement-more {
        display: none;
    }
}

@media (max-width: 640px) {
    /* 问题1: the ticker gets its own full-width line on phones instead
       of being squeezed (or hidden, as before) */
    .header-title-row {
        flex-wrap: wrap;
        row-gap: 10px;
    }
}

.header-extra {
    align-items: center;
    flex-wrap: nowrap;
}

.header-extra :deep(.n-space-item) {
    display: flex;
    align-items: center;
}

.header-locale-button {
    display: inline-flex;
    align-items: center;
}

.header-locale-button :deep(.n-button__content) {
    display: inline-flex;
    align-items: center;
}

.header-locale-button :deep(.n-icon) {
    display: inline-flex;
    align-items: center;
}

.header-version-button {
    display: inline-flex;
    align-items: center;
}

.header-version-button :deep(.n-button__content) {
    display: inline-flex;
    align-items: center;
}

.mobile-menu-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(128, 128, 128, 0.16);
}

.mobile-menu-utility-button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    width: 100%;
    min-width: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-decoration: none;
    opacity: 0.82;
    cursor: pointer;
}

.mobile-menu-action-label {
    margin: 0 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-menu-action-arrow {
    flex: 0 0 auto;
    margin-left: 2px;
}

.n-alert {
    margin-top: 10px;
    margin-bottom: 10px;
    text-align: center;
}

.n-card {
    margin-top: 10px;
}

.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: 20px;
}

.n-form .n-button {
    margin-top: 10px;
}

@media (max-width: 640px) {
    :deep(.n-page-header) {
        padding: 10px 12px;
    }

    :deep(.n-page-header__title) {
        min-width: 0;
    }

    :deep(.n-page-header__title h3) {
        max-width: calc(100vw - 104px);
        margin: 0;
        font-size: clamp(16px, 5vw, 20px);
        line-height: 1.2;
    }
}

</style>
