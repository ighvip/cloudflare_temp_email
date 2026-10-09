<script setup>
import {
  darkTheme,
} from 'naive-ui'
import { computed, onMounted, watch, watchEffect } from 'vue'
import { useHead } from '@unhead/vue'
import { useI18n } from 'vue-i18n'
import { useGlobalState } from './store'
import { useIsMobile } from './utils/composables'
import Header from './views/Header.vue';
import Footer from './views/Footer.vue';
import { api } from './api'
import { getNaiveLocaleConfig } from './i18n/naive-locale'
import { DEFAULT_LOCALE, isSupportedLocale, siteDefaultLocale } from './i18n/utils'
import { APP_CONFIG } from './config'

const {
  isDark, loading, useSideMargin, telegramApp, isTelegram
} = useGlobalState()
const adClient = APP_CONFIG.GOOGLE_AD_CLIENT;
const adSlot = APP_CONFIG.GOOGLE_AD_SLOT;
const { locale } = useI18n({ useScope: 'global' });
const theme = computed(() => isDark.value ? darkTheme : null)

// ---- 问题15: one monochrome design system for every page ----
// naive's green/blue/orange defaults are replaced once, here: black
// primary (inverted white in dark theme), gray secondary accents and
// #e5484d as the site's only alert color. Cards and dialogs keep the
// homepage's 12px corner radius; buttons and form controls (and every
// other control keyed off common.borderRadius) share the site's 6px.
const lightThemeOverrides = {
    common: {
        borderRadius: '6px',
        primaryColor: '#1a1a1a',
        primaryColorHover: '#333333',
        primaryColorPressed: '#000000',
        primaryColorSuppl: '#333333',
        infoColor: '#666666',
        infoColorHover: '#777777',
        infoColorPressed: '#555555',
        infoColorSuppl: '#777777',
        warningColor: '#666666',
        warningColorHover: '#777777',
        warningColorPressed: '#555555',
        warningColorSuppl: '#777777',
        successColor: '#1a1a1a',
        successColorHover: '#333333',
        successColorPressed: '#000000',
        successColorSuppl: '#333333',
        errorColor: '#e5484d',
        errorColorHover: '#f06469',
        errorColorPressed: '#c93a40',
        errorColorSuppl: '#f06469',
    },
    Card: { borderRadius: '12px' },
    Dialog: { borderRadius: '12px' },
}

const darkThemeOverrides = {
    common: {
        borderRadius: '6px',
        primaryColor: '#eeeeee',
        primaryColorHover: '#dddddd',
        primaryColorPressed: '#cccccc',
        primaryColorSuppl: '#dddddd',
        infoColor: '#9a9a9a',
        infoColorHover: '#aaaaaa',
        infoColorPressed: '#888888',
        infoColorSuppl: '#aaaaaa',
        warningColor: '#9a9a9a',
        warningColorHover: '#aaaaaa',
        warningColorPressed: '#888888',
        warningColorSuppl: '#aaaaaa',
        successColor: '#eeeeee',
        successColorHover: '#dddddd',
        successColorPressed: '#cccccc',
        successColorSuppl: '#dddddd',
        errorColor: '#e5484d',
        errorColorHover: '#f06469',
        errorColorPressed: '#c93a40',
        errorColorSuppl: '#f06469',
    },
    Card: { borderRadius: '12px' },
    Dialog: { borderRadius: '12px' },
}

const themeOverrides = computed(() => isDark.value ? darkThemeOverrides : lightThemeOverrides)
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const isMobile = useIsMobile()
const showSideMargin = computed(() => !isMobile.value && useSideMargin.value);
const showAd = computed(() => !isMobile.value && adClient && adSlot);
const gridMaxCols = computed(() => showAd.value ? 8 : 12);

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
})

// open settings (and with them the admin default language) arrive after the
// router has resolved the initial locale, so re-apply it once it lands.
// A route with an explicit /:lang/ prefix or a visitor-chosen language wins.
watch(siteDefaultLocale, () => {
  if (!siteDefaultLocale.value) return
  const pathLocale = window.location.pathname.split('/')[1]
  if (pathLocale && isSupportedLocale(pathLocale)) return
  const stored = window.localStorage.getItem('preferredLocale')
  if (stored && isSupportedLocale(stored)) return
  locale.value = siteDefaultLocale.value
}, { immediate: true })

