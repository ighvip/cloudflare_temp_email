<script setup>
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { useScopedI18n } from '@/i18n/app'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { SendOutlined } from '@vicons/material'
import { api } from '../../api'
import ShadowHtmlComponent from '../../components/ShadowHtmlComponent.vue'
import { useGlobalState } from '../../store'
import { blockRemoteContent } from '../../utils/remote-content-policy'
import { sanitizeHtml } from '../../utils/sanitize-html'

const message = useMessage()
const isPreview = ref(false)
const editorRef = shallowRef()
const sending = ref(false)
const { autoLoadRemoteImages, isDark, openSettings } = useGlobalState()

// 问题10: send disabled → the whole composer is replaced by a quiet
// "not enabled" panel (no toast, no 400 attempt)
const sendDisabled = computed(() => !openSettings.value?.enableSendMail)

const sendMailModel = useSessionStorage('sendMailByAdminModel', {
    fromName: "",
    fromMail: "",
    toName: "",
    toMail: "",
    subject: "",
    contentType: 'text',
    content: "",
});

const { t } = useScopedI18n('views.admin.SendMail')

const contentTypes = computed(() => [
    { label: t('text'), value: 'text' },
    { label: t('html'), value: 'html' },
    { label: t('rich text'), value: 'rich' },
])

const previewContent = computed(() => {
    const content = `${sendMailModel.value.content ?? ''}`
    return autoLoadRemoteImages.value
        ? sanitizeHtml(content)
        : blockRemoteContent(content).html
})

const normalizeSendMailText = (content) => {
    return content
        .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const hasSendMailContent = (content, contentType) => {
    if (typeof content !== 'string' || !content) {
        return false
    }

    if (contentType === 'text') {
        return normalizeSendMailText(content).length > 0
    }

    const container = document.createElement('div')
    container.innerHTML = content
    container.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove())

    const plainContent = normalizeSendMailText(container.textContent ?? '')
    if (plainContent.length > 0) {
        return true
    }

    return Boolean(container.querySelector('img, audio, video, iframe, svg, canvas, table'))
}

