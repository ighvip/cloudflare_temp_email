<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

// @ts-ignore
import { useGlobalState } from '../../store'
// @ts-ignore
import { api } from '../../api'
// @ts-ignore
const message = useMessage()

const { t } = useScopedI18n('views.admin.Telegram')

const status = ref({
    fetched: false,
})

// 问题10: no TELEGRAM_BOT_TOKEN → backend 403s quietly, we show a
// not-enabled panel instead of a red toast
const notEnabled = ref(false)

const isNotEnabledError = (error: unknown) => {
    const err = error as { status?: number; message?: string }
    return err?.status === 403 || /not enabled|not set/i.test(err?.message || '')
}

const fetchStatus = async () => {
    try {
        const res = await api.fetch(`/admin/telegram/status`)
        Object.assign(status.value, res)
        status.value.fetched = true
        notEnabled.value = false
    } catch (error) {
        if (isNotEnabledError(error)) {
            notEnabled.value = true
            return
        }
        message.error((error as Error).message || "error");
    }
}

const init = async () => {
    try {
        await api.fetch(`/admin/telegram/init`, {
            method: 'POST',
        })
        message.success(t('successTip'))
    } catch (error) {
        if (isNotEnabledError(error)) {
            notEnabled.value = true
            return
        }
        message.error((error as Error).message || "error");
    }
}

class TelegramSettings {
    enableAllowList: boolean;
    allowList: string[];
    miniAppUrl: string;
    enableGlobalMailPush: boolean;
    globalMailPushList: string[];

    constructor(
        enableAllowList: boolean, allowList: string[], miniAppUrl: string,
        enableGlobalMailPush: boolean, globalMailPushList: string[]
    ) {
        this.enableAllowList = enableAllowList;
        this.allowList = allowList;
        this.miniAppUrl = miniAppUrl;
        this.enableGlobalMailPush = enableGlobalMailPush;
        this.globalMailPushList = globalMailPushList;
    }
}

const settings = ref(new TelegramSettings(false, [], '', false, []))

const getSettings = async () => {
    try {
        const res = await api.fetch(`/admin/telegram/settings`)
        Object.assign(settings.value, res)
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const saveSettings = async () => {
    try {
        await api.fetch(`/admin/telegram/settings`, {
            method: 'POST',
            body: JSON.stringify(settings.value),
        })
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

onMounted(async () => {
    await getSettings();
    // probe quietly — a missing token surfaces as the not-enabled panel
    await fetchStatus();
})
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded style="max-width: 800px; overflow: auto;">
            <!-- 问题10: quiet not-enabled state (no toast) -->
            <div v-if="notEnabled" class="feature-disabled">
                <div class="feature-disabled-title">{{ t('notEnabled') }}</div>
                <div class="feature-disabled-hint">{{ t('notEnabledHint') }}</div>
            </div>
            <n-flex justify="end">
                <n-button @click="fetchStatus" secondary>
                    {{ t('status') }}
                </n-button>
                <n-button @click="init" type="primary">
                    {{ t('init') }}
                </n-button>
                <n-button @click="saveSettings" type="primary">
                    {{ t('save') }}
                </n-button>
            </n-flex>
            <n-card :bordered="false" embedded>
                <n-form-item-row :label="t('enableTelegramAllowList')">
                    <n-input-group>
                        <n-checkbox v-model:checked="settings.enableAllowList" style="width: 20%;">
                            {{ t('enable') }}
                        </n-checkbox>
                        <n-select v-model:value="settings.allowList" filterable multiple tag style="width: 80%;"
                            :placeholder="t('telegramAllowList')">
                            <template #empty>
                                <n-text depth="3">
                                    {{ t('manualInputPrompt') }}
                                </n-text>
                            </template>
                        </n-select>
                    </n-input-group>
                </n-form-item-row>
                <br />
                <n-form-item-row :label="t('enableGlobalMailPush')">
                    <n-input-group>
                        <n-checkbox v-model:checked="settings.enableGlobalMailPush" style="width: 20%;">
                            {{ t('enable') }}
                        </n-checkbox>
                        <n-select v-model:value="settings.globalMailPushList" filterable multiple tag
                            style="width: 80%;" :placeholder="t('globalMailPushList')">
                            <template #empty>
                                <n-text depth="3">
                                    {{ t('manualInputPrompt') }}
                                </n-text>
                            </template>
                        </n-select>
                    </n-input-group>
                    <template #feedback>
                        <n-text depth="3">
                            {{ t('globalMailPushListTip') }}
                        </n-text>
                    </template>
                </n-form-item-row>
                <br />
                <n-form-item-row :label="t('miniAppUrl')">
                    <n-input v-model:value="settings.miniAppUrl"></n-input>
                </n-form-item-row>
            </n-card>
            <pre v-if="status.fetched">{{ JSON.stringify(status, null, 2) }}</pre>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}

/* 问题10: quiet not-enabled state */
.feature-disabled {
    margin-bottom: 12px;
    padding: 24px 16px;
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
}
</style>