if (showAd.value) {
  useHead({
    script: [{
      src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`,
      async: true,
      crossorigin: 'anonymous',
    }],
  })
}

onMounted(async () => {
  try {
    await api.getUserSettings();
  } catch (error) {
    console.error(error);
  }

  const token = APP_CONFIG.CF_WEB_ANALY_TOKEN;

  const exist = document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]') !== null
  if (token && !exist) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.dataset.cfBeacon = `{ token: ${token} }`;
    document.body.appendChild(script);
  }

  // check if google ad is enabled
  if (showAd.value) {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }


  // check if telegram is enabled
  const enableTelegram = APP_CONFIG.IS_TELEGRAM;
  if (
    (typeof enableTelegram === 'boolean' && enableTelegram === true)
    ||
    (typeof enableTelegram === 'string' && enableTelegram === 'true')
  ) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
    telegramApp.value = window.Telegram?.WebApp || {};
    isTelegram.value = !!window.Telegram?.WebApp?.initData;
  }
});
</script>

<template>
  <n-config-provider :locale="localeConfig.locale" :date-locale="localeConfig.dateLocale" :theme="theme"
    :theme-overrides="themeOverrides">
    <n-global-style />
    <n-spin description="loading..." :show="loading">
      <n-notification-provider container-style="margin-top: 60px;">
        <n-message-provider container-style="margin-top: 20px;">
          <n-grid x-gap="12" :cols="gridMaxCols">
            <n-gi v-if="showSideMargin" span="1">
              <div class="side" v-if="showAd">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </div>
            </n-gi>
            <n-gi :span="!showSideMargin ? gridMaxCols : (gridMaxCols - 2)">
              <div class="main">
                <n-space vertical>
                  <n-layout style="flex: 1;">
                    <Header />
                    <router-view></router-view>
                  </n-layout>
                  <Footer />
                </n-space>
              </div>
            </n-gi>
            <n-gi v-if="showSideMargin" span="1">
              <div class="side" v-if="showAd">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </div>
            </n-gi>
          </n-grid>
          <n-back-top />
        </n-message-provider>
      </n-notification-provider>
    </n-spin>
  </n-config-provider>
</template>


<style>
.n-switch {
  margin-left: 10px;
  margin-right: 10px;
}

/* ---- 问题15: the homepage's monochrome card tabs, now site-wide ----
   naive only flips the active label color (its own background is
   transparent); these rules give card tabs the site's monochrome look.
   Selectors scope to the card-type NAV (not the whole .n-tabs root):
   the admin page nests bar-type sub-menus inside the L1 card tabs, and
   a root-scoped descendant selector used to repaint those nested L2
   tabs as solid black/grey blocks too. The #app prefix keeps these
   above naive's deep BEM chains. Values mirror views/Index.vue. */
#app .n-tabs-nav--card-type .n-tabs-tab {
  color: inherit;
  background-color: rgba(128, 128, 128, 0.07);
  border-color: rgba(128, 128, 128, 0.20);
}

#app .n-tabs-nav--card-type .n-tabs-tab:not(.n-tabs-tab--active):hover {
  background-color: rgba(128, 128, 128, 0.14);
}

/* active = white card + black outline (replaces the solid black block) */
#app .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active,
#app .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active:hover {
  color: #1a1a1a;
  background-color: #fff;
  border-color: #1a1a1a;
}

html.dark #app .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active,
html.dark #app .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active:hover {
  color: #111;
  background-color: #eee;
  border-color: #111;
}

/* prefix/suffix (admin logout button, homepage "simple mode" button)
   were once pinned absolutely to the row edges for perfect centering —
   but then they OVERLAPPED the tab strip whenever the group reached the
   edges (logout covering 关于, simple-mode covering 收件箱). Reverted to
   naive's in-flow layout: they reserve their own width, can never cover
   a tab, and the group centers in the remaining space (a few px of
   skew, invisible in practice). */

/* ---- 问题16: site-wide button language — transparent fill + thin
   outline + 6px corners (radius comes from common.borderRadius above).
   naive paints bg/text from --n-color/--n-text-color on the root and
   the outline from --n-border on the .n-button__border overlay, so
   overriding the custom properties restyles every shape (solid /
   secondary / tertiary / quaternary) and every state (hover, pressed,
   focus, disabled) at once. !important beats the inline vars naive
   writes on each button; [style*="--n-border: none"] excludes naive
   `text` buttons (header nav, mail-list pager …) which stay borderless
   by design. NOT scoped to #app: modals, dialogs and dropdown menus
   teleport to <body>, and their buttons must follow the same rules. */
.n-button:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  /* normal: grey outline + dark grey label, soft tint on hover */
  --n-color: transparent !important;
  --n-color-hover: rgba(128, 128, 128, 0.10) !important;
  --n-color-pressed: rgba(128, 128, 128, 0.16) !important;
  --n-color-focus: rgba(128, 128, 128, 0.10) !important;
  --n-color-disabled: transparent !important;
  --n-border: 1px solid rgba(128, 128, 128, 0.45) !important;
  --n-border-hover: 1px solid rgba(128, 128, 128, 0.75) !important;
  --n-border-pressed: 1px solid rgba(128, 128, 128, 0.75) !important;
  --n-border-focus: 1px solid #1a1a1a !important;
  --n-border-disabled: 1px solid rgba(128, 128, 128, 0.30) !important;
  --n-text-color: #333639 !important;
  --n-text-color-hover: #1a1a1a !important;
  --n-text-color-pressed: #1a1a1a !important;
  --n-text-color-focus: #1a1a1a !important;
  --n-text-color-disabled: rgba(128, 128, 128, 0.85) !important;
}

/* primary: black outline, bold label, hover inverts to solid black
   with white text */
.n-button--primary-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color-hover: #1a1a1a !important;
  --n-color-pressed: #000000 !important;
  --n-color-focus: #1a1a1a !important;
  --n-border: 1px solid #1a1a1a !important;
  --n-border-hover: 1px solid #1a1a1a !important;
  --n-border-pressed: 1px solid #000000 !important;
  --n-border-focus: 1px solid #1a1a1a !important;
  --n-text-color: #1a1a1a !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
  font-weight: 600;
}

/* success mirrors the black accent (site successColor is #1a1a1a) */
.n-button--success-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color-hover: #1a1a1a !important;
  --n-color-pressed: #000000 !important;
  --n-color-focus: #1a1a1a !important;
  --n-border: 1px solid #1a1a1a !important;
  --n-border-hover: 1px solid #1a1a1a !important;
  --n-border-pressed: 1px solid #000000 !important;
  --n-border-focus: 1px solid #1a1a1a !important;
  --n-text-color: #1a1a1a !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
  font-weight: 600;
}

/* danger: the site's only red — outline + label, hover fills red */
.n-button--error-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color-hover: #e5484d !important;
  --n-color-pressed: #c93a40 !important;
  --n-color-focus: #e5484d !important;
  --n-border: 1px solid #e5484d !important;
  --n-border-hover: 1px solid #e5484d !important;
  --n-border-pressed: 1px solid #c93a40 !important;
  --n-border-focus: 1px solid #e5484d !important;
  --n-text-color: #e5484d !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
}

/* secondary/tertiary buttons never render naive's .n-button__border
   overlay (showBorder = false), so for them the outline is painted on
   the button root itself. naive emits a class ONLY for `secondary`
   (Button.js line 366) — `tertiary` has no marker class at all, so it
   is identified by the exact --n-color tint naive gives it from
   buttonColor2 (verified in the live DOM: rgba(46, 51, 56, .05);
   secondary-default shares that tint and wants the same grey outline,
   so one marker selector covers both). quaternary stays borderless by
   design (its --n-color is #0000). */
.n-button--secondary.n-button--default-type,
.n-button--secondary.n-button--info-type,
.n-button--secondary.n-button--warning-type,
.n-button[style*="--n-color: rgba(46, 51, 56, .05)"] {
  border: 1px solid rgba(128, 128, 128, 0.45) !important;
}

.n-button--secondary.n-button--default-type:hover,
.n-button--secondary.n-button--info-type:hover,
.n-button--secondary.n-button--warning-type:hover,
.n-button[style*="--n-color: rgba(46, 51, 56, .05)"]:hover {
  border-color: rgba(128, 128, 128, 0.75) !important;
}

.n-button--primary-type.n-button--secondary,
.n-button--success-type.n-button--secondary,
.n-button--primary-type[style*="--n-color: rgba(46, 51, 56, .05)"],
.n-button--success-type[style*="--n-color: rgba(46, 51, 56, .05)"],
.n-button--primary-type.n-button--secondary:hover,
.n-button--success-type.n-button--secondary:hover,
.n-button--primary-type[style*="--n-color: rgba(46, 51, 56, .05)"]:hover,
.n-button--success-type[style*="--n-color: rgba(46, 51, 56, .05)"]:hover {
  border: 1px solid #1a1a1a !important;
}

.n-button--error-type.n-button--secondary,
.n-button--error-type.n-button--secondary:hover,
.n-button--error-type[style*="--n-color: rgba(46, 51, 56, .05)"],
.n-button--error-type[style*="--n-color: rgba(46, 51, 56, .05)"]:hover {
  border: 1px solid #e5484d !important;
}

/* warning/info ride the grey accent — the base rule above already
   gives them the plain outlined look, no extra override needed. */

/* dark theme: bright outlines mirror the light rules */
html.dark .n-button:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color: transparent !important;
  --n-color-hover: rgba(238, 238, 238, 0.12) !important;
  --n-color-pressed: rgba(238, 238, 238, 0.18) !important;
  --n-color-focus: rgba(238, 238, 238, 0.12) !important;
  --n-color-disabled: transparent !important;
  --n-border: 1px solid rgba(238, 238, 238, 0.40) !important;
  --n-border-hover: 1px solid rgba(238, 238, 238, 0.75) !important;
  --n-border-pressed: 1px solid rgba(238, 238, 238, 0.75) !important;
  --n-border-focus: 1px solid #eeeeee !important;
  --n-border-disabled: 1px solid rgba(238, 238, 238, 0.25) !important;
  --n-text-color: #dddddd !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
  --n-text-color-disabled: rgba(238, 238, 238, 0.45) !important;
}

html.dark .n-button--primary-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]),
html.dark .n-button--success-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color-hover: #eeeeee !important;
  --n-color-pressed: #dddddd !important;
  --n-color-focus: #eeeeee !important;
  --n-border: 1px solid #eeeeee !important;
  --n-border-hover: 1px solid #eeeeee !important;
  --n-border-pressed: 1px solid #cccccc !important;
  --n-border-focus: 1px solid #eeeeee !important;
  --n-text-color: #eeeeee !important;
  --n-text-color-hover: #111111 !important;
  --n-text-color-pressed: #111111 !important;
  --n-text-color-focus: #111111 !important;
  font-weight: 600;
}

html.dark .n-button--error-type:not([style*="--n-border: none"]):not([style*="--n-border:none"]) {
  --n-color-hover: #e5484d !important;
  --n-color-pressed: #c93a40 !important;
  --n-color-focus: #e5484d !important;
  --n-border: 1px solid #e5484d !important;
  --n-border-hover: 1px solid #e5484d !important;
  --n-border-pressed: 1px solid #c93a40 !important;
  --n-border-focus: 1px solid #e5484d !important;
  --n-text-color: #e5484d !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
}

/* dark root outlines for secondary/tertiary (mirrors the light set);
   tertiary's dark marker tint is buttonColor2 = rgba(255, 255, 255, .08) */
html.dark .n-button--secondary.n-button--default-type,
html.dark .n-button--secondary.n-button--info-type,
html.dark .n-button--secondary.n-button--warning-type,
html.dark .n-button[style*="--n-color: rgba(255, 255, 255, .08)"] {
  border: 1px solid rgba(238, 238, 238, 0.40) !important;
}

html.dark .n-button--secondary.n-button--default-type:hover,
html.dark .n-button--secondary.n-button--info-type:hover,
html.dark .n-button--secondary.n-button--warning-type:hover,
html.dark .n-button[style*="--n-color: rgba(255, 255, 255, .08)"]:hover {
  border-color: rgba(238, 238, 238, 0.75) !important;
}

html.dark .n-button--primary-type.n-button--secondary,
html.dark .n-button--success-type.n-button--secondary,
html.dark .n-button--primary-type[style*="--n-color: rgba(255, 255, 255, .08)"],
html.dark .n-button--success-type[style*="--n-color: rgba(255, 255, 255, .08)"],
html.dark .n-button--primary-type.n-button--secondary:hover,
html.dark .n-button--success-type.n-button--secondary:hover,
html.dark .n-button--primary-type[style*="--n-color: rgba(255, 255, 255, .08)"]:hover,
html.dark .n-button--success-type[style*="--n-color: rgba(255, 255, 255, .08)"]:hover {
  border: 1px solid #eeeeee !important;
}

html.dark .n-button--error-type.n-button--secondary,
html.dark .n-button--error-type.n-button--secondary:hover,
html.dark .n-button--error-type[style*="--n-color: rgba(255, 255, 255, .08)"],
html.dark .n-button--error-type[style*="--n-color: rgba(255, 255, 255, .08)"]:hover {
  border: 1px solid #e5484d !important;
}

/* the alert bar / active label follow the same monochrome accent
   (line and bar types already inherit primaryColor from the theme) */
#app .n-tabs .n-tabs-nav .n-tabs-bar {
  background-color: #111;
}

html.dark #app .n-tabs .n-tabs-nav .n-tabs-bar {
  background-color: #eee;
}

@media (hover: none) and (pointer: coarse) and (max-width: 1024px) {
  :where(input, textarea, select, [contenteditable="true"]) {
    font-size: 16px !important;
  }

  :where(.n-input, .n-input-number, .n-base-selection, .n-input-group-label) {
    --n-font-size: 16px !important;
  }
}
</style>

<style scoped>
.side {
  height: 100vh;
}

.main {
  min-height: 100vh;
  display: flex;
  text-align: center;
}

.n-grid {
  height: 100%;
}

.n-gi {
  height: 100%;
}

.n-space {
  flex: 1;
  min-width: 0;
}
</style>
