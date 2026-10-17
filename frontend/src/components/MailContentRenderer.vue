<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from 'vue-i18n'
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound, ImageRound } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { blockRemoteContent } from '../utils/remote-content-policy';
import { utcToLocalDate } from '../utils';
import { api } from '../api';
import { useGlobalState } from '../store';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark, autoLoadRemoteImages } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  // 回调函数 props
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  },
  onUpdateMailReadStatus: {
    type: Function,
    default: () => { }
  },
  // admin mail detail only: lazily resolve the sender IP + geolocation
  showSourceIp: {
    type: Boolean,
    default: false
  }
});

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const readStatusUpdating = ref(false);
const showFullscreen = ref(false);

// Per-mail consent, deliberately independent of the global setting: it only
// ever turns true when the user clicks "load images" for this specific mail,
// and resets when a different mail is shown.
const showRemoteImages = ref(false);
watch(() => props.mail.id, () => {
  showRemoteImages.value = false;
});

// Sanitizing is not optional: DOMPurify always runs, whether or not remote
// images are permitted. Previously the "auto load remote images" preference
// (default on) handed the raw body straight to v-html / the iframe, so any
// inbound mail could execute script in the app origin. `allowRemote` only
// disables the network-blocking pass, never the script/handler stripping.
const processedMail = computed(() => {
  const allowRemote = autoLoadRemoteImages.value || showRemoteImages.value;
  const { html, blocked } = blockRemoteContent(props.mail.message, { allowRemote });
  return { message: html, blocked };
});

const handleLoadRemoteImages = () => {
  showRemoteImages.value = true;
};

const handleDelete = () => {
  props.onDelete();
};

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const handleUpdateMailReadStatus = async () => {
  readStatusUpdating.value = true;
  try {
    await props.onUpdateMailReadStatus();
  } finally {
    readStatusUpdating.value = false;
  }
};


const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};

// ---- admin-only sender IP geolocation ----
// { ip, location } from /admin/mails/:id/ip_info; null until loaded.
// The worker degrades to location:null on lookup failures, so the tag
// simply falls back to the bare IP.
const sourceIpInfo = ref(null);
const { locale } = useI18n({ useScope: 'global' });

const fetchSourceIp = async () => {
  if (!props.showSourceIp || !props.mail?.id) return;
  try {
    const res = await api.fetch(`/admin/mails/${props.mail.id}/ip_info`, { showLoading: false });
    sourceIpInfo.value = res && res.ip ? res : null;
  } catch (error) {
    console.warn('fetch mail ip info failed', error);
    sourceIpInfo.value = null;
  }
};

watch(() => props.mail.id, () => {
  sourceIpInfo.value = null;
  fetchSourceIp();
}, { immediate: true });

// localized country name via Intl (cn / us / ... -> 中国 / 美国 for zh);
// city and region stay in their original English form from the geo source
const sourceIpTag = computed(() => {
  const info = sourceIpInfo.value;
  if (!info?.ip) return '';
  const location = info.location;
  const parts = [info.ip];
  if (location) {
    let country = location.countryCode || '';
    try {
      country = new Intl.DisplayNames([locale.value], { type: 'region' })
        .of(location.countryCode) || location.country || '';
    } catch (e) { country = location.country || location.countryCode || ''; }
    const place = [country, location.city].filter(Boolean).join(' ');
    if (place) parts.push(place);
  }
  return `IP ${parts.join(' · ')}`;
});

</script>

<template>
  <div class="mail-content-renderer">
    <!-- 邮件信息标签 -->
    <n-space>
      <n-tag type="info">
        ID: {{ mail.id }}
      </n-tag>
      <n-tag type="info">
        {{ utcToLocalDate(mail.created_at, useUTCDate) }}
      </n-tag>
      <n-tag type="info">
        FROM: {{ mail.source }}
      </n-tag>
      <n-tag v-if="showEMailTo" type="info">
        TO: {{ mail.address }}
      </n-tag>
      <n-tag v-if="showSourceIp && sourceIpTag" type="info">
        {{ sourceIpTag }}
      </n-tag>

      <!-- 操作按钮 -->
      <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
        <template #trigger>
          <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
        </template>
        {{ t('deleteMailTip') }}
      </n-popconfirm>

      <n-button v-if="mail.attachments && mail.attachments.length > 0" size="small" tertiary type="info"
        @click="handleViewAttachments">
        {{ t('attachments') }}
      </n-button>

      <n-button v-if="enableMailReadStatus" size="small" tertiary type="info" :loading="readStatusUpdating"
        @click="handleUpdateMailReadStatus">
        {{ mail.is_unread === 1 ? t('markAsRead') : t('markAsUnread') }}
      </n-button>

      <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="mail.id + '.eml'"
        :href="getDownloadEmlUrl(mail.raw)">
        <template #icon>
          <n-icon :component="CloudDownloadRound" />
        </template>
        {{ t('downloadMail') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleReply">
        <template #icon>
          <n-icon :component="ReplyFilled" />
        </template>
        {{ t('reply') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleForward">
        <template #icon>
          <n-icon :component="ForwardFilled" />
        </template>
        {{ t('forward') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showTextMail = !showTextMail">
        {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showFullscreen = true">
        <template #icon>
          <n-icon :component="FullscreenRound" />
        </template>
        {{ t('fullscreen') }}
      </n-button>

    </n-space>

    <!-- 外部资源阻断提示 -->
    <n-alert v-if="processedMail.blocked" type="warning" :show-icon="false" :bordered="false"
      class="remote-images-banner">
      <n-space align="center" justify="space-between">
        <span>{{ t('remoteImagesBlocked', { count: processedMail.blocked }) }}</span>
        <n-button size="tiny" tertiary type="warning" @click="handleLoadRemoteImages">
          <template #icon>
            <n-icon :component="ImageRound" />
          </template>
          {{ t('loadRemoteImages') }}
        </n-button>
      </n-space>
    </n-alert>

    <!-- AI 提取信息 -->
    <AiExtractInfo :metadata="mail.metadata" />

    <!-- 邮件内容 -->
    <div class="mail-content" :class="{ 'dark-mode': isDark }">
      <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
      <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox">
      </iframe>
      <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="processedMail.message" :isDark="isDark" class="mail-html" />
    </div>
  </div>

  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
    style="height: 100vh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }">
        <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="processedMail.message" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 附件模态框 -->
  <n-modal v-model:show="showAttachments" preset="dialog" title="Dialog">
    <template #header>
      <div>{{ t('attachments') }}</div>
    </template>
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing class="center" :title="row.filename">
            <template #description>
              <n-space>
                <n-tag type="info">
                  Size: {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" ghost type="info"
                  size="small">
                  {{ t('saveToS3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="row.filename"
              :href="row.url">
              <n-icon :component="CloudDownloadRound" />
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Let the banner's inner space fill the alert so the button sits on the right. */
.remote-images-banner :deep(.n-space) {
  width: 100%;
}

.mail-content {
  margin-top: 10px;
  flex: 1;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.dark-mode .mail-text {
  color: #e0e0e0;
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.dark-mode .mail-iframe {
  background-color: #fff;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.center {
  text-align: center;
}

.fullscreen-mail-content {
  height: calc(100vh - 120px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100vh - 120px);
}
</style>
