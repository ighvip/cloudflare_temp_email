<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import SendBox from '../../components/SendBox.vue';
import EmptyState from '../../components/EmptyState.vue';

const { adminSendBoxTabAddress } = useGlobalState()

const { t } = useScopedI18n('views.admin.SendBox')

// remount the list on every query, like the mail-list page does
const sendBoxKey = ref("")

// 问题9: the wrapper sees every list fetch, so it can swap naive's
// n-result illustration for the shared line-art empty state
const listEmpty = ref(false)

const query = () => {
    adminSendBoxTabAddress.value = adminSendBoxTabAddress.value.trim();
    sendBoxKey.value = Date.now();
}

const fetchData = async (limit, offset) => {
    adminSendBoxTabAddress.value = adminSendBoxTabAddress.value.trim();
    try {
        const res = await api.fetch(
            `/admin/sendbox?limit=${limit}&offset=${offset}`
            + (adminSendBoxTabAddress.value ? `&address=${adminSendBoxTabAddress.value}` : '')
        );
        listEmpty.value = !res || (!(res.count > 0) && !(res.results?.length > 0));
        return res;
    } catch (error) {
        listEmpty.value = false;
        throw error;
    }
}

const deleteSenboxMail = async (curMailId) => {
    await api.fetch(`/admin/sendbox/${curMailId}`, { method: 'DELETE' });
};
</script>

<template>
    <div class="admin-page" :class="{ 'is-empty': listEmpty }">
        <div class="page-head">
            <div class="page-head-row">
                <span class="page-sq" aria-hidden="true"></span>
                <h2>发件箱</h2>
                <span class="page-badge">ADMIN</span>
            </div>
            <p class="page-desc">查看管理员投递出的邮件记录，可按发件地址检索，支持多选删除。</p>
        </div>

        <section class="page-card">
            <div class="page-toolbar">
                <n-input-group>
                    <n-input v-model:value="adminSendBoxTabAddress" :placeholder="t('queryTip')"
                        @keydown.enter="query" clearable />
                    <n-button @click="query" type="primary">
                        {{ t('query') }}
                    </n-button>
                </n-input-group>
            </div>
            <SendBox class="send-box" :key="sendBoxKey" :enableUserDeleteEmail="true" :deleteMail="deleteSenboxMail"
                :fetchMailData="fetchData" :showEMailFrom="true" />
            <EmptyState v-if="listEmpty" variant="sent" title="暂无发件记录" />
        </section>
    </div>
</template>

<style scoped>
/* ---- 问题9: homepage monochrome page chrome ---- */
.admin-page {
    width: min(960px, 100%);
    margin: 0 auto;
    padding: 14px 4px 24px;
    text-align: left;
}

.page-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
}

.page-head-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.page-sq {
    width: 11px;
    height: 11px;
    flex: 0 0 auto;
    background: currentColor;
}

.page-head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.2px;
    line-height: 1.3;
}

.page-badge {
    margin-left: auto;
    padding: 1px 8px;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.10);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    white-space: nowrap;
}

.page-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #666666;
}

:global(html.dark .page-desc) {
    color: #9a9a9a;
}

.page-card {
    padding: 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.page-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.page-toolbar .n-input-group {
    width: min(460px, 100%);
}

/* ---- 问题9: wrapper-level restyle of SendBox (shared component, not
   to be edited) ---- */

/* empty list: naive's n-result (and the blank list/split area behind it)
   gives way to the shared line-art EmptyState rendered by this page */
.is-empty .send-box :deep(.n-split),
.is-empty .send-box :deep(.n-result),
.is-empty .send-box :deep(div:has(> .n-list)) {
    display: none;
}

/* "please select a mail" state: drop the big filled send glyph */
.send-box :deep(.n-result-icon) {
    display: none;
}

/* homepage card language: hairline row separators + mono meta pills */
.send-box :deep(.n-list > .n-list-item:not(:last-child)) {
    border-bottom: 1px solid rgba(128, 128, 128, 0.10);
}

.send-box :deep(.n-tag),
.send-box :deep(.n-tag__content) {
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
}
</style>
