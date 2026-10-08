<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage } from 'naive-ui'
import { hashPassword } from '../../utils'
// @ts-ignore
import { api } from '../../api'

const message = useMessage()

const { t } = useScopedI18n('views.admin.SecuritySettings')

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)

// 认证方式 / 修改时间 / 禁用 env 旧密码登录（来自 /admin/security_settings）
const adminPasswordStored = ref(false)
const adminPasswordUpdatedAt = ref<string | null>(null)
const disableEnvLogin = ref(false)
const savingFlag = ref(false)

const loadSecuritySettings = async () => {
    try {
        const res = await api.fetch('/admin/security_settings')
        adminPasswordStored.value = !!res?.adminPasswordStored
        adminPasswordUpdatedAt.value = res?.adminPasswordUpdatedAt ?? null
        disableEnvLogin.value = !!res?.disableEnvLogin
    } catch (_) {
        // metadata only — the change-password form keeps working without it
    }
}

const authModeText = computed(() => adminPasswordStored.value
    ? '面板存储的新密码'
    : '环境变量密码（ADMIN_PASSWORDS）')

const passwordUpdatedAtText = computed(() => {
    if (!adminPasswordUpdatedAt.value) return '-'
    const date = new Date(adminPasswordUpdatedAt.value)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
})

const onDisableEnvLogin = async (value: boolean) => {
    savingFlag.value = true
    try {
        await api.fetch('/admin/security_settings', {
            method: 'POST',
            body: JSON.stringify({ disable_env_login: value }),
        })
        message.success(value ? '已禁用环境变量旧密码登录' : '已恢复环境变量旧密码登录')
    } catch (error) {
        const err = error as Error & { status?: number }
        message.error(err.status === 400
            ? '未设置新密码，无法禁用 env 旧密码'
            : (err.message || 'error'))
    } finally {
        savingFlag.value = false
        // resync with the server (also reverts a failed toggle)
        await loadSecuritySettings()
    }
}

const submit = async () => {
    if (!currentPassword.value) {
        message.error(t('currentRequired'))
        return
    }
    if (newPassword.value.length < 8) {
        message.error(t('tooShort'))
        return
    }
    if (newPassword.value !== confirmPassword.value) {
        message.error(t('mismatch'))
        return
    }
    if (newPassword.value === currentPassword.value) {
        message.error(t('sameAsCurrent'))
        return
    }
    submitting.value = true
    try {
        await api.fetch('/admin/change_admin_password', {
            method: 'POST',
            body: JSON.stringify({
                current_password: await hashPassword(currentPassword.value),
                new_password: await hashPassword(newPassword.value),
                confirm_password: await hashPassword(confirmPassword.value),
            }),
        })
        message.success(t('success'))
        currentPassword.value = ''
        newPassword.value = ''
        confirmPassword.value = ''
        // a stored password now exists — refresh so the switch unlocks
        await loadSecuritySettings()
    } catch (error) {
        const err = error as Error & { status?: number }
        message.error(err.status === 401 ? t('currentWrong') : (err.message || 'error'))
    } finally {
        submitting.value = false
    }
}

onMounted(loadSecuritySettings)
</script>

<template>
    <div class="center">
        <n-card :title="t('title')" :bordered="false" embedded
            style="max-width: 800px; width: 100%; overflow: auto;">
            <n-alert type="info" style="margin-bottom: 16px;">
                {{ t('hint') }}
            </n-alert>
            <form @submit.prevent="submit">
                <n-form-item-row :label="t('currentPassword')">
                    <n-input v-model:value="currentPassword" type="password" show-password-on="click" />
                </n-form-item-row>
                <n-form-item-row :label="t('newPassword')">
                    <n-input v-model:value="newPassword" type="password" show-password-on="click" />
                </n-form-item-row>
                <n-form-item-row :label="t('confirmPassword')">
                    <n-input v-model:value="confirmPassword" type="password" show-password-on="click"
                        @keyup.enter="submit" />
                </n-form-item-row>
                <n-flex justify="end">
                    <n-button type="primary" :loading="submitting" @click="submit">
                        {{ t('submit') }}
                    </n-button>
                </n-flex>
            </form>
        </n-card>
        <n-card title="认证信息" :bordered="false" embedded
            style="max-width: 800px; width: 100%; overflow: auto;">
            <n-descriptions :column="1" size="small" label-placement="left" bordered>
                <n-descriptions-item label="当前认证方式">
                    {{ authModeText }}
                </n-descriptions-item>
                <n-descriptions-item label="密码最后修改时间">
                    {{ passwordUpdatedAtText }}
                </n-descriptions-item>
            </n-descriptions>
            <n-divider style="margin: 12px 0;" />
            <div class="env-switch-row">
                <div class="env-switch-text">
                    <n-text strong>禁用环境变量旧密码登录</n-text>
                    <div>
                        <n-text depth="3" class="env-switch-hint">
                            开启后，只有存储的新密码可以登录后台（建议先修改密码后再开启）
                        </n-text>
                    </div>
                    <div v-if="!adminPasswordStored">
                        <n-text depth="3" class="env-switch-hint">
                            未设置新密码，无法禁用 env 旧密码
                        </n-text>
                    </div>
                </div>
                <n-tooltip v-if="!adminPasswordStored" trigger="hover" placement="top">
                    <template #trigger>
                        <span class="env-switch-blocked">
                            <n-switch :value="false" disabled />
                        </span>
                    </template>
                    未设置新密码，无法禁用 env 旧密码
                </n-tooltip>
                <n-switch v-else v-model:value="disableEnvLogin" :loading="savingFlag"
                    :disabled="savingFlag" @update:value="onDisableEnvLogin" />
            </div>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: left;
    justify-content: center;
}

.env-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
}

.env-switch-text {
    flex: 1 1 260px;
    min-width: 0;
}

.env-switch-hint {
    font-size: 12px;
    line-height: 1.6;
}

.env-switch-blocked {
    display: inline-flex;
}
</style>
