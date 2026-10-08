<script setup lang="ts">
import { ref } from 'vue'
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
    } catch (error) {
        const err = error as Error & { status?: number }
        message.error(err.status === 401 ? t('currentWrong') : (err.message || 'error'))
    } finally {
        submitting.value = false
    }
}
</script>

<template>
    <div class="center">
        <n-card :title="t('title')" :bordered="false" embedded style="max-width: 800px; overflow: auto;">
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
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}
</style>
