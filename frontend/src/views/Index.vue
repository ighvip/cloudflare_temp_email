<script setup>
import { defineAsyncComponent, onMounted, watch, computed, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRoute, useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'

import { useGlobalState } from '../store'
import { api } from '../api'
import { useIsMobile } from '../utils/composables'
import { getRouterPathWithLang } from '../utils'
import { resolveSupportedLocale } from '../i18n/utils'
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

const {
  loading, settings, openSettings, indexTab, globalTabplacement, useSimpleIndex,
  userJwt, isTelegram,
} = useGlobalState()
const message = useMessage()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

// 问题2: /user and /help render the homepage shell — the corresponding
// panel opens INSIDE the right column (left column stays untouched)
const UserCenter = defineAsyncComponent(() => import('./User.vue'))
const HelpPage = defineAsyncComponent(() => import('./Help.vue'))

const stripLocaleSegment = (path) => {
  const segments = (path || '/').split('/').filter(Boolean)
  if (segments.length && resolveSupportedLocale(segments[0])) segments.shift()
  return segments
}

const panelMode = computed(() => {
  const segments = stripLocaleSegment(route.path)
  if (segments[0] === 'user' && segments.length === 1) return 'user'
  if (segments[0] === 'help' && segments.length === 1) return 'help'
  // any deeper path (/user/oauth2/callback ...) keeps its own route
  return 'home'
})

const goHomePanel = () => router.push(getRouterPathWithLang('/', locale.value))

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

// decorative wave bars for the first-run breathing strip — heights form a
// wave silhouette, each bar bounces on its own period + phase (--h/--d/--dl)
// heights are capped at 72px so the strip keeps the viewport budget on
// typical laptops (the wave silhouette matters, the exact amplitude doesn't)
const waveBars = [
  { h: '26px', d: '1.0s', dl: '0s' },
  { h: '34px', d: '1.3s', dl: '.1s' },
  { h: '44px', d: '1.1s', dl: '.2s' },
  { h: '56px', d: '1.5s', dl: '.05s' },
  { h: '64px', d: '1.2s', dl: '.15s' },
  { h: '72px', d: '1.4s', dl: '.25s' },
  { h: '50px', d: '1.0s', dl: '.1s' },
  { h: '36px', d: '1.6s', dl: '.2s' },
  { h: '44px', d: '1.2s', dl: '0s' },
  { h: '60px', d: '1.3s', dl: '.15s' },
  { h: '52px', d: '1.1s', dl: '.05s' },
  { h: '38px', d: '1.4s', dl: '.2s' },
]

const showQuickStart = computed(() =>
  settings.value.fetched && !settings.value.address && !userJwt.value && !isTelegram.value)

// ---- modular card row: grip-reorder (persisted) + stats summary collapse ----
const homeCardOrder = useStorage('homeCardOrder', ['stats', 'uptime'])
// sanitize whatever is in storage: exactly the two known cards, no dupes
const cardOrder = computed(() => {
  const valid = homeCardOrder.value.filter((key) => key === 'stats' || key === 'uptime')
  for (const key of ['stats', 'uptime']) if (!valid.includes(key)) valid.push(key)
  return valid.slice(0, 2)
})
// default collapsed: the row shows only "today receive · today send"
const statsCollapsed = useStorage('statsCollapsed', true)

const dragOverIndex = ref(-1)
let dragFromIndex = -1
const onCardDragStart = (index, event) => {
  dragFromIndex = index
  event.dataTransfer.effectAllowed = 'move'
  // Firefox refuses to start a drag without payload
  event.dataTransfer.setData('text/plain', cardOrder.value[index])
}
const onCardDragOver = (index) => { dragOverIndex.value = index }
const onCardDragEnd = () => {
  dragFromIndex = -1
  dragOverIndex.value = -1
}
const onCardDrop = (index) => {
  dragOverIndex.value = -1
  if (dragFromIndex < 0 || dragFromIndex === index) {
    dragFromIndex = -1
    return
  }
  const next = [...cardOrder.value]
  const [moved] = next.splice(dragFromIndex, 1)
  next.splice(index, 0, moved)
  homeCardOrder.value = next
  dragFromIndex = -1
}

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
    <div v-if="useSimpleIndex && panelMode === 'home'">
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
              <span class="seg" style="--d: 0.1s"><span>{{ t('heroTitleA') }}</span></span><span class="seg" style="--d: 0.18s"><span>{{ t('heroTitleB') }}</span></span><span class="seg seg-3" style="--d: 0.26s"><span>{{ t('heroTitleC') }}</span></span>
            </h1>
            <p class="hero-sub">{{ introText }}</p>
          </div>

          <HeroFeatures />

          <div class="hero-cards">
            <div v-for="(cardKey, cardIndex) in cardOrder" :key="cardKey" class="hero-card-slot"
              :class="{ 'is-dragover': dragOverIndex === cardIndex }"
              @dragover.prevent="onCardDragOver(cardIndex)"
              @drop.prevent="onCardDrop(cardIndex)">
              <StatsCard v-if="cardKey === 'stats'" :draggable="!isMobile"
                :collapsed="statsCollapsed"
                @dragstart="onCardDragStart(cardIndex, $event)" @dragend="onCardDragEnd"
                @toggle-collapse="statsCollapsed = !statsCollapsed" />
              <UptimeCard v-else :draggable="!isMobile"
                @dragstart="onCardDragStart(cardIndex, $event)" @dragend="onCardDragEnd" />
            </div>
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

            <!-- 问题2: 用户中心 / 帮助 open inside the right column -->
            <div v-if="panelMode !== 'home'" class="panel-embed">
              <div class="panel-embed-head">
                <span class="panel-embed-title">
                  {{ panelMode === 'user' ? t('panelUserCenter') : t('panelHelp') }}
                </span>
                <n-button size="tiny" secondary @click="goHomePanel">
                  ← {{ t('panelBack') }}
                </n-button>
              </div>
              <div class="panel-embed-body">
                <UserCenter v-if="panelMode === 'user'" />
                <HelpPage v-else />
              </div>
            </div>

            <template v-else>
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
              <div v-for="(step, stepIndex) in quickSteps" :key="stepIndex" class="qs-row"
                :style="{ '--i': stepIndex }">
                <span class="qs-index">{{ stepIndex + 1 }}</span>
                <span class="qs-text"><b>{{ step.title }}</b>{{ step.desc }}</span>
              </div>
            </div>

            <!-- first-run breathing strip: wave bars + a flowing mail-step
                 line (decorative only — hidden on phones, motion-safe) -->
            <div v-if="showQuickStart" class="wave-zone" aria-hidden="true">
              <div class="wave">
                <i v-for="(bar, barIndex) in waveBars" :key="barIndex"
                  :style="{ '--h': bar.h, '--d': bar.d, '--dl': bar.dl }" />
              </div>
              <div class="flow">
                <span class="f-label">{{ t('flowStep1') }}</span>
                <span class="f-line" />
                <span class="f-label">{{ t('flowStep2') }}</span>
                <span class="f-line" />
                <span class="f-label">{{ t('flowStep3') }}</span>
              </div>
              <div class="wave-tag">INBOX · 7D · AUTO-DELETE</div>
            </div>

            <div class="panel-fine">
              {{ t('finePrint') }}
            </div>
            </template>
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
    padding-bottom: 4px;
}

.hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 24px;
    padding: 10px 4px 0;
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
    top: 10px;
    right: 4px;
    bottom: 0;
    width: calc((100% - 32px) / 2.15);
    z-index: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

/* ---- left column ---- */
/* vertical budget tightened: the page must fit the viewport without a
   browser scrollbar on a typical laptop window */
.hero-head {
    padding: 6px 2px 4px;
}

/* kicker: category label, its square wipes in first */
.hero-kicker {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 8px;
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

.hero-title {
    margin: 0;
    font-size: clamp(26px, 3vw, 38px);
    line-height: 1.2;
    letter-spacing: -0.5px;
}

/* headline: dual-layer segments — the outer box clips, the inner span
   rises from below its own line box (masked wipe, sharp reveal edge).
   The last segment also carries an in-glyph shimmer: a gray band travels
   through the gradient-clipped text forever (theme-safe via currentColor) */
.hero-title .seg {
    display: inline-block;
    overflow: hidden;
    vertical-align: bottom;
    /* descender room inside the clip box (en locale: y/g/p) — the extra
       padding is pulled back so layout is unchanged */
    padding-bottom: 0.14em;
    margin-bottom: -0.14em;
}

.hero-title .seg > span {
    display: inline-block;
    animation: hero-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: var(--d, 0s);
}

.seg-3 {
    position: relative;
}

.seg-3 > span {
    background-image: linear-gradient(90deg,
            currentColor 0%, currentColor 42%,
            rgba(128, 128, 128, 0.45) 50%,
            currentColor 58%, currentColor 100%);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation:
        hero-rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both,
        hero-shimmer-text 4s linear 1.2s infinite;
    animation-delay: var(--d, 0s), calc(var(--d, 0s) + 0.6s);
}

/* the marker highlight behind the last segment (house signature) */
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

.hero-sub {
    margin: 8px 0 0;
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

/* the masked rise: text slides up from under its own clip box */
@keyframes hero-rise {
    from { opacity: 0; transform: translateY(105%); }
    to { opacity: 1; transform: none; }
}

/* the in-glyph shimmer: the gray band of the 300%-wide gradient sweeps
   through the clipped text (200% -> -100% covers one full band pass) */
@keyframes hero-shimmer-text {
    from { background-position: 200% 0; }
    to { background-position: -100% 0; }
}

/* the subtitle keeps its muted 0.75 opacity after the fade */
@keyframes hero-sub-in {
    from { opacity: 0; }
    to { opacity: 0.75; }
}

/* stats + uptime cards sit side by side — two equal columns */
.hero-cards {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 16px;
    margin-top: 10px;
    /* natural heights: the collapsed stats card stays short, the two cards
       top-align instead of stretching to equal height */
    align-items: start;
}

/* one grid cell per card: the drop target for grip reordering */
.hero-card-slot {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-radius: 12px;
}

.hero-card-slot.is-dragover {
    outline: 1px dashed rgba(128, 128, 128, 0.5);
    outline-offset: 3px;
}

@media (max-width: 992px) {
    .hero-cards {
        grid-template-columns: 1fr;
    }
}

/* ---- right column: independent operations panel ---- */
.action-panel {
    position: relative;
    /* flex column in every state: the tabs (has-address) or the wave strip
       (first-run) absorb the leftover hero height, fine print pins bottom */
    display: flex;
    flex-direction: column;
    /* always fill the pinned hero height — the panel border lands exactly on
       the left column's bottom in every state (guest tabs included, which
       otherwise end hundreds of pixels short) */
    flex: 1 1 auto;
    min-height: 0;
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

/* 问题2: 用户中心 / 帮助 embedded inside the right column */
.panel-embed {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.panel-embed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.16);
}

.panel-embed-title {
    font-size: 14px;
    font-weight: 700;
}

/* the panel itself scrolls (.action-panel), keep deep styles tidy inside */
.panel-embed-body {
    min-width: 0;
}

.panel-embed-body :deep(.user-bar),
.panel-embed-body :deep(.help-hero) {
    margin-top: 0;
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
   look — inactive = gray tint, active = white card + black outline.
   Selectors scope to the card-type NAV so nested sub-menus keep naive's
   native look (mirrors the site-wide rules in App.vue). NOTE: naive uses
   deep BEM chains like `.n-tabs .n-tabs-nav.n-tabs-nav--card-type .n-tabs-tab...`
   (0,5,0) — selectors here must be at least as deep to win. */
.action-panel :deep(.n-tabs-nav--card-type .n-tabs-tab) {
    color: inherit;
    background-color: rgba(128, 128, 128, 0.07);
    border-color: rgba(128, 128, 128, 0.20);
}

.action-panel :deep(.n-tabs-nav--card-type .n-tabs-tab:not(.n-tabs-tab--active):hover) {
    background-color: rgba(128, 128, 128, 0.14);
}

.action-panel :deep(.n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active),
.action-panel :deep(.n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active:hover) {
    color: #1a1a1a;
    background-color: #fff;
    border-color: #1a1a1a;
}

:global(html.dark .action-panel .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active),
:global(html.dark .action-panel .n-tabs-nav--card-type .n-tabs-tab.n-tabs-tab--active:hover) {
    color: #111;
    background-color: #eee;
    border-color: #111;
}

/* primary action buttons: transparent + black outline + bold label,
   hover inverts to solid black — the site-wide rule in App.vue (问题16),
   the old page-local solid-black override was removed so every page
   shares one language. */

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
    animation: hero-fade-up 0.5s ease 0.35s both;
}

.qs-row {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 7px 0;
    /* entrance stagger: each step fades up 60ms after the previous */
    animation: hero-fade-up 0.5s ease both;
    animation-delay: calc(0.4s + var(--i, 0) * 0.06s);
}

.qs-row + .qs-row {
    border-top: 1px dashed rgba(128, 128, 128, 0.28);
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

/* ---- first-run breathing strip: wave bars + flowing mail-step line ---- */
.wave-zone {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    min-height: 120px;
    margin: 2px 0;
    padding: 10px 12px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    overflow: hidden;
    animation: hero-fade-in 0.55s ease 0.7s both;
}

/* dotted backdrop fading out toward the edges (theme-neutral gray) */
.wave-zone::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(128, 128, 128, 0.3) 1px, transparent 1.4px);
    background-size: 14px 14px;
    -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 50%, #000 40%, transparent);
    mask-image: radial-gradient(ellipse 75% 65% at 50% 50%, #000 40%, transparent);
    pointer-events: none;
}

.wave {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 104px;
}

.wave i {
    width: 5px;
    height: var(--h, 40px);
    border-radius: 3px;
    background: currentColor;
    opacity: 0.85;
    animation: wave-bounce var(--d, 1.2s) ease-in-out var(--dl, 0s) infinite;
}

@keyframes wave-bounce {
    0%, 100% { transform: scaleY(0.3); }
    50% { transform: scaleY(1); }
}

.flow {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 260px;
}

.f-label {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: 0.6;
}

.f-line {
    position: relative;
    flex: 1 1 auto;
    height: 1px;
    margin: 0 8px;
    background: rgba(128, 128, 128, 0.3);
    overflow: hidden;
}

/* a dash segment runs the line; the second line starts a lap later */
.f-line::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 26%;
    height: 100%;
    background: currentColor;
    animation: flow-run 2.4s linear infinite;
}

.f-line:last-of-type::after {
    animation-delay: 1.2s;
}

@keyframes flow-run {
    from { left: -26%; }
    to { left: 100%; }
}

.wave-tag {
    position: relative;
    z-index: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.18em;
    white-space: nowrap;
    opacity: 0.55;
}

/* primary create CTA: a breathing outline ring + a light sweep across the
   label on hover (the button inverts to solid, so the sweep reads on fill) */
.action-panel :deep(.cta-breathe) {
    position: relative;
    overflow: hidden;
    animation: cta-breathe 2.4s ease-in-out infinite;
}

@keyframes cta-breathe {
    0%, 100% { box-shadow: 0 0 0 0 rgba(29, 29, 31, 0.22); }
    50% { box-shadow: 0 0 0 7px rgba(29, 29, 31, 0); }
}

:global(html.dark .action-panel .cta-breathe) {
    animation-name: cta-breathe-dark;
}

@keyframes cta-breathe-dark {
    0%, 100% { box-shadow: 0 0 0 0 rgba(238, 238, 238, 0.22); }
    50% { box-shadow: 0 0 0 7px rgba(238, 238, 238, 0); }
}

.action-panel :deep(.cta-breathe)::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 40%;
    background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    transform: translateX(-130%) skewX(-12deg);
    pointer-events: none;
}

.action-panel :deep(.cta-breathe:hover)::after {
    transform: translateX(260%) skewX(-12deg);
    transition: transform 0.7s ease;
}

.panel-fine {
    margin-top: auto;
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
    margin-top: 10px;
    padding: 9px 16px;
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

    /* the breathing strip is a desktop-width luxury */
    .wave-zone {
        display: none;
    }
}

/* motion guards live at the END of the sheet: same-specificity rules
   later in the file would otherwise beat them */
@media (prefers-reduced-motion: reduce) {
    .kicker-sq,
    .kicker-text,
    .hero-title .seg > span,
    .hero-sub,
    .panel-qs-label,
    .qs-row,
    .wave-zone {
        animation: none;
    }

    .seg-3::before {
        animation: none;
        transform: scaleX(1);
    }

    /* the wave bars freeze as a static silhouette, the flow dash hides */
    .wave i {
        animation: none;
    }

    .f-line::after {
        animation: none;
        display: none;
    }

    .action-panel :deep(.cta-breathe) {
        animation: none;
    }

    .action-panel :deep(.cta-breathe)::after {
        display: none;
    }
}
</style>