const send = async () => {
    if (sending.value) {
        return
    }

    const fromMail = `${sendMailModel.value.fromMail ?? ''}`.trim()
    const toMail = `${sendMailModel.value.toMail ?? ''}`.trim()
    const subject = `${sendMailModel.value.subject ?? ''}`.trim()
    const content = `${sendMailModel.value.content ?? ''}`

    if (!fromMail) {
        message.error(t('fromMailEmpty'))
        return
    }
    if (!subject) {
        message.error(t('subjectEmpty'))
        return
    }
    if (!toMail) {
        message.error(t('toMailEmpty'))
        return
    }
    if (!hasSendMailContent(content, sendMailModel.value.contentType)) {
        message.error(t('contentEmpty'))
        return
    }

    const payload = {
        from_name: sendMailModel.value.fromName,
        from_mail: fromMail,
        to_name: sendMailModel.value.toName,
        to_mail: toMail,
        subject,
        is_html: sendMailModel.value.contentType != 'text',
        content,
    }

    sending.value = true
    try {
        await api.fetch(`/admin/send_mail`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        sendMailModel.value = {
            fromName: "",
            fromMail: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        }
        isPreview.value = false
        message.success(t("successSend"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        sending.value = false
    }
}

const toolbarConfig = {
    excludeKeys: ["uploadVideo"]
}

const editorConfig = {
    MENU_CONF: {
        'uploadImage': {
            async customUpload() {
                message.error(t('tooLarge'))
            },
            maxFileSize: 1 * 1024 * 1024,
            base64LimitSize: 1 * 1024 * 1024,
        }
    }
}

onBeforeUnmount(() => {
    const editor = editorRef.value
    if (editor == null) return
    editor.destroy()
})

const handleCreated = (editor) => {
    editorRef.value = editor;
}
</script>

<template>
    <div class="admin-page">
        <div class="page-head">
            <div class="page-head-row">
                <span class="page-sq" aria-hidden="true"></span>
                <h2>发送邮件</h2>
                <span class="page-badge">ADMIN</span>
            </div>
            <p class="page-desc">以管理员身份直接投递邮件，支持纯文本、HTML 与富文本格式。</p>
        </div>

        <!-- 问题10: send channel not configured anywhere → quiet panel -->
        <section v-if="sendDisabled" class="feature-disabled">
            <div class="feature-disabled-title">{{ t('notEnabled') }}</div>
            <div class="feature-disabled-hint">{{ t('notEnabledHint') }}</div>
        </section>

        <section v-else class="page-card">
            <n-form class="composer-form" :model="sendMailModel" label-placement="top">
                <n-grid cols="1 m:2" responsive="screen" :x-gap="16">
                    <n-grid-item>
                        <n-form-item :label="t('senderAddress')" required
                            :label-props="{ for: 'admin-send-mail-sender-address' }">
                            <n-input v-model:value="sendMailModel.fromMail"
                                :input-props="{ id: 'admin-send-mail-sender-address' }" />
                        </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                        <n-form-item :label="t('senderName')"
                            :label-props="{ for: 'admin-send-mail-sender-name' }">
                            <n-input v-model:value="sendMailModel.fromName"
                                :input-props="{ id: 'admin-send-mail-sender-name' }" />
                        </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                        <n-form-item :label="t('recipientAddress')" required
                            :label-props="{ for: 'admin-send-mail-recipient-address' }">
                            <n-input v-model:value="sendMailModel.toMail"
                                :input-props="{ id: 'admin-send-mail-recipient-address' }" />
                        </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                        <n-form-item :label="t('recipientName')"
                            :label-props="{ for: 'admin-send-mail-recipient-name' }">
                            <n-input v-model:value="sendMailModel.toName"
                                :input-props="{ id: 'admin-send-mail-recipient-name' }" />
                        </n-form-item>
                    </n-grid-item>
                </n-grid>

                <n-form-item :label="t('subject')" required
                    :label-props="{ for: 'admin-send-mail-subject' }">
                    <n-input v-model:value="sendMailModel.subject"
                        :input-props="{ id: 'admin-send-mail-subject' }" />
                </n-form-item>

                <div class="editor-panel">
                    <div class="editor-panel-header">
                        <n-text id="admin-send-mail-content-label" strong>{{ t('content') }} <span
                                class="required-mark">*</span></n-text>
                        <div class="editor-controls">
                            <n-radio-group class="format-options" v-model:value="sendMailModel.contentType"
                                size="small" aria-labelledby="admin-send-mail-content-label">
                                <n-radio-button v-for="option in contentTypes" :key="option.value"
                                    :value="option.value" :label="option.label" />
                            </n-radio-group>
                            <n-button v-if="sendMailModel.contentType !== 'text'" tertiary size="small"
                                @click="isPreview = !isPreview">
                                {{ isPreview ? t('edit') : t('preview') }}
                            </n-button>
                        </div>
                    </div>

                    <div v-if="isPreview && sendMailModel.contentType !== 'text'" class="compose-preview">
                        <ShadowHtmlComponent :htmlContent="previewContent" :isDark="isDark" />
                    </div>
                    <div v-else-if="sendMailModel.contentType === 'rich'" class="rich-editor">
                        <Toolbar :defaultConfig="toolbarConfig" :editor="editorRef" mode="default" />
                        <Editor v-model="sendMailModel.content" :defaultConfig="editorConfig" mode="default"
                            @onCreated="handleCreated" />
                    </div>
                    <n-input v-else class="compose-textarea" type="textarea" :bordered="false"
                        v-model:value="sendMailModel.content" :placeholder="t('contentPlaceholder')"
                        :input-props="{ 'aria-label': t('content') }"
                        :autosize="{ minRows: 14, maxRows: 24 }" />
                </div>

                <div class="composer-actions">
                    <n-text depth="3" class="draft-status">{{ t('draftSaved') }}</n-text>
                    <n-button type="primary" :loading="sending" :disabled="sending" @click="send">
                        <template #icon><n-icon :component="SendOutlined" /></template>
                        {{ t('send') }}
                    </n-button>
                </div>
            </n-form>
        </section>
    </div>
</template>

<style scoped>
/* ---- 问题10: quiet "not enabled" state (no toast, no failed request) ---- */
.feature-disabled {
    padding: 40px 20px;
    text-align: center;
    border: 1px dashed rgba(128, 128, 128, 0.45);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.feature-disabled-title {
    font-size: 15px;
    font-weight: 700;
    opacity: 0.8;
}

.feature-disabled-hint {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.7;
    opacity: 0.55;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
}

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

/* the same 12px hairline card container as the other admin mail pages */
.page-card {
    padding: 16px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.editor-panel {
    overflow: hidden;
    border: 1px solid rgba(128, 128, 128, 0.24);
    border-radius: 3px;
}

.editor-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 46px;
    padding: 6px 10px 6px 14px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.18);
}

.editor-controls {
    display: flex;
    align-items: center;
    gap: 8px;
}

.required-mark {
    color: #e5484d;
}

.format-options {
    display: flex;
}

.format-options :deep(.n-radio-button) {
    min-width: 72px;
    text-align: center;
}

.compose-preview {
    min-height: 360px;
    padding: 18px;
}

.rich-editor {
    background: #fff;
}

.rich-editor :deep(.w-e-toolbar) {
    border-bottom: 1px solid #e5e7eb;
}

.rich-editor :deep(.w-e-text-container),
.rich-editor :deep(.w-e-scroll) {
    min-height: 360px;
}

.compose-textarea :deep(.n-input__textarea-el),
.compose-textarea :deep(.n-input__placeholder) {
    line-height: 1.7;
    text-align: left;
}

.composer-form :deep(.n-input__input-el) {
    text-align: left;
}

.composer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(128, 128, 128, 0.18);
}

.draft-status {
    font-size: 13px;
}

@media (max-width: 640px) {
    .admin-page {
        padding-top: 8px;
    }

    .editor-panel-header {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .editor-controls {
        width: 100%;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .format-options {
        max-width: 100%;
    }

    .format-options :deep(.n-radio-button) {
        min-width: 0;
        padding-right: 8px;
        padding-left: 8px;
    }

    .rich-editor :deep(.w-e-toolbar) {
        overflow-x: auto;
    }
}
</style>
