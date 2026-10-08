<script setup>
import { ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue';
import EmptyState from '../../components/EmptyState.vue';

const { adminMailTabAddress } = useGlobalState()

const { t } = useScopedI18n('views.admin.Mails')

const mailBoxKey = ref("")

// 问题9: the wrapper sees every list fetch, so it can swap naive's
// n-result illustration for the shared line-art empty state
const listEmpty = ref(false)

const queryMail = () => {
    adminMailTabAddress.value = adminMailTabAddress.value.trim();
    mailBoxKey.value = Date.now();
}

const fetchMailData = async (limit, offset) => {
    try {
        const res = await api.fetch(
            `/admin/mails`
            + `?limit=${limit}`
            + `&offset=${offset}`
            + (adminMailTabAddress.value ? `&address=${adminMailTabAddress.value}` : '')
        );
        listEmpty.value = !res || (!(res.count > 0) && !(res.results?.length > 0));
        return res;
    } catch (error) {
        listEmpty.value = false;
        throw error;
    }
}

const deleteMail = async (curMailId) => {
    await api.fetch(`/admin/mails/${curMailId}`, { method: 'DELETE' });
};
</script>

<template>
    <div class="admin-page" :class="{ 'is-empty': listEmpty }">
        <div class="page-head">
            <div class="page-head-row">
                <span class="page-sq" aria-hidden="true"></span>
                <h2>邮件列表</h2>
                <span class="page-badge">ADMIN</span>
            </div>
            <p class="page-desc">按地址检索并管理全部收件箱邮件，支持多选与批量删除。</p>
        </div>

        <section class="page-card">
            <div class="page-toolbar">
                <n-input-group>
                    <n-input v-model:value="adminMailTabAddress" :placeholder="t('addressQueryTip')"
                        @keydown.enter="queryMail" clearable />
                    <n-button @click="queryMail" type="primary">
                        {{ t('query') }}
                    </n-button>
                </n-input-group>
            </div>
            <MailBox class="mail-box" :key="mailBoxKey" :enableUserDeleteEmail="true" :fetchMailData="fetchMailData"
                :deleteMail="deleteMail" :showFilterInput="true" />
            <EmptyState v-if="listEmpty" variant="inbox" title="暂无符合条件的邮件" />
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

/* ---- 问题9: wrapper-level restyle of MailBox (the component itself is
   shared with the homepage and must not be edited) ---- */

/* empty list: naive's n-result (and the blank 60vh list/split area behind
   it) gives way to the shared line-art EmptyState rendered by this page */
.is-empty .mail-box :deep(.n-split),
.is-empty .mail-box :deep(.n-result),
.is-empty .mail-box :deep(.mail-list-scroll),
.is-empty .mail-box :deep(div:has(> .n-list)) {
    display: none;
}

/* "please select a mail" state: drop the big filled inbox glyph, the grey
   line of text is enough */
.mail-box :deep(.n-result-icon) {
    display: none;
}

/* homepage card language: hairline row separators + mono meta pills */
.mail-box :deep(.n-list > .n-list-item:not(:last-child)) {
    border-bottom: 1px solid rgba(128, 128, 128, 0.10);
}

.mail-box :deep(.n-tag),
.mail-box :deep(.n-tag__content) {
    border-radius: 999px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
}
</style>
