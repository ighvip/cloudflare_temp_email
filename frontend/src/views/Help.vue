<script setup>
import { computed, nextTick, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'

import { getRouterPathWithLang } from '../utils'
import AdminContact from './common/AdminContact.vue'

/**
 * Standalone help center: detailed tutorial, expanded FAQ and a
 * troubleshooting section (problem → cause → fix). The compact guide in
 * the login card's help tab stays as-is (its copy lives in the
 * views.common.Login namespace and is reused here for the core steps).
 * Deep links from the homepage FAQ banner (#help-faq / #help-trouble)
 * scroll to their section after mount.
 */
const router = useRouter()
const route = useRoute()
const { t, locale } = useScopedI18n('views.Help')
const { t: tl } = useScopedI18n('views.common.Login')

const goHome = () => router.push(getRouterPathWithLang('/', locale.value))

const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToHash = async () => {
    const id = (route.hash || '').slice(1)
    if (!id) return
    await nextTick()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(scrollToHash)
watch(() => route.hash, scrollToHash)

const steps = computed(() => [1, 2, 3, 4, 5, 6].map((n) => ({
    title: tl(`step${n}Title`),
    desc: tl(`step${n}Desc`),
    tip: t(`stepTip${n}`),
})))

const faqs = computed(() => [
    ['faqCreate', 'faqCreateAnswer'],
    ['faqReceive', 'faqReceiveAnswer'],
    ['faqLost', 'faqLostAnswer'],
    ['faqLifetime', 'faqLifetimeAnswer'],
    ['faqMissing', 'faqMissingAnswer'],
].map(([q, a]) => ({ q: tl(q), a: tl(a) })).concat(
    [1, 2, 3, 4].map((n) => ({ q: t(`faqExtraQ${n}`), a: t(`faqExtraA${n}`) }))
))

const troubles = computed(() => [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    q: t(`trouble${n}Q`),
    c: t(`trouble${n}C`),
    f: t(`trouble${n}F`),
})))

const sections = computed(() => [
    { id: 'help-tutorial', label: t('navTutorial') },
    { id: 'help-faq', label: t('navFaq') },
    { id: 'help-trouble', label: t('navTrouble') },
])
</script>

<template>
    <div class="help-page">
        <div class="help-hero">
            <h1 class="help-hero-title">{{ t('pageTitle') }}</h1>
            <p class="help-hero-desc">{{ t('pageDesc') }}</p>
            <n-button size="small" quaternary @click="goHome">← {{ t('backHome') }}</n-button>
        </div>

        <div class="help-layout">
            <nav class="help-nav" aria-label="help sections">
                <button v-for="section in sections" :key="section.id" type="button"
                    class="help-nav-link" @click="scrollTo(section.id)">
                    {{ section.label }}
                </button>
            </nav>

            <div class="help-content">
                <section id="help-tutorial" class="help-section">
                    <div class="help-section-title">{{ t('navTutorial') }}</div>
                    <div class="help-steps">
                        <div v-for="(step, stepIndex) in steps" :key="stepIndex" class="help-step">
                            <div class="help-step-index">{{ stepIndex + 1 }}</div>
                            <div class="help-step-body">
                                <div class="help-step-title">{{ step.title }}</div>
                                <div class="help-step-desc">{{ step.desc }}</div>
                                <div class="help-step-tip">{{ step.tip }}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="help-faq" class="help-section">
                    <div class="help-section-title">{{ t('navFaq') }}</div>
                    <div class="help-faq">
                        <div v-for="(item, itemIndex) in faqs" :key="itemIndex" class="help-faq-item">
                            <b class="help-faq-q">{{ item.q }}</b>
                            <p class="help-faq-a">{{ item.a }}</p>
                        </div>
                    </div>
                </section>

                <section id="help-trouble" class="help-section">
                    <div class="help-section-title">{{ t('navTrouble') }}</div>
                    <div class="help-trouble">
                        <div v-for="(item, itemIndex) in troubles" :key="itemIndex"
                            class="help-trouble-card">
                            <div class="help-trouble-head">
                                <span class="help-tag tag-q">{{ t('symptomTag') }}</span>
                                <b>{{ item.q }}</b>
                            </div>
                            <div class="help-trouble-line">
                                <span class="help-tag tag-cause">{{ t('causeTag') }}</span>
                                <span>{{ item.c }}</span>
                            </div>
                            <div class="help-trouble-line">
                                <span class="help-tag tag-fix">{{ t('fixTag') }}</span>
                                <span>{{ item.f }}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <AdminContact />
            </div>
        </div>
    </div>
