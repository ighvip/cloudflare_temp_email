<script setup>
import { defineAsyncComponent, onMounted, watch, computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRoute } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { useIsMobile } from '../utils/composables'
import { getRouterPathWithLang } from '../utils'
import { FullscreenExitOutlined } from '@vicons/material'

import AddressBar from './index/AddressBar.vue';
import MailBox from '../components/MailBox.vue';
import SendBox from '../components/SendBox.vue';
import AutoReply from './index/AutoReply.vue';
import AccountSettings from './index/AccountSettings.vue';
import Appearance from './common/Appearance.vue';
import Webhook from './index/Webhook.vue';
import Attachment from './index/Attachment.vue';
import About from './common/About.vue';
import SimpleIndex from './index/SimpleIndex.vue';
// P0 redesign: left/right split homepage
import HeroFeatures from './index/HeroFeatures.vue';
import StatsCard from './index/StatsCard.vue';
import UptimeCard from './index/UptimeCard.vue';
import ActivityCard from './index/ActivityCard.vue';

const {
  loading, settings, openSettings, indexTab, globalTabplacement, useSimpleIndex,
  userJwt, isTelegram,
} = useGlobalState()
const message = useMessage()
const route = useRoute()
const isMobile = useIsMobile()

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t, locale } = useScopedI18n('views.Index')
// the intro copy lives in the HomeInfo namespace — it moves from the info
// card to the hero subtitle on the redesigned homepage (same source text)
const { t: tHomeInfo } = useScopedI18n('views.index.HomeInfo')
// the FAQ banner links reuse question copy from the help / login namespaces
const { t: tHelp } = useScopedI18n('views.Help')
const { t: tLogin } = useScopedI18n('views.common.Login')

const introText = computed(() =>
  (openSettings.value.siteIntro || '').trim() || tHomeInfo('defaultIntro'))

// the full tutorial / FAQ / troubleshooting lives on its own page now
const helpPath = computed(() => getRouterPathWithLang('/help', locale.value))

// compact 3-step guide inside the action panel (first-run visitors only)
const quickSteps = computed(() => [1, 2, 3].map((n) => ({
  title: t(`qs${n}Title`),
  desc: t(`qs${n}Desc`),
})))

const showQuickStart = computed(() =>
  settings.value.fetched && !settings.value.address && !userJwt.value && !isTelegram.value)

// curated FAQ links jump straight to the matching help section
const faqLinks = computed(() => [
  { text: tHelp('trouble1Q'), hash: '#help-trouble' },
  { text: tHelp('faqExtraQ3'), hash: '#help-faq' },
  { text: tLogin('faqLifetime'), hash: '#help-faq' },
])

const fetchMailData = async (limit, offset) => {
  if (mailIdQuery.value > 0) {
    const singleMail = await api.fetch(`/api/mail/${mailIdQuery.value}`);
    if (singleMail) return { results: [singleMail], count: 1 };
    return { results: [], count: 0 };
  }
  return await api.fetch(`/api/mails?limit=${limit}&offset=${offset}`);
};

const deleteMail = async (curMailId) => {
  await api.fetch(`/api/mails/${curMailId}`, { method: 'DELETE' });
};

