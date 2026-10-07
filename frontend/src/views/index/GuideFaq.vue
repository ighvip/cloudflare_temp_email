<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import AdminContact from '../common/AdminContact.vue'

/**
 * 操作指南 6 步流程 + 常见问题.
 * Extracted from Login.vue's help tab: the homepage shows it as a permanent
 * left-column section, the login card keeps reusing it as its help tab.
 * All copy lives under the views.common.Login i18n namespace (no key moves).
 */
const { t } = useScopedI18n('views.common.Login')

const guideSteps = computed(() => [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`step${n}Title`),
    desc: t(`step${n}Desc`),
})))

const guideFaqs = computed(() => [
    ['faqCreate', 'faqCreateAnswer'],
    ['faqReceive', 'faqReceiveAnswer'],
    ['faqLost', 'faqLostAnswer'],
    ['faqLifetime', 'faqLifetimeAnswer'],
    ['faqMissing', 'faqMissingAnswer'],
].map(([q, a]) => ({ q: t(q), a: t(a) })))
</script>

<template>
    <div class="guide-wrap">
        <div class="guide-flow" aria-label="guide flow">
            <template v-for="(step, stepIndex) in guideSteps" :key="stepIndex">
                <div class="guide-step" :class="{ 'guide-step-last': stepIndex === guideSteps.length - 1 }">
                    <div class="guide-step-index">{{ stepIndex + 1 }}</div>
                    <div class="guide-step-body">
                        <div class="guide-step-title">{{ step.title }}</div>
                        <div class="guide-step-desc">{{ step.desc }}</div>
                    </div>
                </div>
                <div v-if="stepIndex < guideSteps.length - 1" class="guide-arrow">↓</div>
            </template>
        </div>

        <n-divider style="margin: 14px 0" />

        <div class="guide-detail">
            <div v-for="(item, itemIndex) in guideFaqs" :key="itemIndex" class="guide-detail-item">
                <b>{{ item.q }}</b>
                <span>{{ item.a }}</span>
            </div>
        </div>

        <AdminContact />
    </div>
</template>

<style scoped>
.guide-wrap {
    text-align: left;
}

.guide-flow {
    display: flex;
    flex-direction: column;
    align-items: stretch;
}

.guide-step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(128, 128, 128, 0.2);
    border-radius: 10px;
    background: var(--n-color-target, rgba(128, 128, 128, 0.06));
}

.guide-step-last {
    border-color: rgba(32, 128, 240, 0.4);
}

.guide-step-index {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    background: #2080f0;
}

.guide-step-last .guide-step-index {
    background: #999;
}

.guide-step-body {
    min-width: 0;
}

.guide-step-title {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.5;
}

.guide-step-desc {
    font-size: 13px;
    line-height: 1.6;
    opacity: 0.75;
}

.guide-arrow {
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
    opacity: 0.5;
    padding: 1px 0;
}

.guide-detail {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
}

.guide-detail-item {
    font-size: 13px;
    line-height: 1.7;
}

.guide-detail-item b {
    display: block;
    margin-bottom: 2px;
}

.guide-detail-item span {
    opacity: 0.78;
}
</style>
