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
// #e5484d as the site's only alert color. Cards and dialogs also get
// the homepage's 12px corner radius (form controls keep naive's 3px,
// exactly like the homepage's own buttons and inputs).
const lightThemeOverrides = {
    common: {
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
   transparent); the panel's solid black/white segment look needs
   explicit rules. The #app prefix keeps these above naive's deep
   BEM chains. Values mirror views/Index.vue exactly. */
#app .n-tabs.n-tabs--card-type .n-tabs-tab {
  color: inherit;
  background-color: rgba(128, 128, 128, 0.07);
  border-color: rgba(128, 128, 128, 0.20);
}

#app .n-tabs.n-tabs--card-type .n-tabs-tab:not(.n-tabs-tab--active):hover {
  background-color: rgba(128, 128, 128, 0.14);
}

#app .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active,
#app .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active:hover {
  color: #fff;
  background-color: #1a1a1a;
  border-color: #1a1a1a;
}

html.dark #app .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active,
html.dark #app .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active:hover {
  color: #111;
  background-color: #eee;
  border-color: #eee;
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