const updateMailReadStatus = async (id, isUnread) => {
  await api.fetch(`/api/mails/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ isUnread }),
    showLoading: false
  })
}

const deleteSenboxMail = async (curMailId) => {
  await api.fetch(`/api/sendbox/${curMailId}`, { method: 'DELETE' });
};

const fetchSenboxData = async (limit, offset) => {
  return await api.fetch(`/api/sendbox?limit=${limit}&offset=${offset}`);
};

const saveToS3 = async (mail_id, filename, blob) => {
  try {
    const { url } = await api.fetch(`/api/attachment/put_url`, {
      method: 'POST',
      body: JSON.stringify({ key: `${mail_id}/${filename}` })
    });
    // upload to s3 by formdata
    const formData = new FormData();
    formData.append(filename, blob);
    await fetch(url, {
      method: 'PUT',
      body: formData
    });
    message.success(t('saveToS3Success'));
  } catch (error) {
    console.error(error);
    message.error(error.message || "save to s3 error");
  }
}

const mailBoxKey = ref("")
const mailIdQuery = ref("")
const showMailIdQuery = ref(false)

const queryMail = () => {
  mailBoxKey.value = Date.now();
}

watch(route, () => {
  if (!route.query.mail_id) {
    showMailIdQuery.value = false;
    mailIdQuery.value = "";
    queryMail();
  }
})

onMounted(() => {
  if (route.query.mail_id) {
    showMailIdQuery.value = true;
    mailIdQuery.value = route.query.mail_id;
    queryMail();
  }
})
</script>

<template>
  <div>
    <div v-if="useSimpleIndex">
      <SimpleIndex />
    </div>
    <div v-else class="home-layout">
      <!-- left/right split hero: value headline + proof on the left,
           ALL operations (including the mailbox tabs) live in the right
           panel, which is pinned to the hero height of the left column -->
      <div class="hero">
        <section class="hero-left">
          <div class="hero-head">
            <div class="hero-kicker">
              <span class="kicker-sq" />
              <span class="kicker-text">{{ t('heroKicker') }}</span>
            </div>
            <h1 class="hero-title">
              <span class="seg seg-1">{{ t('heroTitleA') }}</span><span class="seg seg-2">{{ t('heroTitleB') }}</span><span class="seg seg-3">{{ t('heroTitleC') }}</span>
            </h1>
            <p class="hero-sub">{{ introText }}</p>
          </div>

          <HeroFeatures />

          <div class="hero-cards">
            <StatsCard />
            <UptimeCard />
            <ActivityCard />
          </div>
        </section>

        <aside class="hero-right" :class="{ 'has-address': !!settings.address }">
          <!-- one independent operations panel: pills → form → quick start →
               fine print (its own frame, no stretch/void at the bottom) -->
          <div class="action-panel">
            <div class="panel-pills">
              <span class="panel-pill pill-strong">{{ t('pillNoSignup') }}</span>
              <span class="panel-pill pill-outline">{{ t('pillCleanup') }}</span>
              <span class="panel-pill pill-soft">{{ t('pillOpenSource') }}</span>
            </div>

            <AddressBar />

            <!-- all mailbox operations live INSIDE the panel: the right column
                 is one independent operations block, nothing runs below FAQ -->
            <n-tabs v-if="settings.address" type="card" v-model:value="indexTab" :placement="globalTabplacement">
              <template #prefix v-if="!isMobile">
                <n-button @click="useSimpleIndex = true" tertiary size="small">
                  <template #icon>
                    <n-icon>
                      <FullscreenExitOutlined />
                    </n-icon>
                  </template>
                  {{ t('enterSimpleMode') }}
                </n-button>
              </template>
              <n-tab-pane name="mailbox" :tab="t('inbox')">
                <div v-if="showMailIdQuery" style="margin-bottom: 10px;">
                  <n-input-group>
                    <n-input v-model:value="mailIdQuery" />
                    <n-button @click="queryMail" type="primary" tertiary>
                      {{ t('query') }}
                    </n-button>
                  </n-input-group>
                </div>
                <MailBox :key="mailBoxKey" :showEMailTo="false" :showReply="openSettings.enableSendMail" :showSaveS3="openSettings.isS3Enabled"
                  :saveToS3="saveToS3" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
                  :fetchMailData="fetchMailData" :deleteMail="deleteMail" :showFilterInput="true"
                  :enableMailReadStatus="openSettings.enableMailReadStatus" :updateMailReadStatus="updateMailReadStatus"
                  :narrow="true" />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.enableSendMail" name="sendbox" :tab="t('sendbox')">
                <SendBox :fetchMailData="fetchSenboxData" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
                  :deleteMail="deleteSenboxMail" />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.enableSendMail" name="sendmail" :tab="t('sendmail')">
                <SendMail />
              </n-tab-pane>
              <n-tab-pane name="accountSettings" :tab="t('mailboxSettings')">
                <AccountSettings />
              </n-tab-pane>
              <n-tab-pane name="appearance" :tab="t('appearance')">
                <Appearance :showUseSimpleIndex="true" />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.enableAutoReply" name="auto_reply" :tab="t('auto_reply')">
                <AutoReply />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.enableWebhook" name="webhook" :tab="t('webhookSettings')">
                <Webhook />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.isS3Enabled" name="s3_attachment" :tab="t('s3Attachment')">
                <Attachment />
              </n-tab-pane>
              <n-tab-pane v-if="openSettings.enableIndexAbout" name="about" :tab="t('about')">
                <About />
              </n-tab-pane>
            </n-tabs>

            <div v-if="showQuickStart" class="panel-qs">
              <div class="panel-qs-label">{{ t('quickStartLabel') }}</div>
              <div v-for="(step, stepIndex) in quickSteps" :key="stepIndex" class="qs-row">
                <span class="qs-index">{{ stepIndex + 1 }}</span>
                <span class="qs-text"><b>{{ step.title }}</b>{{ step.desc }}</span>
              </div>
            </div>

            <div class="panel-fine">
              {{ t('finePrint') }}
            </div>
          </div>
        </aside>
      </div>

      <!-- curated FAQ banner: the LAST content block on the homepage -->
      <div class="faq-banner">
        <span class="faq-banner-title">{{ t('faqBannerTitle') }}</span>
        <div class="faq-banner-links">
          <router-link v-for="(link, linkIndex) in faqLinks" :key="linkIndex" class="faq-banner-link"
            :to="{ path: helpPath, hash: link.hash }">{{ link.text }}</router-link>
        </div>
        <router-link class="faq-banner-cta" :to="helpPath">{{ t('faqBannerMore') }} →</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-layout {
    padding-bottom: 12px;
}

.hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 24px;
    padding: 12px 4px 4px;
}

/* subtle tech-grid backdrop, works in both light and dark themes */
.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(128, 128, 128, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(128, 128, 128, 0.08) 1px, transparent 1px);
    background-size: 34px 34px;
    -webkit-mask-image: radial-gradient(ellipse 90% 80% at 40% 0%, #000 55%, transparent 100%);
    mask-image: radial-gradient(ellipse 90% 80% at 40% 0%, #000 55%, transparent 100%);
    pointer-events: none;
    z-index: 0;
}

.hero-left {
    position: relative;
    z-index: 1;
    min-width: 0;
}

/* right column: ONE independent operations block, pinned to the hero's
   second track. Absolute so the row height is driven by the left column
   alone — the panel bottom always lands on the left column's bottom and
   the FAQ banner stays the last content block on the page. */
.hero-right {
    position: absolute;
    top: 12px;
    right: 4px;
    bottom: 4px;
    width: calc((100% - 32px) / 2.15);
    z-index: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

/* ---- left column ---- */
.hero-head {
    padding: 10px 2px 18px;
}

/* kicker: category label, its square wipes in first */
.hero-kicker {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 14px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2.5px;
    opacity: 0.7;
}

.kicker-sq {
    width: 11px;
    height: 11px;
    flex: 0 0 auto;
    background: currentColor;
    transform-origin: left center;
    animation: hero-wipe 0.4s 0.05s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.kicker-text {
    animation: hero-fade-in 0.5s 0.15s ease both;
}

/* headline: three segments rise in sequence; the last segment gets a
   marker-sweep highlight plus a subtle recurring shimmer */
.hero-title {
    margin: 0;
    font-size: clamp(26px, 3vw, 38px);
    line-height: 1.2;
    letter-spacing: -0.5px;
}

.hero-title .seg {
    display: inline-block;
    animation: hero-fade-up 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.hero-title .seg-1 {
    animation-delay: 0.10s;
}

.hero-title .seg-2 {
    animation-delay: 0.18s;
}

.hero-title .seg-3 {
    position: relative;
    overflow: hidden;
    animation-delay: 0.26s;
}

.seg-3::before {
    content: '';
    position: absolute;
    inset: 6% 0 2%;
    z-index: -1;
    background: rgba(128, 128, 128, 0.32);
    transform: scaleX(0);
    transform-origin: left center;
    animation: hero-wipe 0.45s 0.75s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.seg-3::after {
    content: '';
    position: absolute;
    inset: 6% 0 2%;
    z-index: -1;
    background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.55) 50%, transparent 58%);
    transform: translateX(-130%);
    animation: hero-shimmer 6s 1.6s ease-in-out infinite;
}

.hero-sub {
    margin: 12px 0 0;
    max-width: 46em;
    font-size: 15px;
    line-height: 1.75;
    text-align: left;
    opacity: 0.75;
    animation: hero-sub-in 0.6s 0.55s ease both;
}

@keyframes hero-fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: none; }
}

@keyframes hero-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes hero-wipe {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
}

/* the subtitle keeps its muted 0.75 opacity after the fade */
@keyframes hero-sub-in {
    from { opacity: 0; }
    to { opacity: 0.75; }
}

@keyframes hero-shimmer {
    0% { transform: translateX(-130%); }
    8% { transform: translateX(130%); }
    100% { transform: translateX(130%); }
}

@media (prefers-reduced-motion: reduce) {
    .kicker-sq,
    .kicker-text,
    .hero-title .seg,
    .hero-sub {
        animation: none;
    }

    .seg-3::before {
        animation: none;
        transform: scaleX(1);
    }

    .seg-3::after {
        animation: none;
        display: none;
    }
}

/* stats + uptime cards sit side by side, the live activity card spans
   both columns below — two equal-height rows so all three match */
.hero-cards {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
    align-items: stretch;
}

/* the activity card is its own component root — parent scope attr applies */
.activity-card {
    grid-column: 1 / -1;
}

@media (max-width: 992px) {
    .hero-cards {
        grid-template-columns: 1fr;
        grid-template-rows: repeat(3, minmax(0, 1fr));
    }
}

/* ---- right column: independent operations panel ---- */
.action-panel {
    position: relative;
    /* safety bound: panel content can never spill past the hero (e.g. the
       address-management list) and overlap the FAQ banner — it scrolls */
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 14px;
    background: rgba(128, 128, 128, 0.04);
    text-align: left;
}

/* with an address the panel fills the hero height and the tab region
   absorbs the leftover space (single internal scrollbar per tab) */
.hero-right.has-address .action-panel {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.hero-right.has-address .action-panel :deep(.n-tabs) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.hero-right.has-address .action-panel :deep(.n-tabs-nav) {
    flex: 0 0 auto;
}

/* naive renders the active pane as a direct child of .n-tabs — it absorbs
   the leftover panel height and becomes the single scroll container */
.hero-right.has-address .action-panel :deep(.n-tab-pane) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
}

.panel-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
}

.panel-pill {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid transparent;
}

/* three grayscale levels: solid / outline / soft fill */
.pill-strong {
    color: #fff;
    background: #1a1a1a;
    border-color: #1a1a1a;
}

.pill-outline {
    color: inherit;
    background: transparent;
    border-color: rgba(128, 128, 128, 0.5);
}

.pill-soft {
    color: inherit;
    background: rgba(128, 128, 128, 0.12);
}

:global(html.dark .pill-strong) {
    color: #111;
    background: #eee;
    border-color: #eee;
}

/* AddressBar already centers its own card — no double frame in the panel */
.action-panel :deep(.center) {
    margin: 0;
}

.action-panel :deep(.n-card) {
    margin-top: 0;
    width: 100%;
    max-width: 100% !important;
    background-color: transparent;
}

.action-panel :deep(.n-alert) {
    margin-top: 0;
}

/* the panel owns the monochrome accent — the blue info / orange warning
   alerts inside it flatten to the site's neutral gray tint */
.action-panel :deep(.n-alert--info-type),
.action-panel :deep(.n-alert--warning-type) {
    background-color: rgba(128, 128, 128, 0.07);
    color: inherit;
}

/* tabs: active label + sliding bar go black (white in dark theme) */
.action-panel :deep(.n-tabs-tab.n-tabs-tab--active) {
    color: #111;
}

.action-panel :deep(.n-tabs-bar) {
    background-color: #111;
}

:global(html.dark .action-panel .n-tabs-tab.n-tabs-tab--active) {
    color: #eee;
}

:global(html.dark .action-panel .n-tabs-bar) {
    background-color: #eee;
}

/* card-type tabs (the mailbox operations inside the panel): monochrome
   segment look — active = solid black/white, inactive = gray tint.
   This also removes naive's green accent from the active tab. NOTE: naive
   uses deep BEM chains like `.n-tabs .n-tabs-nav.n-tabs-nav--card-type .n-tabs-tab...`
   (0,5,0) — selectors here must be at least as deep to win. */
.action-panel :deep(.n-tabs.n-tabs--card-type .n-tabs-tab) {
    color: inherit;
    background-color: rgba(128, 128, 128, 0.07);
    border-color: rgba(128, 128, 128, 0.20);
}

.action-panel :deep(.n-tabs.n-tabs--card-type .n-tabs-tab:not(.n-tabs-tab--active):hover) {
    background-color: rgba(128, 128, 128, 0.14);
}

.action-panel :deep(.n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active),
.action-panel :deep(.n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active:hover) {
    color: #fff;
    background-color: #1a1a1a;
    border-color: #1a1a1a;
}

:global(html.dark .action-panel .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active),
:global(html.dark .action-panel .n-tabs.n-tabs--card-type .n-tabs-tab.n-tabs-tab--active:hover) {
    color: #111;
    background-color: #eee;
    border-color: #eee;
}

/* primary action buttons become solid black with white text */
.action-panel :deep(.n-button--primary-type) {
    color: #fff;
    background-color: #1a1a1a;
    border-color: #1a1a1a;
}

.action-panel :deep(.n-button--primary-type:not(:disabled):hover) {
    color: #fff;
    background-color: #333;
    border-color: #333;
}

:global(html.dark .action-panel .n-button--primary-type) {
    color: #111;
    background-color: #eee;
    border-color: #eee;
}

:global(html.dark .action-panel .n-button--primary-type:not(:disabled):hover) {
    color: #111;
    background-color: #ddd;
    border-color: #ddd;
}

/* input focus ring: black instead of the green primary */
.action-panel :deep(.n-input--focus .n-input__state-border) {
    border-color: #111;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.15);
}

:global(html.dark .action-panel .n-input--focus .n-input__state-border) {
    border-color: #eee;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.18);
}

/* the text caret follows the monochrome accent too */
.action-panel :deep(.n-input__input-el) {
    caret-color: #111;
}

:global(html.dark .action-panel .n-input__input-el) {
    caret-color: #eee;
}

/* compact first-run guide: 3 steps, hidden once an address exists */
.panel-qs {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed rgba(128, 128, 128, 0.28);
}

.panel-qs-label {
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
    opacity: 0.55;
}

.qs-row {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 3px 0;
}

.qs-index {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: #1a1a1a;
}

:global(html.dark .qs-index) {
    color: #111;
    background: #eee;
}

.qs-text {
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.55;
    opacity: 0.8;
}

.qs-text b {
    margin-right: 6px;
    font-weight: 700;
}

.panel-fine {
    margin-top: 14px;
    padding-top: 11px;
    border-top: 1px solid rgba(128, 128, 128, 0.14);
    font-size: 12px;
    line-height: 1.7;
    text-align: center;
    opacity: 0.55;
}

/* ---- FAQ banner: the LAST content block on the homepage ---- */
.faq-banner {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 18px;
    margin-top: 18px;
    padding: 13px 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    text-align: left;
}

.faq-banner-title {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    font-size: 13.5px;
    white-space: nowrap;
}

.faq-banner-title::before {
    content: '';
    width: 4px;
    height: 13px;
    border-radius: 2px;
    background: currentColor;
}

.faq-banner-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    flex: 1 1 auto;
    min-width: 0;
}

.faq-banner-link {
    font-size: 13px;
    color: inherit;
    opacity: 0.72;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(128, 128, 128, 0.55);
    transition: opacity 0.15s ease;
}

.faq-banner-link:hover {
    opacity: 1;
    text-decoration-color: currentColor;
}

.faq-banner-cta {
    font-size: 13px;
    font-weight: 600;
    color: inherit;
    white-space: nowrap;
    text-decoration: none;
}

.faq-banner-cta:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* ---- responsive: operations panel first, everything else below ---- */
@media (max-width: 992px) {
    .hero {
        grid-template-columns: 1fr;
        gap: 16px;
    }

    .hero-right {
        position: static;
        width: auto;
        order: -1;
    }

    /* in flow on small screens: cap the tab region so the panel (and the
       page) never outgrows the viewport — content scrolls inside the tab */
    .hero-right.has-address .action-panel :deep(.n-tab-pane) {
        max-height: 72vh;
    }
}
</style>
