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
        <div class="footer-center" style="padding: 16px">
            <div class="footer-items">
                <n-text depth="3" v-if="showPrefix">
                    {{ t('copyright') }} © 2023-{{ new Date().getFullYear() }}
                </n-text>
                <n-text depth="3" v-if="copyrightText">
                    <div v-html="DOMPurify.sanitize(copyrightText)"></div>
                </n-text>
            </div>
        </div>
    </div>
</template>


<style scoped>
.footer-divider {
    margin: 0;
    padding: 0 var(--x-padding);
}

/* 版权行整体居中，与页面居中布局保持一致。
   用普通 flex 容器替代 n-space：naive 的 n-space 默认内联写死
   justify-content: flex-start（甚至外部 CSS 无法覆盖），普通 div 由我们自己掌控 */
.footer-center {
    text-align: center;
}

.footer-items {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 12px;
}
</style>
