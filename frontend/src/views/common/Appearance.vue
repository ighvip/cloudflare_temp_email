<script setup>
import { useScopedI18n } from '@/i18n/app'

import { useIsMobile } from '../../utils/composables'
import { useGlobalState } from '../../store'
const props = defineProps({
    // 问题13: the admin appearance page must show the 简洁首页 switch too
    showUseSimpleIndex: {
        type: Boolean,
        default: true
    }
})

const {
    mailboxSplitSize, mailListView, mailListPreviewLineClamp, useIframeShowMail, preferShowTextMail, configAutoRefreshInterval,
    globalTabplacement, useSideMargin, useUTCDate, useSimpleIndex, autoLoadRemoteImages,
    colorMode, setColorMode
} = useGlobalState()
const isMobile = useIsMobile()

const { t } = useScopedI18n('views.common.Appearance')
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded>
            <!-- 问题13: the dark/light toggle moved here from the header menu
                 as a three-way mode: light / follow system / dark -->
            <n-form-item-row :label="t('themeMode')">
                <n-radio-group :value="colorMode" @update:value="setColorMode">
                    <n-radio-button value="light" :label="t('themeLight')" />
                    <n-radio-button value="auto" :label="t('themeAuto')" />
                    <n-radio-button value="dark" :label="t('themeDark')" />
                </n-radio-group>
            </n-form-item-row>
            <n-form-item-row v-if="!isMobile" :label="t('mailboxSplitSize')">
                <n-slider v-model:value="mailboxSplitSize" :min="0" :max="0.75" :step="0.01" :marks="{
                    0: '0',
                    0.25: '0.25',
                    0.5: '0.5',
                    0.75: '0.75'
                }" />
            </n-form-item-row>
            <n-form-item-row v-if="!isMobile" :label="t('mailListView')">
                <n-switch v-model:value="mailListView" :round="false" />
            </n-form-item-row>
            <n-form-item-row v-if="!isMobile" :label="t('mailListPreviewLineClamp')">
                <n-slider v-model:value="mailListPreviewLineClamp" :min="0" :max="5" :step="1" :marks="{
                    0: t('off'),
                    1: '1',
                    2: '2',
                    3: '3',
                    4: '4',
                    5: '5'
                }" />
            </n-form-item-row>
            <n-form-item-row :label="t('autoRefreshInterval')">
                <n-slider v-model:value="configAutoRefreshInterval" :min="30" :max="300" :step="1" :marks="{
                    60: '60', 120: '120', 180: '180', 240: '240'
                }" />
            </n-form-item-row>
            <n-form-item-row v-if="props.showUseSimpleIndex" :label="t('useSimpleIndex')">
                <n-switch v-model:value="useSimpleIndex" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('preferShowTextMail')">
                <n-switch v-model:value="preferShowTextMail" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('useIframeShowMail')">
                <n-switch v-model:value="useIframeShowMail" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('useUTCDate')">
                <n-switch v-model:value="useUTCDate" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('autoLoadRemoteImages')">
                <n-switch v-model:value="autoLoadRemoteImages" :round="false" />
            </n-form-item-row>
            <n-form-item-row v-if="!isMobile" :label="t('useSideMargin')">
                <n-switch v-model:value="useSideMargin" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t('globalTabplacement')">
                <n-radio-group v-model:value="globalTabplacement">
                    <n-radio-button value="top" :label="t('top')" />
                    <n-radio-button value="left" :label="t('left')" />
                    <n-radio-button value="right" :label="t('right')" />
                    <n-radio-button value="bottom" :label="t('bottom')" />
                </n-radio-group>
            </n-form-item-row>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    justify-content: center;
}


.n-card {
    max-width: 800px;
    text-align: left;
}
</style>
