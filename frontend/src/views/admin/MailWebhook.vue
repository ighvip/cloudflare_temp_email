<script setup lang="ts">
// @ts-ignore
import { api } from '../../api'

// @ts-ignore
import WebhookComponent from '../../components/WebhookComponent.vue'

const fetchData = async () => {
    return await api.fetch(`/admin/mail_webhook/settings`)
}

const saveSettings = async (webhookSettings: any) => {
    await api.fetch(`/admin/mail_webhook/settings`, {
        method: 'POST',
        body: JSON.stringify(webhookSettings),
    })
}

const testSettings = async (webhookSettings: any) => {
    await api.fetch(`/admin/mail_webhook/test`, {
        method: 'POST',
        body: JSON.stringify(webhookSettings),
    })
}

</script>

<template>
    <div class="admin-page webhook-page">
        <div class="page-head">
            <div class="page-head-row">
                <span class="page-sq" aria-hidden="true"></span>
                <h2>邮件 Webhook</h2>
                <span class="page-badge">ADMIN</span>
            </div>
            <p class="page-desc">收到新邮件时向外部服务推送通知，内置常用服务预设。</p>
        </div>

        <WebhookComponent :fetchData="fetchData" :saveSettings="saveSettings" :testSettings="testSettings" />
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

/* ---- 问题9: wrapper-level restyle of WebhookComponent (markup and
   logic untouched — this page only frames its card like the others) ---- */
.webhook-page :deep(.center) {
    width: 100%;
}

.webhook-page :deep(.center > .n-card) {
    width: 100%;
    max-width: 100% !important;
    /* the component's card IS this page's card container */
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background-color: rgba(128, 128, 128, 0.04);
}

/* the save button is this page's single primary action — solid black */
.webhook-page :deep(.n-button--primary-type) {
    color: #fff;
    background-color: #1a1a1a;
    border-color: #1a1a1a;
}

.webhook-page :deep(.n-button--primary-type:not(:disabled):hover) {
    color: #fff;
    background-color: #333;
    border-color: #333;
}

:global(html.dark .webhook-page .n-button--primary-type) {
    color: #111;
    background-color: #eeeeee;
    border-color: #eeeeee;
}

:global(html.dark .webhook-page .n-button--primary-type:not(:disabled):hover) {
    color: #111;
    background-color: #dddddd;
    border-color: #dddddd;
}
</style>
