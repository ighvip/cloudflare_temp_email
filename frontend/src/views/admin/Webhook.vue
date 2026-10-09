<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

// @ts-ignore
import { useGlobalState } from '../../store'
// @ts-ignore
import { api } from '../../api'
// @ts-ignore
const message = useMessage()

const { t } = useScopedI18n('views.admin.Webhook')

class WebhookSettings {
    enableAllowList: boolean;
    allowList: string[];

    constructor(enableAllowList: boolean, allowList: string[]) {
        this.enableAllowList = enableAllowList;
        this.allowList = allowList;
    }
}

const webhookSettings = ref(new WebhookSettings(false, []))
const webhookEnabled = ref(false)
// 问题10: disabled feature = quiet panel, not an error result
const notEnabled = ref(false)
const errorInfo = ref('')

const isFeatureDisabledError = (error: unknown) => {
    const err = error as { status?: number, message?: string }
    const msg = err?.message || ''
    // 403 = 未启用；400「KV 不可用」= 生产未绑定 KV，同样按安静的未启用态处理
    return err?.status === 403 || /not enabled|not allowed|未启用|未开启|未允许/i.test(msg)
        || /KV 不可用|KV is not available/i.test(msg)
}

const getSettings = async () => {
    try {
        const res = await api.fetch(`/admin/webhook/settings`)
        Object.assign(webhookSettings.value, res)
        webhookEnabled.value = true
    } catch (error) {
        if (isFeatureDisabledError(error)) {
            notEnabled.value = true
            return
        }
        errorInfo.value = (error as Error).message || "error";
    }
}

const saveSettings = async () => {
    try {
        await api.fetch(`/admin/webhook/settings`, {
            method: 'POST',
            body: JSON.stringify(webhookSettings.value),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

onMounted(async () => {
    await getSettings();
})
</script>

<template>
    <div class="center">
        <n-card v-if="webhookEnabled" :bordered="false" embedded style="max-width: 800px; overflow: auto;">
            <n-flex justify="end">
                <n-button @click="saveSettings" type="primary">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-form-item-row :label="t('enableAllowList')">
                <n-switch v-model:value="webhookSettings.enableAllowList" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('webhookAllowList')">
                <n-select v-model:value="webhookSettings.allowList" filterable multiple tag
                    :placeholder="t('webhookAllowList')">
                    <template #empty>
                        <n-text depth="3">
                            {{ t('manualInputPrompt') }}
                        </n-text>
                    </template>
                </n-select>
            </n-form-item-row>
        </n-card>
        <div v-else-if="notEnabled" class="feature-disabled">
            <div class="feature-disabled-title">{{ t('notEnabled') }}</div>
            <div class="feature-disabled-hint">{{ t('notEnabledHint') }}</div>
        </div>
        <n-result v-else status="info" :title="t('loadFailed')" :description="errorInfo" />
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}

/* 问题10: quiet grey "feature disabled" panel */
.feature-disabled {
    max-width: 480px;
    margin: 48px auto;
    padding: 24px 28px;
    border: 1px dashed #d9d9d9;
    border-radius: 12px;
    text-align: center;
    color: #999;
}

.feature-disabled-title {
    font-size: 15px;
    font-weight: 600;
    color: #666;
    margin-bottom: 8px;
}

.feature-disabled-hint {
    font-size: 13px;
    line-height: 1.7;
}
</style>
