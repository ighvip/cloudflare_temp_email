<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import DOMPurify from 'dompurify'
const { openSettings } = useGlobalState()


const { t } = useScopedI18n('views.Footer')

const copyrightText = computed(() => (openSettings.value.copyright || '').trim())
// when the configured copyright is already a full line (contains © / copyright / 版权所有),
// show it as-is instead of prepending "版权所有 © year"
const isFullCopyrightLine = computed(() => /[©]|copyright|版权所有/i.test(copyrightText.value))
const showPrefix = computed(() => !copyrightText.value || !isFullCopyrightLine.value)

</script>

<template>
    <div>
        <n-divider class="footer-divider" />
        <div style="text-align: center; padding: 20px">
            <n-space justify="center">
                <n-text depth="3" v-if="showPrefix">
                    {{ t('copyright') }} © 2023-{{ new Date().getFullYear() }}
                </n-text>
                <n-text depth="3" v-if="copyrightText">
                    <div v-html="DOMPurify.sanitize(copyrightText)"></div>
                </n-text>
            </n-space>
        </div>
    </div>
</template>


<style scoped>
.footer-divider {
    margin: 0;
    padding: 0 var(--x-padding);
}
</style>
