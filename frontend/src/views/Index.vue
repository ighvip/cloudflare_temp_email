<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, watch, computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRoute } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { useIsMobile } from '../utils/composables'
import { FullscreenExitOutlined } from '@vicons/material'

import AddressBar from './index/AddressBar.vue';
import HomeInfo from './index/HomeInfo.vue';
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
import SiteLogo from '../components/SiteLogo.vue';
import HeroFeatures from './index/HeroFeatures.vue';
import TerminalDemo from './index/TerminalDemo.vue';
import ActionStatus from './index/ActionStatus.vue';
import GuideFaq from './index/GuideFaq.vue';

const {
  loading, settings, openSettings, indexTab, globalTabplacement, useSimpleIndex,
  homeGuideEmbedded
} = useGlobalState()
const message = useMessage()
const route = useRoute()
const isMobile = useIsMobile()

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t } = useScopedI18n('views.Index')
// the intro copy lives in the HomeInfo namespace — it moves from the info
// card to the hero subtitle on the redesigned homepage (same source text)
const { t: tHomeInfo } = useScopedI18n('views.index.HomeInfo')

const introText = computed(() =>
  (openSettings.value.siteIntro || '').trim() || tHomeInfo('defaultIntro'))

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

// the guide/FAQ is embedded as a permanent section only while the split
// layout is on screen — SimpleIndex keeps the login card's help tab
const syncGuideEmbedded = () => {
  homeGuideEmbedded.value = !useSimpleIndex.value
}

onMounted(() => {
  syncGuideEmbedded()
  if (route.query.mail_id) {
    showMailIdQuery.value = true;
    mailIdQuery.value = route.query.mail_id;
    queryMail();
  }
})

watch(useSimpleIndex, syncGuideEmbedded)

onUnmounted(() => {
  homeGuideEmbedded.value = false
})
</script>

<template>
  <div>
    <div v-if="useSimpleIndex">
      <SimpleIndex />
    </div>
    <div v-else class="home-layout">
      <!-- left/right split hero: brand + proof on the left, action card right -->
      <div class="hero">
        <section class="hero-left">
          <div class="hero-head">
            <h1 class="hero-title">{{ openSettings.title || t('heroFallbackTitle') }}</h1>
            <p class="hero-sub">{{ introText }}</p>
          </div>

          <HeroFeatures />

          <HomeInfo :hide-intro="true" />

          <div class="hero-block">
            <div class="hero-block-title">{{ t('terminalTitle') }}</div>
            <TerminalDemo />
          </div>

          <div class="hero-block">
            <div class="hero-block-title">{{ t('guideTitle') }}</div>
            <div class="hero-block-card">
              <GuideFaq />
            </div>
          </div>
        </section>

        <aside class="hero-right">
          <div class="right-brand">
            <!-- logo component reused untouched (same SVG as the header) -->
            <SiteLogo />
            <div class="right-brand-text">
              <div class="right-title">{{ openSettings.title || t('heroFallbackTitle') }}</div>
              <div class="right-tagline">{{ t('tagline') }}</div>
            </div>
          </div>

          <div class="right-pills">
            <span class="right-pill pill-blue">{{ t('pillNoSignup') }}</span>
            <span class="right-pill pill-green">{{ t('pillCleanup') }}</span>
            <span class="right-pill pill-amber">{{ t('pillOpenSource') }}</span>
          </div>

          <n-card class="action-card" :bordered="false" embedded>
            <AddressBar />
            <ActionStatus />
          </n-card>

          <div class="right-fine">{{ t('finePrint') }}</div>
        </aside>
      </div>

      <!-- inbox and friends keep their full width below the hero -->
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
            :enableMailReadStatus="openSettings.enableMailReadStatus" :updateMailReadStatus="updateMailReadStatus" />
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

.hero-left,
.hero-right {
    position: relative;
    z-index: 1;
    min-width: 0;
}

.hero-right {
    position: sticky;
    top: 12px;
    align-self: start;
}

/* ---- left column ---- */
.hero-head {
    padding: 10px 2px 18px;
}

.hero-title {
    margin: 0;
    font-size: clamp(26px, 3vw, 38px);
    line-height: 1.2;
    letter-spacing: -0.5px;
}

.hero-sub {
    margin: 12px 0 0;
    max-width: 46em;
    font-size: 15px;
    line-height: 1.75;
    opacity: 0.75;
    text-align: justify;
}

.hero-block {
    margin-top: 18px;
}

.hero-block-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 15px;
}

.hero-block-title::before {
    content: '';
    width: 4px;
    height: 14px;
    border-radius: 2px;
    background: #2080f0;
}

.hero-block-card {
    padding: 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

/* ---- right column ---- */
.right-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 2px;
}

.right-brand-text {
    min-width: 0;
}

.right-title {
    font-weight: 700;
    font-size: 18px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.right-tagline {
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.5;
}

.right-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;
}

.right-pill {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid transparent;
}

.pill-blue {
    color: #2080f0;
    background: rgba(32, 128, 240, 0.10);
    border-color: rgba(32, 128, 240, 0.35);
}

.pill-green {
    color: #18a058;
    background: rgba(24, 160, 88, 0.10);
    border-color: rgba(24, 160, 88, 0.35);
}

.pill-amber {
    color: #d48806;
    background: rgba(240, 160, 32, 0.10);
    border-color: rgba(240, 160, 32, 0.4);
}

.action-card {
    overflow: visible;
}

/* AddressBar already centers its own card — no double frame needed here */
.action-card :deep(.center) {
    margin: 0;
}

.action-card :deep(.n-card) {
    margin-top: 0;
    width: 100%;
    max-width: 100%;
}

.action-card :deep(.n-alert) {
    margin-top: 0;
}

.right-fine {
    margin-top: 10px;
    padding: 0 4px;
    font-size: 12px;
    line-height: 1.7;
    opacity: 0.55;
    text-align: center;
}

/* ---- responsive: action card first, everything else below ---- */
@media (max-width: 992px) {
    .hero {
        grid-template-columns: 1fr;
        gap: 16px;
    }

    .hero-right {
        position: static;
        order: -1;
    }

    .hero-sub {
        text-align: left;
    }
}
</style>
