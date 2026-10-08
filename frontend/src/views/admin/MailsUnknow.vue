<script setup>
import { ref } from 'vue'
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue';
import EmptyState from '../../components/EmptyState.vue';

// 问题9: track emptiness through the fetch proxy so this wrapper can swap
// naive's n-result illustration for the shared line-art empty state
const listEmpty = ref(false)

const fetchMailUnknowData = async (limit, offset) => {
    try {
        const res = await api.fetch(
            `/admin/mails_unknow`
            + `?limit=${limit}`
            + `&offset=${offset}`
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
                <h2>无收件人邮件</h2>
                <span class="page-badge">ADMIN</span>
            </div>
            <p class="page-desc">收件地址不存在或已删除的邮件会归档到这里，可查看与删除。</p>
        </div>

        <section class="page-card">
            <MailBox class="mail-box" :enableUserDeleteEmail="true" :fetchMailData="fetchMailUnknowData"
                :deleteMail="deleteMail" />
            <EmptyState v-if="listEmpty" variant="inbox" title="这里还没有无收件人邮件" />
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

/* ---- 问题9: wrapper-level restyle of MailBox ---- */

/* empty list: naive's n-result (and the blank list/split area behind it)
   gives way to the shared line-art EmptyState rendered by this page */
.is-empty .mail-box :deep(.n-split),
.is-empty .mail-box :deep(.n-result),
.is-empty .mail-box :deep(.mail-list-scroll),
.is-empty .mail-box :deep(div:has(> .n-list)) {
    display: none;
}

/* "please select a mail" state: drop the big filled inbox glyph */
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
