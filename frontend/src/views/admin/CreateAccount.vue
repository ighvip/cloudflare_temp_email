<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { randomAddressName } from '../../utils'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const {
    loading, openSettings,
} = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.CreateAccount')

const enablePrefix = ref(true)
// 问题5: editable/clearable prefix for this creation, prefilled site-wide
const prefixInput = ref('')
// generic /admin/config key holding the site-wide prefix master switch
const PREFIX_ENABLED_KEY = 'prefix-enabled'
const subdomainMode = ref("normal")
const customSubdomain = ref("")
const emailName = ref("")
const emailDomain = ref("")
const showReultModal = ref(false)
const result = ref("")
const addressPassword = ref("")
const createdAddress = ref("")

const addressRegex = computed(() => {
    try {
        if (openSettings.value.addressRegex) {
            return new RegExp(openSettings.value.addressRegex, 'g');
        }
    } catch (error) {
        console.error(error);
        message.error(`Invalid addressRegex: ${openSettings.value.addressRegex}`);
    }
    return /[^a-z0-9]/g;
});

const generateNameLoading = ref(false);
const generateName = async () => {
    try {
        generateNameLoading.value = true;
        emailName.value = randomAddressName()
            .replace(/\s+/g, '.')
            .replace(/\.{2,}/g, '.')
            .replace(addressRegex.value, '')
            .toLowerCase();
        // support maxAddressLen
        if (emailName.value.length > openSettings.value.maxAddressLen) {
            emailName.value = emailName.value.slice(0, openSettings.value.maxAddressLen);
        }
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        generateNameLoading.value = false;
    }
};

const canUseRandomSubdomain = computed(() => {
    if (!emailDomain.value) {
        return false
    }
    return (openSettings.value.randomSubdomainDomains || []).includes(emailDomain.value)
})

watch(canUseRandomSubdomain, (enabled) => {
    if (!enabled) {
        subdomainMode.value = "normal"
    }
})

const newEmail = async () => {
    if (!emailName.value || !emailDomain.value) {
        message.error(t('fillInAllFields'))
        return
    }
    try {
        const domain = subdomainMode.value === "custom"
            ? `${customSubdomain.value.trim()}.${emailDomain.value}`
            : emailDomain.value
        const res = await api.fetch(`/admin/new_address`, {
            method: 'POST',
            body: JSON.stringify({
                enablePrefix: enablePrefix.value,
                // 问题5: admin-editable prefix for this creation — an empty
                // string means "create without a prefix"
                addressPrefix: enablePrefix.value ? prefixInput.value : null,
                enableRandomSubdomain: subdomainMode.value === "random",
                name: emailName.value,
                domain,
            })
        })
        result.value = res["jwt"];
        addressPassword.value = res["password"] || '';
        createdAddress.value = res["address"] || '';
        message.success(t('successTip'))
        showReultModal.value = true
    } catch (error) {
        message.error(error.message || "error");
    }
}

// site-wide master switch — persisted via the generic /admin/config API so it
// survives refresh and applies to the public site (前台) creation too
const onTogglePrefix = async (enabled) => {
    const previous = enablePrefix.value
    enablePrefix.value = enabled
    try {
        await api.fetch('/admin/config', {
            method: 'POST',
            body: { key: PREFIX_ENABLED_KEY, value: JSON.stringify(enabled) },
            showLoading: false,
        })
    } catch (error) {
        enablePrefix.value = previous
        message.error(error.message || 'error')
        return
    }
    // keep the in-memory site prefix in sync so the input prefills after re-enabling
    try {
        if (enabled) {
            const settings = await api.fetch('/open_api/settings', { showLoading: false })
            openSettings.value.prefix = settings.prefix || ''
            if (!prefixInput.value && openSettings.value.prefix) {
                prefixInput.value = openSettings.value.prefix
            }
        } else {
            openSettings.value.prefix = ''
        }
    } catch (error) {
        console.error(error)
    }
}

onMounted(async () => {
    // restore the persisted site-wide prefix switch (default: on)
    try {
        const res = await api.fetch(`/admin/config/${PREFIX_ENABLED_KEY}`, { showLoading: false })
        if (typeof res?.value === 'string' && res.value !== '') {
            enablePrefix.value = res.value !== 'false'
        }
    } catch (error) {
        console.error(error)
    }
    if (enablePrefix.value && openSettings.value.prefix) {
        prefixInput.value = openSettings.value.prefix
    }
    emailDomain.value = openSettings.value.domains?.[0]?.value || ""
})
</script>

<template>
    <div class="center">
        <AddressCredentialModal v-model:show="showReultModal" :address="createdAddress" :jwt="result"
            :address-password="addressPassword" />
        <n-card :bordered="false" embedded style="max-width: 600px;">
            <n-form-item-row :label="t('enablePrefix')">
                <div style="width: 100%;">
                    <n-switch :value="enablePrefix" :round="false" @update:value="onTogglePrefix" />
                    <p style="margin: 8px 0 0; opacity: 0.75;">
                        {{ t('prefixScopeTip') }}
                    </p>
                </div>
            </n-form-item-row>
            <n-form-item-row :label="t('address')">
                <n-spin :show="generateNameLoading" style="width: 100%;">
                    <div>
                        <n-button @click="generateName" style="margin-bottom: 10px;">
                            {{ t('generateName') }}
                        </n-button>
                        <n-input-group>
                            <n-input v-if="enablePrefix" v-model:value="prefixInput" clearable
                                :placeholder="t('prefixPlaceholder')" style="max-width: 180px;" />
                            <n-input v-model:value="emailName" />
                            <n-input-group-label>@</n-input-group-label>
                            <n-select v-model:value="emailDomain" :consistent-menu-width="false"
                                :options="openSettings.domains" />
                        </n-input-group>
                    </div>
                </n-spin>
            </n-form-item-row>
            <n-form-item-row v-if="canUseRandomSubdomain">
                <div style="width: 100%;">
                    <n-radio-group v-model:value="subdomainMode">
                        <n-space vertical>
                            <n-radio value="normal">{{ t('normalSubdomain') }}</n-radio>
                            <n-radio value="random">{{ t('enableRandomSubdomain') }}</n-radio>
                            <n-radio value="custom">{{ t('enableCustomSubdomain') }}</n-radio>
                        </n-space>
                    </n-radio-group>
                    <p v-if="subdomainMode === 'random'" style="margin: 8px 0 0; opacity: 0.75;">
                        {{ t('randomSubdomainTip') }}
                    </p>
                    <n-input-group v-if="subdomainMode === 'custom'" style="margin-top: 8px;">
                        <n-input v-model:value="customSubdomain" />
                        <n-input-group-label>.{{ emailDomain }}</n-input-group-label>
                    </n-input-group>
                </div>
            </n-form-item-row>
            <n-button @click="newEmail" type="primary" block :loading="loading"
                :disabled="subdomainMode === 'custom' && !customSubdomain.trim()">
                {{ t('createEmailAddress') }}
            </n-button>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: 20px;
}
</style>