</template>

<style scoped>
.help-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 8px 4px 32px;
}

.help-hero {
    padding: 18px 4px 6px;
}

.help-hero-title {
    margin: 0;
    font-size: clamp(24px, 3vw, 32px);
    letter-spacing: -0.5px;
}

.help-hero-desc {
    margin: 10px 0 12px;
    max-width: 52em;
    font-size: 15px;
    line-height: 1.75;
    opacity: 0.75;
}

.help-layout {
    display: flex;
    gap: 28px;
    align-items: flex-start;
}

.help-nav {
    position: sticky;
    top: 16px;
    flex: 0 0 148px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.help-nav-link {
    display: block;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
}

.help-nav-link:hover {
    background: rgba(128, 128, 128, 0.14);
}

.help-content {
    flex: 1 1 auto;
    min-width: 0;
}

.help-section {
    margin-bottom: 26px;
    scroll-margin-top: 80px;
}

.help-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-weight: 700;
    font-size: 17px;
}

.help-section-title::before {
    content: '';
    width: 4px;
    height: 15px;
    border-radius: 2px;
    background: currentColor;
}

/* ---- tutorial ---- */
.help-steps {
    display: grid;
    gap: 10px;
}

.help-step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
}

.help-step-index {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    background: #1a1a1a;
}

:global(html.dark .help-step-index) {
    color: #111;
    background: #eee;
}

.help-step-body {
    min-width: 0;
}

.help-step-title {
    font-weight: 600;
    font-size: 14.5px;
    line-height: 1.5;
}

.help-step-desc {
    margin-top: 2px;
    font-size: 13.5px;
    line-height: 1.7;
    opacity: 0.78;
}

.help-step-tip {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed rgba(128, 128, 128, 0.25);
    font-size: 12.5px;
    line-height: 1.7;
    opacity: 0.65;
}

/* ---- faq ---- */
.help-faq {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.help-faq-item {
    padding: 12px 14px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    font-size: 13px;
    line-height: 1.7;
}

.help-faq-q {
    display: block;
    margin-bottom: 4px;
    font-size: 13.5px;
}

.help-faq-a {
    margin: 0;
    opacity: 0.75;
}

/* ---- troubleshooting ---- */
.help-trouble {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.help-trouble-card {
    padding: 12px 14px;
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-left: 3px solid currentColor;
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    font-size: 13px;
    line-height: 1.7;
}

.help-trouble-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.help-trouble-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 5px;
    opacity: 0.8;
}

.help-tag {
    flex: 0 0 auto;
    padding: 0 7px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 18px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
}

/* monochrome tag hierarchy: symptom = solid black, cause = mid gray,
   fix = outline (dark theme inverts the solid black) */
.tag-q { background: #1a1a1a; }
.tag-cause { background: #767676; }
.tag-fix {
    padding: 0 6px;
    border: 1px solid rgba(128, 128, 128, 0.6);
    line-height: 16px;
    color: inherit;
    background: transparent;
}

:global(html.dark .tag-q) {
    color: #111;
    background: #eee;
}

@media (max-width: 860px) {
    .help-nav {
        display: none;
    }

    .help-faq,
    .help-trouble {
        grid-template-columns: 1fr;
    }
}
</style>
