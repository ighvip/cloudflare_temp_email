<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import {
    NewLabelOutlined, MonitorHeartFilled, AdminPanelSettingsFilled,
} from '@vicons/material'
import { Envelope, Language, ExchangeAlt } from '@vicons/fa'

/**
 * Left-column feature grid of the redesigned homepage (only additions —
 * nothing from the old page is replaced by this).
 */
const { t } = useScopedI18n('views.Index')

const features = computed(() => [
    { icon: NewLabelOutlined, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: Envelope, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: AdminPanelSettingsFilled, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: ExchangeAlt, title: t('feature4Title'), desc: t('feature4Desc') },
    { icon: Language, title: t('feature5Title'), desc: t('feature5Desc') },
    { icon: MonitorHeartFilled, title: t('feature6Title'), desc: t('feature6Desc') },
])
</script>

<template>
    <div class="feature-grid">
        <div v-for="(item, index) in features" :key="index" class="feature-item">
            <div class="feature-icon">
                <n-icon :component="item.icon" />
            </div>
            <div class="feature-body">
                <div class="feature-title">{{ item.title }}</div>
                <div class="feature-desc">{{ item.desc }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

@media (max-width: 640px) {
    .feature-grid {
        grid-template-columns: 1fr;
    }
}

.feature-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.feature-item:hover {
    transform: translateY(-2px);
    border-color: rgba(32, 128, 240, 0.45);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.feature-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: #2080f0;
    background: rgba(32, 128, 240, 0.12);
}

.feature-body {
    min-width: 0;
}

.feature-title {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.4;
}

.feature-desc {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.6;
    opacity: 0.7;
}
</style>
